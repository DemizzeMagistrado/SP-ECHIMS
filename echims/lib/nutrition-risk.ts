import { withHistoryComparisons, type HistoryAssessment, type IndicatorChange } from './nutrition-history'
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type MonitoringRule = { rule_name: string; severity: RiskSeverity }
export type RiskRecord = {
  child_id: number; child_name: string; barangay_id: number; barangay_name: string
  assessment_id: number; assessment_date: string; severity: RiskSeverity
  classifications: { field: string; label: string; code: string }[]
  worsening: IndicatorChange[]; previous_assessment_id: number | null; previous_date: string | null
}
export type RiskMonitoring = { records: RiskRecord[]; counts: { at_risk: number; critical: number; high: number; worsened: number; needs_review: number; assessed_children: number } }
const severityRank: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
function relation(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' ? row as Record<string, unknown> : null
}
const rulesForCode: Record<string, string> = {
  UNDERWEIGHT: 'NUT_UNDERWEIGHT', SEVERELY_UNDERWEIGHT: 'NUT_SEVERELY_UNDERWEIGHT',
  STUNTED: 'NUT_STUNTED', SEVERELY_STUNTED: 'NUT_SEVERELY_STUNTED',
  SAM: 'NUT_SAM_SCREENING', MAM: 'NUT_MAM_SCREENING', INFANT_URGENT_REVIEW: 'NUT_INFANT_URGENT_REVIEW',
  OVERWEIGHT: 'NUT_OVERWEIGHT', OBESE: 'NUT_OBESITY', OBESITY: 'NUT_OBESITY',
}
const riskCodes = new Set([...Object.keys(rulesForCode), 'WASTED', 'WASTING', 'SEVERELY_WASTED', 'SEVERE_WASTING', 'THINNESS', 'SEVERE_THINNESS', 'POSSIBLE_RISK_OF_OVERWEIGHT'])
const fields = [['weight_for_age', 'Weight-for-age'], ['height_for_age', 'Height-for-age'], ['weight_for_height', 'Weight-for-length/height'], ['bmi_for_age', 'BMI-for-age'], ['nutritional_status', 'Screening'], ['muac_status', 'MUAC']] as const
export function buildRiskMonitoring(assessments: Record<string, unknown>[], rules: MonitoringRule[]): RiskMonitoring {
  const configured = new Map(rules.map((rule) => [rule.rule_name, rule.severity]))
  const groups = new Map<number, (HistoryAssessment & { raw: Record<string, unknown> })[]>()
  for (const raw of assessments) {
    const childId = Number(raw.child_id)
    const child = relation(raw.child)
    if (!child || child.status !== 'ACTIVE' || !Number.isSafeInteger(childId) || childId <= 0
      || !Number.isSafeInteger(Number(raw.assessment_id)) || typeof raw.assessment_date !== 'string') continue
    const row = { ...raw, assessment_id: Number(raw.assessment_id), assessment_date: raw.assessment_date, raw } as HistoryAssessment & { raw: Record<string, unknown> }
    const group = groups.get(childId) ?? []
    group.push(row); groups.set(childId, group)
  }
  const records: RiskRecord[] = []
  let needsReview = 0
  for (const [childId, rows] of groups) {
    const ordered = withHistoryComparisons(rows)
    const latest = ordered[ordered.length - 1]
    const raw = latest.raw
    if (raw.is_at_risk !== true) {
      if (raw.is_at_risk !== false || raw.evaluation_status !== 'EVALUATED') needsReview++
      continue
    }
    const child = relation(raw.child)!
    const barangay = relation(child.barangay)
    const classifications = fields.flatMap(([field, label]) => typeof raw[field] === 'string' && riskCodes.has(raw[field] as string) ? [{ field, label, code: raw[field] as string }] : [])
    let severity: RiskSeverity = 'MEDIUM'
    for (const item of classifications) {
      const candidate = configured.get(rulesForCode[item.code])
      if (candidate && severityRank[candidate] > severityRank[severity]) severity = candidate
    }
    const worsening = latest.history_comparison.changes.filter((change) => change.change === 'Worsened')
    const worseningSeverity = configured.get('NUT_STATUS_WORSENED')
    if (worsening.length && worseningSeverity && severityRank[worseningSeverity] > severityRank[severity]) severity = worseningSeverity
    records.push({ child_id: childId, child_name: [child.last_name, [child.first_name, child.middle_name].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      barangay_id: Number(child.barangay_id), barangay_name: typeof barangay?.barangay_name === 'string' ? barangay.barangay_name : 'Barangay unavailable',
      assessment_id: latest.assessment_id, assessment_date: latest.assessment_date, severity, classifications, worsening,
      previous_assessment_id: latest.history_comparison.previous_assessment_id, previous_date: latest.history_comparison.previous_date })
  }
  records.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.assessment_date.localeCompare(a.assessment_date) || a.child_name.localeCompare(b.child_name))
  return { records, counts: { at_risk: records.length, critical: records.filter((row) => row.severity === 'CRITICAL').length,
    high: records.filter((row) => row.severity === 'HIGH').length, worsened: records.filter((row) => row.worsening.length).length,
    needs_review: needsReview, assessed_children: groups.size } }
}
