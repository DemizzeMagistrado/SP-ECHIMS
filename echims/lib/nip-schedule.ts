export type NipVaccine = {
  code: string
  vaccine_type: string
  total_doses: number
  min_age_days: number
  interval_days: number | null
  dose_age_months?: number[]
  routine_enabled?: boolean
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
    route: 'Intradermal',
    dose_volume: '0.05 mL',
  },
  {
    code: 'HEPB',
    vaccine_type: 'Hepatitis B',
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

  return recommended.toISOString().slice(0, 10)
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