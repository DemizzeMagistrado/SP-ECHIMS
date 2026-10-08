import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { NIP_CATALOG, GRACE_PERIOD_DAYS } from '@/lib/nip-schedule'

// NIP-USR004 — Immunization history for a single child.
// GET /api/vaccination/history?child_id=123
//
// Returns:
//   - approved_records: APPROVED vaccination_record rows (vaccine joined), newest first
//   - vaccine_status: per-vaccine computed status matrix — each dose marked COMPLETE / DUE /
//     OVERDUE / UPCOMING against the NIP schedule and the child's age
//   - next_due: the earliest OVERDUE or DUE dose, or null when caught up
//
// RLS on vaccination_record already scopes rows to the viewer's RHU/barangay.
// Role gating: anyone who can view Child Profiling can see the history (BNS included).

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator',
  'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any): Promise<UserRole | undefined> {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle()
  return roleAliases[String(data?.role ?? '').trim().toLowerCase()]
}

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

type DoseStatus = 'COMPLETE' | 'DUE' | 'OVERDUE' | 'UPCOMING'

type DoseRow = {
  dose_number: number
  status: DoseStatus
  due_date: string              // yyyy-mm-dd
  given_date: string | null     // yyyy-mm-dd when COMPLETE
  batch_number: string | null
  vaccination_site: string | null
  vaccination_record_id: number | null
}

type VaccineStatusRow = {
  code: string
  vaccine_type: string          // display name
  route: string
  dose_volume: string
  total_doses: number
  doses: DoseRow[]
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Grace period lives in lib/nip-schedule.ts (GRACE_PERIOD_DAYS) so NIP-USR004 and
// NIP-USR005 both read the same value. Change it there, both endpoints update.

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in to view immunization history.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Child Profiling', 'view')) {
    return invalid('You are not authorized to view immunization history.', 403)
  }

  const url = new URL(request.url)
  const childIdRaw = url.searchParams.get('child_id')
  const childId = Number(childIdRaw)
  if (!Number.isSafeInteger(childId) || childId <= 0) {
    return invalid('A valid child_id is required.')
  }

  // Confirm child exists + is in scope (RLS filters it)
  const childRes = await supabase.from('child')
    .select('child_id, first_name, middle_name, last_name, date_of_birth, barangay_id')
    .eq('child_id', childId)
    .maybeSingle()
  if (childRes.error || !childRes.data) {
    return invalid('Child not found or outside your scope.', 404)
  }
  const dob = String(childRes.data.date_of_birth)

  // Pull APPROVED vaccination records joined with vaccine details
  const recRes = await supabase.from('vaccination_record')
    .select(`
      vaccination_record_id, vaccination_date, dose_number, batch_number,
      vaccination_site, remarks, created_at,
      vaccine:vaccine(vaccine_id, vaccine_type, dose_volume, route, target_age,
        item:item(item_id, item_name))
    `)
    .eq('child_id', childId)
    .eq('status', 'APPROVED')
    .order('vaccination_date', { ascending: false })

  if (recRes.error) return invalid(`Unable to load history. ${recRes.error.message ?? ''}`.trim(), 500)
  const approvedRecords = recRes.data ?? []

  // Compute per-vaccine, per-dose status against the NIP schedule
  const today = todayYMD()
  const vaccineStatus: VaccineStatusRow[] = NIP_CATALOG.map((v) => {
    const doses: DoseRow[] = []
    for (let n = 1; n <= v.total_doses; n++) {
      // Due date for this dose
      const offsetDays = v.min_age_days + (v.interval_days ? (n - 1) * v.interval_days : 0)
      const dueDate = addDays(dob, offsetDays)

      // Match an APPROVED record by vaccine_type + dose_number
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = approvedRecords.find((r: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vacc: any = Array.isArray(r.vaccine) ? r.vaccine[0] : r.vaccine
        return vacc?.vaccine_type === v.code && r.dose_number === n
      })

      let status: DoseStatus
      if (match) status = 'COMPLETE'
      else if (dueDate > today) status = 'UPCOMING'
      else {
        const daysPastDue = Math.floor((new Date(today + 'T00:00:00').getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000)
        status = daysPastDue <= GRACE_PERIOD_DAYS ? 'DUE' : 'OVERDUE'
      }

      doses.push({
        dose_number: n,
        status,
        due_date: dueDate,
        given_date: match ? String(match.vaccination_date) : null,
        batch_number: match?.batch_number ?? null,
        vaccination_site: match?.vaccination_site ?? null,
        vaccination_record_id: match?.vaccination_record_id ?? null,
      })
    }
    return {
      code: v.code,
      vaccine_type: v.vaccine_type,
      route: v.route,
      dose_volume: v.dose_volume,
      total_doses: v.total_doses,
      doses,
    }
  })

  // Next due = earliest OVERDUE or DUE dose
  const flat = vaccineStatus.flatMap((v) =>
    v.doses
      .filter((d) => d.status === 'OVERDUE' || d.status === 'DUE')
      .map((d) => ({ vaccine_code: v.code, vaccine_type: v.vaccine_type, ...d })),
  ).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const nextDue = flat[0] ?? null

  return NextResponse.json({
    child: childRes.data,
    approved_records: approvedRecords,
    vaccine_status: vaccineStatus,
    next_due: nextDue,
    counts: {
      complete: vaccineStatus.reduce((n, v) => n + v.doses.filter((d) => d.status === 'COMPLETE').length, 0),
      due: vaccineStatus.reduce((n, v) => n + v.doses.filter((d) => d.status === 'DUE').length, 0),
      overdue: vaccineStatus.reduce((n, v) => n + v.doses.filter((d) => d.status === 'OVERDUE').length, 0),
      upcoming: vaccineStatus.reduce((n, v) => n + v.doses.filter((d) => d.status === 'UPCOMING').length, 0),
    },
  })
}