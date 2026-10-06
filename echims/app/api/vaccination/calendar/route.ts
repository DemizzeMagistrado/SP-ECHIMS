import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-USR001 — Vaccination calendar backend.
// GET /api/vaccination/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Returns child vaccination schedule requests (health_activity_schedule rows with
//   activity_type='VACCINATION' and child_id set) between the two dates. The RLS
//   policies already scope results to the signed-in user's RHU/barangay — admin sees
//   all, PHN sees their RHU, BHW/RHM/BNS see their assigned barangays.

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

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in to view the vaccination calendar.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'view')) {
    return invalid('You are not authorized to view the vaccination calendar.', 403)
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? new Date().toISOString().slice(0, 10)
  const to = url.searchParams.get('to') ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return invalid('from and to must be yyyy-mm-dd.')
  }

  // Fetch all per-child vaccination schedule requests in the window.
  // RLS will transparently filter to what the user is allowed to see.
  const { data, error } = await supabase.from('health_activity_schedule')
    .select(`
      schedule_id, status, schedule_date, created_at, remarks, review_remarks,
      child_id, barangay_id,
      child:child(child_id, first_name, middle_name, last_name, date_of_birth),
      barangay:barangay(barangay_id, barangay_name)
    `)
    .eq('activity_type', 'VACCINATION')
    .not('child_id', 'is', null)
    .gte('schedule_date', from)
    .lte('schedule_date', to)
    .order('schedule_date', { ascending: true })

  if (error) return invalid('Unable to load the vaccination calendar.', 500)

  return NextResponse.json({
    from, to,
    schedules: data ?? [],
    // Expose the viewer's permission to approve so the client can show/hide buttons.
    can_review: role === 'Public Health Nurse' || role === 'Rural Health Midwife' || role === 'Administrator',
  })
}