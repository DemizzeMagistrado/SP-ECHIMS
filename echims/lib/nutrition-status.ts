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
