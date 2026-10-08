'use client'

// NIP-USR006 — Add / edit vaccine form modal (admin-only).

import { useEffect, useMemo, useState } from 'react'
import { X, AlertCircle, Loader2, Syringe, Hash, Droplet, MapPin, Calendar } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

export type VaccineCatalogRow = {
  vaccine_id: number
  vaccine_type: string
  dose_volume: string | null
  route: string | null
  target_age: string | null
  min_age_days: number
  interval_days: number | null
  total_doses: number
  updated_at: string
  item: { item_id: number; item_name: string; description: string | null; unit: string; status: string } |
        { item_id: number; item_name: string; description: string | null; unit: string; status: string }[] | null
}

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing: VaccineCatalogRow | null   // null = CREATE, non-null = EDIT
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export function VaccineFormModal({ open, onClose, onSaved, editing }: Props) {
  const { showToast } = useToast()
  const isEdit = Boolean(editing)

  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('dose')
  const [vaccineType, setVaccineType] = useState('')
  const [doseVolume, setDoseVolume] = useState('')
  const [route, setRoute] = useState('')
  const [targetAge, setTargetAge] = useState('')
  const [minAgeDays, setMinAgeDays] = useState<string>('0')
  const [intervalDays, setIntervalDays] = useState<string>('')
  const [totalDoses, setTotalDoses] = useState<string>('1')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)   // 2-step confirmation before save

  useEffect(() => {
    if (!open) return
    const item = editing ? one(editing.item) : null
    setItemName(item?.item_name ?? '')
    setDescription(item?.description ?? '')
    setUnit(item?.unit ?? 'dose')
    setVaccineType(editing?.vaccine_type ?? '')
    setDoseVolume(editing?.dose_volume ?? '')
    setRoute(editing?.route ?? '')
    setTargetAge(editing?.target_age ?? '')
    setMinAgeDays(String(editing?.min_age_days ?? 0))
    setIntervalDays(editing?.interval_days != null ? String(editing.interval_days) : '')
    setTotalDoses(String(editing?.total_doses ?? 1))
    setFormError(null)
    setConfirming(false)
  }, [open, editing])

  const totalDosesNum = Number(totalDoses)
  const intervalRequired = useMemo(() => totalDosesNum > 1, [totalDosesNum])

  if (!open) return null

  function validate(): string | null {
    if (!itemName.trim()) return 'Vaccine name is required.'
    if (!vaccineType.trim()) return 'Short code (vaccine_type) is required — e.g. BCG, PENTA.'
    if (vaccineType.trim().length > 32) return 'Short code must be 32 characters or fewer.'
    const min = Number(minAgeDays)
    if (!Number.isSafeInteger(min) || min < 0) return 'Minimum age (days) must be a non-negative integer.'
    const dose = Number(totalDoses)
    if (!Number.isSafeInteger(dose) || dose < 1 || dose > 10) return 'Total doses must be 1-10.'
    if (dose > 1) {
      const iv = Number(intervalDays)
      if (!Number.isSafeInteger(iv) || iv <= 0) return 'Interval (days) must be a positive integer when total doses > 1.'
    }
    return null
  }

  function requestSave(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError(null)
    setConfirming(true)
  }

  async function doSave() {
    setSubmitting(true)
    try {
      const payload = {
        ...(isEdit ? { vaccine_id: editing!.vaccine_id } : {}),
        item_name: itemName.trim(),
        description: description.trim() || null,
        unit: unit.trim() || 'dose',
        vaccine_type: vaccineType.trim().toUpperCase(),
        dose_volume: doseVolume.trim() || null,
        route: route.trim() || null,
        target_age: targetAge.trim() || null,
        min_age_days: Number(minAgeDays),
        interval_days: totalDosesNum > 1 ? Number(intervalDays) : null,
        total_doses: Number(totalDoses),
      }
      const r = await fetch('/api/vaccines/catalog', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed.')
      showToast({ type: 'success', message: isEdit ? 'Vaccine updated.' : 'Vaccine created.' })
      onSaved()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed.')
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="my-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-sky-50 via-white to-white px-6 pt-6 pb-5">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
              <Syringe size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{isEdit ? 'Edit vaccine' : 'Add new vaccine'}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Catalog + schedule rules follow DOH guidelines. Changes affect schedule computation.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={requestSave} className="space-y-5 px-6 pt-5 pb-4">
          {/* Identity */}
          <section className="space-y-3">
            <SectionTitle>Vaccine identity</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vaccine name" required>
                <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Pentavalent Vaccine" className={INPUT} required />
              </Field>
              <Field label="Short code (vaccine_type)" required hint="UPPERCASE, max 32 chars">
                <input value={vaccineType} onChange={(e) => setVaccineType(e.target.value.toUpperCase())} placeholder="e.g. PENTA" className={INPUT} maxLength={32} required />
              </Field>
            </div>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="e.g. DPT-HepB-Hib 5-in-1 combination" className={`${INPUT} resize-none`} />
            </Field>
          </section>

          {/* Administration details */}
          <section className="space-y-3">
            <SectionTitle>Administration</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={<><Droplet size={11} className="inline" /> Dose volume</>}>
                <input value={doseVolume} onChange={(e) => setDoseVolume(e.target.value)} placeholder="e.g. 0.5 mL" className={INPUT} />
              </Field>
              <Field label={<><MapPin size={11} className="inline" /> Route</>}>
                <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Intramuscular" className={INPUT} />
              </Field>
              <Field label="Unit (inventory)">
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="dose" className={INPUT} />
              </Field>
            </div>
            <Field label={<><Calendar size={11} className="inline" /> Target age (display text)</>}>
              <input value={targetAge} onChange={(e) => setTargetAge(e.target.value)} placeholder="e.g. 6, 10, 14 weeks" className={INPUT} />
            </Field>
          </section>

          {/* Schedule rules — THIS drives due/overdue computation */}
          <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <SectionTitle tone="amber">Schedule rules (used by alerts and defaulters)</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={<><Hash size={11} className="inline" /> Total doses</>} required hint="1-10">
                <input type="number" min={1} max={10} value={totalDoses} onChange={(e) => setTotalDoses(e.target.value)} className={INPUT} required />
              </Field>
              <Field label="Minimum age (days)" required hint="Days after birth for dose 1">
                <input type="number" min={0} value={minAgeDays} onChange={(e) => setMinAgeDays(e.target.value)} className={INPUT} required />
              </Field>
              <Field label={`Interval (days)${intervalRequired ? '' : ' — not needed for single-dose'}`} required={intervalRequired} hint="Days between consecutive doses">
                <input
                  type="number"
                  min={1}
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(e.target.value)}
                  disabled={!intervalRequired}
                  placeholder={intervalRequired ? 'e.g. 28' : '—'}
                  className={`${INPUT} ${!intervalRequired ? 'bg-slate-100 text-muted-foreground' : ''}`}
                  required={intervalRequired}
                />
              </Field>
            </div>
          </section>

          {/* Error */}
          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </form>

        {/* Footer — confirmation step */}
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          {!confirming ? (
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" onClick={requestSave} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
                {isEdit ? 'Review changes' : 'Review new vaccine'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Confirm {isEdit ? 'update' : 'creation'}.</strong> This change is logged in the audit trail and may affect generated schedules + overdue alerts.
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setConfirming(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Back</button>
                <button type="button" onClick={doSave} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {submitting && <Loader2 className="animate-spin" size={14} />}
                  {submitting ? 'Saving…' : `Yes, ${isEdit ? 'update' : 'create'}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Small subcomponents ---
const INPUT = 'w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed'

function SectionTitle({ children, tone }: { children: React.ReactNode; tone?: 'amber' }) {
  const color = tone === 'amber' ? 'text-amber-900' : 'text-primary/80'
  return <h3 className={`text-[11px] font-bold uppercase tracking-widest ${color}`}>{children}</h3>
}

function Field({ label, required, hint, children }: { label: React.ReactNode; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </div>
      {children}
      {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  )
}