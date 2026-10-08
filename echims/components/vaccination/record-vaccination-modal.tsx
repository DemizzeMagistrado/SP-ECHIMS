'use client'

// NIP-USR003 — Record Administered Vaccine modal (polished).
// Opens from the Records tab's "Add new record" button. Role gating on open:
// Admin / PHN / BHW / RHM can see this; BNS cannot.
//
// Flow:
//   1. User picks a child (barangay-scoped by RLS on /api/children)
//   2. User picks a vaccine (from /api/vaccines) — selection reveals dosage/route card
//   3. User enters dose #, date (defaults today), batch, site, remarks
//   4. Save → POSTs to /api/vaccination/records; online queues on failure.

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  X, AlertCircle, Loader2, Syringe, Wifi, WifiOff, User, Calendar, Hash,
  Droplet, MapPin, ChevronDown, CheckCircle2, Search,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { newClientRequestId, sendOrQueueVaccination, type VaccinationPayload } from '@/lib/vaccination-offline'

type ChildRef = {
  child_id: number
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: string
  barangay_id: number
  barangay?: { barangay_name: string } | { barangay_name: string }[] | null
}

type VaccineRef = {
  vaccine_id: number
  vaccine_type: string
  dose_volume: string | null
  route: string | null
  target_age: string | null
  item: { item_id: number; item_name: string } | { item_id: number; item_name: string }[] | null
}

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  ownerId: string | null
  prefillChildId?: number
}

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

function fullName(c: ChildRef) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
}

function vaccineLabel(v: VaccineRef) {
  const item = one(v.item)
  return item?.item_name || v.vaccine_type || `Vaccine #${v.vaccine_id}`
}

function monthsOld(dob: string): string {
  const birth = new Date(dob + 'T00:00:00')
  const now = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth()
  if (months < 0) return 'unborn'
  if (months < 24) return `${months} mo`
  const years = Math.floor(months / 12)
  const remMo = months % 12
  return remMo ? `${years}y ${remMo}mo` : `${years}y`
}

const todayYMD = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// --- Shared field styles ---
const FIELD_LABEL = 'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const FIELD_INPUT = 'w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted/40'
const SELECT_WRAP = 'relative'
const SELECT_INPUT = `${FIELD_INPUT} appearance-none pr-9`

function Required() {
  return <span className="text-rose-500" aria-label="required">*</span>
}

export function RecordVaccinationModal({ open, onClose, onSaved, ownerId, prefillChildId }: Props) {
  const { showToast } = useToast()
  const [isOnline, setIsOnline] = useState(true)

  const [childId, setChildId] = useState<number | ''>('')
  const [childQuery, setChildQuery] = useState<string>('')          // text typed in the combobox
  const [childOpen, setChildOpen] = useState<boolean>(false)         // suggestions dropdown visibility
  const [childActiveIdx, setChildActiveIdx] = useState<number>(0)    // highlighted suggestion for keyboard nav
  const childBoxRef = useRef<HTMLDivElement | null>(null)            // outside-click detection
  const [vaccineId, setVaccineId] = useState<number | ''>('')
  const [doseNumber, setDoseNumber] = useState<string>('1')
  const [vaccinationDate, setVaccinationDate] = useState<string>(todayYMD())
  const [batchNumber, setBatchNumber] = useState<string>('')
  const [vaccinationSite, setVaccinationSite] = useState<string>('')
  const [remarks, setRemarks] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const childrenSWR = useSWR<{ children: ChildRef[] }>(open ? '/api/children' : null, fetcher)
  const vaccinesSWR = useSWR<{ vaccines: VaccineRef[] }>(open ? '/api/vaccines' : null, fetcher)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const update = () => setIsOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setChildId(prefillChildId ?? '')
    setChildQuery('')
    setChildOpen(false)
    setChildActiveIdx(0)
    setVaccineId('')
    setDoseNumber('1')
    setVaccinationDate(todayYMD())
    setBatchNumber('')
    setVaccinationSite('')
    setRemarks('')
    setFormError(null)
  }, [open, prefillChildId])

  // Once children load + a prefillChildId exists, show its name in the combobox input.
  useEffect(() => {
    if (!open || !prefillChildId) return
    const list = childrenSWR.data?.children
    const c = list?.find((row) => row.child_id === prefillChildId)
    if (c) setChildQuery(fullName(c))
  }, [open, prefillChildId, childrenSWR.data])

  // Close suggestions when clicking outside the combobox
  useEffect(() => {
    if (!childOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!childBoxRef.current) return
      if (!childBoxRef.current.contains(e.target as Node)) setChildOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [childOpen])

  const selectedChild = useMemo(
    () => childrenSWR.data?.children?.find((c) => c.child_id === childId) ?? null,
    [childrenSWR.data, childId],
  )

  // Filtered suggestions for the child combobox — matches first/middle/last/barangay
  // substrings, case-insensitive. Caps at 8 so the dropdown stays short.
  const childSuggestions = useMemo(() => {
    const all = childrenSWR.data?.children ?? []
    const q = childQuery.trim().toLowerCase()
    if (!q) return all.slice(0, 8)
    return all.filter((c) => {
      const b = one(c.barangay)
      const hay = `${c.first_name} ${c.middle_name ?? ''} ${c.last_name} ${b?.barangay_name ?? ''}`.toLowerCase()
      return hay.includes(q)
    }).slice(0, 8)
  }, [childrenSWR.data, childQuery])

  function pickChild(c: ChildRef) {
    setChildId(c.child_id)
    setChildQuery(fullName(c))
    setChildOpen(false)
    setChildActiveIdx(0)
  }
  const selectedVaccine = useMemo(
    () => vaccinesSWR.data?.vaccines?.find((v) => v.vaccine_id === vaccineId) ?? null,
    [vaccinesSWR.data, vaccineId],
  )

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!ownerId) { setFormError('Please sign in first.'); return }
    if (!childId) { setFormError('Please select a child.'); return }
    if (!vaccineId) { setFormError('Please select a vaccine.'); return }
    const dose = Number(doseNumber)
    if (!Number.isSafeInteger(dose) || dose <= 0) { setFormError('Dose number must be a positive integer.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vaccinationDate)) { setFormError('Please pick a valid date.'); return }
    if (new Date(vaccinationDate + 'T23:59:59') > new Date()) { setFormError('Date cannot be in the future.'); return }

    const payload: VaccinationPayload = {
      child_id: Number(childId),
      vaccine_id: Number(vaccineId),
      dose_number: dose,
      vaccination_date: vaccinationDate,
      batch_number: batchNumber.trim() || null,
      vaccination_site: vaccinationSite.trim() || null,
      remarks: remarks.trim() || null,
      schedule_id: null,
      client_request_id: newClientRequestId(),
    }
    const display = {
      childName: selectedChild ? fullName(selectedChild) : `Child #${childId}`,
      vaccineLabel: selectedVaccine ? vaccineLabel(selectedVaccine) : `Vaccine #${vaccineId}`,
    }

    setSubmitting(true)
    const res = await sendOrQueueVaccination(ownerId, payload, display)
    setSubmitting(false)

    if (res.ok) {
      showToast({ type: 'success', message: res.idempotent ? 'Record already synced.' : 'Record saved. Pending PHN approval.' })
      onSaved(); onClose(); return
    }
    if (res.queued) {
      showToast({ type: 'success', message: 'Saved locally. Will sync when you reconnect.' })
      onSaved(); onClose(); return
    }
    setFormError(res.error)
  }

  const vaccineChosen = Boolean(selectedVaccine)
  const dosage = selectedVaccine?.dose_volume ?? null
  const route = selectedVaccine?.route ?? null
  const targetAge = selectedVaccine?.target_age ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="my-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* ===== Header ===== */}
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-sky-50 via-white to-white px-6 pt-6 pb-5">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
              <Syringe size={20} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">Record administered vaccination</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Saves as <span className="font-semibold text-amber-700">PENDING</span> for PHN approval. Stock deducts on approve.
              </p>
            </div>
          </div>

          {/* Online/offline chip */}
          <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {isOnline
              ? <><Wifi size={12} /> Online — saves to server</>
              : <><WifiOff size={12} /> Offline — will queue locally</>}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ===== Section: Patient & Vaccine ===== */}
          <section className="space-y-4 px-6 pt-6">
            <SectionTitle>Patient &amp; vaccine</SectionTitle>

            {/* Child combobox (type to search) */}
            <div className="space-y-1.5">
              <label htmlFor="rv-child" className={FIELD_LABEL}>
                <User size={12} /> Child <Required />
              </label>
              <div ref={childBoxRef} className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="rv-child"
                  type="text"
                  value={childQuery}
                  onChange={(e) => {
                    setChildQuery(e.target.value)
                    // Typing invalidates any previously-picked child until they pick again
                    if (childId) setChildId('')
                    setChildOpen(true)
                    setChildActiveIdx(0)
                  }}
                  onFocus={() => setChildOpen(true)}
                  onKeyDown={(e) => {
                    if (!childOpen) return
                    if (e.key === 'ArrowDown') { e.preventDefault(); setChildActiveIdx((i) => Math.min(i + 1, childSuggestions.length - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setChildActiveIdx((i) => Math.max(i - 1, 0)) }
                    else if (e.key === 'Enter') {
                      if (childSuggestions[childActiveIdx]) { e.preventDefault(); pickChild(childSuggestions[childActiveIdx]) }
                    } else if (e.key === 'Escape') { setChildOpen(false) }
                  }}
                  placeholder={childrenSWR.isLoading ? 'Loading children…' : 'Type a child\'s name…'}
                  className={`${FIELD_INPUT} pl-9 ${childQuery && !childId ? 'ring-2 ring-amber-200' : ''}`}
                  autoComplete="off"
                  disabled={!!prefillChildId || childrenSWR.isLoading}
                  aria-autocomplete="list"
                  aria-expanded={childOpen}
                  aria-controls="rv-child-listbox"
                  required
                />
                {childQuery && !prefillChildId && (
                  <button
                    type="button"
                    onClick={() => { setChildId(''); setChildQuery(''); setChildOpen(true); setChildActiveIdx(0) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Clear"
                  >
                    <X size={14} />
                  </button>
                )}

                {/* Suggestions panel */}
                {childOpen && !prefillChildId && (
                  <div
                    id="rv-child-listbox"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-100"
                  >
                    {childrenSWR.isLoading && (
                      <div className="px-3 py-3 text-sm text-muted-foreground">Loading…</div>
                    )}
                    {!childrenSWR.isLoading && childSuggestions.length === 0 && (
                      <div className="px-3 py-3 text-sm text-muted-foreground">
                        No match for &ldquo;{childQuery}&rdquo;.
                      </div>
                    )}
                    {childSuggestions.map((c, idx) => {
                      const b = one(c.barangay)
                      const active = idx === childActiveIdx
                      return (
                        <button
                          key={c.child_id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setChildActiveIdx(idx)}
                          onClick={() => pickChild(c)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                            active ? 'bg-sky-50' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{fullName(c)}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {b?.barangay_name ?? '—'} · {monthsOld(c.date_of_birth)} · DOB {c.date_of_birth}
                            </p>
                          </div>
                          {childId === c.child_id && <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {!childId && childQuery && (
                <p className="text-xs text-amber-700">Pick a match from the suggestions.</p>
              )}
            </div>

            {/* Vaccine picker */}
            <div className="space-y-1.5">
              <label htmlFor="rv-vaccine" className={FIELD_LABEL}>
                <Syringe size={12} /> Vaccine <Required />
              </label>
              <div className={SELECT_WRAP}>
                <select
                  id="rv-vaccine"
                  value={vaccineId}
                  onChange={(e) => setVaccineId(e.target.value ? Number(e.target.value) : '')}
                  className={SELECT_INPUT}
                  disabled={vaccinesSWR.isLoading}
                  required
                >
                  <option value="">
                    {vaccinesSWR.isLoading ? 'Loading vaccines…' : 'Select a vaccine'}
                  </option>
                  {vaccinesSWR.data?.vaccines?.map((v) => (
                    <option key={v.vaccine_id} value={v.vaccine_id}>
                      {vaccineLabel(v)} ({v.vaccine_type})
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              {vaccinesSWR.data?.vaccines?.length === 0 && (
                <p className="text-xs text-amber-700">No vaccines seeded. Run the NIP-USR003 migration first.</p>
              )}
            </div>

            {/* Vaccine info card — only shown once a vaccine is picked */}
            {vaccineChosen && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <CheckCircle2 size={12} /> Vaccine profile
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <InfoCell icon={<Droplet size={13} />} label="Dosage" value={dosage} />
                  <InfoCell icon={<MapPin size={13} />} label="Route" value={route} />
                  <InfoCell icon={<Calendar size={13} />} label="Target age" value={targetAge} />
                </div>
              </div>
            )}
          </section>

          {/* ===== Section: Administration ===== */}
          <section className="space-y-4 px-6 pt-6">
            <SectionTitle>Administration</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="rv-dose" className={FIELD_LABEL}>
                  <Hash size={12} /> Dose number <Required />
                </label>
                <input
                  id="rv-dose"
                  type="number"
                  min={1}
                  value={doseNumber}
                  onChange={(e) => setDoseNumber(e.target.value)}
                  className={FIELD_INPUT}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rv-date" className={FIELD_LABEL}>
                  <Calendar size={12} /> Date administered <Required />
                </label>
                <input
                  id="rv-date"
                  type="date"
                  value={vaccinationDate}
                  max={todayYMD()}
                  onChange={(e) => setVaccinationDate(e.target.value)}
                  className={FIELD_INPUT}
                  required
                />
              </div>
            </div>
          </section>

          {/* ===== Section: Documentation ===== */}
          <section className="space-y-4 px-6 pt-6">
            <SectionTitle>Documentation</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="rv-batch" className={FIELD_LABEL}>Batch number</label>
                <input
                  id="rv-batch"
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="e.g. BT-2026-0012"
                  className={FIELD_INPUT}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rv-site" className={FIELD_LABEL}>Vaccination site</label>
                <input
                  id="rv-site"
                  type="text"
                  value={vaccinationSite}
                  onChange={(e) => setVaccinationSite(e.target.value)}
                  placeholder="e.g. Left deltoid"
                  className={FIELD_INPUT}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rv-remarks" className={FIELD_LABEL}>Remarks</label>
              <textarea
                id="rv-remarks"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Observations, reactions, anything worth noting…"
                className={`${FIELD_INPUT} resize-none`}
              />
            </div>
          </section>

          {/* ===== Error banner ===== */}
          {formError && (
            <div className="mx-6 mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* ===== Footer ===== */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <p className="text-xs text-muted-foreground">
              Recorded by <span className="font-semibold text-foreground">you</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="animate-spin" size={14} />}
                {submitting ? 'Saving…' : 'Save as PENDING'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- Small subcomponents ---

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary/80">
      {children}
    </h3>
  )
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-white/80 px-2.5 py-2 ring-1 ring-sky-100">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {icon} {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold ${value ? 'text-foreground' : 'text-slate-400'}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}