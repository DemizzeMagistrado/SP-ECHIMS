import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Admin-only barangay assignment management for health workers.
// POST { user_id, barangay_id } → create ACTIVE assignment.
// DELETE { assignment_id } → mark INACTIVE (we soft-delete so audit trail stays intact,
// and so is_assigned_to_barangay() keeps resolving correctly on existing records).

type Profile = { role?: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAdmin(): Promise<{ supabase: any; response: null } | { supabase: null; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, response: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) }
  const { data: profile } = await supabase.rpc('get_my_profile').maybeSingle() as { data: Profile | null }
  if (profile?.role !== 'Administrator') return { supabase: null, response: NextResponse.json({ error: 'Admin access only.' }, { status: 403 }) }
  return { supabase, response: null }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.response) return auth.response
  const supabase = auth.supabase
  const body = await request.json().catch(() => null) as { user_id?: string; barangay_id?: number } | null
  if (!body?.user_id || !body?.barangay_id) return NextResponse.json({ error: 'user_id and barangay_id are required.' }, { status: 400 })
  // Confirm the user is actually a health worker — only RHM/BHW/BNS/PHN get barangay assignments.
  const { data: hw } = await supabase.from('health_worker').select('user_id').eq('user_id', body.user_id).maybeSingle()
  if (!hw) return NextResponse.json({ error: 'Only health workers can be assigned to a barangay.' }, { status: 400 })
  // Prevent duplicate ACTIVE assignment for the same (user, barangay).
  const { data: existing } = await supabase.from('health_worker_assignment').select('assignment_id').eq('user_id', body.user_id).eq('barangay_id', body.barangay_id).eq('status', 'ACTIVE').maybeSingle()
  if (existing) return NextResponse.json({ error: 'This user is already assigned to that barangay.' }, { status: 409 })
  const { error } = await supabase.from('health_worker_assignment').insert({ user_id: body.user_id, barangay_id: body.barangay_id, status: 'ACTIVE', assigned_date: new Date().toISOString().slice(0, 10) })
  if (error) return NextResponse.json({ error: 'Unable to create assignment.' }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.response) return auth.response
  const supabase = auth.supabase
  const body = await request.json().catch(() => null) as { assignment_id?: number } | null
  if (!body?.assignment_id) return NextResponse.json({ error: 'assignment_id is required.' }, { status: 400 })
  // Soft delete — keep the row for audit, flip status so is_assigned_to_barangay() returns false.
  const { error } = await supabase.from('health_worker_assignment').update({ status: 'INACTIVE' }).eq('assignment_id', body.assignment_id)
  if (error) return NextResponse.json({ error: 'Unable to remove assignment.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}