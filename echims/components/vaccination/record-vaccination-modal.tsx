'use client'

// NIP-USR003 — Record Administered Vaccine modal.
// Opens from the Records tab's "Add new record" button. Role gating on open:
// Admin / PHN / BHW / RHM can see this; BNS cannot.
//
// Flow:
//   1. User picks a child (barangay-scoped by RLS on /api/children)
//   2. User picks a vaccine (from /api/vaccines)
//   3. User enters dose #, date (defaults today), batch, site, remarks
//   4. On Save: generates a client_request_id (uuid) and POSTs to /api/vaccination/records
//      - online + 2xx → success toast, close, refresh list
//      - online + 4xx → inline error, user fixes
//      - offline / 5xx → queued in IndexedDB (vaccination-offline.ts), success toast says "saved locally"

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { X, AlertCircle, Loader2, Syringe, Wifi, WifiOff } from 'lucide-react'
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
  onSaved: () => void                 // called after a successful save or local queue
  ownerId: string | null              // auth.uid() of the current user — needed for offline queue keying
  prefillChildId?: number             // when launched from a child profile, pre-select that child
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

const todayYMD = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function RecordVaccinationModal({ open, onClose, onSaved, ownerId, prefillChildId }: Props) {
  const { showToast } = useToast()
  const [isOnline, setIsOnline] = useState(true)

  // Form state
  const [childId, setChildId] = useState<number | ''>('')
  const [vaccineId, setVaccineId] = useState<number | ''>('')
  const [doseNumber, setDoseNumber] = useState<string>('1')
  const [vaccinationDate, setVaccinationDate] = useState<string>(todayYMD())
  const [batchNumber, setBatchNumber] = useState<string>('')
  const [vaccinationSite, setVaccinationSite] = useState<string>('')
  const [remarks, setRemarks] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Load children (RLS-scoped) + vaccines
  const childrenSWR = useSWR<{ children: ChildRef[] }>(open ? '/api/children' : null, fetcher)
  const vaccinesSWR = useSWR<{ vaccines: VaccineRef[] }>(open ? '/api/vaccines' : null, fetcher)

  // Online/offline detection
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

  // Prefill on open
  useEffect(() => {
    if (!open) return
    setChildId(prefillChildId ?? '')
    setVaccineId('')
    setDoseNumber('1')
    setVaccinationDate(todayYMD())
    setBatchNumber('')
    setVaccinationSite('')
    setRemarks('')
    setFormError(null)
  }, [open, prefillChildId])

  const selectedChild = useMemo(
    () => childrenSWR.data?.children?.find((c) => c.child_id === childId) ?? null,
    [childrenSWR.data, childId],
  )
  const selectedVaccine = useMemo(
    () => vaccinesSWR.data?.vaccines?.find((v) => v.vaccine_id === vaccineId) ?? null,
    [vaccinesSWR.data, vaccineId],
  )

  // Dosage pulled from vaccine (not stored again on the record)
  const dosageDisplay = selectedVaccine?.dose_volume ?? '—'
  const routeDisplay = selectedVaccine?.route ?? '—'

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    // --- Required-field validation ---
    if (!ownerId) { setFormError('Please sign in first.'); return }
    if (!childId) { setFormError('Please select a child.'); return }
    if (!vaccineId) { setFormError('Please select a vaccine.'); return }
    const dose = Number(doseNumber)
    if (!Number.isSafeInteger(dose) || dose <= 0) { setFormError('Dose number must be a positive integer.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vaccinationDate)) { setFormError('Please pick a valid date.'); return }
    if (new Date(vaccinationDate + 'T23:59:59') > new Date()) { setFormError('Date cannot be in the future.'); return }

    // --- Build payload ---
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
      onSaved()
      onClose()
      return
    }
    if (res.queued) {
      showToast({ type: 'success', message: 'Saved locally. Will sync when you reconnect.' })
      onSaved()
      onClose()
      return
    }
    setFormError(res.error)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
      <div className="mx-auto my-6 max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-sky-100 text-primary">
              <Syringe size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Record administered vaccination</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Saves as PENDING for PHN approval. Stock is deducted on approve.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* Online/offline banner */}
        <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
          isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
        }`}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          {isOnline ? 'Online — record will save to the server.' : 'Offline — record will save locally and sync when reconnected.'}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          {/* Child picker */}
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">Child <span className="text-rose-600">*</span></span>
            <select
              value={childId}
              onChange={(e) => setChildId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-muted"
              disabled={!!prefillChildId || childrenSWR.isLoading}
              required
            >
              <option value="">
                {childrenSWR.isLoading ? 'Loading children...' : 'Select a child in your barangay'}
              </option>
              {childrenSWR.data?.children?.map((c) => {
                const b = one(c.barangay)
                return (
                  <option key={c.child_id} value={c.child_id}>
                    {fullName(c)} — {b?.barangay_name ?? 'No barangay'} (DOB {c.date_of_birth})
                  </option>
                )
              })}
            </select>
          </label>

          {/* Vaccine picker */}
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">Vaccine <span className="text-rose-600">*</span></span>
            <select
              value={vaccineId}
              onChange={(e) => setVaccineId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={vaccinesSWR.isLoading}
              required
            >
              <option value="">
                {vaccinesSWR.isLoading ? 'Loading vaccines...' : 'Select a vaccine'}
              </option>
              {vaccinesSWR.data?.vaccines?.map((v) => (
                <option key={v.vaccine_id} value={v.vaccine_id}>
                  {vaccineLabel(v)} ({v.vaccine_type})
                </option>
              ))}
            </select>
            {vaccinesSWR.data?.vaccines?.length === 0 && (
              <span className="text-xs text-amber-700">
                No vaccines are seeded yet. Run the NIP-USR003 migration first.
              </span>
            )}
          </label>

          {/* Dose + date in a row */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Dose number <span className="text-rose-600">*</span></span>
              <input
                type="number"
                min={1}
                value={doseNumber}
                onChange={(e) => setDoseNumber(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Date administered <span className="text-rose-600">*</span></span>
              <input
                type="date"
                value={vaccinationDate}
                max={todayYMD()}
                onChange={(e) => setVaccinationDate(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </label>
          </div>

          {/* Read-only dosage + route pulled from vaccine */}
          <div className="grid gap-4 rounded-lg bg-muted/40 p-3 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Dosage (from vaccine)</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{dosageDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Route</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{routeDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recorded by</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">You (auto-captured)</p>
            </div>
          </div>

          {/* Batch + site in a row */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Batch number</span>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g. BT-2026-0012"
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">Free text in v1 — batch tracking is a later ticket.</span>
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Vaccination site</span>
              <input
                type="text"
                value={vaccinationSite}
                onChange={(e) => setVaccinationSite(e.target.value)}
                placeholder="e.g. Left deltoid"
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          {/* Remarks */}
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">Remarks</span>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any notes about this administration..."
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {/* Error banner */}
          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="animate-spin" size={14} />}
              {submitting ? 'Saving...' : 'Save as PENDING'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}