import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-REV01 — every vaccination schedule request for one child (the Schedule card shows only the
// latest). GET /api/vaccination/schedule-history?child_id=123
// RLS on health_activity_schedule scopes rows to the user's barangay / RHU (Admin: all).

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator',
  'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar',
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)
  const { data: profile } = await db.rpc('get_my_profile').maybeSingle()
  const role = roleAliases[String((profile as { role?: string } | null)?.role ?? '').trim().toLowerCase()]
  if (!role || !canPerform(role, 'Vaccination', 'view')) return json({ error: 'You cannot view vaccination schedules.' }, 403)

  const childId = Number(new URL(request.url).searchParams.get('child_id'))
  if (!Number.isSafeInteger(childId) || childId <= 0) return json({ error: 'A valid child_id is required.' }, 400)

  const { data, error } = await db.from('health_activity_schedule')
    .select(`
      schedule_id, status, schedule_date, start_time, end_time, created_at, remarks, review_remarks, reviewed_at,
      cancellation_reason, completion_date,
      requester:health_worker!fk_schedule_created_by(user_id, user:users!fk_health_worker_user(full_name)),
      reviewer:public_health_nurse!fk_schedule_reviewed_by(user_id, hw:health_worker!fk_phn_health_worker(user:users!fk_health_worker_user(full_name)))
    `)
    .eq('activity_type', 'VACCINATION')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('Schedule history GET:', error)
    return json({ error: 'Unable to load the schedule history.' }, 500)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null
  const rows = (data ?? []).map((r) => ({
    schedule_id: r.schedule_id, status: r.status, schedule_date: r.schedule_date, start_time: r.start_time, end_time: r.end_time,
    created_at: r.created_at, remarks: r.remarks, review_remarks: r.review_remarks, reviewed_at: r.reviewed_at,
    cancellation_reason: r.cancellation_reason, completion_date: r.completion_date,
    requested_by: one(one(r.requester)?.user)?.full_name ?? null,
    reviewed_by: one(one(one(r.reviewer)?.hw)?.user)?.full_name ?? null,
  }))
  return json({ child_id: childId, rows })
}
