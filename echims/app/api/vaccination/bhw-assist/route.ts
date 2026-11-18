import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-REV01 — "BHW to assist" flag on a child's vaccination schedule (e.g. guardian has no phone).
// POST /api/vaccination/bhw-assist  Body: { child_id: number, assist: boolean, reason?: string }
// RLS on child_vaccination_assist limits it to children the user can see (barangay / RHU / admin).

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator',
  'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar',
}

const invalid = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in.', 401)
  const { data: profile } = await supabase.rpc('get_my_profile').maybeSingle()
  const role = roleAliases[String((profile as { role?: string } | null)?.role ?? '').trim().toLowerCase()]
  if (!role || !canPerform(role, 'Vaccination Schedule', 'view') || role === 'Barangay Nutrition Scholar') {
    return invalid('Your account cannot change this flag.', 403)
  }

  const body = await request.json().catch(() => null) as { child_id?: unknown; assist?: unknown; reason?: unknown } | null
  const childId = Number(body?.child_id)
  if (!Number.isSafeInteger(childId) || childId <= 0) return invalid('A valid child_id is required.')
  if (typeof body?.assist !== 'boolean') return invalid('assist must be true or false.')
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) || null : null

  const result = body.assist
    ? await supabase.from('child_vaccination_assist')
        .upsert({ child_id: childId, reason, flagged_by: user.id, flagged_at: new Date().toISOString() })
        .select('child_id').maybeSingle()
    : await supabase.from('child_vaccination_assist').delete().eq('child_id', childId).select('child_id').maybeSingle()

  if (result.error) {
    if (result.error.code === '42501') return invalid('This child is outside your assigned barangay or RHU.', 403)
    console.error('BHW assist:', result.error)
    return invalid('Unable to save the flag. Try again.', 500)
  }
  if (body.assist && !result.data) return invalid('This child is outside your assigned barangay or RHU.', 403)
  return NextResponse.json({ child_id: childId, assist: body.assist, reason })
}
