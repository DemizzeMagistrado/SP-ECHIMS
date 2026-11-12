'use client'

// NIP-USR003 — Record administered vaccination.
// Opens from Records "Add new record" (and the child profile). Admin / PHN / BHW / RHM.
//   1. Pick a child (barangay-scoped by RLS on /api/children) — history preview appears.
//   2. Pick a vaccine (active ones only), dose, date (birth date → today), batch number (one
//      system format), site (fixed list) and remarks. Companion medications (e.g. Paracetamol
//      Drops with Pentavalent) are noted; they are dispensed with the dose on PHN approval.
//   3. Save → POST /api/vaccination/records, kept on the device first so it survives going
//      offline. Success shows the child's next scheduled dose with a printable slip.
//   A dose that is already saved shows both versions side by side (keep mine / keep saved).

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSWR from 'swr'
import { CheckCircle2, Pill, Printer, Search, Syringe, Wifi, WifiOff, X, CalendarClock } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useAuth } from '@/components/auth/auth-provider'
import { toast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { DateInput, Field, Input, Select, Textarea } from '@/components/ui/form'
import { Spinner } from '@/components/brand/logo-loader'
import { BatchNumberField, checkBatchNumber } from '@/components/inventory/batch-number-field'
import { VaccinationHistoryPreview } from '@/components/vaccination/vaccination-history-preview'
import { VaccinationConflict } from '@/components/vaccination/vaccination-conflict'
import { newClientRequestId, sendOrQueueVaccination, type VaccinationConflict as Conflict, type VaccinationPayload } from '@/lib/vaccination-offline'
import { VACCINATION_SITES } from '@/lib/vaccination-config'
import { NIP_CATALOG, manilaTodayYMD, nipNextDose, nipVaccineTimeline, normalizeVaccineCode } from '@/lib/nip-schedule'

type ChildRef = {
  child_id: number
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: string
  barangay_id: number
  barangay?: { barangay_name: string } | { barangay_name: string }[] | null
}
type Companion = { quantity: number; note: string | null; active: boolean; item: { item_id: number; item_name: string; unit: string | null; status: string } | null }
type VaccineRef = {
  vaccine_id: number
  vaccine_type: string
  dose_volume: string | null
  route: string | null
  target_age: string | null
  total_doses: number | null
  item: { item_id: number; item_name: string } | { item_id: number; item_name: string }[] | null
  companions?: Companion[] | null
}
type HistoryPayload = {
  child: { date_of_birth: string }
  vaccine_status: { code: string; doses: { dose_number: number; given_date: string | null }[] }[]
}
type Props = { open: boolean; onClose: () => void; onSaved: () => void; ownerId: string | null; prefillChildId?: number }
type Errors = Partial<Record<'child' | 'vaccine' | 'dose' | 'date' | 'batch' | 'site', string>>
type NextDose = { vaccine_type: string; dose_number: number; date: string; missed: boolean }
type Saved = { childName: string; dob: string; vaccine: string; dose: number; date: string; queued: boolean; next: NextDose | null | 'unknown' }

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Request failed.')
  return d
}
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}
const fullName = (c: ChildRef) => [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
const vaccineLabel = (v: VaccineRef) => one(v.item)?.item_name || v.vaccine_type || `Vaccine #${v.vaccine_id}`
const fmt = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
function monthsOld(dob: string): string {
  const birth = new Date(dob + 'T00:00:00'), now = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth()
  if (months < 24) return `${Math.max(0, months)} mo`
  return months % 12 ? `${Math.floor(months / 12)}y ${months % 12}mo` : `${Math.floor(months / 12)}y`
}

/** Given doses per vaccine code from the history payload, plus the dose just recorded. */
function nextScheduledDose(history: HistoryPayload, extra: { code: string; dose: number; date: string }): NextDose | null {
  const today = manilaTodayYMD()
  let best: NextDose | null = null
  for (const v of NIP_CATALOG) {
    if (v.routine_enabled === false) continue
    const doses = history.vaccine_status.find((s) => s.code === v.code)?.doses ?? []
    const dates = Array.from({ length: v.total_doses }, (_, i) =>
      v.code === extra.code && i + 1 === extra.dose ? extra.date : doses.find((d) => d.dose_number === i + 1)?.given_date ?? null)
    const n = nipNextDose(nipVaccineTimeline(history.child.date_of_birth, v, dates, today))
    if (n && (!best || n.date < best.date)) best = { vaccine_type: v.vaccine_type, dose_number: n.dose_number, date: n.date, missed: n.status === 'OVERDUE' }
  }
  return best
}

export function RecordVaccinationModal({ open, onClose, onSaved, ownerId, prefillChildId }: Props) {
  const { user } = useAuth()
  const canEditOthers = user?.role === 'Public Health Nurse' || user?.role === 'Administrator'
  const [isOnline, setIsOnline] = useState(true)
  const [childId, setChildId] = useState<number | ''>('')
  const [childQuery, setChildQuery] = useState('')
  const [childOpen, setChildOpen] = useState(false)
  const [childActiveIdx, setChildActiveIdx] = useState(0)
  const childBoxRef = useRef<HTMLDivElement | null>(null)
  const [vaccineId, setVaccineId] = useState<number | ''>('')
  const [doseNumber, setDoseNumber] = useState('1')
  const [vaccinationDate, setVaccinationDate] = useState(manilaTodayYMD())
  const [batchNumber, setBatchNumber] = useState('')
  const [site, setSite] = useState('')
  const [remarks, setRemarks] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ payload: VaccinationPayload; conflict: Conflict; label: string } | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)

  const childrenSWR = useSWR<{ children: ChildRef[] }>(open ? '/api/children?view=vaccination-options' : null, fetcher)
  const vaccinesSWR = useSWR<{ vaccines: VaccineRef[] }>(open ? '/api/vaccines' : null, fetcher)
  const historySWR = useSWR<HistoryPayload>(open && childId ? `/api/vaccination/history?child_id=${childId}` : null, fetcher)

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  // Fresh form each time it opens.
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const openKey = open ? `open:${prefillChildId ?? ''}` : null
  if (openKey !== openedFor) {
    setOpenedFor(openKey)
    if (open) {
      setChildId(prefillChildId ?? ''); setChildQuery(''); setChildOpen(false); setChildActiveIdx(0)
      setVaccineId(''); setDoseNumber('1'); setVaccinationDate(manilaTodayYMD()); setBatchNumber(''); setSite(''); setRemarks('')
      setErrors({}); setSaveError(null); setConflict(null); setSaved(null)
    }
  }

  const children = childrenSWR.data?.children
  const selectedChild = useMemo(() => children?.find((c) => c.child_id === childId) ?? null, [children, childId])
  const shownQuery = childQuery || (prefillChildId && selectedChild ? fullName(selectedChild) : '')

  useEffect(() => {
    if (!childOpen) return
    const onDocClick = (e: MouseEvent) => { if (childBoxRef.current && !childBoxRef.current.contains(e.target as Node)) setChildOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [childOpen])

  const childSuggestions = useMemo(() => {
    const all = children ?? []
    const q = childQuery.trim().toLowerCase()
    if (!q) return all.slice(0, 8)
    return all.filter((c) => `${c.first_name} ${c.middle_name ?? ''} ${c.last_name} ${one(c.barangay)?.barangay_name ?? ''}`.toLowerCase().includes(q)).slice(0, 8)
  }, [children, childQuery])

  const vaccines = vaccinesSWR.data?.vaccines ?? []
  const selectedVaccine = vaccines.find((v) => v.vaccine_id === vaccineId) ?? null
  const companions = (selectedVaccine?.companions ?? []).filter((c) => c.active && c.item && c.item.status === 'ACTIVE')
  const totalDoses = selectedVaccine?.total_doses ?? 3

  function pickChild(c: ChildRef) {
    setChildId(c.child_id); setChildQuery(fullName(c)); setChildOpen(false); setChildActiveIdx(0)
    setErrors((e) => ({ ...e, child: undefined }))
  }

  function pickVaccine(id: number | '') {
    setVaccineId(id)
    setErrors((e) => ({ ...e, vaccine: undefined, dose: undefined }))
    // Suggest the first dose of this vaccine not yet given.
    const v = vaccines.find((x) => x.vaccine_id === id)
    const doses = v ? historySWR.data?.vaccine_status.find((s) => s.code === normalizeVaccineCode(v.vaccine_type))?.doses : null
    const next = doses?.find((d) => !d.given_date)?.dose_number
    setDoseNumber(String(next ?? 1))
  }

  function validate(): { payload: VaccinationPayload } | null {
    const e: Errors = {}
    if (!childId) e.child = 'Choose the child from the list.'
    if (!vaccineId) e.vaccine = 'Choose the vaccine given.'
    const dose = Number(doseNumber)
    if (!Number.isSafeInteger(dose) || dose < 1 || dose > totalDoses) e.dose = `Choose a dose from 1 to ${totalDoses}.`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vaccinationDate)) e.date = 'Enter the date the dose was given.'
    else if (vaccinationDate > manilaTodayYMD()) e.date = 'The date cannot be in the future.'
    else if (selectedChild && vaccinationDate < selectedChild.date_of_birth) e.date = 'The date cannot be before the child was born.'
    const batch = checkBatchNumber(batchNumber, false)
    if (batch.error) e.batch = batch.error
    if (site && !(VACCINATION_SITES as readonly string[]).includes(site)) e.site = 'Choose a site from the list.'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return null
    return {
      payload: {
        child_id: Number(childId), vaccine_id: Number(vaccineId), dose_number: dose, vaccination_date: vaccinationDate,
        batch_number: batch.value, vaccination_site: site || null, remarks: remarks.trim() || null,
        schedule_id: null, client_request_id: newClientRequestId(),
      },
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    if (!ownerId) { setSaveError('Please sign in first.'); return }
    const checked = validate()
    if (!checked) return
    const { payload } = checked
    const display = { childName: selectedChild ? fullName(selectedChild) : `Child #${childId}`, vaccineLabel: selectedVaccine ? vaccineLabel(selectedVaccine) : `Vaccine #${vaccineId}` }

    setSubmitting(true)
    let res
    try { res = await sendOrQueueVaccination(ownerId, payload, display) }
    catch (error) { setSaveError(`${error instanceof Error ? error.message : 'Could not keep the record on this device.'} Keep this form open and try again.`); setSubmitting(false); return }
    setSubmitting(false)

    if (!res.ok && res.conflict) {
      setConflict({ payload, conflict: res.conflict, label: `${display.childName} · ${display.vaccineLabel} dose ${payload.dose_number}` })
      return
    }
    if (!res.ok && res.blocked) {
      // The server refused it (not a conflict): keep the form open so it can be fixed.
      setSaveError(`${res.error} Fix it here and save again. A copy is also kept under “Review pending drafts”.`)
      onSaved()
      return
    }
    const queued = !res.ok
    onSaved()
    const code = selectedVaccine ? normalizeVaccineCode(selectedVaccine.vaccine_type) : ''
    const history = historySWR.data
    setSaved({
      childName: display.childName, dob: selectedChild?.date_of_birth ?? '', vaccine: display.vaccineLabel, dose: payload.dose_number,
      date: payload.vaccination_date, queued,
      next: history ? nextScheduledDose(history, { code, dose: payload.dose_number, date: payload.vaccination_date }) : 'unknown',
    })
    toast.success(queued ? 'Saved on this device. It will sync when you are back online.' : 'Vaccination recorded. Waiting for PHN approval.')
  }

  function printSlip() {
    document.body.classList.add('printing-slip')
    const done = () => { document.body.classList.remove('printing-slip'); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    window.print()
  }

  const vaccineChosen = Boolean(selectedVaccine)

  if (saved) {
    const next = saved.next
    return (
      <Modal
        open={open}
        onClose={onClose}
        confirmDiscard={false}
        icon={<CheckCircle2 />}
        title="Vaccination recorded"
        subtitle={saved.queued ? 'Saved on this device; it uploads when you are back online.' : 'Saved. The PHN approves it and stock is deducted then.'}
        cancelLabel="Done"
        footer={<>
          <Button variant="secondary" onClick={() => { setOpenedFor(null) }}>Record another</Button>
          {next && next !== 'unknown' && <Button onClick={printSlip}><Printer size={15} aria-hidden="true" /> Print next schedule</Button>}
        </>}
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-navy"><span className="font-semibold">{saved.childName}</span> · {saved.vaccine} dose {saved.dose} · {fmt(saved.date)}</p>
          <div role="status" className="rounded-xl border border-brand-blue/25 bg-brand-ice p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-blue"><CalendarClock size={14} aria-hidden="true" /> Next scheduled dose</p>
            {next === 'unknown' ? (
              <p className="mt-1 text-sm text-brand-muted">The next dose will show on the child profile once this record syncs.</p>
            ) : next ? (
              <p className="mt-1 font-display text-lg font-bold text-brand-navy">{next.vaccine_type} dose {next.dose_number} · {fmt(next.date)}{next.missed && <span className="block text-sm font-normal text-danger">Missed earlier · rescheduled to this date</span>}</p>
            ) : (
              <p className="mt-1 text-sm text-brand-navy">No more routine doses are due for this child.</p>
            )}
          </div>
          {companions.length > 0 && <p className="text-xs text-brand-muted">{companions.map((c) => c.item!.item_name).join(', ')} recorded with this dose (deducted from barangay stock on approval).</p>}
        </div>
        {next && next !== 'unknown' && typeof document !== 'undefined' && createPortal(
          <div className="print-slip-root">
            <div style={{ fontFamily: 'sans-serif', maxWidth: 360, border: '1px solid #000', padding: 16 }}>
              <p style={{ fontSize: 12, margin: 0 }}>eCHIMS · Child immunization</p>
              <h1 style={{ fontSize: 18, margin: '6px 0' }}>Next vaccination schedule</h1>
              <p style={{ margin: '4px 0' }}><strong>{saved.childName}</strong>{saved.dob ? ` · born ${fmt(saved.dob)}` : ''}</p>
              <p style={{ margin: '4px 0' }}>Given today: {saved.vaccine} dose {saved.dose} ({fmt(saved.date)})</p>
              <p style={{ margin: '12px 0 4px', fontSize: 16 }}>Please return on <strong>{fmt(next.date)}</strong></p>
              <p style={{ margin: 0 }}>for {next.vaccine_type} dose {next.dose_number}.</p>
              <p style={{ fontSize: 11, marginTop: 12 }}>Bring this slip and the child&rsquo;s immunization card to the RHU / health station.</p>
            </div>
          </div>,
          document.body,
        )}
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      size="lg"
      icon={<Syringe />}
      title="Record administered vaccination"
      subtitle={<>Saves as Pending for PHN approval. Stock is deducted on approval. <span className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isOnline ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'}`}>{isOnline ? <><Wifi size={11} aria-hidden="true" /> Online</> : <><WifiOff size={11} aria-hidden="true" /> Offline · saves on this device</>}</span></>}
      onSubmit={handleSubmit}
      noValidate
      bodyClassName="space-y-5"
      footerStart={<span className="text-xs text-brand-muted">Recorded by you</span>}
      footer={conflict ? null : <Button type="submit" loading={submitting}>{submitting ? 'Saving…' : 'Save as pending'}</Button>}
    >
      {conflict && ownerId ? (
        <VaccinationConflict
          ownerId={ownerId}
          payload={conflict.payload}
          conflict={conflict.conflict}
          label={conflict.label}
          canEditOthers={canEditOthers}
          onResolved={() => { setConflict(null); onSaved(); onClose() }}
        />
      ) : (<>
        {saveError && (
          <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
            <p className="font-semibold">The record was not saved to the server.</p>
            <p className="mt-0.5">{saveError}</p>
          </div>
        )}

        <Field label="Child" required error={errors.child} hint={childId ? undefined : childQuery ? 'Pick a match from the list.' : undefined}>
          <div ref={childBoxRef} className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <Input
              type="text"
              value={shownQuery}
              onChange={(e) => { setChildQuery(e.target.value); if (childId) setChildId(''); setChildOpen(true); setChildActiveIdx(0) }}
              onFocus={() => setChildOpen(true)}
              onKeyDown={(e) => {
                if (!childOpen) return
                if (e.key === 'ArrowDown') { e.preventDefault(); setChildActiveIdx((i) => Math.min(i + 1, childSuggestions.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setChildActiveIdx((i) => Math.max(i - 1, 0)) }
                else if (e.key === 'Enter' && childSuggestions[childActiveIdx]) { e.preventDefault(); pickChild(childSuggestions[childActiveIdx]) }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setChildOpen(false) }
              }}
              placeholder={childrenSWR.isLoading ? 'Loading children…' : "Type a child's name…"}
              className="pl-9 pr-9"
              autoComplete="off"
              disabled={!!prefillChildId || childrenSWR.isLoading}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={childOpen}
              aria-controls="rv-child-listbox"
            />
            {childQuery && !prefillChildId && (
              <button type="button" onClick={() => { setChildId(''); setChildQuery(''); setChildOpen(true) }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-brand-muted hover:bg-brand-ice" aria-label="Clear child">
                <X size={14} aria-hidden="true" />
              </button>
            )}
            {childOpen && !prefillChildId && (
              <ul id="rv-child-listbox" role="listbox" className="scroll-subtle absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-xl border border-brand-line bg-white p-1 shadow-lg">
                {childrenSWR.error && <li className="px-3 py-2 text-xs text-danger">{childrenSWR.error.message}</li>}
                {childrenSWR.isLoading && <li className="px-3 py-3 text-sm text-brand-muted"><span role="status" className="flex items-center gap-2"><Spinner label="Loading children…" />Loading children…</span></li>}
                {!childrenSWR.isLoading && childSuggestions.length === 0 && <li className="px-3 py-3 text-sm text-brand-muted">No match for “{childQuery}”.</li>}
                {childSuggestions.map((c, idx) => (
                  <li
                    key={c.child_id}
                    role="option"
                    aria-selected={childId === c.child_id}
                    onMouseEnter={() => setChildActiveIdx(idx)}
                    onMouseDown={(e) => { e.preventDefault(); pickChild(c) }}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${idx === childActiveIdx ? 'bg-brand-ice' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-brand-navy">{fullName(c)}</span>
                      <span className="block truncate text-xs text-brand-muted">{one(c.barangay)?.barangay_name ?? '—'} · {monthsOld(c.date_of_birth)} · DOB {c.date_of_birth}</span>
                    </span>
                    {childId === c.child_id && <CheckCircle2 size={14} aria-hidden="true" className="shrink-0 text-good" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        {typeof childId === 'number' && childId > 0 && <VaccinationHistoryPreview childId={childId} />}

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Vaccine" required error={errors.vaccine} hint={vaccinesSWR.data?.vaccines?.length === 0 ? 'No active vaccines in the catalog.' : undefined}>
            <Select value={vaccineId} onChange={(e) => pickVaccine(e.target.value ? Number(e.target.value) : '')} disabled={vaccinesSWR.isLoading} placeholder="Select a vaccine">
              <option value="">{vaccinesSWR.isLoading ? 'Loading vaccines…' : 'Select a vaccine'}</option>
              {vaccines.map((v) => <option key={v.vaccine_id} value={v.vaccine_id}>{vaccineLabel(v)} ({v.vaccine_type})</option>)}
            </Select>
          </Field>
          <Field label="Dose" required error={errors.dose}>
            <Select value={doseNumber} onChange={(e) => { setDoseNumber(e.target.value); setErrors((x) => ({ ...x, dose: undefined })) }}>
              {Array.from({ length: totalDoses }, (_, i) => <option key={i + 1} value={String(i + 1)}>Dose {i + 1}</option>)}
            </Select>
          </Field>
        </div>

        {vaccineChosen && (
          <p className="rounded-lg bg-brand-ice px-3 py-2 text-xs text-brand-navy">
            <span className="font-semibold">{selectedVaccine!.dose_volume ?? '—'}</span> · {selectedVaccine!.route ?? '—'} · target age {selectedVaccine!.target_age ?? '—'}
          </p>
        )}
        {companions.length > 0 && (
          <div role="note" className="flex items-start gap-2 rounded-xl border border-nutrition/20 bg-nutrition-soft p-3 text-sm text-brand-navy">
            <Pill size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-nutrition" />
            <span>
              {companions.map((c) => `${c.item!.item_name} will be recorded with this dose`).join('; ')}
              <span className="block text-xs text-brand-muted">{companions.map((c) => `${c.quantity} ${c.item!.unit ?? 'unit'}${c.quantity === 1 ? '' : 's'}`).join(', ')} from the child&rsquo;s barangay stock, deducted when the PHN approves.</span>
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date given" required error={errors.date}>
            <DateInput value={vaccinationDate} min={selectedChild?.date_of_birth} max={manilaTodayYMD()} onChange={(e) => { setVaccinationDate(e.target.value); setErrors((x) => ({ ...x, date: undefined })) }} />
          </Field>
          <Field label="Vaccination site" error={errors.site}>
            <Select value={site} onChange={(e) => { setSite(e.target.value); setErrors((x) => ({ ...x, site: undefined })) }}>
              <option value="">Select site</option>
              {VACCINATION_SITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </div>

        <BatchNumberField value={batchNumber} onChange={(v) => { setBatchNumber(v); setErrors((x) => ({ ...x, batch: undefined })) }} error={errors.batch} hint="From the vial or box, e.g. BT-2026-0012. Leave blank to use the oldest batch in stock." />

        <Field label="Remarks">
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Observations, reactions, anything worth noting…" />
        </Field>
      </>)}
    </Modal>
  )
}
