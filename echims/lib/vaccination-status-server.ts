// One way to decide which NIP doses are Missed, used by the dashboard (summary + widgets) so its
// numbers match Vaccination › Schedule and the child profile: approved doses, the editable
// catalog rules (eligibility windows included) and lib/nip-schedule's timeline. Not eligible
// doses are never counted as missed.

import { loadNipCatalog } from './nip-catalog-server'
import { manilaTodayYMD, nipDaysBetween, nipVaccineTimeline, normalizeVaccineCode, type NipVaccine } from './nip-schedule'

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
type Given = Map<string, Map<number, string>> // vaccine code → dose → date given

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/** Approved doses per child: child_id → vaccine code → dose number → date given. */
export async function approvedDoses(db: Db, childIds: number[]): Promise<Map<number, Given>> {
  const out = new Map<number, Given>()
  for (let i = 0; i < childIds.length; i += 300) {
    const { data, error } = await db.from('vaccination_record')
      .select('child_id, dose_number, vaccination_date, vaccine:vaccine(vaccine_type)')
      .eq('status', 'APPROVED')
      .in('child_id', childIds.slice(i, i + 300))
    if (error) throw error
    for (const r of (data ?? []) as { child_id: number; dose_number: number; vaccination_date: string; vaccine: unknown }[]) {
      const vt = one(r.vaccine as { vaccine_type?: string } | null)?.vaccine_type
      if (!vt) continue
      const code = normalizeVaccineCode(vt)
      const perChild = out.get(r.child_id) ?? new Map<string, Map<number, string>>()
      const doses = perChild.get(code) ?? new Map<number, string>()
      doses.set(Number(r.dose_number), String(r.vaccination_date))
      perChild.set(code, doses)
      out.set(r.child_id, perChild)
    }
  }
  return out
}

/** Missed doses of one child (routine vaccines), each with how many days past its due date. */
export function missedDoses(dob: string, given: Given | undefined, catalog: NipVaccine[], today: string) {
  const out: { code: string; dose: number; daysPast: number }[] = []
  for (const v of catalog) {
    if (v.routine_enabled === false) continue
    const g = given?.get(v.code)
    for (const t of nipVaccineTimeline(dob, v, Array.from({ length: v.total_doses }, (_, i) => g?.get(i + 1) ?? null), today)) {
      if (t.status === 'OVERDUE') out.push({ code: v.code, dose: t.dose_number, daysPast: nipDaysBetween(t.due_date, today) })
    }
  }
  return out
}

/** Missed doses for children in scope (null = all the caller can see under RLS). */
export async function missedDoseCount(db: Db, barangayIds: number[] | null, today = manilaTodayYMD()): Promise<number> {
  let q = db.from('child').select('child_id, date_of_birth').in('status', ['ACTIVE', 'MONITORING'])
  if (barangayIds !== null) q = q.in('barangay_id', barangayIds.length ? barangayIds : [-1])
  const { data, error } = await q
  if (error) throw error
  const children = (data ?? []) as { child_id: number; date_of_birth: string | null }[]
  const [catalog, given] = await Promise.all([loadNipCatalog(db), approvedDoses(db, children.map((c) => c.child_id))])
  return children.reduce((n, c) => n + (c.date_of_birth ? missedDoses(c.date_of_birth, given.get(c.child_id), catalog, today).length : 0), 0)
}
