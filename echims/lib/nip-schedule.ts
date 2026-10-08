export type NipVaccine = {
  code: string
  vaccine_type: string // display name — also matches vaccine.vaccine_type when seeded
  total_doses: number
  min_age_days: number // age at which dose 1 should be given
  interval_days: number | null // days between consecutive doses (null for single-dose)
  route: string
  dose_volume: string
}

// Grace period in days after a dose's due date before it's considered OVERDUE.
// Used by /api/vaccination/history (NIP-USR004) and /api/vaccination/defaulters (NIP-USR005).
// Centralized here so both routes stay in sync. Future ticket may move this to a DB setting.
export const GRACE_PERIOD_DAYS = 30

export const NIP_CATALOG: NipVaccine[] = [
  {
    code: 'BCG',
    vaccine_type: 'BCG',
    total_doses: 1,
    min_age_days: 0, // at birth
    interval_days: null,
    route: 'Intradermal',
    dose_volume: '0.05 mL',
  },
  {
    code: 'HEPB',
    vaccine_type: 'Hepatitis B',
    total_doses: 1,
    min_age_days: 0, // at birth (within 24 hours)
    interval_days: null,
    route: 'Intramuscular',
    dose_volume: '0.5 mL',
  },
  {
    code: 'PENTA',
    vaccine_type: 'Pentavalent',
    total_doses: 3,
    min_age_days: 42, // 6 weeks
    interval_days: 28, // then at 10 and 14 weeks (4-week intervals)
    route: 'Intramuscular',
    dose_volume: '0.5 mL',
  },
  {
    code: 'OPV',
    vaccine_type: 'OPV',
    total_doses: 3,
    min_age_days: 42,
    interval_days: 28,
    route: 'Oral',
    dose_volume: '2 drops',
  },
  {
    code: 'IPV',
    vaccine_type: 'IPV',
    total_doses: 2,
    min_age_days: 98, // 14 weeks
    interval_days: 196, // dose 2 at ~9 months
    route: 'Intramuscular',
    dose_volume: '0.5 mL',
  },
  {
    code: 'PCV13',
    vaccine_type: 'PCV13',
    total_doses: 3,
    min_age_days: 42,
    interval_days: 28,
    route: 'Intramuscular',
    dose_volume: '0.5 mL',
  },
  {
    code: 'ROTA',
    vaccine_type: 'Rotavirus',
    total_doses: 2,
    min_age_days: 42,
    interval_days: 28,
    route: 'Oral',
    dose_volume: '1.5 mL',
  },
  {
    code: 'MMR',
    vaccine_type: 'MMR',
    total_doses: 2,
    min_age_days: 270, // 9 months
    interval_days: 90, // dose 2 at ~12 months
    route: 'Intramuscular',
    dose_volume: '0.5 mL',
  },
]

export type ScheduleEntry = {
  vaccine_code: string
  vaccine_type: string
  dose_number: number
  recommended_date: string // ISO yyyy-mm-dd
  route: string
  dose_volume: string
}

// Compute the full recommended schedule for a child given their DOB.
// Returns entries sorted by recommended_date so the UI shows them chronologically.
export function computeSchedule(dateOfBirth: string): ScheduleEntry[] {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`)
  if (isNaN(birth.getTime())) return []
  const entries: ScheduleEntry[] = []
  for (const vaccine of NIP_CATALOG) {
    for (let dose = 1; dose <= vaccine.total_doses; dose++) {
      const offsetDays = vaccine.min_age_days + (dose - 1) * (vaccine.interval_days ?? 0)
      const recommended = new Date(birth)
      recommended.setUTCDate(recommended.getUTCDate() + offsetDays)
      entries.push({
        vaccine_code: vaccine.code,
        vaccine_type: vaccine.vaccine_type,
        dose_number: dose,
        recommended_date: recommended.toISOString().slice(0, 10),
        route: vaccine.route,
        dose_volume: vaccine.dose_volume,
      })
    }
  }
  entries.sort((a, b) => a.recommended_date.localeCompare(b.recommended_date))
  return entries
}

// A dose is considered "already given" if the vaccination_record has a row for the
// same vaccine_type and dose_number for that child, regardless of its scheduled date.
export function excludeGivenDoses(
  entries: ScheduleEntry[],
  given: { vaccine_type: string; dose_number: number }[],
): ScheduleEntry[] {
  const givenKeys = new Set(given.map((g) => `${g.vaccine_type}:${g.dose_number}`))
  return entries.filter((e) => !givenKeys.has(`${e.vaccine_type}:${e.dose_number}`))
}