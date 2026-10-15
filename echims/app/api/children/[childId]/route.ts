// echims/app/api/children/[childId]/vaccination-schedule/route.ts
// Minimal stub for the vaccination schedule section on the child profile page.
// Returns a valid-shape empty payload so the UI doesn't crash with
// "Unexpected token '<', '<!DOCTYPE'..." when the schedule hasn't been
// computed yet. Enhance later with real preview logic.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ childId: string }> },
) {
  const { childId } = await context.params
  const id = Number(childId)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid child id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  // Fetch minimal child info (RLS enforces visibility).
  const { data: child, error: childErr } = await supabase
    .from('child')
    .select('child_id, first_name, middle_name, last_name, date_of_birth')
    .eq('child_id', id)
    .maybeSingle()
  if (childErr) return NextResponse.json({ error: childErr.message }, { status: 500 })
  if (!child) return NextResponse.json({ error: 'Child not found.' }, { status: 404 })

  const fullName = [child.first_name, child.middle_name, child.last_name]
    .filter(Boolean)
    .join(' ')

  // Latest schedule request (if the health_activity_schedule table has one)
  // Use maybeSingle to tolerate missing rows gracefully.
  let latest_request = null
  try {
    const { data: req } = await supabase
      .from('health_activity_schedule')
      .select('schedule_id, status, created_at, created_by, reviewed_by, reviewed_at, review_remarks, schedule_date, remarks')
      .eq('child_id', id)
      .eq('activity_type', 'VACCINATION')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (req) latest_request = req
  } catch {
    // Table/columns may vary — safe to leave null.
  }

  return NextResponse.json({
    child: {
      child_id: child.child_id,
      name: fullName || `Child #${child.child_id}`,
      date_of_birth: child.date_of_birth,
    },
    latest_request,
    preview: [],       // Empty preview until the computed schedule logic ships.
    excluded_count: 0,
  })
}