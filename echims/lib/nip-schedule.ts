export type NipVaccine = {
  code: string
  vaccine_type: string
  total_doses: number
  min_age_days: number
  interval_days: number | null
  dose_age_months?: number[]
  /** Not given after this age (in months): the dose becomes "Not eligible", not "Missed". */
  max_age_months?: number
  routine_enabled?: boolean
  /** Shortest gap after the previous dose when a missed dose is rescheduled (default interval_days, else 28). */
  min_interval_days?: number
  route: string
  dose_volume: string
}

// Existing application setting, not a clinical allowance to delay doses.
export const GRACE_PERIOD_DAYS = 30

export const NIP_CATALOG: NipVaccine[] = [
  {
    code: 'BCG',
    vaccine_type: 'BCG',
    total_doses: 1,
    min_age_days: 0,
    interval_days: null,
    // DOH NIP: BCG is given up to the first birthday.
    max_age_months: 12,
    route: 'Intradermal',
    dose_volume: '0.05 mL',
  },
  {
    code: 'HEPB',
    vaccine_type: 'Hep-B',
    total_doses: 1,
    min_age_days: 0,
    interval_days: null,
    route: 'Intramuscular',
    dose_volume: '0.5 mL',
  },
  {
    code: 'PENTA',
    vaccine_type: 'Pentavalent',
    total_doses: 3,
    min_age_days: 42,
    interval_days: 28,
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
    min_age_days: 98,
    interval_days: null,
    // Dose 1 uses 98 days; dose 2 uses nine calendar months.
    dose_age_months: [-1, 9],
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
    // Keep recognition of existing records.
    // Exclude from routine scheduling pending local programme verification.
    routine_enabled: false,
    route: 'Oral',
    dose_volume: '1.5 mL',
  },
  {
    code: 'MMR',
    vaccine_type: 'MMR',
    total_doses: 2,
    min_age_days: 0,
    interval_days: null,
    dose_age_months: [9, 12],
    min_interval_days: 28,
    route: 'Subcutaneous',
    dose_volume: '0.5 mL',
  },
  {
    code: 'MR',
    vaccine_type: 'MR',
    total_doses: 1,
    min_age_days: 270,
    interval_days: null,
    // Campaign / supplemental dose: recordable, not part of the routine card schedule.
    routine_enabled: false,
    route: 'Subcutaneous',
    dose_volume: '0.5 mL',
  },
]

export type ScheduleEntry = {
  vaccine_code: string
  vaccine_type: string
  dose_number: number
  recommended_date: string
  route: string
  dose_volume: string
}

// Accept either stored codes or familiar display names.
export function normalizeVaccineCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[\s_-]+/g, '')

  const aliases: Record<string, string> = {
    BCG: 'BCG',
    HEPB: 'HEPB',
    HEPATITISB: 'HEPB',
    PENTA: 'PENTA',
    PENTAVALENT: 'PENTA',
    OPV: 'OPV',
    ORALPOLIO: 'OPV',
    ORALPOLIOVACCINE: 'OPV',
    IPV: 'IPV',
    INACTIVATEDPOLIO: 'IPV',
    INACTIVATEDPOLIOVACCINE: 'IPV',
    PCV13: 'PCV13',
    PCV: 'PCV13',
    ROTA: 'ROTA',
    ROTAVIRUS: 'ROTA',
    MMR: 'MMR',
    MR: 'MR',
    MEASLESRUBELLA: 'MR',
  }

  return aliases[normalized] ?? normalized
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T00:00:00.000Z`)

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null
  }

  return date
}

function addCalendarMonths(birth: Date, months: number): Date {
  const target = new Date(birth)
  const originalDay = birth.getUTCDate()

  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + months)

  const lastDay = new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate()

  target.setUTCDate(Math.min(originalDay, lastDay))

  return target
}

export function getNipDoseDate(
  dateOfBirth: string,
  vaccine: NipVaccine,
  doseNumber: number,
): string | null {
  const birth = parseDate(dateOfBirth)

  if (
    !birth ||
    !Number.isInteger(doseNumber) ||
    doseNumber < 1 ||
    doseNumber > vaccine.total_doses
  ) {
    return null
  }

  const months = vaccine.dose_age_months?.[doseNumber - 1]
  let recommended: Date

  if (months !== undefined && months >= 0) {
    recommended = addCalendarMonths(birth, months)
  } else {
    recommended = new Date(birth)
    const offset =
      vaccine.min_age_days +
      (doseNumber - 1) * (vaccine.interval_days ?? 0)

    recommended.setUTCDate(recommended.getUTCDate() + offset)
  }

  // Every due date is counted forward from the date of birth; never earlier.
  if (recommended.getTime() < birth.getTime()) return null
  return recommended.toISOString().slice(0, 10)
}

export type NipDoseStatus = 'COMPLETE' | 'UPCOMING' | 'OVERDUE' | 'NOT_ELIGIBLE'

/**
 * One dose's status, the same everywhere (profile, schedule tab, defaulters):
 * given → COMPLETE; due today or later → UPCOMING (Pending); past due and not given →
 * OVERDUE (Missed); past the vaccine's age limit and not given → NOT_ELIGIBLE.
 */
export function nipDoseStatus(dateOfBirth: string, vaccine: NipVaccine, dueDate: string, given: boolean, today: string): NipDoseStatus {
  if (given) return 'COMPLETE'
  if (vaccine.max_age_months !== undefined) {
    const birth = parseDate(dateOfBirth)
    if (birth && today >= addCalendarMonths(birth, vaccine.max_age_months).toISOString().slice(0, 10)) return 'NOT_ELIGIBLE'
  }
  return dueDate >= today ? 'UPCOMING' : 'OVERDUE'
}

export function computeSchedule(dateOfBirth: string): ScheduleEntry[] {
  const entries: ScheduleEntry[] = []

  for (const vaccine of NIP_CATALOG) {
    if (vaccine.routine_enabled === false) continue

    for (let dose = 1; dose <= vaccine.total_doses; dose++) {
      const date = getNipDoseDate(dateOfBirth, vaccine, dose)
      if (!date) continue

      entries.push({
        vaccine_code: vaccine.code,
        vaccine_type: vaccine.vaccine_type,
        dose_number: dose,
        recommended_date: date,
        route: vaccine.route,
        dose_volume: vaccine.dose_volume,
      })
    }
  }

  return entries.sort(
    (a, b) => a.recommended_date.localeCompare(b.recommended_date),
  )
}

export function excludeGivenDoses(
  entries: ScheduleEntry[],
  given: { vaccine_type: string; dose_number: number }[],
): ScheduleEntry[] {
  const givenKeys = new Set(
    given.map(
      (record) =>
        `${normalizeVaccineCode(record.vaccine_type)}:${record.dose_number}`,
    ),
  )

  return entries.filter(
    (entry) =>
      !givenKeys.has(
        `${normalizeVaccineCode(entry.vaccine_code)}:${entry.dose_number}`,
      ),
  )
}

export function manilaTodayYMD(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}`
}

export function nipDaysBetween(from: string, to: string): number {
  const start = parseDate(from)
  const end = parseDate(to)

  if (!start || !end) return NaN

  return Math.round((end.getTime() - start.getTime()) / 86400000)
} 
function addDays(ymd: string, days: number): string {
  const d = parseDate(ymd)!
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type NipTimelineDose = {
  dose_number: number
  due_date: string
  status: NipDoseStatus
  /** Set when the dose moves: a missed dose's next valid date (today or later), or a pending dose
   *  pushed back because the dose before it was given or rescheduled late. */
  rescheduled_date: string | null
}

/**
 * Every dose of one vaccine for one child. A missed dose is rescheduled to the earliest valid
 * date: not before today, its own due date, or the previous dose (given or rescheduled) plus the
 * minimum interval. Past the vaccine's age limit the dose is NOT_ELIGIBLE instead.
 * givenDates[i] is the date dose i+1 was given, or null.
 */
export function nipVaccineTimeline(dateOfBirth: string, vaccine: NipVaccine, givenDates: (string | null | undefined)[], today: string): NipTimelineDose[] {
  const birth = parseDate(dateOfBirth)
  const cutoff = birth && vaccine.max_age_months !== undefined ? addCalendarMonths(birth, vaccine.max_age_months).toISOString().slice(0, 10) : null
  const gap = vaccine.min_interval_days ?? vaccine.interval_days ?? 28
  const out: NipTimelineDose[] = []
  let previous: string | null = null
  for (let n = 1; n <= vaccine.total_doses; n++) {
    const due = getNipDoseDate(dateOfBirth, vaccine, n)
    if (!due) continue
    const given = givenDates[n - 1] ?? null
    let status = nipDoseStatus(dateOfBirth, vaccine, due, Boolean(given), today)
    let rescheduled: string | null = null
    const earliest: string | null = previous ? addDays(previous, gap) : null
    // Missed: move to today or later. Pending but too close to a moved earlier dose: move too.
    if (status === 'OVERDUE') rescheduled = earliest && earliest > today ? earliest : today
    else if (status === 'UPCOMING' && earliest && earliest > due) rescheduled = earliest
    if (rescheduled && cutoff && rescheduled >= cutoff) { status = 'NOT_ELIGIBLE'; rescheduled = null }
    out.push({ dose_number: n, due_date: due, status, rescheduled_date: rescheduled })
    previous = given ?? rescheduled ?? (status === 'UPCOMING' ? due : previous)
  }
  return out
}

/** Next date a dose of this vaccine can be given (the dose the child should get next), or null. */
export function nipNextDose(timeline: NipTimelineDose[]): (NipTimelineDose & { date: string }) | null {
  const d = timeline.find((x) => x.status === 'OVERDUE' || x.status === 'UPCOMING')
  return d ? { ...d, date: d.rescheduled_date ?? d.due_date } : null
}
