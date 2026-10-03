import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

const roleAliases: Record<string, UserRole> = { administrator: 'Administrator', admin: 'Administrator', 'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse', 'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker', 'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife', 'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any) {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle()
  return roleAliases[String(data?.role ?? '').trim().toLowerCase()]
}

function parseId(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/^CH-/, '').split('-').pop())
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function monthsOld(value: string) {
  const birth = new Date(`${value}T00:00:00Z`)
  const now = new Date()
  return (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth() - (now.getUTCDate() < birth.getUTCDate() ? 1 : 0)
}

async function session(permission: 'view' | 'create' | 'edit') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const role = await trustedRole(supabase)
  return role && canPerform(role, 'Child Profiling', permission) ? { supabase, user, role } : { supabase, user, role, forbidden: true as const }
}

function invalid(message: string, status = 400) { return NextResponse.json({ error: message }, { status }) }

export async function GET(request: Request) {
  const auth = await session('view')
  if (!auth) return invalid('Please sign in before accessing child records.', 401)
  if ('forbidden' in auth) return invalid('You are not authorized to access child records.', 403)
  const childId = parseId(new URL(request.url).searchParams.get('childId'))
  let query = auth.supabase.from('child').select('child_id, first_name, middle_name, last_name, date_of_birth, sex, birth_place, address, registration_date, status, household_id, barangay_id, guardian_id').order('child_id', { ascending: false })
  if (childId) query = query.eq('child_id', childId)
  const { data, error } = await query
  if (error) return invalid('Unable to load child records.', 500)
  const rows = data ?? []
  if (childId) {
    const child = rows[0]
    if (!child) return invalid('Child could not be found.', 404)
    const [guardian, profile, assessment] = await Promise.all([
      child.guardian_id ? auth.supabase.from('guardian').select('*').eq('guardian_id', child.guardian_id).maybeSingle() : Promise.resolve({ data: null }),
      auth.supabase.from('child_profile_record').select('*').eq('child_id', child.child_id).order('profiling_date', { ascending: false }).limit(1).maybeSingle(),
      auth.supabase.from('nutritional_assessment').select('nutritional_status, assessment_date').eq('child_id', child.child_id).order('assessment_date', { ascending: false }).limit(1).maybeSingle(),
    ])
    return NextResponse.json({ child, guardian: guardian.data, profile: profile.data, monitoringStatus: assessment.data?.nutritional_status ?? 'Not Yet Assessed' })
  }
  const assessments = await auth.supabase.from('nutritional_assessment').select('child_id, nutritional_status, assessment_date').in('child_id', rows.map((child) => child.child_id)).order('assessment_date', { ascending: false })
  const latestStatus = new Map<number, string>()
  for (const assessment of assessments.data ?? []) if (!latestStatus.has(assessment.child_id)) latestStatus.set(assessment.child_id, assessment.nutritional_status)
  return NextResponse.json(rows.map((child) => ({ id: `CH-${child.child_id}`, householdNumber: child.household_id ? `HH-${child.household_id}` : '', name: [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(' '), barangay: child.barangay_id ? String(child.barangay_id) : '', address: child.address ?? '', dob: child.date_of_birth, age: `${Math.max(0, monthsOld(child.date_of_birth))} mos`, sex: child.sex, status: child.status, monitoringStatus: latestStatus.get(child.child_id) ?? 'Not Yet Assessed', guardianId: child.guardian_id })))
}

export async function POST(request: Request) {
  const auth = await session('create')
  if (!auth) return invalid('Please sign in before registering a child.', 401)
  if ('forbidden' in auth) return invalid('Your role cannot register child profiles.', 403)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return invalid('Invalid request body.') }
  const firstName = String(body.first_name ?? '').trim()
  const middleName = String(body.middle_name ?? '').trim() || null
  const lastName = String(body.last_name ?? '').trim()
  const dob = String(body.date_of_birth ?? '')
  const sex = String(body.sex ?? '').trim().toUpperCase()
  const barangayId = parseId(body.barangay_id)
  let householdId = parseId(body.household_id)
  if (!firstName || !lastName || !dob || !sex || !barangayId) return invalid('First name, last name, date of birth, sex, and barangay are required.')
  const date = new Date(`${dob}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || dob > new Date().toISOString().slice(0, 10)) return invalid('Date of birth must be valid and cannot be in the future.')
  if (monthsOld(dob) < 0 || monthsOld(dob) > 59) return invalid('Child must be between 0 and 59 months old.')
  const household = body.new_household && typeof body.new_household === 'object' ? body.new_household as Record<string, unknown> : null
  if (!householdId && household) {
    const created = await auth.supabase.from('household').insert({ household_no: String(household.household_no ?? '').trim(), household_address: String(household.household_address ?? '').trim(), purok: String(household.purok ?? '').trim() || null, is_4ps_member: Boolean(household.is_4ps_member), barangay_id: barangayId }).select('household_id').single()
    if (created.error) return invalid('Unable to create the household. Check the household details.', 400)
    householdId = created.data.household_id
  }
  if (!householdId) return invalid('Select an existing household or enter new household details.')
  const householdCheck = await auth.supabase.from('household').select('household_id').eq('household_id', householdId).maybeSingle()
  if (!householdCheck.data) return invalid('Selected household was not found.')
  let guardianId = parseId(body.guardian_id)
  const newGuardian = body.new_guardian && typeof body.new_guardian === 'object' ? body.new_guardian as Record<string, unknown> : null
  if (!guardianId && newGuardian) {
    const guardian = await auth.supabase.from('guardian').insert({ first_name: String(newGuardian.first_name ?? '').trim(), middle_name: String(newGuardian.middle_name ?? '').trim() || null, last_name: String(newGuardian.last_name ?? '').trim(), contact_number: String(newGuardian.contact_number ?? '').trim() || null, address: String(newGuardian.address ?? '').trim() || null, relationship_to_child: String(newGuardian.relationship_to_child ?? '').trim() || null }).select('guardian_id').single()
    if (guardian.error) return invalid('Unable to create the guardian. Check the guardian details.')
    guardianId = guardian.data.guardian_id
  }
  if (guardianId) { const guardian = await auth.supabase.from('guardian').select('guardian_id').eq('guardian_id', guardianId).maybeSingle(); if (!guardian.data) return invalid('Selected guardian was not found.') }
  const duplicate = await auth.supabase.from('child').select('child_id').eq('first_name', firstName).eq('last_name', lastName).eq('date_of_birth', dob).eq('household_id', householdId).maybeSingle()
  if (duplicate.data) return NextResponse.json({ duplicate: true, error: 'A child with the same name, birth date, and household is already registered.' }, { status: 409 })
  const inserted = await auth.supabase.from('child').insert({ first_name: firstName, middle_name: middleName, last_name: lastName, date_of_birth: dob, sex, birth_place: String(body.birth_place ?? '').trim() || null, address: String(body.address ?? '').trim() || null, registration_date: new Date().toISOString().slice(0, 10), status: 'ACTIVE', household_id: householdId, barangay_id: barangayId, guardian_id: guardianId }).select('child_id').single()
  if (inserted.error) return invalid(inserted.error.code === '42501' ? 'You are not authorized for this barangay.' : 'Unable to save the child record.', inserted.error.code === '42501' ? 403 : 500)
  const profileFields = ['relationship_to_household_head', 'civil_status', 'educational_attainment', 'religion', 'ethnicity', 'philhealth_membership_type', 'philhealth_category', 'water_source_type', 'toilet_facility_type', 'medical_history', 'last_menstrual_period']
  const profile = Object.fromEntries(profileFields.filter((field) => body[field] !== undefined && body[field] !== '').map((field) => [field, body[field]]))
  if (Object.keys(profile).length) { const result = await auth.supabase.from('child_profile_record').insert({ ...profile, child_id: inserted.data.child_id, profiling_date: new Date().toISOString().slice(0, 10), recorded_by: auth.user.id }); if (result.error) return invalid('Child saved, but profiling details could not be saved.', 500) }
  return NextResponse.json({ child_id: inserted.data.child_id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const auth = await session('edit')
  if (!auth) return invalid('Please sign in before editing a child.', 401)
  if ('forbidden' in auth) return invalid('Your role cannot edit child profiles.', 403)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const childId = parseId(body?.child_id)
  if (!childId) return invalid('A valid child is required.')
  const updates = Object.fromEntries(['first_name', 'middle_name', 'last_name', 'date_of_birth', 'sex', 'birth_place', 'address', 'barangay_id', 'household_id', 'guardian_id'].filter((field) => body?.[field] !== undefined).map((field) => [field, field === 'sex' ? String(body?.sex ?? '').trim().toUpperCase() || null : body?.[field] === '' ? null : body?.[field]]))
  if (updates.date_of_birth && monthsOld(String(updates.date_of_birth)) > 59) return invalid('Child must be between 0 and 59 months old at registration.')
  const result = await auth.supabase.from('child').update(updates).eq('child_id', childId)
  if (result.error) return invalid(result.error.code === '42501' ? 'You are not authorized to edit this child.' : 'Unable to update the child record.', result.error.code === '42501' ? 403 : 500)
  const profileFields = ['relationship_to_household_head', 'civil_status', 'educational_attainment', 'religion', 'ethnicity', 'philhealth_membership_type', 'philhealth_category', 'water_source_type', 'toilet_facility_type', 'medical_history', 'last_menstrual_period']
  const patchBody = body ?? {}
  const profileUpdates = Object.fromEntries(profileFields.filter((field) => patchBody[field] !== undefined).map((field) => [field, patchBody[field] === '' ? null : patchBody[field]]))
  if (Object.keys(profileUpdates).length) {
    const existing = await auth.supabase.from('child_profile_record').select('profile_record_id').eq('child_id', childId).order('profiling_date', { ascending: false }).limit(1).maybeSingle()
    const profileResult = existing.data
      ? await auth.supabase.from('child_profile_record').update(profileUpdates).eq('profile_record_id', existing.data.profile_record_id)
      : await auth.supabase.from('child_profile_record').insert({ ...profileUpdates, child_id: childId, profiling_date: new Date().toISOString().slice(0, 10), recorded_by: auth.user.id })
    if (profileResult.error) return invalid('Child updated, but profiling details could not be saved.', 500)
  }
  return NextResponse.json({ message: 'Child updated successfully.' })
}