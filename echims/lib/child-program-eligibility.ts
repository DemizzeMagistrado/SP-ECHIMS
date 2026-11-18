// Date-only calendar calculations; no patient status is changed by this module.
function dateParts(value: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return [y, m, d]
}
function daysInMonth(y: number, m: number) {
  return [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}
function dateString(y: number, m: number, d: number) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
export function manilaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now)
  const part = (name: string) => parts.find(p => p.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function childProgramEligibility(birthDate: string | null, registryStatus: string, asOf: string) {
  const today = dateParts(asOf)
  if (!today) throw new Error('Invalid evaluation date.')
  const birth = birthDate ? dateParts(birthDate) : null
  const base = {asOf, registryStatus, changesRegistryStatus: false, patientRecordRetained: true}
  if (!birth || !birthDate || birthDate > asOf || birth[0] > 9994) {
    return {...base, ageScope: 'NEEDS_REVIEW', archiveStatus: 'NEEDS_REVIEW', archivedEffectiveOn: null, underFive: null, underFiveEndsOn: null, programAction: 'VERIFY_DATE_OF_BIRTH'}
  }
  const [y, m, d] = birth
  // Calendar anniversary, clamped to month end for leap-day births.
  const endsOn = dateString(y + 5, m, Math.min(d, daysInMonth(y + 5, m)))
  const underFive = asOf < endsOn
  return {...base, ageScope: underFive ? 'UNDER_FIVE' : 'AGED_OUT', archiveStatus: underFive ? 'UNDER_FIVE' : 'ARCHIVED', archivedEffectiveOn: underFive ? null : endsOn, underFive, underFiveEndsOn: endsOn,
    programAction: underFive ? 'WITHIN_AGE_SCOPE' : 'ARCHIVED'}
}
