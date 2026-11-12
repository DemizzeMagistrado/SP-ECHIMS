// One place for the vaccination form rules that RHU staff may ask to adjust.
// The batch number format is stored in the database (vaccination_setting 'batch_number_format',
// edited in Vaccination › Vaccines (Catalog settings)); DEFAULT_BATCH_RULE is used until it loads or if it is
// missing. The database keeps batch numbers in the normalized form (echims_normalize_batch).

export const VACCINATION_SITES = [
  'Left deltoid',
  'Right deltoid',
  'Left thigh (vastus lateralis)',
  'Right thigh (vastus lateralis)',
  'Right upper arm (BCG)',
  'Oral',
] as const

/** Letters/digits in groups joined by one of `separators`, `min`–`max` characters long. */
export type BatchRule = { min: number; max: number; separators: string; example: string }
export const DEFAULT_BATCH_RULE: BatchRule = { min: 2, max: 30, separators: '-', example: 'BT-2026-0012' }
export const BATCH_SEPARATOR_CHOICES = ['-', '/', '.'] as const
/** Kept for callers that only need the default example. */
export const BATCH_NUMBER_EXAMPLE = DEFAULT_BATCH_RULE.example

const escape = (c: string) => c.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
export function batchPattern(rule: BatchRule): RegExp {
  const sep = rule.separators ? `(?:[${[...rule.separators].map(escape).join('')}][A-Z0-9]+)*` : ''
  return new RegExp(`^(?=.{${rule.min},${rule.max}}$)[A-Z0-9]+${sep}$`)
}

/** A stored rule is used only when it is sane; otherwise the default applies. */
export function parseBatchRule(value: unknown): BatchRule {
  const v = value as Partial<BatchRule> | null
  const min = Number(v?.min), max = Number(v?.max)
  const separators = typeof v?.separators === 'string' ? [...new Set(v.separators)].filter((c) => (BATCH_SEPARATOR_CHOICES as readonly string[]).includes(c)).join('') : null
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 60 || min > max || separators === null) return DEFAULT_BATCH_RULE
  const example = typeof v?.example === 'string' && v.example.trim() ? v.example.trim().toUpperCase() : DEFAULT_BATCH_RULE.example
  return { min, max, separators, example }
}

/** Trim, uppercase, spaces to single hyphens. Same rule as SQL echims_normalize_batch. */
export function normalizeBatchNumber(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-')
  return v || null
}

export function describeBatchRule(rule: BatchRule): string {
  const seps = [...rule.separators].map((c) => (c === '-' ? 'dashes' : c === '/' ? 'slashes' : 'dots'))
  return `Letters and numbers${seps.length ? ` joined by ${seps.join(' or ')}` : ' only'}, e.g. ${rule.example} (${rule.min}–${rule.max} characters).`
}

/** Error text for the field, or null when valid (empty is valid: batch is optional). */
export function batchNumberError(value: string | null | undefined, rule: BatchRule = DEFAULT_BATCH_RULE): string | null {
  const v = normalizeBatchNumber(value)
  if (!v) return null
  return batchPattern(rule).test(v) ? null : `Use ${describeBatchRule(rule).replace(/^L/, 'l')}`
}

export function isVaccinationSite(value: string | null | undefined): boolean {
  return value == null || (VACCINATION_SITES as readonly string[]).includes(value)
}
