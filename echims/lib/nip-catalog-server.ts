// The NIP schedule rules as the server should use them: the code defaults (lib/nip-schedule)
// with the values Admin edits in Vaccination › Vaccines (vaccine.min_age_days, interval_days,
// total_doses, max_age_days, min_interval_days). Dose timing by calendar month (IPV dose 2, MMR)
// stays in code. If the table can't be read, the code defaults are used.

import { NIP_CATALOG, normalizeVaccineCode, type NipVaccine } from './nip-schedule'

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = { vaccine_type: string | null; min_age_days: number | null; interval_days: number | null; total_doses: number | null; max_age_days?: number | null; min_interval_days?: number | null }

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined)

export function mergeNipCatalog(rows: Row[], withEligibility: boolean): NipVaccine[] {
  return NIP_CATALOG.map((v) => {
    const r = rows.find((x) => x.vaccine_type && normalizeVaccineCode(x.vaccine_type) === v.code)
    if (!r) return v
    const out: NipVaccine = { ...v }
    out.min_age_days = int(r.min_age_days) ?? v.min_age_days
    if (r.interval_days === null || int(r.interval_days) !== undefined) out.interval_days = r.interval_days
    const doses = int(r.total_doses)
    if (doses && doses > 0) out.total_doses = doses
    if (withEligibility) {
      // The stored window is authoritative once the columns exist (NULL = no age limit).
      out.max_age_days = int(r.max_age_days)
      out.max_age_months = undefined
      out.min_interval_days = int(r.min_interval_days) ?? undefined
    }
    return out
  })
}

export async function loadNipCatalog(db: Db): Promise<NipVaccine[]> {
  const full = await db.from('vaccine').select('vaccine_type, min_age_days, interval_days, total_doses, max_age_days, min_interval_days')
  if (!full.error) return mergeNipCatalog(full.data ?? [], true)
  // Before migration 06 the eligibility columns don't exist: keep the code windows.
  const base = await db.from('vaccine').select('vaccine_type, min_age_days, interval_days, total_doses')
  if (base.error) { console.warn('NIP catalog: using code defaults.', base.error); return NIP_CATALOG }
  return mergeNipCatalog(base.data ?? [], false)
}
