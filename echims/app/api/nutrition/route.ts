import { NextResponse } from 'next/server'
import { buildRiskMonitoring, type MonitoringRule } from '@/lib/nutrition-risk'
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
  assessment_id, child_id, assessed_by, schedule_id, client_request_id,
  assessment_date, weight, height, muac, measurement_type, edema_grade,
  age_days, sex_at_assessment, normalized_height_cm,
  waz, haz, whz, baz, bmi,
  weight_for_age, height_for_age, weight_for_height, bmi_for_age,
  muac_status, nutritional_status, evaluation_status,
  engine_version, evaluated_at, is_at_risk, remarks, created_at,
  child!inner (child_id, status, first_name, middle_name, last_name,
    date_of_birth, sex, barangay_id, address,
    guardian (guardian_id, first_name, middle_name, last_name, relationship_to_child),
    household (household_address, purok),
    barangay (barangay_id, barangay_name, municipality, province))
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
  const profileData: unknown = profileResult.data
  const roleKey = profileData && typeof profileData === 'object' && 'role' in profileData
    ? String(profileData.role ?? '').trim().toLowerCase() : ''
  const role = roleAliases[roleKey]
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
  // Only BNS can record assessments; other permitted roles retain scoped viewing.
  return { context: {
    supabase, userId: user.id, role,
    canCreate: role === 'BNS',
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
type ChildProfile = {
  child_id: number
  profile_record_id: number
  profiling_date: string | null
  ethnicity: string | null
}
async function latestChildProfiles(supabase: Supabase, childIds: number[]) {
  const ids = [...new Set(childIds)]
  const profiles = new Map<number, ChildProfile>()
  // Use only already-visible child IDs. RLS still controls profile access.
  // Date precedence matches /api/children; the ID breaks same-date ties.
  for (let start = 0; start < ids.length; start += 200) {
    const chunk = ids.slice(start, start + 200)
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('child_profile_record')
        .select('child_id, profile_record_id, profiling_date, ethnicity')
        .in('child_id', chunk)
        .order('profiling_date', { ascending: false, nullsFirst: false })
        .order('profile_record_id', { ascending: false })
        .range(offset, offset + 999)
      if (error) {
        console.error('Nutrition child-profile lookup failed:', error)
        throw new Error('Unable to load child-profile information.')
      }
      for (const row of (data ?? []) as ChildProfile[]) {
        const childId = Number(row.child_id)
        if (!profiles.has(childId)) profiles.set(childId, row)
      }
      if ((data?.length ?? 0) < 1000) break
    }
  }
  return profiles
}
export async function GET() {
  try {
    const auth = await authorize()
    if (auth.response) return auth.response
    const { supabase, role, canCreate, userId, barangayIds } = auth.context
    const metadata = { role, currentUserId: userId, permissions: { create: canCreate } }
    if (barangayIds?.length === 0) {
      return NextResponse.json({ ...metadata, data: [], children: [], risk_monitoring: buildRiskMonitoring([], []) }, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
    // Fetch child options in pages so large scoped barangays are not truncated.
    const children: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from('child').select(`
        child_id, first_name, middle_name, last_name,
        date_of_birth, sex, barangay_id, address,
        guardian (guardian_id, first_name, middle_name, last_name, relationship_to_child),
        household (household_address, purok),
        barangay (barangay_id, barangay_name, municipality, province)
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
    // Page through all RLS-visible assessments; summaries must not stop at 500.
    const assessments: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += 1000) {
      let assessmentQuery = supabase.from('nutritional_assessment')
        .select(assessmentFields)
        .order('assessment_date', { ascending: false })
        .order('assessment_id', { ascending: false })
        .range(offset, offset + 999)
      if (barangayIds !== null) assessmentQuery = assessmentQuery.in('child.barangay_id', barangayIds)
      const { data, error } = await assessmentQuery
      if (error) {
        console.error('Nutrition assessment GET failed:', error)
        return fail('Unable to load nutrition assessments.', 500)
      }
      assessments.push(...(data ?? []))
      if ((data?.length ?? 0) < 1000) break
    }
    const { data: monitoringRules, error: monitoringRulesError } = await supabase.rpc('get_nutrition_monitoring_rules')
    if (monitoringRulesError) {
      console.error('Nutrition monitoring rule lookup failed:', monitoringRulesError)
      return fail('Unable to load nutrition monitoring rules. Install the NUT-USR004 database migration and retry.', 500)
    }
    const riskMonitoring = buildRiskMonitoring(assessments, (monitoringRules ?? []) as MonitoringRule[])
    const profiles = await latestChildProfiles(supabase, [
      ...children.map((child) => Number(child.child_id)),
      ...assessments.map((assessment) => Number(assessment.child_id)),
    ])
    return NextResponse.json({
      ...metadata,
      risk_monitoring: riskMonitoring,
      data: assessments.map((assessment) => ({
        ...assessment, profile: profiles.get(Number(assessment.child_id)) ?? null,
      })),
      children: children.map((child) => ({
        ...child, profile: profiles.get(Number(child.child_id)) ?? null,
      })),
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Nutrition GET failed:', error)
    return fail('An unexpected error occurred.', 500)
  }
}
type StoredAssessment = Record<string, unknown> & { child_id: number }
function sameRequestValues(row: StoredAssessment, body: Record<string, unknown>) {
  const optionalNumber = (value: unknown) => value == null || value === '' ? null : Number(value)
  return Number(row.child_id) === Number(body.child_id)
    && String(row.assessment_date) === body.assessment_date
    && Number(row.weight) === Number(body.weight)
    && Number(row.height) === Number(body.height)
    && optionalNumber(row.muac) === optionalNumber(body.muac)
    && row.measurement_type === body.measurement_type
    && Number(row.edema_grade) === body.edema_grade
    && optionalNumber(row.schedule_id) === optionalNumber(body.schedule_id)
    && String(row.remarks ?? '').trim() === String(body.remarks ?? '').trim()
}
async function existingRequest(supabase: Supabase, userId: string, requestId: string) {
  return supabase.from('nutritional_assessment').select(assessmentFields)
    .eq('assessed_by', userId).eq('client_request_id', requestId).maybeSingle()
}
async function replayResponse(supabase: Supabase, row: StoredAssessment, body: Record<string, unknown>) {
  if (!sameRequestValues(row, body)) {
    return fail('This request ID was already saved with different measurements. Refresh the child history before creating another assessment.', 409)
  }
  const profiles = await latestChildProfiles(supabase, [Number(row.child_id)])
  return NextResponse.json({
    message: 'This assessment was already saved. No duplicate was created.', replayed: true,
    data: { ...row, profile: profiles.get(Number(row.child_id)) ?? null },
  })
}
export async function POST(request: Request) {
  try {
    const auth = await authorize()
    if (auth.response) return auth.response
    const { supabase, userId, canCreate, barangayIds } = auth.context
    if (!canCreate) return fail('Only Barangay Nutrition Scholars can record assessments.', 403)
    const payload: unknown = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return fail('Request body must be a JSON object.', 400)
    }
    const body = payload as Record<string, unknown>
    const allowed = new Set([
      'child_id', 'assessment_date', 'weight', 'height', 'muac',
      'measurement_type', 'edema_grade', 'remarks', 'schedule_id', 'client_request_id', 'request_owner_id',
    ])
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return fail('Submit assessment measurements only. Child information comes from the child profile; scores and classifications are server-generated.', 400)
    }
    if (body.request_owner_id != null && body.request_owner_id !== userId) {
      return fail('Sign back into the account that recorded this assessment draft.', 403)
    }
    const requestId = body.client_request_id == null ? null : body.client_request_id
    if (requestId !== null && (typeof requestId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))) {
      return fail('Invalid assessment request identifier.', 400)
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
    if (requestId !== null) {
      const previous = await existingRequest(supabase, userId, requestId)
      if (previous.error) return fail('Unable to verify the assessment request.', 500)
      if (previous.data) return await replayResponse(supabase, previous.data as StoredAssessment, body)
    }
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
    // Cross-check raw measurements even when a new request UUID is supplied.
    // Existing UUID retries were handled above; different same-day measurements
    // remain possible after the user reviews the child's history.
    for (let offset = 0; ; offset += 1000) {
      const { data: sameDay, error: duplicateError } = await supabase.from('nutritional_assessment')
        .select('assessment_id, child_id, assessment_date, weight, height, muac, measurement_type, edema_grade')
        .eq('child_id', childId).eq('assessment_date', body.assessment_date)
        .order('assessment_id', { ascending: true }).range(offset, offset + 999)
      if (duplicateError) return fail('Unable to check existing assessments for duplicates. Your draft was not submitted.', 500)
      const duplicate = (sameDay ?? []).find((row) =>
        Number(row.weight) === weight && Number(row.height) === height
        && (row.muac == null ? null : Number(row.muac)) === muac
        && row.measurement_type === body.measurement_type
        && Number(row.edema_grade) === body.edema_grade)
      if (duplicate) return NextResponse.json({
        error: `Matching measurements already exist as assessment #${duplicate.assessment_id} for this child and date. Review the existing record before creating another assessment.`,
        duplicate_assessment_id: duplicate.assessment_id,
      }, { status: 409 })
      if ((sameDay ?? []).length < 1000) break
    }
    // Read linked demographics before the write so lookup failure cannot
    // report a failed save after an assessment was already committed.
    const profiles = await latestChildProfiles(supabase, [childId])
    const { data, error } = await supabase.from('nutritional_assessment').insert({
      child_id: childId, assessed_by: userId, client_request_id: requestId,
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
      // Another tab or retry may have committed this request concurrently.
      if (error.code === '23505' && requestId !== null) {
        const previous = await existingRequest(supabase, userId, requestId)
        if (!previous.error && previous.data) {
          return await replayResponse(supabase, previous.data as StoredAssessment, body)
        }
      }
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
    return NextResponse.json({
      message: 'Assessment saved and evaluated.',
      data: { ...data, profile: profiles.get(childId) ?? null },
    }, { status: 201 })
  } catch (error) {
    console.error('Nutrition POST failed:', error)
    return fail('An unexpected error occurred.', 500)
  }
}
