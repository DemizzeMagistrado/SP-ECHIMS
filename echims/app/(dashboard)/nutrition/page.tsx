'use client'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import Link from 'next/link'
import { NutritionRiskMonitor } from '@/components/nutrition/nutrition-risk-monitor'
import type { RiskMonitoring } from '@/lib/nutrition-risk'
import { getNutritionBrowserClient, saveSnapshot, loadSnapshot, removeSnapshot, listQueue, putQueuedAssessment, removeQueuedAssessment, validateOfflinePayload, type NutritionPayload, type QueuedAssessment } from '@/lib/nutrition-offline'
import { AlertCircle, Loader2, Plus, RefreshCw, Printer, X } from 'lucide-react'
type Relation<T> = T | T[] | null
type Barangay = { barangay_id: number; barangay_name: string; municipality: string; province: string }
type Guardian = { guardian_id?: number; first_name: string; middle_name: string | null; last_name: string; relationship_to_child: string | null }
type Household = { household_address: string; purok: string | null }
type ChildProfile = { ethnicity: string | null }
type Child = {
  profile?: ChildProfile | null
  child_id: number
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: string
  sex: 'MALE' | 'FEMALE'
  barangay_id: number
  barangay: Relation<Barangay>
  address?: string | null
  guardian?: Relation<Guardian>
  household?: Relation<Household>
}
type NumberValue = number | string | null
type Assessment = {
  assessment_id: number
  client_request_id?: string | null
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
  profile?: ChildProfile | null
}
type NutritionResponse = {
  risk_monitoring?: RiskMonitoring
  data: Assessment[]
  children: Child[]
  role: string
  currentUserId: string
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
type SyncReviewRow = {
  draft: QueuedAssessment
  sameDay: Assessment[]
  exactDuplicates: Assessment[]
  localDuplicateIds: string[]
}
type SyncReview = { ownerId: string; rows: SyncReviewRow[]; selectedIds: string[] }
function sameMeasurements(payload: NutritionPayload, record: {
  child_id: number; assessment_date: string; weight: NumberValue; height: NumberValue;
  muac: NumberValue; measurement_type: string | null; edema_grade: number | null
}) {
  const muac = (value: NumberValue) => value === null || value === '' ? null : Number(value)
  return Number(payload.child_id) === Number(record.child_id)
    && payload.assessment_date === record.assessment_date
    && Number(payload.weight) === Number(record.weight) && Number(payload.height) === Number(record.height)
    && muac(payload.muac) === muac(record.muac)
    && payload.measurement_type === record.measurement_type && payload.edema_grade === record.edema_grade
}
function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}
function childName(child: Child | null) {
  return child ? `${child.last_name}, ${[child.first_name, child.middle_name].filter(Boolean).join(' ')}` : 'Child name unavailable'
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
function ipMembership(ethnicity: string | null | undefined) {
  switch (ethnicity?.trim().toUpperCase()) {
    case 'IP': return 'Yes'
    case 'NON-IP': return 'No'
    default: return 'Not confirmed'
  }
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
function birthAtAssessment(item: Assessment) {
  if (item.age_days == null) return one(item.child)?.date_of_birth ?? null
  const date = new Date(`${item.assessment_date}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - item.age_days)
  return date.toISOString().slice(0, 10)
}
function completedMonths(birth: string | null, date: string) {
  if (!birth) return null
  const b = new Date(`${birth}T00:00:00Z`)
  const d = new Date(`${date}T00:00:00Z`)
  let months = (d.getUTCFullYear() - b.getUTCFullYear()) * 12 + d.getUTCMonth() - b.getUTCMonth()
  if (date < addMonths(birth, months)) months--
  return months
}
function residentLocation(child: Child) {
  const household = one(child.household ?? null)
  const address = child.address?.trim() || household?.household_address?.trim() || ''
  const purok = household?.purok?.trim() || ''
  return purok && !address.toLowerCase().includes(purok.toLowerCase()) ? [purok, address].filter(Boolean).join(', ') : address
}
function caregiverName(child: Child | null) {
  const guardian = one(child?.guardian ?? null)
  return guardian ? `${guardian.last_name}, ${[guardian.first_name, guardian.middle_name].filter(Boolean).join(' ')}` : 'Not recorded'
}
function childRecordUrl(childId: number) {
  return `/child-profiling/children/${childId}`
}
class NutritionHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'NutritionHttpError' }
}
async function readJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new NutritionHttpError(`The nutrition endpoint returned a non-JSON response (HTTP ${response.status}). Check app/api/nutrition/route.ts.`, response.status)
  }
  const body = await response.json()
  if (!response.ok) throw new NutritionHttpError(typeof body?.error === 'string' ? body.error : 'Request failed.', response.status)
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
    ['Date measured', item.assessment_date], ['Birth date used for calculation', birthAtAssessment(item) ?? 'Not recorded'],
    ['Sex used for calculation', label(item.sex_at_assessment)],
    ['Residence location (current profile)', one(item.child) ? residentLocation(one(item.child)!) || 'Not recorded' : 'Not recorded'],
    ['Mother/caregiver (current profile)', caregiverName(one(item.child))],
    ['Ethnicity (current profile)', item.profile?.ethnicity || 'Not recorded'],
    ['Belongs to IP group? (current profile)', ipMembership(item.profile?.ethnicity)], ['Age in completed months', String(completedMonths(birthAtAssessment(item), item.assessment_date) ?? 'Not recorded')], ['Summary', label(item.nutritional_status)],
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
type IndicatorField = 'weight_for_age' | 'height_for_age' | 'weight_for_height'
type ListCode = 'UW' | 'SUW' | 'St' | 'SSt' | 'W' | 'SW'
type ReportView = 'Summary' | 'Assessments' | 'Risk' | ListCode
const listDefinitions: Record<ListCode, { title: string; field: IndicatorField; value: string }> = {
  UW: { title: 'Underweight', field: 'weight_for_age', value: 'UNDERWEIGHT' },
  SUW: { title: 'Severely Underweight', field: 'weight_for_age', value: 'SEVERELY_UNDERWEIGHT' },
  St: { title: 'Stunted', field: 'height_for_age', value: 'STUNTED' },
  SSt: { title: 'Severely Stunted', field: 'height_for_age', value: 'SEVERELY_STUNTED' },
  W: { title: 'Wasted', field: 'weight_for_height', value: 'WASTED' },
  SW: { title: 'Severely Wasted', field: 'weight_for_height', value: 'SEVERELY_WASTED' },
}
const listCodes: ListCode[] = ['UW', 'SUW', 'St', 'SSt', 'W', 'SW']
const ageBands = [
  { label: '0–5 months', min: 0, max: 5 }, { label: '6–11 months', min: 6, max: 11 },
  { label: '12–23 months', min: 12, max: 23 }, { label: '24–35 months', min: 24, max: 35 },
  { label: '36–47 months', min: 36, max: 47 }, { label: '48–59 months', min: 48, max: 59 },
]
const indicatorValues: Record<IndicatorField, string[]> = {
  weight_for_age: ['NOT_UNDERWEIGHT', 'UNDERWEIGHT', 'SEVERELY_UNDERWEIGHT'],
  height_for_age: ['NOT_STUNTED', 'STUNTED', 'SEVERELY_STUNTED'],
  weight_for_height: ['NORMAL', 'POSSIBLE_RISK_OF_OVERWEIGHT', 'WASTED', 'SEVERELY_WASTED', 'OVERWEIGHT', 'OBESE'],
}
const summaryRows: { title: string; field: IndicatorField; value: string; list?: ListCode }[] = [
  { title: 'WFA — Not underweight', field: 'weight_for_age', value: 'NOT_UNDERWEIGHT' },
  { title: 'WFA — UW', field: 'weight_for_age', value: 'UNDERWEIGHT', list: 'UW' },
  { title: 'WFA — SUW', field: 'weight_for_age', value: 'SEVERELY_UNDERWEIGHT', list: 'SUW' },
  { title: 'HFA — Not stunted', field: 'height_for_age', value: 'NOT_STUNTED' },
  { title: 'HFA — St', field: 'height_for_age', value: 'STUNTED', list: 'St' },
  { title: 'HFA — SSt', field: 'height_for_age', value: 'SEVERELY_STUNTED', list: 'SSt' },
  { title: 'WFL/H — Normal', field: 'weight_for_height', value: 'NORMAL' },
  { title: 'WFL/H — Possible overweight risk', field: 'weight_for_height', value: 'POSSIBLE_RISK_OF_OVERWEIGHT' },
  { title: 'WFL/H — W', field: 'weight_for_height', value: 'WASTED', list: 'W' },
  { title: 'WFL/H — SW', field: 'weight_for_height', value: 'SEVERELY_WASTED', list: 'SW' },
  { title: 'WFL/H — Overweight', field: 'weight_for_height', value: 'OVERWEIGHT' },
  { title: 'WFL/H — Obese', field: 'weight_for_height', value: 'OBESE' },
]
function assessmentMonths(item: Assessment) {
  return completedMonths(birthAtAssessment(item), item.assessment_date)
}
function assessmentSex(item: Assessment) {
  return item.sex_at_assessment ?? one(item.child)?.sex ?? null
}
function eligibleForReport(item: Assessment) {
  const months = assessmentMonths(item)
  return months !== null && Number.isFinite(months) && months >= 0 && months < 60
}
function validIndicator(item: Assessment, field: IndicatorField) {
  return Boolean(item.engine_version && indicatorValues[field].includes(item[field] ?? ''))
}
function latestPerChild(records: Assessment[]) {
  const sorted = [...records].sort((a, b) => b.assessment_date.localeCompare(a.assessment_date) || b.assessment_id - a.assessment_id)
  const map = new Map<number, Assessment>()
  for (const item of sorted) if (!map.has(item.child_id)) map.set(item.child_id, item)
  return [...map.values()]
}
function listRecords(records: Assessment[], code: ListCode) {
  const rule = listDefinitions[code]
  return records.filter((item) => eligibleForReport(item) && validIndicator(item, rule.field) && item[rule.field] === rule.value)
    .sort((a, b) => childName(one(a.child)).localeCompare(childName(one(b.child))))
}
function sexCounts(records: Assessment[]) {
  return { boys: records.filter((item) => assessmentSex(item) === 'MALE').length,
    girls: records.filter((item) => assessmentSex(item) === 'FEMALE').length, total: records.length }
}
function inAgeBand(records: Assessment[], min: number, max: number) {
  return records.filter((item) => { const months = assessmentMonths(item); return months !== null && months >= min && months <= max })
}
function prevalence(count: number, denominator: number) {
  return denominator ? `${(count / denominator * 100).toFixed(1)}%` : '—'
}
function undernourished(item: Assessment) {
  return (validIndicator(item, 'weight_for_age') && ['UNDERWEIGHT', 'SEVERELY_UNDERWEIGHT'].includes(item.weight_for_age!))
    || (validIndicator(item, 'height_for_age') && ['STUNTED', 'SEVERELY_STUNTED'].includes(item.height_for_age!))
    || (validIndicator(item, 'weight_for_height') && ['WASTED', 'SEVERELY_WASTED'].includes(item.weight_for_height!))
}
function overnourished(item: Assessment) {
  return validIndicator(item, 'weight_for_height') && ['OVERWEIGHT', 'OBESE'].includes(item.weight_for_height!)
}
function caregiverCount(records: Assessment[]) {
  const ids = new Set<number>()
  for (const item of records) { const id = one(one(item.child)?.guardian ?? null)?.guardian_id; if (id != null) ids.add(id) }
  return ids.size
}
function SummaryReport({ records, year, barangay, onList }: {
  records: Assessment[]; year: string; barangay: string; onList: (code: ListCode) => void
}) {
  const eligible = records.filter(eligibleForReport)
  const underTwo = inAgeBand(eligible, 0, 23)
  const denominators = (field: IndicatorField) => eligible.filter((item) => validIndicator(item, field))
  const cell = 'border border-border px-3 py-2 text-center text-xs'
  const summary = [
    ['Children assessed, 0–59 months', eligible.length],
    ['Children with UW/SUW, St/SSt or W/SW (unique children)', eligible.filter(undernourished).length],
    ['Children with overweight/obesity (WFL/H)', eligible.filter(overnourished).length],
    ['Children assessed, 0–23 months', underTwo.length],
    ['Children 0–23 months with UW/St/W classifications', underTwo.filter(undernourished).length],
    ['Linked mothers/caregivers of assessed children', caregiverCount(eligible)],
    ['Linked mothers/caregivers of children with UW/St/W classifications', caregiverCount(eligible.filter(undernourished))],
    ['Linked mothers/caregivers of children with overweight/obesity', caregiverCount(eligible.filter(overnourished))],
    ['Linked mothers/caregivers of children 0–23 months', caregiverCount(underTwo)],
    ['Children without a linked caregiver ID', eligible.filter((item) => one(one(item.child)?.guardian ?? null)?.guardian_id == null).length],
    ['WFA unavailable / not verified', eligible.length - denominators('weight_for_age').length],
    ['HFA unavailable / not verified', eligible.length - denominators('height_for_age').length],
    ['WFL/H unavailable / not verified', eligible.length - denominators('weight_for_height').length],
    ['Excluded: age unavailable or outside 0–59 months', records.length - eligible.length],
    ['Sex unavailable (included in totals only)', eligible.filter((item) => !['MALE', 'FEMALE'].includes(assessmentSex(item) ?? '')).length],
    ['IP children (current profile)', eligible.filter((item) => ipMembership(item.profile?.ethnicity) === 'Yes').length],
    ['IP membership not confirmed', eligible.filter((item) => ipMembership(item.profile?.ethnicity) === 'Not confirmed').length],
  ]
  return <section className="space-y-4 rounded-2xl border border-border bg-white p-5" aria-label="OPT Plus summary">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Nutritional Assessment {year} — Summary</h2><p className="text-sm text-muted-foreground">{barangay}</p></div><button type="button" onClick={() => window.print()} className="nutrition-no-print flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Printer size={16} />Print summary</button></div>
    <div className="grid gap-3 sm:grid-cols-3">{(['weight_for_age', 'height_for_age', 'weight_for_height'] as IndicatorField[]).map((field) => <div key={field} className="rounded-lg bg-sky-50 p-3 text-sm"><p>{field === 'weight_for_age' ? 'Total valid WFA' : field === 'height_for_age' ? 'Total valid HFA' : 'Total valid WFL/H'}</p><strong className="text-xl">{denominators(field).length}</strong></div>)}</div>
    <div className="overflow-x-auto"><table className="w-full border-collapse"><caption className="sr-only">Nutrition classifications by age, sex, prevalence and IP membership</caption><thead>
      <tr className="bg-sky-50"><th rowSpan={2} className={cell}>Classification</th>{ageBands.map((band) => <th key={band.label} colSpan={3} className={cell}>{band.label}</th>)}<th colSpan={2} className={cell}>0–59 months</th><th colSpan={2} className={cell}>F1K: 0–23 months</th><th colSpan={3} className={cell}>IP children</th></tr>
      <tr className="bg-muted">{ageBands.flatMap((band) => ['Boys', 'Girls', 'Total'].map((heading) => <th key={`${band.label}-${heading}`} className={cell}>{heading}</th>))}{['Total', 'Prevalence', 'F1K total', 'F1K prevalence', 'IP boys', 'IP girls', 'IP total'].map((heading) => <th key={heading} className={cell}>{heading}</th>)}</tr>
    </thead><tbody>
      {summaryRows.map((row) => {
        const matching = eligible.filter((item) => validIndicator(item, row.field) && item[row.field] === row.value)
        const f1k = inAgeBand(matching, 0, 23)
        const ip = sexCounts(matching.filter((item) => ipMembership(item.profile?.ethnicity) === 'Yes'))
        return <tr key={row.title}><th scope="row" className={`${cell} whitespace-nowrap text-left`}>{row.list ? <button type="button" onClick={() => onList(row.list!)} className="font-medium text-primary underline">{row.title}</button> : row.title}</th>
          {ageBands.flatMap((band) => { const count = sexCounts(inAgeBand(matching, band.min, band.max)); return [count.boys, count.girls, count.total].map((n, index) => <td key={`${band.label}-${index}`} className={cell}>{n}</td>) })}
          <td className={cell}>{matching.length}</td><td className={cell}>{prevalence(matching.length, denominators(row.field).length)}</td><td className={cell}>{f1k.length}</td><td className={cell}>{prevalence(f1k.length, inAgeBand(denominators(row.field), 0, 23).length)}</td><td className={cell}>{ip.boys}</td><td className={cell}>{ip.girls}</td><td className={cell}>{ip.total}</td>
        </tr>
      })}
      <tr className="bg-slate-800 font-bold text-white"><th scope="row" className={`${cell} text-left`}>Children assessed</th>{ageBands.flatMap((band) => { const c = sexCounts(inAgeBand(eligible, band.min, band.max)); return [c.boys, c.girls, c.total].map((n, index) => <td key={`${band.label}-${index}`} className={cell}>{n}</td>) })}<td className={cell}>{eligible.length}</td><td className={cell}>—</td><td className={cell}>{underTwo.length}</td><td className={cell}>—</td>{(() => { const c = sexCounts(eligible.filter((item) => ipMembership(item.profile?.ethnicity) === 'Yes')); return [c.boys, c.girls, c.total].map((n, index) => <td key={index} className={cell}>{n}</td>) })()}</tr>
    </tbody></table></div>
    <p className="text-xs text-muted-foreground">One latest assessment per child in the selected year and barangay. Prevalence uses the number with a valid classification for that indicator; missing, implausible, edema-affected and legacy results are excluded from its denominator. The six classifications remain separate. Current profile data supplies IP membership and caregiver links.</p>
    <div className="grid gap-3 md:grid-cols-2">{summary.map(([name, value]) => <div key={name} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"><span>{name}</span><strong>{value}</strong></div>)}</div>
    <p className="text-xs text-muted-foreground">Total barangay population and estimated child population are unavailable in the supplied database. Caregivers are counted by linked guardian ID, not by name. WFA does not define overweight and HFA does not define tallness in the installed engine, so those sample rows are not fabricated.</p>
  </section>
}
function ClassificationList({ records, code, year, barangay, onScores }: {
  records: Assessment[]; code: ListCode; year: string; barangay: string; onScores: (item: Assessment) => void
}) {
  const definition = listDefinitions[code]
  const items = listRecords(records, code)
  const heightIndicator = definition.field === 'height_for_age'
  const cell = 'border border-border px-4 py-3 text-left text-sm'
  return <section className="space-y-4 rounded-2xl border border-border bg-white p-5" aria-label={`List ${code}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">List {code} — {definition.title} children, 0–59 months</h2><p className="text-sm text-muted-foreground">{barangay} · {year} · {items.length} children</p></div><button type="button" onClick={() => window.print()} className="nutrition-no-print flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Printer size={16} />Print list</button></div>
    <div className="overflow-x-auto"><table className="w-full border-collapse"><thead className="bg-muted"><tr>{['Child ID', 'Address / location', 'Mother / caregiver', 'Full name of child', 'Sex', 'Age (months)', 'Classification', 'Weight (kg)', 'Length/height (cm)', 'Date measured'].map((name) => <th key={name} rowSpan={2} className={cell}>{name}</th>)}<th colSpan={4} className={cell}>Date of follow-up</th><th rowSpan={2} className={`${cell} nutrition-no-print`}>Actions</th></tr><tr>{[1, 2, 3, 4].map((n) => <th key={n} className={cell}>{n}</th>)}</tr></thead><tbody>
      {items.map((item) => <tr key={item.child_id}><td className={cell}>CH-{item.child_id}</td><td className={cell}>{one(item.child) ? residentLocation(one(item.child)!) || 'Not recorded' : 'Not recorded'}</td><td className={cell}>{caregiverName(one(item.child))}</td><td className={cell}>{childName(one(item.child))}</td><td className={cell}>{assessmentSex(item) === 'MALE' ? 'M' : assessmentSex(item) === 'FEMALE' ? 'F' : '—'}</td><td className={cell}>{assessmentMonths(item)}</td><td className={cell}>{code}</td><td className={cell}>{quantity(item.weight)}</td><td className={cell}>{quantity(item.height)}</td><td className={`${cell} whitespace-nowrap`}>{item.assessment_date}</td>{[1, 2, 3, 4].map((n) => <td key={n} aria-label={`Follow-up ${n}: not recorded`} className={`${cell} min-w-24`}>—</td>)}<td className={`${cell} nutrition-no-print`}><Link href={childRecordUrl(item.child_id)} className="block text-primary underline">View child record</Link><button type="button" onClick={() => onScores(item)} className="mt-2 text-primary underline">Scores</button></td></tr>)}
      {items.length === 0 && <tr><td colSpan={15} className={`${cell} py-8 text-center text-muted-foreground`}>No {definition.title.toLowerCase()} children in this scope.</td></tr>}
    </tbody></table></div>
    <p className="text-xs text-muted-foreground">This list uses {heightIndicator ? 'height-for-age' : definition.field === 'weight_for_age' ? 'weight-for-age' : 'weight-for-length/height'} classification, independently of SAM/MAM status. It uses each child’s latest assessment in the selected year. Follow-up dates have no dedicated field in the supplied database; the four columns are blank spaces for the printed list.</p>
  </section>
}
export default function NutritionPage() {
  const [category, setCategory] = useState('All')
  const [history, setHistory] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [selected, setSelected] = useState<Assessment | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [reportYear, setReportYear] = useState(todayKey().slice(0, 4))
  const [reportBarangay, setReportBarangay] = useState('All')
  const [reportView, setReportView] = useState<ReportView>('Assessments')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [online, setOnline] = useState(true)
  const [cachedResponse, setCachedResponse] = useState<NutritionResponse | null>(null)
  const [queued, setQueued] = useState<QueuedAssessment[]>([])
  const [syncing, setSyncing] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [syncReview, setSyncReview] = useState<SyncReview | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const ownerRef = useRef<string | null>(null)
  const syncBusy = useRef(false)
  const editingRequest = useRef<string | null>(null)
  const syncHandler = useRef<(approval?: SyncReview) => Promise<void>>(async () => {})
  const { data: liveData, error, mutate, isValidating } = useSWR<NutritionResponse>(
    authReady && ownerId && online ? [endpoint, ownerId] : null,
    ([url]: [string, string]) => fetchNutrition(url),
    { shouldRetryOnError: false, revalidateOnFocus: true },
  )
  const accessDenied = error instanceof NutritionHttpError && [401, 403].includes(error.status)
  const data = accessDenied ? undefined : liveData?.currentUserId === ownerId ? liveData
    : cachedResponse?.currentUserId === ownerId ? cachedResponse : undefined
  const canRecord = data?.role === 'BNS' && data.permissions.create
  const savingRef = useRef(false)
  const children = data?.children ?? []
  const scopedRecords = useMemo(() => (data?.data ?? []).filter((item) =>
    item.assessment_date.startsWith(`${reportYear}-`) &&
    (reportBarangay === 'All' || String(one(item.child)?.barangay_id) === reportBarangay)
  ), [data, reportYear, reportBarangay])
  const barangays = useMemo(() => {
    const map = new Map<number, Barangay>()
    for (const c of [...(data?.children ?? []), ...(data?.data ?? []).map((item) => one(item.child)).filter((c): c is Child => c !== null)]) {
      const b = one(c.barangay)
      if (b) map.set(b.barangay_id, b)
    }
    return [...map.values()].sort((a, b) => a.barangay_name.localeCompare(b.barangay_name))
  }, [data])
  const selectedAreas = reportBarangay === 'All' ? barangays : barangays.filter((b) => String(b.barangay_id) === reportBarangay)
  const years = [...new Set([todayKey().slice(0, 4), ...(data?.data ?? []).map((item) => item.assessment_date.slice(0, 4))])].sort().reverse()
  const latest = useMemo(() => latestPerChild(scopedRecords), [scopedRecords])
  const visible = (history ? scopedRecords : latest).filter((item) => matches(item, category))
  const countCategories = ['MAM', 'SAM', 'Stunted', 'Wasted', 'Overweight / obesity']
  const allCategories = ['All', ...countCategories, 'Underweight', 'Possible risk of overweight', 'Infant urgent review', 'Needs verification', 'Not evaluated']
  const child = children.find((item) => String(item.child_id) === draft?.child_id) ?? null
  const days = draft && child ? ageDays(child, draft.assessment_date) : null
  const eligibleChildren = draft ? children.filter((item) => (reportBarangay === 'All' || String(item.barangay_id) === reportBarangay) && draft.assessment_date >= item.date_of_birth && draft.assessment_date < addMonths(item.date_of_birth, 60)) : []
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
  async function refreshQueue(id: string) {
    const rows = await listQueue(id)
    if (ownerRef.current === id) setQueued(rows)
  }
  async function reviewQueue(requestId?: string) {
    const id = ownerRef.current
    if (!id || !canRecord || !navigator.onLine || syncing || reviewing) return
    setReviewing(true); setStorageError('')
    try {
      const allRows = await listQueue(id)
      const rows = allRows.filter((row) => requestId ? row.requestId === requestId : row.status === 'PENDING')
      if (!rows.length) { setStorageError('No pending drafts to review. Use Review & retry on a blocked draft.'); return }
      const fresh = await fetchNutrition(endpoint)
      if (ownerRef.current !== id) return
      if (fresh.currentUserId !== id || fresh.role !== 'BNS' || !fresh.permissions.create) throw new Error('Sign in with the BNS account that recorded these drafts.')
      await saveSnapshot(id, fresh)
      if (ownerRef.current !== id) return
      setCachedResponse(fresh); await mutate(fresh, { revalidate: false })
      const reviewRows = rows.map((row): SyncReviewRow => {
        const sameDay = fresh.data.filter((record) => record.client_request_id !== row.requestId
          && Number(record.child_id) === Number(row.payload.child_id) && record.assessment_date === row.payload.assessment_date)
        return { draft: row, sameDay,
          exactDuplicates: sameDay.filter((record) => sameMeasurements(row.payload, record)),
          localDuplicateIds: allRows.slice(0, allRows.findIndex((other) => other.requestId === row.requestId)).filter((other) => sameMeasurements(row.payload, other.payload)).map((other) => other.requestId),
        }
      })
      setSyncReview({ ownerId: id, rows: reviewRows,
        selectedIds: reviewRows.filter((row) => !row.sameDay.length && !row.localDuplicateIds.length).map((row) => row.draft.requestId) })
    } catch (problem) { if (ownerRef.current === id) setStorageError(problem instanceof Error ? problem.message : 'Unable to check drafts for duplicates.') }
    finally { if (ownerRef.current === id) setReviewing(false) }
  }
  async function confirmReview() {
    if (!syncReview || !syncReview.selectedIds.length || syncReview.ownerId !== ownerRef.current || !canRecord) return
    const approval = syncReview
    setSyncReview(null)
    await syncHandler.current(approval)
  }
  async function syncQueue(approval?: SyncReview) {
    const id = ownerRef.current
    if (!id || !approval || approval.ownerId !== id || !navigator.onLine || syncBusy.current) return
    syncBusy.current = true
    setSyncing(true)
    let syncId: number | null = null
    const confirmedRequestIds: string[] = []
    const failures: string[] = []
    try {
      const pending = (await listQueue(id)).filter((row) => approval.selectedIds.includes(row.requestId))
      if (pending.length === 0 || ownerRef.current !== id) return
      const started = await readJson(await fetch('/api/nutrition/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_owner_id: id }),
      }))
      syncId = Number(started.sync_id)
      if (!Number.isSafeInteger(syncId) || syncId <= 0) { syncId = null; throw new Error('The server did not confirm the sync log. Drafts were retained.') }
      // Recheck active account, role and scope before uploading local drafts.
      const fresh = await fetchNutrition(endpoint)
      if (ownerRef.current !== id) { failures.push('The signed-in account changed during sync.'); return }
      if (fresh.currentUserId !== id) throw new Error('Sign back into the account that recorded these drafts.')
      if (fresh.role !== 'BNS' || !fresh.permissions.create) throw new Error('This account cannot record assessments. Local drafts were retained.')
      await saveSnapshot(id, fresh)
      if (ownerRef.current !== id) { failures.push('The signed-in account changed during sync.'); return }
      setCachedResponse(fresh)
      await mutate(fresh, { revalidate: false })
      const rows = (await listQueue(id)).filter((row) => approval.selectedIds.includes(row.requestId))
      let saved = 0
      for (const row of rows) {
        const reviewed = approval.rows.find((item) => item.draft.requestId === row.requestId)
        if (!reviewed || JSON.stringify(reviewed.draft.payload) !== JSON.stringify(row.payload)) {
          failures.push('A draft changed after review. Review it again before uploading.'); continue
        }
        const currentSameDay = fresh.data.filter((record) => record.client_request_id !== row.requestId
          && Number(record.child_id) === Number(row.payload.child_id) && record.assessment_date === row.payload.assessment_date)
        if (currentSameDay.some((record) => sameMeasurements(row.payload, record))
            || currentSameDay.some((record) => !reviewed.sameDay.some((known) => known.assessment_id === record.assessment_id))) {
          const detail = 'A matching or new same-day assessment exists. Review the existing record before uploading.'
          await putQueuedAssessment(id, { ...row, status: 'BLOCKED', lastError: detail })
          failures.push(detail); continue
        }
        if (!navigator.onLine || ownerRef.current !== id) { failures.push('Connection lost or signed-in account changed during sync.'); break }
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 25000)
        try {
          const result = await readJson(await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ ...row.payload, request_owner_id: id }),
          }))
          if (!result.data?.assessment_id) throw new Error('The server did not confirm this save. The draft remains queued.')
          confirmedRequestIds.push(row.requestId)
          await removeQueuedAssessment(id, row.requestId)
          saved++
          fresh.data.push(result.data)
          if (ownerRef.current === id && approval.selectedIds.length === 1) {
            setSelected(result.data)
            setReportYear(row.payload.assessment_date.slice(0, 4))
            setReportView('Assessments')
          }
        } catch (syncError) {
          const detail = syncError instanceof Error ? syncError.message : 'Unable to sync this assessment.'
          failures.push(detail)
          const status = syncError instanceof NutritionHttpError ? syncError.status : 0
          await putQueuedAssessment(id, { ...row,
            status: status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429 ? 'BLOCKED' : 'PENDING',
            lastError: detail,
          })
          if (status === 401 || status === 403 || status === 0 || status >= 500 || status === 408 || status === 429) break
        } finally { window.clearTimeout(timeout) }
      }
      if (ownerRef.current === id) {
        await refreshQueue(id)
        if (saved > 0) {
          setMessage(`${saved} assessment${saved === 1 ? '' : 's'} saved on the server and classified.`)
          await mutate()
        }
      }
    } catch (syncError) {
      failures.push(syncError instanceof Error ? syncError.message : 'Sync did not finish.')
      if (ownerRef.current === id) setStorageError(syncError instanceof Error ? syncError.message : 'Unable to sync. Local drafts were retained.')
    } finally {
      if (syncId !== null) {
        try {
          await readJson(await fetch('/api/nutrition/sync', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sync_id: syncId, request_owner_id: id,
              confirmed_request_ids: confirmedRequestIds,
              error_message: failures.length ? failures.slice(0, 3).join(' | ') : null }),
          }))
        } catch (logError) {
          if (ownerRef.current === id) setStorageError(`Assessment drafts are retained or already saved. Sync-log finalization failed: ${logError instanceof Error ? logError.message : 'Unknown error'}. The run may remain STARTED.`)
        }
      }
      syncBusy.current = false
      if (ownerRef.current === id) setSyncing(false)
    }
  }
  syncHandler.current = syncQueue
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || savingRef.current) return
    setFormError('')
    const id = ownerRef.current
    if (!id || !data || !canRecord || data.currentUserId !== id || !child) {
      setFormError('Select an eligible child from your account’s saved barangay scope. Open this page online once before working offline.'); return
    }
    if (draft.edema_grade === '') { setFormError('Record the edema examination result.'); return }
    let requestId: string
    try { requestId = editingRequest.current ?? crypto.randomUUID() }
    catch { setFormError('Unable to create a draft ID. Use this app over HTTPS or localhost.'); return }
    const payload: NutritionPayload = {
      child_id: Number(draft.child_id), assessment_date: draft.assessment_date,
      weight: Number(draft.weight), height: Number(draft.height),
      muac: draft.muac.trim() ? Number(draft.muac) : null,
      measurement_type: draft.measurement_type as NutritionPayload['measurement_type'],
      edema_grade: Number(draft.edema_grade), remarks: draft.remarks,
      client_request_id: requestId,
    }
    const validation = validateOfflinePayload(payload, child.date_of_birth, todayKey())
    if (validation) { setFormError(validation); return }
    savingRef.current = true
    setSaving(true)
    try {
      const existing = queued.find((item) => item.requestId === requestId)
      await putQueuedAssessment(id, {
        key: `${id}:${requestId}`, ownerId: id, requestId, childName: childName(child),
        queuedAt: existing?.queuedAt ?? new Date().toISOString(), status: 'PENDING', lastError: null, payload,
      })
      if (ownerRef.current !== id) return
      editingRequest.current = null
      setDraft(null)
      setStorageError('')
      setMessage('Draft saved locally. Review or edit it, then confirm upload when online. Nothing is uploaded automatically.')
      await refreshQueue(id)
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Unable to save the local draft.')
    } finally {
      savingRef.current = false
      if (ownerRef.current === id) setSaving(false)
    }
  }
  function editQueued(row: QueuedAssessment) {
    if (row.ownerId !== ownerRef.current || syncing) return
    editingRequest.current = row.requestId
    setFormError('')
    setDraft({ child_id: String(row.payload.child_id), assessment_date: row.payload.assessment_date,
      weight: String(row.payload.weight), height: String(row.payload.height),
      muac: row.payload.muac == null ? '' : String(row.payload.muac),
      measurement_type: row.payload.measurement_type, edema_grade: String(row.payload.edema_grade), remarks: row.payload.remarks })
  }
  async function removeQueued(row: QueuedAssessment) {
    const id = ownerRef.current
    if (!id || row.ownerId !== id || syncing) return
    try { await removeQueuedAssessment(id, row.requestId); await refreshQueue(id) }
    catch (problem) { setStorageError(problem instanceof Error ? problem.message : 'Unable to remove the local draft.') }
  }
  async function retryQueued(row: QueuedAssessment) {
    const id = ownerRef.current
    if (!id || row.ownerId !== id || syncing) return
    try {
      await putQueuedAssessment(id, { ...row, status: 'PENDING', lastError: null })
      await refreshQueue(id)
      await reviewQueue(row.requestId)
    } catch (problem) { setStorageError(problem instanceof Error ? problem.message : 'Unable to retry the draft.') }
  }
  useEffect(() => {
    let alive = true
    const applySession = (id: string | null) => {
      if (!alive) return
      if (ownerRef.current !== id) {
        ownerRef.current = id
        setOwnerId(id); setCachedResponse(null); setQueued([]); setDraft(null); setSelected(null)
        setFormError(''); setMessage(''); setStorageError(''); setSyncing(false); setSaving(false)
        editingRequest.current = null
        setSyncReview(null); setReviewing(false)
      }
      setAuthReady(true)
    }
    try {
      const client = getNutritionBrowserClient()
      let authEventReceived = false
      const { data: subscription } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        authEventReceived = true
        applySession(session?.user.id ?? null)
      })
      void client.auth.getSession().then(({ data: sessionData }: { data: { session: Session | null } }) => {
        if (!authEventReceived) applySession(sessionData.session?.user.id ?? null)
      })
        .catch(() => { if (alive) { setAuthReady(true); setStorageError('Unable to load the signed-in session.') } })
      return () => { alive = false; subscription.subscription.unsubscribe() }
    } catch (problem) {
      setAuthReady(true)
      setStorageError(problem instanceof Error ? problem.message : 'Unable to initialize the session.')
      return () => { alive = false }
    }
  }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    if (!ownerId) return
    let alive = true
    void Promise.all([loadSnapshot<NutritionResponse>(ownerId), listQueue(ownerId)]).then(([snapshot, rows]) => {
      if (alive && ownerRef.current === ownerId) { setCachedResponse(snapshot); setQueued(rows) }
    }).catch((problem) => { if (alive) setStorageError(problem instanceof Error ? problem.message : 'Offline storage is unavailable.') })
    return () => { alive = false }
  }, [ownerId])
  useEffect(() => {
    if (!ownerId || liveData?.currentUserId !== ownerId) return
    void saveSnapshot(ownerId, liveData).catch((problem) => {
      if (ownerRef.current === ownerId) setStorageError(problem instanceof Error ? problem.message : 'Unable to cache this account’s child options.')
    })
  }, [ownerId, liveData])
  useEffect(() => {
    if (!ownerId || !accessDenied) return
    setCachedResponse(null)
    void removeSnapshot(ownerId).catch(() => {})
  }, [ownerId, accessDenied])
  return <div className="nutrition-report-root space-y-6">
    <style>{`@media print {
      body * { visibility: hidden; }
      .nutrition-report-root, .nutrition-report-root * { visibility: visible; }
      .nutrition-report-root { position: absolute; inset: 0; width: 100%; background: white; }
      .nutrition-no-print { display: none !important; }
      .nutrition-report-root .overflow-x-auto { overflow: visible !important; }
      .nutrition-report-root table { width: 100%; table-layout: fixed; font-size: 6.5pt; }
      .nutrition-report-root th, .nutrition-report-root td { padding: 2px; white-space: normal !important; overflow-wrap: anywhere; min-width: 0 !important; }
      .nutrition-report-root th:first-child { width: 15%; }
      .nutrition-report-root thead { display: table-header-group; }
      .nutrition-report-root tr { break-inside: avoid; }
      @page { size: A4 landscape; margin: 8mm; }
    }`}</style>
    <div className="nutrition-no-print flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold text-foreground">Nutritional Assessment</h1><p className="mt-1 text-muted-foreground">OPT Plus measurements, WHO classifications, and follow-up monitoring</p></div>
      {data?.role === 'BNS' && <div className="flex flex-col items-end gap-1">
        <button type="button" disabled={!canRecord || !ownerId || accessDenied}
          title={!data ? 'Loading account permissions and child options' : !data.permissions.create ? 'This account has view access only' : 'Record anthropometric measurements'}
          onClick={() => { editingRequest.current = null; setFormError(''); setMessage(''); setDraft({ ...initialDraft(), assessment_date: reportYear === todayKey().slice(0, 4) ? todayKey() : `${reportYear}-12-31` }) }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus size={20} />Record Assessment</button>
        {!canRecord && <span className="text-xs text-muted-foreground">Recording permission is unavailable for this account.</span>}
      </div>}
    </div>
    <nav aria-label="Nutrition views" className="nutrition-no-print flex gap-1 border-b border-sky-200 bg-sky-50 px-2">
      {(['Assessments', 'Summary', 'Risk'] as const).map((view) => {
        const active = view === 'Summary' ? reportView !== 'Assessments' && reportView !== 'Risk' : reportView === view
        return <button key={view} type="button" aria-pressed={active} onClick={() => setReportView(view)} className={`border-b-2 px-5 py-4 text-sm font-medium transition-colors ${active ? 'border-[#0077B6] text-[#0077B6]' : 'border-transparent text-muted-foreground hover:border-sky-200 hover:text-[#0077B6]'}`}>{view === 'Assessments' ? 'All assessments' : view === 'Risk' ? 'Risk monitoring' : 'Summary'}</button>
      })}
    </nav>
    {message && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
    {error && <div role="alert" className={alertClass}>{error.message}<button type="button" onClick={() => void mutate()} className="ml-3 underline">Retry</button></div>}
    {!authReady && <p role="status" className="text-sm">Checking signed-in account…</p>}
    {authReady && !ownerId && <p role="alert" className={alertClass}>Sign in to access this account’s nutrition records and offline drafts.</p>}
    {ownerId && !data && !error && <p role="status" className="flex items-center gap-2 text-sm">{online ? <><Loader2 className="animate-spin" size={18} />Loading assessments…</> : 'No cached child options are available. Open this page online once before working offline.'}</p>}
    <section className="nutrition-no-print space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Offline assessment queue">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{online ? 'Online' : 'Offline'} · {queued.length} local draft{queued.length === 1 ? '' : 's'}</h2><p className="text-xs text-muted-foreground">Drafts stay on this device until you review and confirm upload. Reconnecting never uploads automatically.</p></div><button type="button" disabled={!online || !ownerId || !canRecord || syncing || reviewing || queued.length === 0} onClick={() => void reviewQueue()} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50">{syncing ? 'Uploading…' : reviewing ? 'Checking drafts…' : 'Review pending drafts'}</button></div>
      {storageError && <p role="alert" className={alertClass}>{storageError}</p>}
      {queued.map((row) => <div key={row.requestId} className="rounded-lg border border-border bg-white p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{row.childName}</strong><p>{row.payload.assessment_date} · {row.status === 'BLOCKED' ? 'Needs correction or permission review' : 'Pending sync'}</p></div><div className="flex gap-3"><button type="button" disabled={syncing || !canRecord} onClick={() => editQueued(row)} className="text-primary underline disabled:opacity-50">Edit draft</button><button type="button" disabled={syncing || !online || !canRecord} onClick={() => void retryQueued(row)} className="text-primary underline disabled:opacity-50">Review & retry</button><button type="button" disabled={syncing} onClick={() => void removeQueued(row)} className="text-red-700 underline disabled:opacity-50">Remove local draft</button></div></div>{row.lastError && <p className="mt-2 text-xs text-red-700">{row.lastError}</p>}</div>)}
    </section>
    {reportView !== 'Risk' && <div className="nutrition-no-print flex flex-wrap items-center gap-3">
      <label htmlFor="nutrition-year" className="text-sm font-medium">Year</label>
      <select id="nutrition-year" value={reportYear} onChange={(event) => setReportYear(event.target.value)} className="rounded-lg border border-border bg-white px-3 py-2">{years.map((year) => <option key={year}>{year}</option>)}</select>
      <label htmlFor="nutrition-barangay" className="text-sm font-medium">Barangay</label>
      <select id="nutrition-barangay" value={reportBarangay} onChange={(event) => setReportBarangay(event.target.value)} className="rounded-lg border border-border bg-white px-3 py-2"><option value="All">All accessible barangays</option>{barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name} — {b.municipality}</option>)}</select>
    </div>}
    {reportView === 'Risk' && <NutritionRiskMonitor key={ownerId ?? 'signed-out'} monitoring={data?.risk_monitoring} loading={!authReady || Boolean(ownerId && !data && !error) || isValidating} error={error?.message} offline={!online} onRefresh={() => void mutate()} />}
    {reportView !== 'Assessments' && reportView !== 'Risk' && <nav aria-label="Summary classifications" className="nutrition-no-print flex flex-wrap gap-2 rounded-xl border border-border bg-white p-3">
      {(['Summary', ...listCodes] as Exclude<ReportView, 'Assessments' | 'Risk'>[]).map((view) => <button key={view} type="button" aria-pressed={reportView === view} onClick={() => setReportView(view)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${reportView === view ? 'bg-sky-100 text-[#0077B6]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{view === 'Summary' ? 'Overview' : `List ${view} (${listRecords(latest, view).length})`}</button>)}
    </nav>}
    {reportView === 'Summary' && <SummaryReport records={latest} year={reportYear} barangay={reportBarangay === 'All' ? 'All accessible barangays' : selectedAreas[0]?.barangay_name ?? 'Selected barangay'} onList={setReportView} />}
    {reportView !== 'Summary' && reportView !== 'Assessments' && reportView !== 'Risk' && <ClassificationList records={latest} code={reportView} year={reportYear} barangay={reportBarangay === 'All' ? 'All accessible barangays' : selectedAreas[0]?.barangay_name ?? 'Selected barangay'} onScores={setSelected} />}
    {reportView === 'Assessments' && <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {countCategories.map((name) => <button key={name} type="button" onClick={() => setCategory(category === name ? 'All' : name)} aria-pressed={category === name} className={`rounded-xl border p-4 text-left ${category === name ? 'border-primary bg-sky-50' : 'border-border bg-white'}`}>
        <p className="text-sm text-muted-foreground">{name}</p><p className="mt-1 text-2xl font-bold text-foreground">{latest.filter((item) => matches(item, name)).length}</p>
      </button>)}
    </div>
    <p className="text-xs text-muted-foreground">Counts use the latest loaded assessment per child in the selected year and barangay. Categories can overlap.</p>
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="nutrition-category" className="text-sm font-medium">Classification view</label>
      <select id="nutrition-category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border bg-white px-3 py-2">{allCategories.map((name) => <option key={name}>{name}</option>)}</select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} />Include assessment history</label>
      <button type="button" disabled={isValidating} onClick={() => void mutate()} className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={16} className={isValidating ? 'animate-spin' : ''} />Refresh</button>
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="border-b border-border p-5"><h2 className="font-semibold">{history ? 'Assessment history' : 'Latest assessments'}</h2><p className="mt-1 text-sm text-muted-foreground">Profile information comes from the linked child record. View child record opens the centralized profile and health history; Scores shows this assessment’s calculated results.</p></div>
      <div className="overflow-x-auto"><table className="w-full">
        <thead className="bg-muted"><tr>{[
          'Child seq.', 'Address / location of residence', 'Name of mother or caregiver', 'Full name of child',
          'Belongs to IP group?', 'Sex', 'Date of birth', 'Date measured', 'Weight (kg)', 'Length / height (cm)',
          'Age in months', 'Age in days', 'Weight-for-age status', 'Length/height-for-age status',
          'Weight-for-length/height status', 'Bilateral pitting edema', 'Disability', 'MUAC (cm)', 'MUAC status', 'Actions',
        ].map((heading) => <th key={heading} scope="col" className="min-w-24 px-4 py-4 text-left text-xs font-semibold">{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {visible.map((item, index) => <tr key={item.assessment_id} className="hover:bg-muted">
            <td className="px-4 py-4 text-sm">{index + 1}</td>
            <td className="min-w-40 px-4 py-4 text-sm">{one(item.child) ? residentLocation(one(item.child)!) || 'Not recorded' : 'Not recorded'}</td>
            <td className="min-w-44 px-4 py-4 text-sm">{caregiverName(one(item.child))}</td>
            <td className="min-w-44 px-4 py-4 text-sm font-medium">{childName(one(item.child))}<span className="mt-1 block text-xs text-muted-foreground">{one(one(item.child)?.barangay ?? null)?.barangay_name ?? 'Barangay unavailable'}</span></td>
            <td className="px-4 py-4 text-sm">{ipMembership(item.profile?.ethnicity)}</td>
            <td className="px-4 py-4 text-sm">{one(item.child)?.sex === 'MALE' ? 'M' : one(item.child)?.sex === 'FEMALE' ? 'F' : 'Not recorded'}</td>
            <td className="whitespace-nowrap px-4 py-4 text-sm">{one(item.child)?.date_of_birth ?? 'Not recorded'}</td>
            <td className="whitespace-nowrap px-4 py-4 text-sm">{item.assessment_date}</td>
            <td className="px-4 py-4 text-sm">{quantity(item.weight)}</td>
            <td className="px-4 py-4 text-sm">{quantity(item.height)}<span className="block text-xs text-muted-foreground">{label(item.measurement_type)}</span></td>
            <td className="px-4 py-4 text-sm">{item.age_days == null ? 'Not recorded' : completedMonths(birthAtAssessment(item), item.assessment_date)}</td>
            <td className="px-4 py-4 text-sm">{item.age_days ?? 'Not recorded'}</td>
            <td className="min-w-40 px-4 py-4 text-sm">{label(item.weight_for_age)}</td>
            <td className="min-w-40 px-4 py-4 text-sm">{label(item.height_for_age)}</td>
            <td className="min-w-40 px-4 py-4 text-sm">{label(item.weight_for_height)}</td>
            <td className="px-4 py-4 text-sm">{item.edema_grade == null ? 'Not recorded' : item.edema_grade === 0 ? 'Absent' : `+${item.edema_grade}`}</td>
            <td className="px-4 py-4 text-sm">Not recorded in child profile</td>
            <td className="px-4 py-4 text-sm">{quantity(item.muac)}</td>
            <td className="min-w-36 px-4 py-4 text-sm">{label(item.muac_status)}</td>
            <td className="min-w-44 px-4 py-4 text-sm"><span className="block text-xs">{!item.engine_version ? 'Legacy — not verified' : label(item.nutritional_status)}</span><span className="my-1 block text-xs text-muted-foreground">{followUp(item)}</span><Link href={childRecordUrl(item.child_id)} className="mb-2 block font-medium text-primary underline">View child record</Link><button type="button" onClick={() => setSelected(item)} className="font-medium text-primary underline">Scores<span className="sr-only"> for assessment {item.assessment_id}</span></button></td>
          </tr>)}
          {data && visible.length === 0 && <tr><td colSpan={20} className="px-5 py-10 text-center text-sm text-muted-foreground">No assessments match this view.</td></tr>}
        </tbody>
      </table></div>
      <p className="border-t border-border p-4 text-xs text-muted-foreground">Shows current linked profile information alongside measurements recorded on the assessment date. IP membership comes from the latest child profile’s Ethnicity field. Disability and region are not present in the supplied profile fields. All accessible assessment records are loaded in pages.</p>
    </div>
    </>}
    <div className="nutrition-no-print rounded-2xl border border-border bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><AlertCircle size={19} className="text-orange-500" />Follow-up guidance</h2><p className="mt-2 text-sm text-muted-foreground">SAM and infant urgent-review results require prompt clinical assessment. Other growth concerns require health-staff review. Missing scores and flagged measurements are displayed for verification.</p></div>
    {syncReview && <Modal title="Review drafts before upload" busy={syncing} onClose={() => setSyncReview(null)}>
      <p className="mb-4 text-sm text-muted-foreground">Check the measurements and any existing records. Select drafts to upload, or go back and edit them. Classification and alerts are generated only after confirmed server submission.</p>
      <div className="space-y-4">{syncReview.rows.map((item) => {
        const row = item.draft
        const blocked = item.exactDuplicates.length > 0 || item.localDuplicateIds.length > 0
        return <section key={row.requestId} className="rounded-xl border border-border p-4">
          <label className="flex items-center gap-3 font-semibold"><input type="checkbox" disabled={blocked} checked={syncReview.selectedIds.includes(row.requestId)} onChange={(event) => setSyncReview((previous) => previous ? { ...previous, selectedIds: event.target.checked ? [...previous.selectedIds, row.requestId] : previous.selectedIds.filter((id) => id !== row.requestId) } : previous)} />{row.childName} · {row.payload.assessment_date}</label>
          <p className="mt-2 text-sm">Weight: {row.payload.weight} kg · Length/height: {row.payload.height} cm · Position: {label(row.payload.measurement_type)} · MUAC: {row.payload.muac ?? 'Not measured'} · Edema: {row.payload.edema_grade === 0 ? 'Absent' : `+${row.payload.edema_grade}`}</p>
          <p className="mt-1 text-sm">Remarks: {row.payload.remarks || 'None'}</p>
          {item.localDuplicateIds.length > 0 && <p className="mt-2 text-sm text-red-700">Identical measurements appear in an earlier draft in your local queue. Edit or remove the duplicate draft before uploading.</p>}
          {item.sameDay.length > 0 && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm"><p className="font-semibold">{item.exactDuplicates.length ? 'Matching measurements already recorded — upload blocked.' : 'Existing assessment on this date. Select this draft only if it is a separate measurement.'}</p>{item.sameDay.map((record) => <p key={record.assessment_id} className="mt-1">Assessment #{record.assessment_id}: {quantity(record.weight, 'kg')} · {quantity(record.height, 'cm')} · MUAC {quantity(record.muac, 'cm')} · {label(record.measurement_type)} · Edema {record.edema_grade ?? 'Not recorded'}</p>)}<Link href={childRecordUrl(row.payload.child_id)} className="mt-2 inline-block text-primary underline">View child record</Link></div>}
          <button type="button" onClick={() => { setSyncReview(null); editQueued(row) }} className="mt-3 text-sm text-primary underline">Edit this draft</button>
        </section>
      })}</div>
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setSyncReview(null)} className="rounded-lg border border-border px-4 py-2">Back to drafts</button><button type="button" disabled={!online || !canRecord || syncReview.selectedIds.length === 0 || syncing} onClick={() => void confirmReview()} className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">Confirm upload ({syncReview.selectedIds.length})</button></div>
    </Modal>}
    {draft && <Modal title="Record nutritional assessment" busy={saving} onClose={() => setDraft(null)}>
      <form onSubmit={save} className="space-y-6">
        {formError && <p role="alert" className={alertClass}>{formError}</p>}
        <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
          <section><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">Child and caregiver information</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium md:col-span-2">Select child<select autoFocus required value={draft.child_id} onChange={(event) => change('child_id', event.target.value)} className={inputClass}><option value="">Select a child</option>{eligibleChildren.map((item) => <option key={item.child_id} value={item.child_id}>{childName(item)} — {one(item.barangay)?.barangay_name ?? 'Barangay'} — #{item.child_id}</option>)}</select></label>
              <label className="text-sm font-medium">Address or location of child's residence<input readOnly value={child ? residentLocation(child) || 'Not recorded' : ''} className={inputClass} /></label>
              <label className="text-sm font-medium">Name of mother or caregiver<input readOnly value={child ? caregiverName(child) : ''} className={inputClass} /></label>
              <label className="text-sm font-medium">Full name of child<input readOnly value={child ? childName(child) : ''} className={inputClass} /></label>
              <label className="text-sm font-medium">Ethnicity<input readOnly value={child?.profile?.ethnicity ?? ''} className={inputClass} /></label>
              <label className="text-sm font-medium">Belongs to IP group?<input readOnly value={child ? ipMembership(child.profile?.ethnicity) : ''} className={inputClass} /></label>
              <label className="text-sm font-medium">Sex<input readOnly value={child?.sex === 'MALE' ? 'M' : child?.sex === 'FEMALE' ? 'F' : ''} className={inputClass} /></label>
              <label className="text-sm font-medium">Date of birth<input readOnly type="date" value={child?.date_of_birth ?? ''} className={inputClass} /></label>
            </div>
            {child && <p className="mt-3 text-sm">These fields come from the child profile. <Link href={childRecordUrl(child.child_id)} className="font-medium text-primary underline">View child record</Link></p>}
            {eligibleChildren.length === 0 && <p className="mt-3 text-sm text-orange-700">No active children in this scope are younger than five on the selected measurement date.</p>}
          </section>
          <section><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">Date measured and anthropometric measurements</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">Date measured<input required type="date" value={draft.assessment_date} min={child?.date_of_birth} max={todayKey()} onChange={(event) => change('assessment_date', event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-medium">Weight (kg)<input required type="number" min="0.01" step="0.01" value={draft.weight} onChange={(event) => change('weight', event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-medium">Length / height (cm)<input required type="number" min="0.1" step="0.1" value={draft.height} onChange={(event) => change('height', event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-medium">Actual measurement position<select required value={draft.measurement_type} onChange={(event) => change('measurement_type', event.target.value)} className={inputClass}><option value="">Select position</option><option value="LENGTH">Recumbent length — lying down</option><option value="HEIGHT">Standing height</option></select></label>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Recommended position: {days === null ? 'select a child first' : days < 731 ? 'recumbent length' : 'standing height'}. Enter the original measured value; the server applies any position correction.</p>
          </section>
          <section><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">Automatically calculated — no data entry</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">Age in completed months<input readOnly value={child ? completedMonths(child.date_of_birth, draft.assessment_date) ?? '' : ''} className={inputClass} /></label>
              <label className="text-sm font-medium">Age in days<input readOnly value={days ?? ''} className={inputClass} /></label>
              {['Weight-for-age status', 'Length/height-for-age status', 'Weight-for-length/height status'].map((name) => <label key={name} className="text-sm font-medium">{name}<input readOnly value="Calculated by the server after saving" className={inputClass} /></label>)}
            </div>
          </section>
          <section><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">Edema and MUAC</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">Bilateral pitting edema<select required value={draft.edema_grade} onChange={(event) => change('edema_grade', event.target.value)} className={inputClass}><option value="">Select examination result</option><option value="0">Absent (0)</option><option value="1">Mild (+1)</option><option value="2">Moderate (+2)</option><option value="3">Severe (+3)</option></select></label>
              <label className="text-sm font-medium">MUAC (cm, optional)<input type="number" min="0.1" step="0.1" value={draft.muac} onChange={(event) => change('muac', event.target.value)} className={inputClass} /><span className="mt-1 block text-xs font-normal text-muted-foreground">{underSix ? '6–59-month MUAC cutoffs are not applied to this infant.' : 'Leave blank if not measured.'}</span></label>
              <label className="text-sm font-medium">MUAC status<input readOnly value="Calculated by the server after saving" className={inputClass} /></label>
            </div>
          </section>
          <label className="block text-sm font-medium">Remarks<textarea rows={3} value={draft.remarks} onChange={(event) => change('remarks', event.target.value)} className={inputClass} /></label>
          <p className="rounded-lg bg-sky-50 p-3 text-sm">WHO Z-scores, classifications and risk alerts are generated after server validation. Drafts remain on this device until you review and confirm upload.</p>
        </fieldset>
        <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setDraft(null)} className="rounded-lg border border-border px-4 py-2 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving || !child || !canRecord || accessDenied || !ownerId} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{saving && <Loader2 size={16} className="animate-spin" />}{saving ? 'Saving…' : 'Save local draft'}</button></div>
      </form>
    </Modal>}
    {selected && <AssessmentDetails assessment={selected} onClose={() => setSelected(null)} />}
  </div>
}
