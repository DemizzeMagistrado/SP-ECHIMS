export type SavedAdministration = {
  supplementation_record_id: number
  supplementation_date: string
  supplement_id: number
  record_type: string | null
  tier?: string | null
  purpose?: string | null
  protocol_snapshot?: unknown
  course_reference?: string | null
  clinical_indication?: string | null
  clinical_dose_number?: number | null
  course_start_date?: string | null
}
export type DueRow = {
  key: string
  supplementId: number
  tier: string
  reference: string
  lastDate: string
  dueDate: string | null
  nextDose: number | null
  status: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'COURSE_COMPLETED' | 'NOT_ELIGIBLE' | 'REVIEW_REQUIRED' | 'UNAVAILABLE'
  detail: string
}
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)
export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}
export function manilaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function addCalendarMonths(value: string, months: number): string {
  const d = new Date(`${value}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}
function addDays(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function ageMonths(birth: string, at: string): number {
  const b = new Date(`${birth}T00:00:00Z`), d = new Date(`${at}T00:00:00Z`)
  return (d.getUTCFullYear()-b.getUTCFullYear())*12+d.getUTCMonth()-b.getUTCMonth()-(d.getUTCDate()<b.getUTCDate()?1:0)
}
function timeStatus(due: string, today: string): DueRow['status'] {
  return due < today ? 'OVERDUE' : due === today ? 'DUE_TODAY' : 'UPCOMING'
}
function checkAge(row: DueRow, snapshot: Record<string, unknown>, birth: string, today: string): DueRow {
  if (!row.dueDate || !validCalendarDate(birth) || !integer(snapshot.age_min_months) || !integer(snapshot.age_max_months))
    return {...row,status:'UNAVAILABLE',detail:'Saved age limits or child birth date are unavailable.'}
  const age = ageMonths(birth, row.dueDate)
  if (age < 0 || age >= 60 || ageMonths(birth,today) >= 60)
    return {...row,status:'NOT_ELIGIBLE',detail:'Outside this module’s 0–59-month age range. Review the child’s current care plan.'}
  if (age < snapshot.age_min_months || age > snapshot.age_max_months || (row.dueDate <= today && (ageMonths(birth,today) < snapshot.age_min_months || ageMonths(birth,today) > snapshot.age_max_months)))
    return {...row,status:'REVIEW_REQUIRED',detail:'Age at the due date falls outside the saved protocol. Review an eligible protocol; do not reuse its previous dose.'}
  return row
}
// These are tracking dates from saved protocol metadata, not prescribing decisions.
export function buildSupplementationDue(records: SavedAdministration[], birth: string, childStatus: string, today: string): DueRow[] {
  if (!validCalendarDate(today)) throw new Error('A valid local date is required.')
  const sorted = [...records].sort((a,b)=>b.supplementation_date.localeCompare(a.supplementation_date)||b.supplementation_record_id-a.supplementation_record_id)
  const groups = new Map<string,SavedAdministration[]>()
  for (const r of sorted) {
    if (r.record_type === 'DISPENSED') continue
    const s = object(r.protocol_snapshot)
    const type = typeof s?.supplement_type === 'string' ? s.supplement_type : `product:${r.supplement_id}`
    const key = r.record_type !== 'ADMINISTERED' ? `legacy:${r.supplementation_record_id}`
      : r.tier === 'CLINICAL' ? `clinical:${r.course_reference || `missing:${r.supplementation_record_id}`}`
      : `interval:${type}:${r.tier || s?.tier || 'UNKNOWN'}:${r.purpose || s?.purpose || 'UNKNOWN'}`
    const group=groups.get(key)??[];group.push(r);groups.set(key,group)
  }
  const result: DueRow[]=[]
  for (const [key,entries] of groups) {
    const latest=entries[0], snapshot=object(latest.protocol_snapshot)
    let row: DueRow={key,supplementId:latest.supplement_id,tier:latest.tier || String(snapshot?.tier || 'Unknown'),reference:latest.course_reference || String(snapshot?.protocol_code || 'Saved record'),lastDate:latest.supplementation_date,dueDate:null,nextDose:null,status:'UNAVAILABLE',detail:'Saved scheduling information is unavailable. No due date was assumed.'}
    if (latest.record_type !== 'ADMINISTERED' || !snapshot || !validCalendarDate(latest.supplementation_date) || latest.supplementation_date > today) {
      result.push(row);continue
    }
    if (row.tier === 'CLINICAL') {
      const first=entries.find(e=>e.clinical_dose_number===1)
      const firstSnapshot=object(first?.protocol_snapshot)
      const offsets=firstSnapshot?.clinical_dose_offsets_days
      if (!first || !latest.course_reference || !validCalendarDate(first.course_start_date) || !Array.isArray(offsets) || offsets.length===0 || offsets[0]!==0 || offsets.some((n,i)=>!integer(n)||n<0||(i>0&&n<=offsets[i-1]))) {
        result.push(row);continue
      }
      const numbers=entries.map(e=>e.clinical_dose_number)
      const count=entries.length
      const consistent=entries.every(e=>{
        const snap=object(e.protocol_snapshot)
        const n=e.clinical_dose_number
        return integer(n)&&n>=1&&n<=offsets.length&&e.course_start_date===first.course_start_date&&e.clinical_indication===first.clinical_indication&&snap?.supplement_type===firstSnapshot?.supplement_type&&JSON.stringify(snap?.clinical_dose_offsets_days)===JSON.stringify(offsets)&&e.supplementation_date===addDays(first.course_start_date!, offsets[n-1])
      }) && new Set(numbers).size===count && Array.from({length:count},(_,i)=>i+1).every(n=>numbers.includes(n))
      if (!consistent) row={...row,status:'REVIEW_REQUIRED',detail:'Course dates, dose sequence or saved protocol details are inconsistent. Reconcile the course.'}
      else if (count===offsets.length) row={...row,status:'COURSE_COMPLETED',detail:'All doses in the saved schedule are recorded. This does not establish clinical recovery.'}
      else if (sorted.some(other => {
        if (other.record_type === 'DISPENSED' || (other.tier === 'CLINICAL' && other.course_reference === latest.course_reference)) return false
        const otherSnapshot = object(other.protocol_snapshot)
        if (other.supplement_id !== latest.supplement_id && otherSnapshot?.supplement_type !== snapshot.supplement_type) return false
        if (other.supplementation_date >= first.course_start_date!) return true
        if (other.tier !== 'CLINICAL' || other.clinical_dose_number !== 1) return false
        const otherOffsets = otherSnapshot?.clinical_dose_offsets_days
        const recordedDoses = new Set(sorted.filter(dose => dose.record_type === 'ADMINISTERED' && dose.tier === 'CLINICAL' && dose.course_reference === other.course_reference).map(dose => dose.clinical_dose_number))
        return !Array.isArray(otherOffsets) || recordedDoses.size < otherOffsets.length
      })) row = {...row, status: 'REVIEW_REQUIRED', detail: 'Another administration or unfinished course of this supplement conflicts with this course. RHM must reconcile the history before scheduling.'}
      else {
        const due=addDays(first.course_start_date,offsets[count])
        row=checkAge({...row,dueDate:due,nextDose:count+1,status:timeStatus(due,today),detail:'Next dose follows the saved course offsets. A missed clinical date requires RHM review before recording.'},snapshot,birth,today)
      }
    } else if (row.tier==='ROUTINE'||row.tier==='TARGETED') {
      if(integer(snapshot.interval_months)&&snapshot.interval_months>0&&snapshot.interval_months<=60){
        const due=addCalendarMonths(latest.supplementation_date,snapshot.interval_months)
        row=checkAge({...row,dueDate:due,status:timeStatus(due,today),detail:'Tracking date from the last administration and saved protocol interval; staff must recheck eligibility and history.'},snapshot,birth,today)
        const newerSameType=sorted.find(r=>r.record_type!=='DISPENSED'&&r.supplementation_record_id!==latest.supplementation_record_id&&(r.supplement_id===latest.supplement_id||object(r.protocol_snapshot)?.supplement_type===snapshot.supplement_type)&&(r.supplementation_date>latest.supplementation_date||(r.supplementation_date===latest.supplementation_date&&r.supplementation_record_id>latest.supplementation_record_id)))
        if(newerSameType)row={...row,status:'REVIEW_REQUIRED',detail:'A newer administration of this supplement exists under another course or purpose. Reconcile it before scheduling another dose.'}
      }
    }
    if(childStatus!=='ACTIVE'&&row.status!=='COURSE_COMPLETED')row={...row,status:'REVIEW_REQUIRED',detail:'The child is not active. Review the profile before scheduling.'}
    result.push(row)
  }
  return result.sort((a,b)=>(a.dueDate??'9999').localeCompare(b.dueDate??'9999')||a.key.localeCompare(b.key))
}
