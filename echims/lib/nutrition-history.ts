export type HistoryAssessment = {
  assessment_id: number
  assessment_date: string
  weight?: number | string | null
  height?: number | string | null
  muac?: number | string | null
  measurement_type?: string | null
  edema_grade?: number | null
  waz?: number | string | null
  haz?: number | string | null
  whz?: number | string | null
  baz?: number | string | null
  weight_for_age?: string | null
  height_for_age?: string | null
  weight_for_height?: string | null
  bmi_for_age?: string | null
  nutritional_status?: string | null
  muac_status?: string | null
  evaluation_status?: string | null
  engine_version?: string | null
  is_at_risk?: boolean | null
  remarks?: string | null
  history_comparison?: HistoryComparison
}
export type IndicatorChange = { label: string; previous: string | null; current: string | null; change: 'Improved' | 'Worsened' | 'Unchanged' | 'Not comparable' }
export type HistoryComparison = { previous_assessment_id: number | null; previous_date: string | null; changes: IndicatorChange[] }
const fields = [
  ['weight_for_age', 'Weight-for-age'], ['height_for_age', 'Height-for-age'],
  ['weight_for_height', 'Weight-for-length/height'], ['bmi_for_age', 'BMI-for-age'],
  ['nutritional_status', 'Acute screening'],
] as const
const profiles: Record<string, Record<string, [string, number]>> = {
  weight_for_age: { NOT_UNDERWEIGHT: ['LOW', 0], NORMAL: ['LOW', 0], UNDERWEIGHT: ['LOW', 1], SEVERELY_UNDERWEIGHT: ['LOW', 2] },
  height_for_age: { NOT_STUNTED: ['LOW', 0], NORMAL: ['LOW', 0], STUNTED: ['LOW', 1], SEVERELY_STUNTED: ['LOW', 2] },
  weight_for_height: { NORMAL: ['NORMAL', 0], WASTED: ['LOW', 1], WASTING: ['LOW', 1], SEVERELY_WASTED: ['LOW', 2], SEVERE_WASTING: ['LOW', 2], POSSIBLE_RISK_OF_OVERWEIGHT: ['HIGH', 1], OVERWEIGHT: ['HIGH', 2], OBESE: ['HIGH', 3], OBESITY: ['HIGH', 3] },
  bmi_for_age: { NORMAL: ['NORMAL', 0], THINNESS: ['LOW', 1], SEVERE_THINNESS: ['LOW', 2], WASTED: ['LOW', 1], SEVERELY_WASTED: ['LOW', 2], POSSIBLE_RISK_OF_OVERWEIGHT: ['HIGH', 1], OVERWEIGHT: ['HIGH', 2], OBESE: ['HIGH', 3], OBESITY: ['HIGH', 3] },
  nutritional_status: { NO_ACUTE_CRITERIA_IDENTIFIED: ['ACUTE', 0], MAM: ['ACUTE', 1], SAM: ['ACUTE', 2] },
}
export function labelClassification(value: string | null | undefined) {
  if (!value) return 'Not evaluated'
  if (value === 'SAM' || value === 'MAM') return value
  return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}
export function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
export function chronologicalHistory<T extends HistoryAssessment>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.assessment_date.localeCompare(b.assessment_date) || a.assessment_id - b.assessment_id)
}
export function compareAssessment(current: HistoryAssessment, previous: HistoryAssessment | null): HistoryComparison {
  const compatible = previous && current.evaluation_status === 'EVALUATED' && previous.evaluation_status === 'EVALUATED'
    && Boolean(current.engine_version) && current.engine_version === previous.engine_version
  return {
    previous_assessment_id: previous?.assessment_id ?? null,
    previous_date: previous?.assessment_date ?? null,
    changes: fields.map(([field, label]) => {
      const before = previous?.[field] ?? null
      const after = current[field] ?? null
      const oldRank = before ? profiles[field][before] : undefined
      const newRank = after ? profiles[field][after] : undefined
      let change: IndicatorChange['change'] = 'Not comparable'
      if (compatible && oldRank && newRank && (oldRank[0] === newRank[0] || oldRank[1] === 0 || newRank[1] === 0)) {
        change = newRank[1] > oldRank[1] ? 'Worsened' : newRank[1] < oldRank[1] ? 'Improved' : 'Unchanged'
      }
      return { label, previous: before, current: after, change }
    }),
  }
}
export function withHistoryComparisons<T extends HistoryAssessment>(rows: readonly T[]) {
  const sorted = chronologicalHistory(rows)
  let previousDateRecord: T | null = null
  let last: T | null = null
  return sorted.map((row) => {
    if (last && last.assessment_date !== row.assessment_date) previousDateRecord = last
    const history_comparison = compareAssessment(row, previousDateRecord)
    last = row
    return { ...row, history_comparison }
  })
}
