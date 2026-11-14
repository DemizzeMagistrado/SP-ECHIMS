// One color map for nutritional status, used by the Nutrition page, the child profile and the
// dashboard: normal / no flagged indicators = healthy green, underweight / MAM / needs verification
// = amber, stunted = violet, wasted / SAM / infant urgent review / any severe class = severe red,
// possible risk of overweight = risk violet, overweight / obese = blue, anything else = gray.
import type { StatusTone } from '@/components/ui/status-badge'

const code = (value: string | null | undefined) => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')

const TONE: Record<string, StatusTone> = {
  NORMAL: 'healthy', NOT_UNDERWEIGHT: 'healthy', NOT_STUNTED: 'healthy', HEALTHY: 'healthy', NO_ACUTE_CRITERIA_IDENTIFIED: 'healthy',
  NO_FLAGGED_INDICATORS: 'healthy', NO_LOW_MUAC: 'healthy',
  UNDERWEIGHT: 'warn', MAM: 'warn', MODERATE_ACUTE_MALNUTRITION: 'warn', AT_RISK: 'warn', NEEDS_VERIFICATION: 'warn', THIN: 'warn', THINNESS: 'warn',
  STUNTED: 'nutrition',
  WASTED: 'severe', WASTING: 'severe', SAM: 'severe', SEVERE_ACUTE_MALNUTRITION: 'severe', INFANT_URGENT_REVIEW: 'severe',
  POSSIBLE_RISK_OF_OVERWEIGHT: 'risk',
  OVERWEIGHT: 'info', OBESE: 'info', OBESITY: 'info',
}

/** Badge tone for a classification code (any case, spaces or dashes). Severe classes are red. */
export function nutritionTone(value: string | null | undefined): StatusTone {
  const c = code(value)
  if (c.startsWith('SEVERE')) return 'severe'
  return TONE[c] ?? 'neutral'
}

/** Solid color for charts (same tones as the badges). */
export const NUTRITION_TONE_COLOR: Record<StatusTone, string> = {
  good: 'var(--tone-good)', warn: 'var(--tone-warn)', danger: 'var(--tone-danger)',
  nutrition: 'var(--tone-nutrition)', info: 'var(--brand-blue)', neutral: '#94A3B8',
  severe: 'var(--tone-severe)', risk: 'var(--tone-risk)', healthy: 'var(--tone-healthy)',
}

/** Child profile opened at the Nutrition history section (lands like the NIP links). */
export function nutritionProfileHref(childId: number) {
  return `/child-profiling/children/${childId}#nutrition-history`
}

const LABELS: Record<string, string> = {
  SAM: 'SAM',
  MAM: 'MAM',
  NO_FLAGGED_INDICATORS: 'No flagged indicators',
  NOT_UNDERWEIGHT: 'Not underweight',
  NOT_STUNTED: 'Not stunted',
  NOT_INTERPRETABLE_EDEMA: 'Not interpretable — edema',
  INFANT_URGENT_REVIEW: 'Infant urgent review',
  NOT_EVALUATED: 'Not evaluated',
  NEEDS_VERIFICATION: 'Needs verification',
  NORMAL: 'Normal',
  NO_LOW_MUAC: 'No low MUAC',
  AT_RISK: 'At risk',
  NOT_APPLICABLE: 'Not applicable',
}

/** Display text for a classification code ("SEVERE_LOW_MUAC" → "Severe low MUAC"); "Not recorded" when empty. */
export function nutritionLabel(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  return LABELS[value] ?? value.toLowerCase().replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase()).replace(/\bmuac\b/gi, 'MUAC')
}

/** Flagged classification values in tables: severe / SAM in severe red, possible risk of overweight in violet. */
export function nutritionFlagClass(code: string | null | undefined) {
  const c = String(code ?? '').toUpperCase()
  if (c.startsWith('SEVERE') || c === 'SAM' || c === 'INFANT_URGENT_REVIEW') return 'font-semibold text-severe'
  if (c === 'POSSIBLE_RISK_OF_OVERWEIGHT') return 'font-semibold text-risk'
  return ''
}

/** Proposed MUAC plausibility bounds for 6–59 months (supabase/proposals/nut_rev01_02). Until the
 *  database check is approved and applied, the app only warns with these. Keep in sync with NUT-R012. */
export const MUAC_PLAUSIBLE_CM = { min: 7, max: 22 } as const
export const muacImplausible = (muac: number | string | null | undefined, ageDays: number | null | undefined) =>
  muac != null && muac !== '' && (ageDays == null || ageDays >= 182) && (Number(muac) < MUAC_PLAUSIBLE_CM.min || Number(muac) > MUAC_PLAUSIBLE_CM.max)
