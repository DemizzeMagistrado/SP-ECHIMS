import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type NutritionRole = 'Administrator' | 'PHN' | 'RHM' | 'BNS'
type Supabase = Awaited<ReturnType<typeof createClient>>
type AuthContext = {
  supabase: Supabase
  userId: string
  role: NutritionRole
  canCreate: boolean
  barangayIds: number[] | null
}
type Authorization = { context: AuthContext; response?: never } | {
  context?: never
  response: NextResponse
}

const roleAliases: Record<string, NutritionRole> = {
  admin: 'Administrator', administrator: 'Administrator',
  phn: 'PHN', 'public health nurse': 'PHN',
  rhm: 'RHM', 'rural health midwife': 'RHM',
  bns: 'BNS', 'barangay nutrition scholar': 'BNS',
}

const assessmentFields = `
  assessment_id, child_id, assessed_by, schedule_id,
  assessment_date, weight, height, muac, measurement_type, edema_grade,
  age_days, sex_at_assessment, normalized_height_cm,
  waz, haz, whz, baz, bmi,
  weight_for_age, height_for_age, weight_for_height, bmi_for_age,
  muac_status, nutritional_status, evaluation_status,
  engine_version, evaluated_at, remarks, created_at,
  child (child_id, first_name, middle_name, last_name,
    date_of_birth, sex, barangay_id,
    barangay (barangay_id, barangay_name))
`

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function authorize(): Promise<Authorization> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { response: fail('Unauthorized.', 401) }

  const [profileResult, accountResult] = await Promise.all([
    supabase.rpc('get_my_profile').maybeSingle(),
    supabase.from('users').select('account_status')
      .eq('user_id', user.id).maybeSingle(),
  ])
  if (profileResult.error || accountResult.error) {
    console.error('Nutrition authorization lookup failed:', {
      profile: profileResult.error, account: accountResult.error,
    })
    return { response: fail('Unable to verify account permissions.', 500) }
  }
  if (accountResult.data?.account_status !== 'ACTIVE') {
    return { response: fail('An active account is required.', 403) }
  }
  const role = roleAliases[String(profileResult.data?.role ?? '').trim().toLowerCase()]
  if (!role) return { response: fail('You cannot access nutrition assessments.', 403) }

  let barangayIds: number[] | null = null
  if (role === 'PHN') {
    const { data: phn, error } = await supabase.from('public_health_nurse')
      .select('rhu_id').eq('user_id', user.id).maybeSingle()
    if (error) {
      console.error('Nutrition PHN scope lookup failed:', error)
      return { response: fail('Unable to determine RHU scope.', 500) }
    }
    if (phn?.rhu_id == null) barangayIds = []
    else {
      const { data, error: scopeError } = await supabase.from('barangay')
        .select('barangay_id').eq('rhu_id', phn.rhu_id)
      if (scopeError) return { response: fail('Unable to determine barangay scope.', 500) }
      barangayIds = (data ?? []).map((item) => Number(item.barangay_id))
    }
  } else if (role === 'RHM' || role === 'BNS') {
    const { data, error } = await supabase.from('health_worker_assignment')
      .select('barangay_id').eq('user_id', user.id).eq('status', 'ACTIVE')
    if (error) return { response: fail('Unable to determine assigned barangays.', 500) }
    barangayIds = [...new Set((data ?? []).map((item) => Number(item.barangay_id)))]
  }

  // Matches existing database role access. Administrators view/supervise;
  // assessment creation requires a health-worker assessor.
  return { context: {
    supabase, userId: user.id, role,
    canCreate: role === 'PHN' || role === 'RHM' || role === 'BNS',
    barangayIds,
  } }
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function positiveId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (!/^\d+$/.test(String(value))) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function measurement(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export async function GET() {
  try {
    const auth = await authorize()
    if (auth.response) return auth.response
    const { supabase, role, canCreate, userId, barangayIds } = auth.context
    const metadata = { role, currentUserId: userId, permissions: { create: canCreate } }
    if (barangayIds?.length === 0) {
      return NextResponse.json({ ...metadata, data: [], children: [] }, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }

    // Fetch child options in pages so large scoped barangays are not truncated.
    const children: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from('child').select(`
        child_id, first_name, middle_name, last_name,
        date_of_birth, sex, barangay_id,
        barangay (barangay_id, barangay_name)
      `).eq('status', 'ACTIVE').order('child_id').range(offset, offset + 999)
      if (barangayIds !== null) query = query.in('barangay_id', barangayIds)
      const { data, error } = await query
      if (error) {
        console.error('Nutrition child-options query failed:', error)
        return fail('Unable to load children.', 500)
      }
      children.push(...(data ?? []))
      if ((data?.length ?? 0) < 1000) break
    }

    // RLS enforces assessment visibility, including historical/inactive children.
    const { data, error } = await supabase.from('nutritional_assessment')
      .select(assessmentFields)
      .order('assessment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('assessment_id', { ascending: false })
      .limit(500)
    if (error) {
      console.error('Nutrition assessment GET failed:', error)
      return fail('Unable to load nutrition assessments.', 500)
    }
    return NextResponse.json({ ...metadata, data: data ?? [], children }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Nutrition GET failed:', error)
    return fail('An unexpected error occurred.', 500)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize()
    if (auth.response) return auth.response
    const { supabase, userId, canCreate, barangayIds } = auth.context
    if (!canCreate) return fail('Your role cannot record assessments.', 403)

    const payload: unknown = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return fail('Request body must be a JSON object.', 400)
    }
    const body = payload as Record<string, unknown>
    const allowed = new Set([
      'child_id', 'assessment_date', 'weight', 'height', 'muac',
      'measurement_type', 'edema_grade', 'remarks', 'schedule_id',
    ])
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return fail('Submit measurement fields only. Scores and classifications are server-generated.', 400)
    }

    const childId = positiveId(body.child_id)
    const weight = measurement(body.weight)
    const height = measurement(body.height)
    const muac = body.muac == null || body.muac === '' ? null : measurement(body.muac)
    if (!childId || !isDate(body.assessment_date) || weight === null || height === null) {
      return fail('Provide a valid child, assessment date, weight in kg, and length/height in cm.', 400)
    }
    if (body.muac != null && body.muac !== '' && muac === null) {
      return fail('MUAC must be a positive number in cm.', 400)
    }
    if (body.measurement_type !== 'LENGTH' && body.measurement_type !== 'HEIGHT') {
      return fail('Choose recumbent length or standing height.', 400)
    }
    if (typeof body.edema_grade !== 'number' || !Number.isInteger(body.edema_grade)
        || body.edema_grade < 0 || body.edema_grade > 3) {
      return fail('Record bilateral pitting edema as 0, 1, 2, or 3.', 400)
    }
    if (body.remarks != null && typeof body.remarks !== 'string') {
      return fail('Remarks must be text.', 400)
    }
    const scheduleId = body.schedule_id == null ? null : positiveId(body.schedule_id)
    if (body.schedule_id != null && scheduleId === null) return fail('Invalid schedule ID.', 400)

    const { data: child, error: childError } = await supabase.from('child')
      .select('child_id, barangay_id, status').eq('child_id', childId).maybeSingle()
    if (childError) return fail('Unable to verify the selected child.', 500)
    if (!child || (barangayIds !== null && !barangayIds.includes(Number(child.barangay_id)))) {
      return fail('Child not found in your geographic scope.', 403)
    }
    if (child.status !== 'ACTIVE') return fail('Select an active child.', 400)

    if (scheduleId !== null) {
      const { data: schedule, error } = await supabase.from('health_activity_schedule')
        .select('barangay_id, activity_type, status').eq('schedule_id', scheduleId).maybeSingle()
      if (error) return fail('Unable to verify the linked activity.', 500)
      if (!schedule || Number(schedule.barangay_id) !== Number(child.barangay_id)
          || schedule.activity_type !== 'NUTRITIONAL_ASSESSMENT'
          || !['APPROVED', 'ONGOING', 'COMPLETED'].includes(schedule.status)) {
        return fail('Link an approved, ongoing, or completed nutrition activity in the child’s barangay.', 400)
      }
    }

    const { data, error } = await supabase.from('nutritional_assessment').insert({
      child_id: childId, assessed_by: userId,
      assessment_date: body.assessment_date,
      weight, height, muac,
      measurement_type: body.measurement_type,
      edema_grade: body.edema_grade,
      remarks: typeof body.remarks === 'string' ? body.remarks.trim() || null : null,
      schedule_id: scheduleId,
      // Required existing column; the database evaluator replaces this value.
      nutritional_status: 'NOT_EVALUATED',
    }).select(assessmentFields).single()

    if (error) {
      console.error('Nutrition assessment POST failed:', error)
      const statuses: Record<string, number> = {
        '42501': 403, '22023': 400, '22007': 400, '22008': 400,
        '23514': 400, '23503': 400, '23505': 409,
      }
      const status = statuses[error.code] ?? 500
      return fail(error.code === '22023' ? error.message :
        status === 403 ? 'You cannot record an assessment for this child.' :
        status === 400 ? 'Invalid assessment values or linked records.' :
        status === 409 ? 'This assessment conflicts with an existing record.' :
        'Unable to save the assessment. Check the server log.', status)
    }
    return NextResponse.json({ message: 'Assessment saved and evaluated.', data }, { status: 201 })
  } catch (error) {
    console.error('Nutrition POST failed:', error)
    return fail('An unexpected error occurred.', 500)
  }
}
