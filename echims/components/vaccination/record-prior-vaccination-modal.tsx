'use client'

// NIP-USR008 — Record Prior vaccination modal.
// Opened in the context of a specific child from the Immunization History section.
// Admin/RHM/BHW can use this (not PHN per NIP-USR007, not BNS).
//
// Why prior records exist:
//   A child enrolling in eCHIMS may already have shots documented in a Baby Book
//   or a prior RHU's records. Without a way to capture those, the schedule
//   computation would flag them as overdue defaulters. This modal lets staff
//   record those prior doses so the schedule reflects reality.
//
// Flow:
//   1. User picks a vaccine (from /api/vaccines — active catalog)
//   2. Enters dose #, date given, optional batch + site, REQUIRED source string
//   3. Submit → POST /api/vaccination/prior → auto-APPROVED on success
//   4. On success, calls onSaved() so the parent SWR cache refreshes

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  X, AlertCircle, Loader2, Syringe, Calendar, Hash, MapPin, FileText,
  CheckCircle2, History,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'

type VaccineOption = {
  vaccine_id: number
  vaccine_type: string
  dose_volume: string | null
  route: string | null
  target_age: string | null
  item?: { item_name?: string } | { item_name?: string }[] | null
}

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  childId: number
  childName: string
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load.')
  return d
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Common source presets so staff doesn't have to re-type "Baby Book" over and over.
const SOURCE_PRESETS = [
  'Baby Book',
  'Mother\'s Record',
  'Prior RHU record',
  'Transfer certificate',
  'Hospital discharge summary',
] as const

export function RecordPriorVaccinationModal({ open, onClose, onSaved, childId, childName }: Props) {
  const { showToast } = useToast()
  const { data, error, isLoading } = useSWR<{ vaccines: VaccineOption[] }>(
    open ? '/api/vaccines' : null,
    fetcher,
  )

  const [vaccineId, setVaccineId] = useState<string>('')
  const [doseNumber, setDoseNumber] = useState<string>('1')
  const [vaccinationDate, setVaccinationDate] = useState<string>('')
  const [batchNumber, setBatchNumber] = useState<string>('')
  const [site, setSite] = useState<string>('')
  const [sourcePreset, setSourcePreset] = useState<string>(SOURCE_PRESETS[0])
  const [sourceCustom, setSourceCustom] = useState<string>('')
  const [remarks, setRemarks] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string>('')

  const vaccines = data?.vaccines ?? []
  const selectedVaccine = useMemo(
    () => vaccines.find((v) => String(v.vaccine_id) === vaccineId) ?? null,
    [vaccines, vaccineId],
  )

  // Reset form when modal (re)opens so stale state doesn't bleed into the next child.
  useEffect(() => {
    if (open) {
      setVaccineId('')
      setDoseNumber('1')
      setVaccinationDate('')
      setBatchNumber('')
      setSite('')
      setSourcePreset(SOURCE_PRESETS[0])
      setSourceCustom('')
      setRemarks('')
      setFormError('')
    }
  }, [open])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')

    // Client-side guardrails (server re-validates everything).
    if (!vaccineId) return setFormError('Please pick a vaccine.')
    const dose = Number(doseNumber)
    if (!Number.isSafeInteger(dose) || dose <= 0) return setFormError('Dose number must be a positive whole number.')
    if (!vaccinationDate) return setFormError('Please enter the date the dose was given.')
    if (new Date(vaccinationDate + 'T23:59:59') > new Date()) {
      return setFormError('Date given cannot be in the future.')
    }
    const source = sourcePreset === 'Other' ? sourceCustom.trim() : sourcePreset.trim()
    if (!source) return setFormError('Please pick or enter a record source.')

    setSaving(true)
    try {
      const r = await fetch('/api/vaccination/prior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_id: childId,
          vaccine_id: Number(vaccineId),
          dose_number: dose,
          vaccination_date: vaccinationDate,
          batch_number: batchNumber.trim() || undefined,
          vaccination_site: site.trim() || undefined,
          prior_source: source,
          remarks: remarks.trim() || undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Save failed (HTTP ${r.status}).`)
      showToast({ type: 'success', message: `Prior ${selectedVaccine?.vaccine_type ?? 'vaccine'} dose ${dose} saved for ${childName}.` })
      onSaved?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save prior record.'
      setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <History size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Add past vaccination</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                For <strong>{childName}</strong>. Use this for shots given before eCHIMS enrollment (Baby Book, prior RHU, etc.).
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="space-y-5 p-6">
          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              Prior records are <strong>auto-approved</strong> and count as completed doses in the schedule. They do not go through PHN review.
            </span>
          </div>

          {/* Vaccine */}
          <div>
            <label htmlFor="vaccine" className="mb-1 block text-sm font-semibold text-foreground">
              <Syringe size={13} className="mr-1 inline" /> Vaccine *
            </label>
            {isLoading ? (
              <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">Loading catalog…</div>
            ) : error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error.message}</div>
            ) : (
              <select
                id="vaccine"
                value={vaccineId}
                onChange={(e) => setVaccineId(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select a vaccine…</option>
                {vaccines.map((v) => {
                  const name = one(v.item)?.item_name ?? v.vaccine_type
                  return <option key={v.vaccine_id} value={v.vaccine_id}>{name} ({v.vaccine_type})</option>
                })}
              </select>
            )}
            {selectedVaccine && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedVaccine.dose_volume ?? '—'} · {selectedVaccine.route ?? '—'} · {selectedVaccine.target_age ?? '—'}
              </p>
            )}
          </div>

          {/* Dose + Date row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="dose" className="mb-1 block text-sm font-semibold text-foreground">
                <Hash size={13} className="mr-1 inline" /> Dose number *
              </label>
              <input
                id="dose"
                type="number"
                min="1"
                step="1"
                value={doseNumber}
                onChange={(e) => setDoseNumber(e.target.value)}
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="date" className="mb-1 block text-sm font-semibold text-foreground">
                <Calendar size={13} className="mr-1 inline" /> Date given *
              </label>
              <input
                id="date"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={vaccinationDate}
                onChange={(e) => setVaccinationDate(e.target.value)}
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Source — the key field that distinguishes prior records */}
          <div>
            <label htmlFor="source-preset" className="mb-1 block text-sm font-semibold text-foreground">
              <FileText size={13} className="mr-1 inline" /> Record source *
            </label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <select
                id="source-preset"
                value={sourcePreset}
                onChange={(e) => setSourcePreset(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {SOURCE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="Other">Other (specify)</option>
              </select>
              {sourcePreset === 'Other' && (
                <input
                  type="text"
                  value={sourceCustom}
                  onChange={(e) => setSourceCustom(e.target.value)}
                  placeholder="e.g. Transferred from Legazpi RHU"
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Where did this record come from? Required for audit.</p>
          </div>

          {/* Batch + Site row (both optional) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="batch" className="mb-1 block text-sm font-semibold text-foreground">
                Batch number <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                id="batch"
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="If known"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="site" className="mb-1 block text-sm font-semibold text-foreground">
                <MapPin size={13} className="mr-1 inline" /> Site <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                id="site"
                type="text"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="e.g. Left thigh"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Remarks (optional) */}
          <div>
            <label htmlFor="remarks" className="mb-1 block text-sm font-semibold text-foreground">
              Remarks <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Any notes about this prior record"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Error */}
          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
              {saving ? 'Saving…' : 'Save prior record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}