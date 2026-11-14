'use client'

// Scores dialog for one nutritional assessment (This assessment / History) and the Edit
// measurements dialog it opens. Edits go through POST /api/nutritional-assessment/edit (the
// edit_nutritional_assessment RPC), which keeps the earlier values as a revision.

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import useSWR, { type SWRResponse } from 'swr'
import { AlertTriangle, Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { TabBar } from '@/components/ui/module-tabs'
import { Button } from '@/components/ui/button'
import { Field, Select, Textarea, Input } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { MUAC_SOFT_WARNING, muacUnusual, nutritionFlagClass, nutritionLabel, nutritionTone } from '@/lib/nutrition-status'

type Num = number | string | null

/** The assessment fields the dialogs use (the page's Assessment rows have all of them). */
export type ScoresAssessment = {
  assessment_id: number
  child_id: number
  assessed_by: string
  assessment_date: string
  weight: Num
  height: Num
  muac: Num
  measurement_type: 'LENGTH' | 'HEIGHT' | null
  edema_grade: number | null
  age_days: number | null
  sex_at_assessment: string | null
  normalized_height_cm: Num
  waz: Num
  haz: Num
  whz: Num
  baz: Num
  bmi: Num
  weight_for_age: string | null
  height_for_age: string | null
  weight_for_height: string | null
  bmi_for_age: string | null
  muac_status: string | null
  nutritional_status: string
  evaluation_status: string
  engine_version: string | null
  remarks?: string | null
}

type Revision = {
  revision_no: number
  changed_fields: string[]
  old_values: Record<string, unknown>
  new_values: Record<string, unknown>
  reason: string
  note: string | null
  editor_name: string | null
  editor_role: string | null
  edited_at: string
}
type HistoryRow = {
  assessment_id: number
  assessment_date: string
  weight: Num
  height: Num
  measurement_type: string | null
  muac: Num
  nutritional_status: string
  engine_version: string | null
  revisions: Revision[]
}
type HistoryPayload = { assessments: HistoryRow[]; revisionsAvailable: boolean }

const shown = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))
const zScore = (v: Num) => {
  if (v === null || v === '' || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`
}
const edemaText = (g: unknown) => (g === null || g === undefined ? 'Not recorded' : Number(g) === 0 ? 'Absent' : `Grade ${'+'.repeat(Number(g))}`)
const position = (t: unknown) => (t === 'LENGTH' ? 'Length' : t === 'HEIGHT' ? 'Height' : '—')
const REASON_LABEL: Record<string, string> = {
  ENTRY_ERROR: 'Entry error',
  REMEASURED_SAME_DAY: 'Re-measured the same day',
  WRONG_POSITION: 'Wrong measurement position',
  OTHER: 'Other',
}
const EDEMA_OPTIONS = [
  ['0', 'Absent'],
  ['1', 'Grade + (feet)'],
  ['2', 'Grade ++ (feet and legs)'],
  ['3', 'Grade +++ (generalized)'],
] as const

function Pill({ item }: { item: Pick<ScoresAssessment, 'nutritional_status' | 'engine_version'> }) {
  return (
    <StatusBadge
      status={item.nutritional_status ?? 'unknown'}
      tone={item.engine_version ? nutritionTone(item.nutritional_status) : 'neutral'}
      label={item.engine_version ? nutritionLabel(item.nutritional_status) : 'Legacy — not verified'}
      className="text-xs font-semibold"
    />
  )
}

/** One line on what drove the result, from the stored classifications. */
function driver(item: ScoresAssessment) {
  if (!item.engine_version) return 'Legacy classification: not verified by the rule engine.'
  const s = item.nutritional_status
  const parts: string[] = []
  if (s === 'SAM' || s === 'MAM') {
    if (item.muac_status && item.muac_status.includes('LOW_MUAC') && item.muac_status !== 'NO_LOW_MUAC') parts.push(`MUAC: ${nutritionLabel(item.muac_status).toLowerCase().replace('muac', 'MUAC')}`)
    if (item.edema_grade && item.edema_grade > 0) parts.push(`bilateral pitting edema (${'+'.repeat(item.edema_grade)})`)
    if (item.weight_for_height && /WASTED/.test(item.weight_for_height)) parts.push(`weight-for-length/height: ${nutritionLabel(item.weight_for_height).toLowerCase()}`)
    return parts.length ? `Classified from ${parts.join('; ')}.` : `Classified as ${s} by the acute malnutrition rules.`
  }
  if (s === 'INFANT_URGENT_REVIEW') return 'Infant under 6 months flagged for urgent review.'
  if (s === 'NEEDS_VERIFICATION') return 'One or more measurements need to be verified.'
  const flagged = ([
    ['weight-for-age', item.weight_for_age], ['length/height-for-age', item.height_for_age],
    ['weight-for-length/height', item.weight_for_height], ['BMI-for-age', item.bmi_for_age],
  ] as const).filter(([, v]) => v && !['NORMAL', 'NOT_UNDERWEIGHT', 'NOT_STUNTED', 'NOT_APPLICABLE', 'NOT_EVALUATED'].includes(v))
  if (flagged.length) return `Classified from ${flagged.map(([n, v]) => `${n}: ${nutritionLabel(v).toLowerCase()}`).join('; ')}.`
  return 'No indicator is flagged.'
}

export function ScoresDialog({ item, childName, meta, recommendation, canEdit, online, onClose, onEdited }: {
  item: ScoresAssessment
  childName: string
  /** "Female, 29 months (887 days), Bagasbas. Measured 2026-10-16." */
  meta: string
  recommendation: string
  canEdit: boolean
  online: boolean
  onClose: () => void
  /** After a saved edit: the updated assessment fields. */
  onEdited: (updated: Partial<ScoresAssessment>) => void
}) {
  const [tab, setTab] = useState<'now' | 'history'>('now')
  const [editing, setEditing] = useState(false)
  const idBase = useId().replace(/:/g, '')
  const history = useSWR<HistoryPayload>(
    tab === 'history' ? `/api/nutritional-assessment/history?childId=${item.child_id}` : null,
    async (url: string) => {
      const r = await fetch(url, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to load the history.')
      return d as HistoryPayload
    },
  )
  const muacFlag = nutritionFlagClass(item.muac_status) || (muacUnusual(item.muac, item.age_days) ? 'font-semibold text-severe' : '')

  return (
    <>
      <Modal
        open={!editing}
        size="wide"
        eyebrow="Scores"
        title={childName}
        titleClassName="font-sans text-[22px]"
        subtitle={meta}
        onClose={onClose}
        cancelLabel="Close"
        buttonSize="lg"
        confirmDiscard={false}
        belowHeader={
          <TabBar
            variant="underline"
            className="px-5 sm:px-6"
            label="Scores views"
            idBase={idBase}
            value={tab}
            onChange={setTab}
            items={[{ value: 'now', label: 'This assessment' }, { value: 'history', label: 'History' }]}
          />
        }
        footer={canEdit ? (
          <Button size="lg" disabled={!online} title={online ? undefined : 'Reconnect to edit'} onClick={() => setEditing(true)}>
            <Pencil size={16} aria-hidden="true" /> Edit measurements
          </Button>
        ) : undefined}
      >
        <div role="tabpanel" id={`${idBase}-panel-${tab}`} aria-labelledby={`${idBase}-tab-${tab}`}>
          {tab === 'now' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[14px] bg-brand-ice px-4 py-3">
                <Pill item={item} />
                <div className="min-w-0 flex-[1_1_16rem] text-sm">
                  <p className="font-semibold text-brand-navy">{recommendation}</p>
                  <p className="text-brand-muted">{driver(item)}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-brand-line bg-brand-line sm:grid-cols-4">
                {([
                  ['Weight', `${shown(item.weight)} kg`, ''],
                  [position(item.measurement_type) === '—' ? 'Length/Height' : position(item.measurement_type), `${shown(item.height)} cm`, ''],
                  ['MUAC', item.muac == null || item.muac === '' ? 'Not recorded' : `${shown(item.muac)} cm`, muacFlag],
                  ['Pitting edema', edemaText(item.edema_grade), item.edema_grade ? 'font-semibold text-severe' : ''],
                ] as const).map(([name, value, cls]) => (
                  <div key={name} className="bg-white px-4 py-3">
                    <dt className="text-[13px] text-brand-muted">{name}</dt>
                    <dd className={cn('mt-0.5 text-lg font-semibold tabular-nums text-brand-navy', cls)}>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="overflow-x-auto rounded-[14px] border border-brand-line">
                <table className="w-full text-sm text-brand-navy">
                  <thead className="bg-group-a">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 text-left text-[13px] font-semibold">Indicator</th>
                      <th scope="col" className="px-4 py-2.5 text-right text-[13px] font-semibold">z-score</th>
                      <th scope="col" className="px-4 py-2.5 text-left text-[13px] font-semibold">Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-line">
                    {([
                      ['Weight-for-age', item.waz, item.weight_for_age],
                      ['Length/height-for-age', item.haz, item.height_for_age],
                      ['Weight-for-length/height', item.whz, item.weight_for_height],
                      ['BMI-for-age', item.baz, item.bmi_for_age],
                      ['MUAC', null, item.muac_status],
                    ] as const).map(([name, z, cls]) => (
                      <tr key={name}>
                        <th scope="row" className="px-4 py-2.5 text-left font-medium">{name}</th>
                        <td className="px-4 py-2.5 text-right tabular-nums">{zScore(z)}</td>
                        <td className={cn('px-4 py-2.5', nutritionFlagClass(cls))}>{nutritionLabel(cls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="group rounded-[14px] border border-brand-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-sm font-semibold text-brand-navy outline-none focus-visible:ring-2 focus-visible:ring-brand-sky [&::-webkit-details-marker]:hidden">
                  Calculation details
                </summary>
                <dl className="grid gap-x-6 gap-y-2 border-t border-brand-line px-4 py-3 text-sm sm:grid-cols-2">
                  {([
                    ['Age at assessment', item.age_days == null ? 'Not recorded' : `${item.age_days} days`],
                    ['Sex at assessment', nutritionLabel(item.sex_at_assessment)],
                    ['Height used', item.normalized_height_cm == null ? '—' : `${shown(item.normalized_height_cm)} cm (${position(item.measurement_type).toLowerCase()})`],
                    ['BMI', item.bmi == null || item.bmi === '' ? '—' : Number(item.bmi).toFixed(1)],
                    ['Reference', item.engine_version ?? 'Not engine evaluated'],
                    ['Evaluation status', nutritionLabel(item.evaluation_status)],
                    ['Remarks', item.remarks || 'None recorded'],
                  ] as const).map(([name, value]) => (
                    <div key={name} className="flex justify-between gap-3 sm:block">
                      <dt className="text-brand-muted">{name}</dt>
                      <dd className="text-right font-medium text-brand-navy sm:text-left">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>
          ) : (
            <HistoryPanel item={item} state={history} />
          )}
        </div>
      </Modal>
      {editing && (
        <EditMeasurementsDialog
          item={item}
          childName={childName}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false)
            setTab('history')
            void history.mutate()
            onEdited(updated)
          }}
        />
      )}
    </>
  )
}

function changeText(field: string, oldV: unknown, newV: unknown) {
  switch (field) {
    case 'weight': return `Weight ${shown(oldV)} kg → ${shown(newV)} kg`
    case 'height': return `Length/height ${shown(oldV)} cm → ${shown(newV)} cm`
    case 'muac': return `MUAC ${oldV == null ? 'not recorded' : `${shown(oldV)} cm`} → ${newV == null ? 'not recorded' : `${shown(newV)} cm`}`
    case 'measurement_type': return `Measured as ${position(oldV)} → ${position(newV)}`
    case 'edema_grade': return `Pitting edema ${edemaText(oldV)} → ${edemaText(newV)}`
    default: return `${field} ${shown(oldV)} → ${shown(newV)}`
  }
}

function HistoryPanel({ item, state }: { item: ScoresAssessment; state: SWRResponse<HistoryPayload> }) {
  if (state.isLoading) return <p className="py-6 text-center text-sm text-brand-muted">Loading the history…</p>
  if (state.error || !state.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-danger/20 bg-danger-soft p-4 text-sm text-brand-navy">
        <span>We couldn&rsquo;t load the history. {state.error instanceof Error ? state.error.message : ''}</span>
        <Button variant="outline" size="sm" onClick={() => void state.mutate()}>Try again</Button>
      </div>
    )
  }
  const rows = state.data.assessments
  const revisions = rows.find((r) => r.assessment_id === item.assessment_id)?.revisions ?? []
  return (
    <div className="space-y-5">
      <section aria-labelledby="history-assessments">
        <h3 id="history-assessments" className="mb-2 text-sm font-semibold text-brand-navy">Assessments</h3>
        <div className="overflow-x-auto rounded-[14px] border border-brand-line">
          <table className="w-full text-sm text-brand-navy">
            <thead className="bg-group-a">
              <tr>
                {['Date measured', 'Weight (kg)', 'Length / height (cm)', 'MUAC (cm)', 'Result'].map((h, i) => (
                  <th key={h} scope="col" className={cn('px-3 py-2.5 text-[13px] font-semibold', i > 0 && i < 4 ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {rows.map((r, i) => (
                <tr key={r.assessment_id} className={r.assessment_id === item.assessment_id ? 'bg-brand-ice' : undefined}>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {r.assessment_date}
                    {i === 0 && <span className="ml-2 rounded-full bg-badge px-2 py-0.5 text-xs font-semibold text-brand-navy">Latest</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{shown(r.weight)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{shown(r.height)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{shown(r.muac)}</td>
                  <td className="px-3 py-2.5"><Pill item={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="history-changes">
        <h3 id="history-changes" className="mb-2 text-sm font-semibold text-brand-navy">Changes to the {item.assessment_date} assessment</h3>
        {!state.data.revisionsAvailable ? (
          <p className="rounded-[14px] bg-brand-ice px-4 py-3 text-sm text-brand-muted">Edit history is not available yet: the database update for it has not been applied.</p>
        ) : revisions.length === 0 ? (
          <p className="rounded-[14px] bg-brand-ice px-4 py-3 text-sm text-brand-muted">No changes yet. If the measurements are corrected, the earlier values stay here.</p>
        ) : (
          <ol className="space-y-2">
            {revisions.map((rev) => {
              const oldS = String(rev.old_values.nutritional_status ?? '')
              const newS = String(rev.new_values.nutritional_status ?? '')
              return (
                <li key={rev.revision_no} className="rounded-[14px] border border-brand-line px-4 py-3 text-sm text-brand-navy">
                  <ul className="space-y-0.5 font-semibold">
                    {rev.changed_fields.map((f) => <li key={f} className="tabular-nums">{changeText(f, rev.old_values[f], rev.new_values[f])}</li>)}
                  </ul>
                  <p className="mt-1">
                    Reason: {REASON_LABEL[rev.reason] ?? rev.reason}{rev.note ? ` — ${rev.note}` : ''}
                  </p>
                  {oldS !== newS && <p className="mt-0.5">Result: {nutritionLabel(oldS)} → {nutritionLabel(newS)}</p>}
                  <p className="mt-1 text-xs text-brand-muted">
                    Edited by {rev.editor_name ?? 'a health worker'}{rev.editor_role ? `, ${rev.editor_role}` : ''}, on {new Date(rev.edited_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
        <p className="mt-2 text-xs text-brand-muted">The table always shows the latest values. Earlier values are kept here and in the child&rsquo;s record.</p>
      </section>
    </div>
  )
}

type FieldName = 'weight' | 'height' | 'measurementType' | 'muac' | 'edemaGrade' | 'reason' | 'note' | 'form'

/** Inline field warning: review color with a 2px left rule. */
function Warning({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 border-l-2 border-review-line bg-review-soft px-2.5 py-1.5 text-[13px] text-review">
      <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function EditMeasurementsDialog({ item, childName, onClose, onSaved }: {
  item: ScoresAssessment
  childName: string
  onClose: () => void
  onSaved: (updated: Partial<ScoresAssessment>) => void
}) {
  const [weight, setWeight] = useState(item.weight == null ? '' : String(item.weight))
  const [height, setHeight] = useState(item.height == null ? '' : String(item.height))
  const [type, setType] = useState<'LENGTH' | 'HEIGHT' | ''>(item.measurement_type ?? '')
  const [muac, setMuac] = useState(item.muac == null ? '' : String(item.muac))
  const [edema, setEdema] = useState(item.edema_grade == null ? '0' : String(item.edema_grade))
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [saving, setSaving] = useState(false)
  const name = useId()
  // A field's warning (and the general one) goes away as soon as that field is changed.
  const clear = (field: FieldName) => setErrors((e) => (e[field] || e.form ? { ...e, [field]: undefined, form: undefined } : e))

  const positive = (v: string) => /^\d+(?:\.\d+)?$/.test(v.trim()) && Number(v) > 0
  // Soft warning only (bounds pending confirmation): saving is still allowed.
  const unusual = muac.trim() && positive(muac) ? muacUnusual(Number(muac), item.age_days) : null
  const muacWarning = unusual ? MUAC_SOFT_WARNING[unusual] : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const next: Partial<Record<FieldName, string>> = {}
    if (!positive(weight)) next.weight = 'Enter the weight in kg as a positive number.'
    if (!positive(height)) next.height = 'Enter the length or height in cm as a positive number.'
    if (!type) next.measurementType = 'Choose how it was measured.'
    if (muac.trim() && !positive(muac)) next.muac = 'Enter MUAC in cm as a positive number, or leave it empty.'
    if (!reason) next.reason = 'Choose a reason for the change.'
    if (reason === 'OTHER' && !note.trim()) next.note = 'Add a note explaining the change.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const r = await fetch('/api/nutritional-assessment/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: item.assessment_id, weight: weight.trim(), height: height.trim(), measurementType: type,
          muac: muac.trim() || null, edemaGrade: Number(edema), reason, note: note.trim() || null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErrors({ [(d.field as FieldName) ?? 'form']: d.error || 'Unable to save the changes.' })
        return
      }
      onSaved(d.assessment as Partial<ScoresAssessment>)
    } catch {
      setErrors({ form: 'The changes were not saved. Check the connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="form"
      title="Edit measurements"
      subtitle={`${childName}. Assessment of ${item.assessment_date}.`}
      onClose={onClose}
      onSubmit={submit}
      noValidate
      busy={saving}
      buttonSize="lg"
      footer={<Button type="submit" size="lg" loading={saving}>Save changes</Button>}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Weight (kg)" required>
            <Input inputMode="decimal" value={weight} onChange={(e) => { setWeight(e.target.value); clear('weight') }} className="h-11 rounded-[10px] border-control-line px-4" aria-invalid={Boolean(errors.weight) || undefined} />
            {errors.weight && <Warning>{errors.weight}</Warning>}
          </Field>
          <Field label="Length / height (cm)" required>
            <Input inputMode="decimal" value={height} onChange={(e) => { setHeight(e.target.value); clear('height') }} className="h-11 rounded-[10px] border-control-line px-4" aria-invalid={Boolean(errors.height) || undefined} />
            {errors.height && <Warning>{errors.height}</Warning>}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-brand-navy">Measured as</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['LENGTH', 'Length (lying down)'], ['HEIGHT', 'Height (standing)']] as const).map(([value, text]) => (
              <label key={value} className={cn(
                'flex h-11 cursor-pointer items-center gap-3 rounded-[10px] border px-4 text-sm font-semibold text-brand-navy transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link',
                type === value ? 'border-brand-navy bg-brand-ice' : 'border-control-line bg-white hover:bg-brand-ice/60',
              )}>
                <input type="radio" name={name} value={value} checked={type === value} onChange={() => { setType(value); clear('measurementType') }} className="size-4 accent-brand-navy" />
                {text}
              </label>
            ))}
          </div>
          {errors.measurementType && <Warning>{errors.measurementType}</Warning>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="MUAC (cm)">
            <Input inputMode="decimal" value={muac} onChange={(e) => { setMuac(e.target.value); clear('muac') }} className="h-11 rounded-[10px] border-control-line px-4" aria-invalid={Boolean(errors.muac) || undefined} />
            {(errors.muac || muacWarning) && <Warning>{errors.muac ?? muacWarning}</Warning>}
          </Field>
          <Field label="Bilateral pitting edema">
            <Select controlSize="lg" value={edema} onChange={(e) => { setEdema(e.target.value); clear('edemaGrade') }}>
              {EDEMA_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </Select>
            {errors.edemaGrade && <Warning>{errors.edemaGrade}</Warning>}
          </Field>
        </div>
        <Field label="Reason for change" required>
          <Select controlSize="lg" value={reason} onChange={(e) => { setReason(e.target.value); clear('reason') }} aria-invalid={Boolean(errors.reason) || undefined}>
            <option value="">Choose a reason</option>
            {Object.entries(REASON_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Select>
          {errors.reason && <Warning>{errors.reason}</Warning>}
        </Field>
        <Field label={reason === 'OTHER' ? 'Note' : 'Note (optional)'} required={reason === 'OTHER'}>
          <Textarea value={note} maxLength={500} rows={3} onChange={(e) => { setNote(e.target.value); clear('note') }} className="rounded-[10px] border-control-line px-4" aria-invalid={Boolean(errors.note) || undefined} />
          {errors.note && <Warning>{errors.note}</Warning>}
        </Field>
        {errors.form && <Warning>{errors.form}</Warning>}
        <p className="rounded-[10px] bg-brand-ice px-4 py-3 text-sm text-brand-navy">
          Saving recalculates the scores and classification. The earlier values stay in this assessment&rsquo;s history and the child&rsquo;s record.
        </p>
      </div>
    </Modal>
  )
}
