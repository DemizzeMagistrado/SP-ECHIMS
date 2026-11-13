// One color map for nutritional status, used by the Nutrition page, the child profile and the
// dashboard: normal = green, underweight / MAM / needs verification = amber, stunted = violet,
// wasted / SAM / any severe class = red, overweight / obese = blue, anything else = gray.
import type { StatusTone } from '@/components/ui/status-badge'

const code = (value: string | null | undefined) => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')

const TONE: Record<string, StatusTone> = {
  NORMAL: 'good', NOT_UNDERWEIGHT: 'good', NOT_STUNTED: 'good', HEALTHY: 'good', NO_ACUTE_CRITERIA_IDENTIFIED: 'good',
  UNDERWEIGHT: 'warn', MAM: 'warn', MODERATE_ACUTE_MALNUTRITION: 'warn', AT_RISK: 'warn', NEEDS_VERIFICATION: 'warn', THIN: 'warn', THINNESS: 'warn',
  STUNTED: 'nutrition',
  WASTED: 'danger', WASTING: 'danger', SAM: 'danger', SEVERE_ACUTE_MALNUTRITION: 'danger', INFANT_URGENT_REVIEW: 'danger',
  OVERWEIGHT: 'info', OBESE: 'info', OBESITY: 'info', POSSIBLE_RISK_OF_OVERWEIGHT: 'info',
}

/** Badge tone for a classification code (any case, spaces or dashes). Severe classes are red. */
export function nutritionTone(value: string | null | undefined): StatusTone {
  const c = code(value)
  if (c.startsWith('SEVERE')) return 'danger'
  return TONE[c] ?? 'neutral'
}

/** Solid color for charts (same tones as the badges). */
export const NUTRITION_TONE_COLOR: Record<StatusTone, string> = {
  good: 'var(--tone-good)', warn: 'var(--tone-warn)', danger: 'var(--tone-danger)',
  nutrition: 'var(--tone-nutrition)', info: 'var(--brand-blue)', neutral: '#94A3B8',
}
