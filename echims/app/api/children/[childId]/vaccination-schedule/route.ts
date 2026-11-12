// echims/app/api/children/[childId]/vaccination-schedule/route.ts
// NIP-USR001 + NIP-USR004 — Due detection + Request schedule.
//
// GET  → computed preview of due/overdue doses for this child
// POST → BHW/RHM creates a PENDING schedule request with date + optional time

import { NIP_CATALOG, manilaTodayYMD, nipVaccineTimeline, normalizeVaccineCode } from '@/lib/nip-schedule'
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

  const fullName = [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(' ')

  const { data: vaccines } = await supabase
    .from('vaccine')
    .select('vaccine_id, vaccine_type')

  let given: Array<{ vaccine_id: number; dose_number: number; vaccination_date: string; status: string }> = []
  try {
    const { data } = await supabase
      .from('vaccination_record')
      .select('vaccine_id, dose_number, vaccination_date, status')
      .eq('child_id', id)
      .in('status', ['PENDING', 'APPROVED'])
    if (data) given = data as typeof given
  } catch { /* ok */ }

  // Same schedule as the immunization history and defaulters (lib/nip-schedule): every date is
  // counted from this child's date of birth. Given doses are matched by vaccine code + dose.
  const codeById = new Map((vaccines ?? []).map((v) => [v.vaccine_id as number, normalizeVaccineCode(String(v.vaccine_type))]))
  const givenOn = new Map(given.map((g) => [`${codeById.get(g.vaccine_id) ?? ''}:${g.dose_number}`, String(g.vaccination_date)]))
  const today = manilaTodayYMD()

  type Entry = {
    vaccine_code: string; vaccine_type: string; dose_number: number
    recommended_date: string; route: string; dose_volume: string
    /** Missed (or pushed back): the next valid date. */
    rescheduled_date?: string
    /** Past the vaccine's age limit (e.g. BCG after 12 months): shown, not counted as missed. */
    not_eligible?: boolean
  }
  const preview: Entry[] = []
  let excluded_count = 0
  const dob = String(child.date_of_birth)
  for (const vaccine of NIP_CATALOG) {
    if (vaccine.routine_enabled === false) continue
    const dates = Array.from({ length: vaccine.total_doses }, (_, i) => givenOn.get(`${vaccine.code}:${i + 1}`) ?? null)
    for (const t of nipVaccineTimeline(dob, vaccine, dates, today)) {
      if (t.status === 'COMPLETE') { excluded_count++; continue }
      preview.push({
        vaccine_code: vaccine.code, vaccine_type: vaccine.vaccine_type, dose_number: t.dose_number,
        recommended_date: t.due_date, route: vaccine.route, dose_volume: vaccine.dose_volume,
        ...(t.rescheduled_date ? { rescheduled_date: t.rescheduled_date } : {}),
        ...(t.status === 'NOT_ELIGIBLE' ? { not_eligible: true } : {}),
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