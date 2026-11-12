// One place for the vaccination form rules that RHU staff may ask to adjust.
// The database keeps batch numbers in the normalized form (see echims_normalize_batch);
// the pattern below is checked by the APIs and the forms.

export const VACCINATION_SITES = [
  'Left deltoid',
  'Right deltoid',
  'Left thigh (vastus lateralis)',
  'Right thigh (vastus lateralis)',
  'Right upper arm (BCG)',
  'Oral',
] as const

/** Letters/digits in groups joined by single hyphens, 2–30 characters, e.g. BT-2026-0012. */
export const BATCH_NUMBER_PATTERN = /^(?=.{2,30}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/
export const BATCH_NUMBER_EXAMPLE = 'BT-2026-0012'

/** Trim, uppercase, spaces to single hyphens. Same rule as SQL echims_normalize_batch. */
export function normalizeBatchNumber(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-')
  return v || null
}

/** Error text for the field, or null when valid (empty is valid: batch is optional). */
export function batchNumberError(value: string | null | undefined): string | null {
  const v = normalizeBatchNumber(value)
  if (!v) return null
  return BATCH_NUMBER_PATTERN.test(v) ? null : `Use letters and numbers joined by single dashes, e.g. ${BATCH_NUMBER_EXAMPLE} (2–30 characters).`
}

export function isVaccinationSite(value: string | null | undefined): boolean {
  return value == null || (VACCINATION_SITES as readonly string[]).includes(value)
}
