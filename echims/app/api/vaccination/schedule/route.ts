import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-USR002 — Vaccination Schedule list backend.
// GET /api/vaccination/schedule?status=PENDING&from=YYYY-MM-DD&to=YYYY-MM-DD&q=juan
//
// Returns the per-child vaccination schedule requests the signed-in user can see.
// RLS on health_activity_schedule already scopes rows to the user's RHU/barangay —
// Admin sees all, PHN sees their RHU, BHW/RHM/BNS see their assigned barangay.
// 'can_review' is derived from role so the client can show/hide approve/reject.

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

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVISION', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const
type Status = typeof VALID_STATUSES[number]

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in to view the vaccination schedule.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination Schedule', 'view')) {
    return invalid('You are not authorized to view the vaccination schedule.', 403)
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status')?.toUpperCase() ?? ''
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  const q = url.searchParams.get('q')?.trim() ?? ''

  if (status && !VALID_STATUSES.includes(status as Status)) {
    return invalid(`status must be one of: ${VALID_STATUSES.join(', ')}`)
  }
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return invalid('from must be yyyy-mm-dd.')
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return invalid('to must be yyyy-mm-dd.')

  let query = supabase.from('health_activity_schedule')
    .select(`
      schedule_id, status, schedule_date, created_at, remarks, review_remarks,
      child_id, barangay_id, created_by, reviewed_by, reviewed_at,
      child:child(child_id, first_name, middle_name, last_name, date_of_birth),
      barangay:barangay(barangay_id, barangay_name)
    `)
    .eq('activity_type', 'VACCINATION')
    .not('child_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)
  if (from) query = query.gte('schedule_date', from)
  if (to) query = query.lte('schedule_date', to)

  const { data, error } = await query
  if (error) return invalid('Unable to load the schedule list.', 500)

  // Client-side 'q' filter on child name — the embedded child columns can't be
  // searched server-side without an RPC. Fine for ≤200 rows.
  const rows = (data ?? []).filter((row) => {
    if (!q) return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = Array.isArray(row.child) ? row.child[0] : row.child
    if (!c) return false
    const name = `${c.first_name ?? ''} ${c.middle_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
    return name.includes(q.toLowerCase())
  })

  const canReview = role === 'Public Health Nurse' || role === 'Administrator'

  return NextResponse.json({
    rows,
    can_review: canReview,
    role,
    filters: { status: status || null, from: from || null, to: to || null, q: q || null },
  })
}