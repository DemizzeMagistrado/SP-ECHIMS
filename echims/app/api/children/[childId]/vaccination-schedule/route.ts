import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { computeSchedule, excludeGivenDoses } from '@/lib/nip-schedule'

// NIP-USR001 — Vaccination Schedule for a specific child
//
// GET /api/children/[childId]/vaccination-schedule
//   → Returns the computed schedule preview + the latest schedule request (if any)
//
// POST /api/children/[childId]/vaccination-schedule
//   → Creates a new PENDING schedule request in health_activity_schedule
//     (one row with activity_type='VACCINATION' + child_id set).
//     Only BHW/RHM can create; they must be assigned to the child's barangay.
//
// Entries are COMPUTED on-the-fly from the child's DOB + the NIP catalog so there's
// no entry persistence table. Vaccines already recorded in vaccination_record are
// excluded from the preview.

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

function parseChildId(value: string | undefined) {
  const n = Number(String(value ?? '').replace(/^CH-/i, ''))
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function GET(_request: Request, { params }: { params: Promise<{ childId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before accessing the vaccination schedule.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Child Profiling', 'view')) {
    return invalid('You are not authorized to view this schedule.', 403)
  }

  const { childId: childIdParam } = await params
  const childId = parseChildId(childIdParam)
  if (!childId) return invalid('A valid child is required.')

  // Load the child (we need DOB) + the latest schedule request + already-recorded doses in parallel.
  const [childRes, latestRequestRes, givenRes] = await Promise.all([
    supabase.from('child').select('child_id, date_of_birth, first_name, last_name, barangay_id').eq('child_id', childId).maybeSingle(),
    supabase.from('health_activity_schedule')
      .select('schedule_id, status, created_at, created_by, reviewed_by, reviewed_at, review_remarks, schedule_date, remarks')
      .eq('child_id', childId)
      .eq('activity_type', 'VACCINATION')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('vaccination_record')
      .select('dose_number, vaccine:vaccine(vaccine_type)')
      .eq('child_id', childId),
  ])

  if (childRes.error || !childRes.data) return invalid('Child could not be found.', 404)
  if (latestRequestRes.error) return invalid('Unable to load schedule request.', 500)
  if (givenRes.error) return invalid('Unable to load existing vaccination records.', 500)

  // Shape the given-doses list for excludeGivenDoses; Supabase embed may return array or object.
  const given = (givenRes.data ?? []).flatMap((row) => {
    const vt = Array.isArray(row.vaccine) ? row.vaccine[0]?.vaccine_type : (row.vaccine as { vaccine_type?: string } | null)?.vaccine_type
    return vt ? [{ vaccine_type: vt, dose_number: row.dose_number }] : []
  })

  const full = computeSchedule(childRes.data.date_of_birth)
  const preview = excludeGivenDoses(full, given)

  return NextResponse.json({
    child: {
      child_id: childRes.data.child_id,
      name: `${childRes.data.first_name} ${childRes.data.last_name}`,
      date_of_birth: childRes.data.date_of_birth,
    },
    latest_request: latestRequestRes.data,
    preview,
    excluded_count: full.length - preview.length,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ childId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before creating a schedule request.', 401)
  const role = await trustedRole(supabase)
  // Only BHW/RHM can create a schedule request per the ticket spec.
  if (role !== 'Barangay Health Worker' && role !== 'Rural Health Midwife') {
    return invalid('Only Barangay Health Workers and Rural Health Midwives can request a vaccination schedule.', 403)
  }

  const { childId: childIdParam } = await params
  const childId = parseChildId(childIdParam)
  if (!childId) return invalid('A valid child is required.')

  const body = await request.json().catch(() => null) as { remarks?: string; schedule_date?: string } | null
  const remarks = String(body?.remarks ?? '').trim() || null
  const scheduleDate = (body?.schedule_date && /^\d{4}-\d{2}-\d{2}$/.test(body.schedule_date))
    ? body.schedule_date
    : new Date().toISOString().slice(0, 10)

  // Fetch the child so we know the barangay to insert against. RLS on the INSERT also
  // enforces barangay assignment, so if an unassigned worker tries this they get 42501.
  const childRes = await supabase.from('child').select('child_id, barangay_id, date_of_birth').eq('child_id', childId).maybeSingle()
  if (childRes.error || !childRes.data) return invalid('Child could not be found.', 404)

  // Guard against duplicate pending requests — one open request per child at a time.
  const existingRes = await supabase.from('health_activity_schedule')
    .select('schedule_id')
    .eq('child_id', childId)
    .eq('activity_type', 'VACCINATION')
    .eq('status', 'PENDING')
    .maybeSingle()
  if (existingRes.data) {
    return invalid('There is already a pending vaccination schedule request for this child. Wait for it to be reviewed before submitting another one.', 409)
  }

  // Create the request. activity_type='VACCINATION', status='PENDING', child_id set.
  // Chain select().maybeSingle() so a silent RLS block becomes a surfaced 403 instead
  // of a confusing "no rows returned" result on the frontend.
  const insertRes = await supabase.from('health_activity_schedule').insert({
    activity_type: 'VACCINATION',
    schedule_date: scheduleDate,
    status: 'PENDING',
    conflict_status: 'NONE',
    created_by: user.id,
    barangay_id: childRes.data.barangay_id,
    child_id: childId,
    remarks,
  }).select('schedule_id').maybeSingle()

  if (insertRes.error) {
    const code = insertRes.error.code
    const message = code === '42501'
      ? 'You are not authorized to request a schedule for this child. Your account may not be assigned to the child\'s barangay.'
      : `Unable to create the schedule request. [${code ?? 'unknown'}] ${insertRes.error.message ?? ''}`.trim()
    return invalid(message, code === '42501' ? 403 : 500)
  }
  if (!insertRes.data) return invalid('Schedule request was not created. Your account may not be assigned to this child\'s barangay.', 403)

  return NextResponse.json({ schedule_id: insertRes.data.schedule_id, status: 'PENDING' }, { status: 201 })
}