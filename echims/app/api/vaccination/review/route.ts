import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-USR001 — Approve / reject a vaccination schedule request.
// POST /api/vaccination/review
// Body: { schedule_id: number, action: 'APPROVE' | 'REJECT', review_remarks?: string }
//
// Only PHN or Admin can review. The role matrix lists Vaccination Schedule for RHM as
// ['view', 'request'] (no 'approve'), and the Supabase schema's reviewed_by/approved_by
// FKs point to public_health_nurse only — so RHM is excluded here to match both.
// RLS on health_activity_schedule still scopes rows: PHN sees only their RHU, Admin all.

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

function parseScheduleId(value: unknown) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before reviewing a request.', 401)
  const role = await trustedRole(supabase)
  if (role !== 'Public Health Nurse' && role !== 'Administrator') {
    return invalid('Only Public Health Nurses or Administrators can review schedule requests.', 403)
  }

  const body = await request.json().catch(() => null) as { schedule_id?: number; action?: string; review_remarks?: string } | null
  const scheduleId = parseScheduleId(body?.schedule_id)
  if (!scheduleId) return invalid('A valid schedule_id is required.')
  const action = String(body?.action ?? '').trim().toUpperCase()
  if (action !== 'APPROVE' && action !== 'REJECT') return invalid('action must be APPROVE or REJECT.')

  const reviewRemarks = String(body?.review_remarks ?? '').trim() || null
  if (action === 'REJECT' && !reviewRemarks) {
    return invalid('A reason is required when rejecting a request.')
  }

  // Confirm the request is actually a PENDING vaccination schedule for a child (not a
  // barangay-wide activity) before changing status.
  const existingRes = await supabase.from('health_activity_schedule')
    .select('schedule_id, status, activity_type, child_id')
    .eq('schedule_id', scheduleId)
    .maybeSingle()
  if (existingRes.error || !existingRes.data) return invalid('Schedule request could not be found.', 404)
  if (existingRes.data.activity_type !== 'VACCINATION' || !existingRes.data.child_id) {
    return invalid('This endpoint only reviews per-child vaccination schedule requests.')
  }
  if (existingRes.data.status !== 'PENDING' && existingRes.data.status !== 'NEEDS_REVISION') {
    return invalid(`This request is already ${existingRes.data.status.toLowerCase()}.`)
  }

  const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  const updateRes = await supabase.from('health_activity_schedule')
    .update({
      status: newStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_remarks: reviewRemarks,
    })
    .eq('schedule_id', scheduleId)
    .select('schedule_id, status')
    .maybeSingle()

  if (updateRes.error) {
    const code = updateRes.error.code
    const message = code === '42501'
      ? 'You are not authorized to review this request. The request may belong to a barangay or RHU outside your scope.'
      : `Unable to update the request. [${code ?? 'unknown'}] ${updateRes.error.message ?? ''}`.trim()
    return invalid(message, code === '42501' ? 403 : 500)
  }
  if (!updateRes.data) return invalid('Request was not updated. Your account may not be assigned to this RHU/barangay.', 403)

  return NextResponse.json({ schedule_id: updateRes.data.schedule_id, status: updateRes.data.status })
}