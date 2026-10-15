// echims/app/api/children/[childId]/vaccination-schedule/route.ts
// NIP-USR001 + NIP-USR004 — Due detection + Request schedule.
//
// GET  → computed preview of due/overdue doses for this child
// POST → BHW/RHM creates a PENDING schedule request with date + optional time

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/* ──────────────── GET: due/overdue preview ──────────────── */

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

  const { data: child, error: childErr } = await supabase
    .from('child')
    .select('child_id, first_name, middle_name, last_name, date_of_birth, barangay_id')
    .eq('child_id', id)
    .maybeSingle()
  if (childErr) return NextResponse.json({ error: childErr.message }, { status: 500 })
  if (!child) return NextResponse.json({ error: 'Child not found.' }, { status: 404 })

  const dob = new Date(`${child.date_of_birth}T00:00:00Z`)
  const fullName = [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(' ')

  const { data: vaccines } = await supabase
    .from('vaccine')
    .select('vaccine_id, vaccine_type, dose_volume, route, min_age_days, interval_days, total_doses')
    .order('min_age_days', { ascending: true })

  let given: Array<{ vaccine_id: number; dose_number: number }> = []
  try {
    const { data } = await supabase
      .from('vaccination_record')
      .select('vaccine_id, dose_number')
      .eq('child_id', id)
    if (data) given = data as Array<{ vaccine_id: number; dose_number: number }>
  } catch { /* ok */ }

  const key = (vid: number, dose: number) => `${vid}:${dose}`
  const givenSet = new Set(given.map((g) => key(g.vaccine_id, g.dose_number)))

  type Entry = {
    vaccine_code: string; vaccine_type: string; dose_number: number
    recommended_date: string; route: string; dose_volume: string
  }
  const preview: Entry[] = []
  let excluded_count = 0

  for (const v of (vaccines ?? []) as Array<{
    vaccine_id: number; vaccine_type: string; dose_volume: string | null; route: string | null
    min_age_days: number; interval_days: number | null; total_doses: number | null
  }>) {
    const totalDoses = Math.max(1, v.total_doses ?? 1)
    const interval = Math.max(0, v.interval_days ?? 0)
    for (let dose = 1; dose <= totalDoses; dose++) {
      if (givenSet.has(key(v.vaccine_id, dose))) { excluded_count++; continue }
      const daysOffset = v.min_age_days + (dose - 1) * interval
      const dueDate = new Date(dob.getTime() + daysOffset * 86400000)
      const ageMonthsAtDue = (dueDate.getTime() - dob.getTime()) / (86400000 * 30.44)
      if (ageMonthsAtDue > 60) continue
      preview.push({
        vaccine_code: v.vaccine_type,
        vaccine_type: v.vaccine_type,
        dose_number: dose,
        recommended_date: dueDate.toISOString().slice(0, 10),
        route: v.route ?? '',
        dose_volume: v.dose_volume ?? '',
      })
    }
  }
  preview.sort((a, b) => a.recommended_date.localeCompare(b.recommended_date))

  let latest_request = null
  try {
    const { data: req } = await supabase
      .from('health_activity_schedule')
      .select('schedule_id, status, created_at, created_by, reviewed_by, reviewed_at, review_remarks, schedule_date, remarks, start_time, end_time')
      .eq('child_id', id)
      .eq('activity_type', 'VACCINATION')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (req) latest_request = req
  } catch { /* ok */ }

  return NextResponse.json({
    child: {
      child_id: child.child_id,
      name: fullName || `Child #${child.child_id}`,
      date_of_birth: child.date_of_birth,
    },
    latest_request,
    preview,
    excluded_count,
  })
}

/* ──────────────── POST: BHW/RHM requests a schedule ──────────────── */

type Body = {
  proposed_date?: string
  schedule_date?: string     // frontend sends this name
  start_time?: string | null
  end_time?: string | null
  remarks?: string
}

export async function POST(
  request: Request,
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

  // Role gate: Admin/PHN/RHM/BHW can request. BNS cannot.
  const [{ data: adminRow }, { data: phnRow }, { data: rhmRow }, { data: bhwRow }] = await Promise.all([
    supabase.from('administrator').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('public_health_nurse').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('rural_health_midwife').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('barangay_health_worker').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!adminRow && !phnRow && !rhmRow && !bhwRow) {
    return NextResponse.json({ error: 'Only health workers can request a vaccination schedule.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as Body | null
  const dateStr = body?.proposed_date ?? body?.schedule_date
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'A valid proposed date (YYYY-MM-DD) is required.' }, { status: 400 })
  }
  const date = new Date(`${dateStr}T00:00:00Z`)
  if (isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 })

  // Validate optional time fields
  const timeRe = /^\d{2}:\d{2}(:\d{2})?$/
  const start_time = body?.start_time && timeRe.test(body.start_time) ? body.start_time : null
  const end_time = body?.end_time && timeRe.test(body.end_time) ? body.end_time : null

  // Need barangay_id for the schedule
  const { data: child } = await supabase.from('child').select('barangay_id').eq('child_id', id).maybeSingle()
  if (!child) return NextResponse.json({ error: 'Child not found.' }, { status: 404 })

  // Guard: block duplicate PENDING request for this child
  const { data: existing } = await supabase
    .from('health_activity_schedule')
    .select('schedule_id')
    .eq('child_id', id)
    .eq('activity_type', 'VACCINATION')
    .eq('status', 'PENDING')
    .limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'A pending vaccination schedule request already exists for this child.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('health_activity_schedule')
    .insert({
      activity_type: 'VACCINATION',
      schedule_date: dateStr,
      start_time,
      end_time,
      status: 'PENDING',
      conflict_status: 'NONE',
      remarks: (body?.remarks ?? '').trim() || null,
      created_by: user.id,
      barangay_id: child.barangay_id,
      child_id: id,
    })
    .select('schedule_id, status, created_at, schedule_date, start_time, end_time, remarks')
    .single()

  if (error) {
    const code = error.code
    const status = code === '42501' ? 403 : code === '23505' ? 409 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ ok: true, request: data }, { status: 201 })
}