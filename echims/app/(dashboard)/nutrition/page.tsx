'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import { AlertCircle, Loader2, Plus, RefreshCw, X } from 'lucide-react'

type Relation<T> = T | T[] | null
type Barangay = { barangay_id: number; barangay_name: string }
type Child = {
  child_id: number
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: string
  sex: 'MALE' | 'FEMALE'
  barangay_id: number
  barangay: Relation<Barangay>
}
type NumberValue = number | string | null
type Assessment = {
  assessment_id: number
  child_id: number
  assessed_by: string
  assessment_date: string
  weight: NumberValue
  height: NumberValue
  muac: NumberValue
  measurement_type: 'LENGTH' | 'HEIGHT' | null
  edema_grade: number | null
  age_days: number | null
  sex_at_assessment: string | null
  normalized_height_cm: NumberValue
  waz: NumberValue
  haz: NumberValue
  whz: NumberValue
  baz: NumberValue
  bmi: NumberValue
  weight_for_age: string | null
  height_for_age: string | null
  weight_for_height: string | null
  bmi_for_age: string | null
  muac_status: string | null
  nutritional_status: string
  evaluation_status: string
  engine_version: string | null
  evaluated_at: string | null
  remarks: string | null
  child: Relation<Child>
}
type NutritionResponse = {
  data: Assessment[]
  children: Child[]
  role: string
  permissions: { create: boolean }
}
type Draft = {
  child_id: string
  assessment_date: string
  weight: string
  height: string
  muac: string
  measurement_type: '' | 'LENGTH' | 'HEIGHT'
  edema_grade: string
  remarks: string
}

const endpoint = '/api/nutrition'
const inputClass = 'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 font-normal text-foreground'
const alertClass = 'rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800'

function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}
function childName(child: Child | null) {
  return child ? [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(' ') : 'Child name unavailable'
}
function label(value: string | null | undefined) {
  const names: Record<string, string> = {
    SAM: 'SAM', MAM: 'MAM', NO_FLAGGED_INDICATORS: 'No flagged indicators',
    NOT_UNDERWEIGHT: 'Not underweight', NOT_STUNTED: 'Not stunted',
    NOT_INTERPRETABLE_EDEMA: 'Not interpretable — edema',
    INFANT_URGENT_REVIEW: 'Infant urgent review',
    NOT_EVALUATED: 'Not evaluated', NEEDS_VERIFICATION: 'Needs verification',
    NORMAL: 'Normal', NO_LOW_MUAC: 'No low MUAC',
    AT_RISK: 'At risk', NOT_APPLICABLE: 'Not applicable',
  }
  if (!value) return 'Not recorded'
  return names[value] ?? value.toLowerCase().replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase())
}
function quantity(value: NumberValue, unit = '', decimals?: number) {
  if (value === null || value === '' || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  return `${decimals === undefined ? number : number.toFixed(decimals)}${unit ? ` ${unit}` : ''}`
}
function todayKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
function addMonths(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}
function ageDays(child: Child, date: string) {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${child.date_of_birth}T00:00:00Z`)) / 86400000)
}
function initialDraft(): Draft {
  return { child_id: '', assessment_date: todayKey(), weight: '', height: '', muac: '', measurement_type: '', edema_grade: '', remarks: '' }
}
async function readJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`The nutrition endpoint returned a non-JSON response (HTTP ${response.status}). Check app/api/nutrition/route.ts.`)
  }
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Request failed.')
  return body
}
async function fetchNutrition(url: string): Promise<NutritionResponse> {
  return readJson(await fetch(url, { cache: 'no-store' }))
}
function matches(item: Assessment, category: string) {
  if (!item.engine_version && category !== 'All' && category !== 'Not evaluated') return false
  switch (category) {
    case 'MAM': return item.nutritional_status === 'MAM'
    case 'SAM': return item.nutritional_status === 'SAM'
    case 'Stunted': return ['STUNTED', 'SEVERELY_STUNTED'].includes(item.height_for_age ?? '')
    case 'Wasted': return ['WASTED', 'SEVERELY_WASTED'].includes(item.weight_for_height ?? '')
    case 'Overweight / obesity': return [item.weight_for_height, item.bmi_for_age].some((value) => value === 'OVERWEIGHT' || value === 'OBESE')
    case 'Underweight': return ['UNDERWEIGHT', 'SEVERELY_UNDERWEIGHT'].includes(item.weight_for_age ?? '')
    case 'Possible risk of overweight': return [item.weight_for_height, item.bmi_for_age].includes('POSSIBLE_RISK_OF_OVERWEIGHT')
    case 'Infant urgent review': return item.nutritional_status === 'INFANT_URGENT_REVIEW'
    case 'Needs verification': return item.evaluation_status === 'NEEDS_VERIFICATION'
    case 'Not evaluated': return !item.engine_version || item.evaluation_status === 'NOT_EVALUATED'
    default: return true
  }
}
function followUp(item: Assessment) {
  if (!item.engine_version) return 'Legacy classification — not engine verified'
  if (item.nutritional_status === 'SAM' || item.nutritional_status === 'INFANT_URGENT_REVIEW') return 'Urgent clinical assessment'
  if (item.evaluation_status === 'NEEDS_VERIFICATION') return 'Verify measurements and review'
  if (item.nutritional_status === 'MAM' || item.nutritional_status === 'AT_RISK') return 'Clinical follow-up'
  if (item.evaluation_status !== 'EVALUATED') return 'Complete or verify assessment'
  return 'Routine growth monitoring'
}
function Modal({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={ref} aria-label={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
    className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-2xl bg-white p-0 text-foreground shadow-xl backdrop:bg-slate-950/50">
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold text-[#03045E]">{title}</h2>
        <button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className="rounded-lg p-2 hover:bg-muted disabled:opacity-50"><X size={22} /></button>
      </div>
      {children}
    </div>
  </dialog>
}
function AssessmentDetails({ assessment, onClose }: { assessment: Assessment; onClose: () => void }) {
  const item = assessment
  const rows = [
    ['Assessment', `#${item.assessment_id}`], ['Child', childName(one(item.child))],
    ['Date', item.assessment_date], ['Summary', label(item.nutritional_status)],
    ['Evaluation', label(item.evaluation_status)], ['Age at assessment', item.age_days == null ? 'Not recorded' : `${item.age_days} days`],
    ['Weight', quantity(item.weight, 'kg')], ['Measured length/height', quantity(item.height, 'cm')],
    ['Measurement position', label(item.measurement_type)], ['Corrected length/height', quantity(item.normalized_height_cm, 'cm')],
    ['MUAC', quantity(item.muac, 'cm')], ['MUAC classification', label(item.muac_status)],
    ['Bilateral pitting edema', item.edema_grade == null ? 'Not recorded' : item.edema_grade === 0 ? 'Absent' : `+${item.edema_grade}`],
    ['WAZ', quantity(item.waz, '', 2)], ['Weight-for-age', label(item.weight_for_age)],
    ['HAZ', quantity(item.haz, '', 2)], ['Length/height-for-age', label(item.height_for_age)],
    ['WLZ/WHZ', quantity(item.whz, '', 2)], ['Weight-for-length/height', label(item.weight_for_height)],
    ['BAZ', quantity(item.baz, '', 2)], ['BMI-for-age', label(item.bmi_for_age)],
    ['BMI', quantity(item.bmi, 'kg/m²', 2)], ['Engine', item.engine_version ?? 'Not engine evaluated'],
  ]
  return <Modal title="Assessment details" onClose={onClose}>
    <p className="mb-4 rounded-lg bg-sky-50 p-3 text-sm">{followUp(item)}. Each growth indicator is interpreted separately.</p>
    <dl className="grid gap-4 rounded-xl bg-muted p-4 sm:grid-cols-2">
      {rows.map(([name, value]) => <div key={name}><dt className="text-xs text-muted-foreground">{name}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}
    </dl>
    <p className="mt-4 text-sm"><strong>Remarks:</strong> {item.remarks || 'None recorded'}</p>
  </Modal>
}

export default function NutritionPage() {
  const { data, error, mutate, isValidating } = useSWR<NutritionResponse>(endpoint, fetchNutrition)
  const [category, setCategory] = useState('All')
  const [history, setHistory] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [selected, setSelected] = useState<Assessment | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const savingRef = useRef(false)
  const records = data?.data ?? []
  const children = data?.children ?? []
  const latest = useMemo(() => {
    const byChild = new Map<number, Assessment>()
    for (const item of data?.data ?? []) if (!byChild.has(item.child_id)) byChild.set(item.child_id, item)
    return [...byChild.values()]
  }, [data])
  const visible = (history ? records : latest).filter((item) => matches(item, category))
  const countCategories = ['MAM', 'SAM', 'Stunted', 'Wasted', 'Overweight / obesity']
  const allCategories = ['All', ...countCategories, 'Underweight', 'Possible risk of overweight', 'Infant urgent review', 'Needs verification', 'Not evaluated']
  const child = children.find((item) => String(item.child_id) === draft?.child_id) ?? null
  const days = draft && child ? ageDays(child, draft.assessment_date) : null
  const eligibleChildren = draft ? children.filter((item) => draft.assessment_date >= item.date_of_birth && draft.assessment_date < addMonths(item.date_of_birth, 60)) : []
  const underSix = !!(draft && child && draft.assessment_date < addMonths(child.date_of_birth, 6))

  function change(key: keyof Draft, value: string) {
    setDraft((previous) => {
      if (!previous) return previous
      const next = { ...previous, [key]: value }
      if (key === 'child_id' || key === 'assessment_date') {
        const selectedChild = children.find((item) => String(item.child_id) === next.child_id)
        next.measurement_type = selectedChild && next.assessment_date ? ageDays(selectedChild, next.assessment_date) < 731 ? 'LENGTH' : 'HEIGHT' : ''
      }
      return next
    })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || savingRef.current) return
    setFormError('')
    if (!child || draft.assessment_date < child.date_of_birth || draft.assessment_date >= addMonths(child.date_of_birth, 60)) {
      setFormError('Select a child younger than five years on the assessment date.'); return
    }
    if (draft.assessment_date > todayKey()) { setFormError('Assessment date cannot be in the future.'); return }
    if (days !== null && days / 30.4375 < 9 && draft.measurement_type === 'HEIGHT') {
      setFormError('Use recumbent length for infants younger than nine months. A standing measurement requires verification.'); return
    }
    savingRef.current = true
    setSaving(true)
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_id: Number(draft.child_id), assessment_date: draft.assessment_date,
          weight: Number(draft.weight), height: Number(draft.height),
          muac: draft.muac.trim() ? Number(draft.muac) : null,
          measurement_type: draft.measurement_type,
          edema_grade: Number(draft.edema_grade), remarks: draft.remarks,
        }),
      })
      const result = await readJson(response)
      setDraft(null)
      setSelected(result.data)
      setMessage(`Assessment #${result.data.assessment_id} saved. ${followUp(result.data)}.`)
      try { await mutate() } catch { setMessage('Assessment saved. Refresh the list to reload the latest records.') }
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Unable to save assessment.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold text-foreground">Nutritional Assessment</h1><p className="mt-1 text-muted-foreground">OPT Plus measurements, WHO classifications, and follow-up monitoring</p></div>
      {data?.permissions.create && <button type="button" onClick={() => { setFormError(''); setMessage(''); setDraft(initialDraft()) }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white"><Plus size={20} />Record Assessment</button>}
    </div>
    {message && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
    {error && <div role="alert" className={alertClass}>{error.message}<button type="button" onClick={() => void mutate()} className="ml-3 underline">Retry</button></div>}
    {!data && !error && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={18} />Loading assessments…</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {countCategories.map((name) => <button key={name} type="button" onClick={() => setCategory(category === name ? 'All' : name)} aria-pressed={category === name} className={`rounded-xl border p-4 text-left ${category === name ? 'border-primary bg-sky-50' : 'border-border bg-white'}`}>
        <p className="text-sm text-muted-foreground">{name}</p><p className="mt-1 text-2xl font-bold text-foreground">{latest.filter((item) => matches(item, name)).length}</p>
      </button>)}
    </div>
    <p className="text-xs text-muted-foreground">Counts use the latest loaded assessment per child. Categories can overlap.</p>
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="nutrition-category" className="text-sm font-medium">Classification view</label>
      <select id="nutrition-category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border bg-white px-3 py-2">{allCategories.map((name) => <option key={name}>{name}</option>)}</select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} />Include assessment history</label>
      <button type="button" disabled={isValidating} onClick={() => void mutate()} className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={16} className={isValidating ? 'animate-spin' : ''} />Refresh</button>
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="border-b border-border p-5"><h2 className="font-semibold">{history ? 'Assessment history' : 'Latest assessments'}</h2><p className="mt-1 text-sm text-muted-foreground">Classifications are calculated by the database. Select Details to view each indicator and Z-score.</p></div>
      <div className="overflow-x-auto"><table className="w-full">
        <thead className="bg-muted"><tr>{['Child', 'Date', 'Weight', 'Length / height', 'MUAC', 'Edema', 'Classification', 'Follow-up', ''].map((heading, index) => <th key={index} scope="col" className="px-5 py-4 text-left text-sm font-semibold">{heading || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {visible.map((item) => <tr key={item.assessment_id} className="hover:bg-muted">
            <td className="px-5 py-4 text-sm font-medium">{childName(one(item.child))}<span className="mt-1 block text-xs text-muted-foreground">{one(one(item.child)?.barangay ?? null)?.barangay_name ?? 'Barangay unavailable'}</span></td>
            <td className="whitespace-nowrap px-5 py-4 text-sm">{item.assessment_date}</td>
            <td className="whitespace-nowrap px-5 py-4 text-sm">{quantity(item.weight, 'kg')}</td>
            <td className="whitespace-nowrap px-5 py-4 text-sm">{quantity(item.height, 'cm')}<span className="block text-xs text-muted-foreground">{label(item.measurement_type)}</span></td>
            <td className="whitespace-nowrap px-5 py-4 text-sm">{quantity(item.muac, 'cm')}</td>
            <td className="px-5 py-4 text-sm">{item.edema_grade == null ? 'Not recorded' : item.edema_grade === 0 ? 'Absent' : `+${item.edema_grade}`}</td>
            <td className="px-5 py-4 text-sm"><span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${!item.engine_version || item.evaluation_status !== 'EVALUATED' ? 'bg-slate-100 text-slate-700' : item.nutritional_status === 'NO_FLAGGED_INDICATORS' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-800'}`}>{!item.engine_version ? 'Legacy — not verified' : label(item.nutritional_status)}</span></td>
            <td className="px-5 py-4 text-sm">{followUp(item)}</td>
            <td className="px-5 py-4"><button type="button" onClick={() => setSelected(item)} className="text-sm font-medium text-primary underline">Details<span className="sr-only"> for assessment {item.assessment_id}</span></button></td>
          </tr>)}
          {data && visible.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">No assessments match this view.</td></tr>}
        </tbody>
      </table></div>
      <p className="border-t border-border p-4 text-xs text-muted-foreground">Loads up to 500 recent assessments within your access scope. Older records may not be included in these counts.</p>
    </div>
    <div className="rounded-2xl border border-border bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><AlertCircle size={19} className="text-orange-500" />Follow-up guidance</h2><p className="mt-2 text-sm text-muted-foreground">SAM and infant urgent-review results require prompt clinical assessment. Other growth concerns require health-staff review. Missing scores and flagged measurements are displayed for verification.</p></div>

    {draft && <Modal title="Record nutritional assessment" busy={saving} onClose={() => setDraft(null)}>
      <form onSubmit={save} className="space-y-6">
        {formError && <p role="alert" className={alertClass}>{formError}</p>}
        <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
          <section><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">Child information</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">Child<select autoFocus required value={draft.child_id} onChange={(event) => change('child_id', event.target.value)} className={inputClass}><option value="">Select a child</option>{eligibleChildren.map((item) => <option key={item.child_id} value={item.child_id}>{childName(item)} — {one(item.barangay)?.barangay_name ?? 'Barangay'} — #{item.child_id}</option>)}</select></label>
              <label className="text-sm font-medium">Assessment date<input required type="date" value={draft.assessment_date} min={child?.date_of_birth} max={todayKey()} onChange={(event) => change('assessment_date', event.target.value)} className={inputClass} /></label>
            </div>
            {child && <p className="mt-3 text-sm text-muted-foreground">Birth date: {child.date_of_birth} · Sex: {label(child.sex)} · Age on assessment date: {days} days</p>}
            {eligibleChildren.length === 0 && <p className="mt-3 text-sm text-orange-700">No active children in your scope are younger than five on this date.</p>}
          </section>
          <section><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">Anthropometric measurements</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">Weight (kg)<input required type="number" min="0.01" step="0.01" value={draft.weight} onChange={(event) => change('weight', event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-medium">Measured length / height (cm)<input required type="number" min="0.1" step="0.1" value={draft.height} onChange={(event) => change('height', event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-medium">Measurement position<select required value={draft.measurement_type} onChange={(event) => change('measurement_type', event.target.value)} className={inputClass}><option value="">Choose actual position</option><option value="LENGTH">Recumbent length — lying down</option><option value="HEIGHT">Standing height</option></select></label>
              <label className="text-sm font-medium">MUAC (cm, optional)<input type="number" min="0.1" step="0.1" value={draft.muac} onChange={(event) => change('muac', event.target.value)} className={inputClass} /><span className="mt-1 block text-xs font-normal text-muted-foreground">{underSix ? 'Standard 6–59-month MUAC cutoffs will not be applied to this infant.' : 'Leave blank when not measured; do not enter zero.'}</span></label>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Recommended position: {days === null ? 'select a child first' : days < 731 ? 'recumbent length' : 'standing height'}. Enter the measurement as taken; the server handles the position correction.</p>
          </section>
          <section><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">Additional assessment information</h3>
            <label className="block text-sm font-medium">Bilateral pitting edema<select required value={draft.edema_grade} onChange={(event) => change('edema_grade', event.target.value)} className={inputClass}><option value="">Select examination result</option><option value="0">Absent (0)</option><option value="1">Mild (+1)</option><option value="2">Moderate (+2)</option><option value="3">Severe (+3)</option></select></label>
            <label className="mt-4 block text-sm font-medium">Remarks<textarea rows={3} value={draft.remarks} onChange={(event) => change('remarks', event.target.value)} className={inputClass} /></label>
          </section>
          <p className="rounded-lg bg-sky-50 p-3 text-sm">WHO Z-scores, classifications, and risk alerts are generated after saving. They are not entered manually.</p>
        </fieldset>
        <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setDraft(null)} className="rounded-lg border border-border px-4 py-2 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving || !child || !!error} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{saving && <Loader2 size={16} className="animate-spin" />}{saving ? 'Saving…' : 'Save assessment'}</button></div>
      </form>
    </Modal>}
    {selected && <AssessmentDetails assessment={selected} onClose={() => setSelected(null)} />}
  </div>
}
