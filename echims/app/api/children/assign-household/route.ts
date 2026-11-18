import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-REV01 — "Household not assigned" task: a child accepted on a transfer without a household
// (allowed) gets one here. POST /api/children/assign-household
//   { child_id, household_id }                                      → link an existing household
//   { child_id, new_household: { household_address, household_no?, purok?, is_4ps_member? } } → create + link
// The household must be in the child's barangay. Only for children with no household yet.
// RLS decides who may create the household; echims_assign_child_household (migration 11) links it.

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator',
  'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar',
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const id = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null }

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)
  const { data: profile } = await db.rpc('get_my_profile').maybeSingle()
  const role = roleAliases[String((profile as { role?: string } | null)?.role ?? '').trim().toLowerCase()]
  if (!role || !canPerform(role, 'Child Profiling', 'edit')) return json({ error: 'Your account cannot change child records.' }, 403)

  const body = await request.json().catch(() => null) as { child_id?: number; household_id?: number; new_household?: Record<string, unknown> } | null
  const childId = id(body?.child_id)
  if (!childId) return json({ error: 'A valid child_id is required.' }, 400)

  const child = await db.from('child').select('child_id, barangay_id, household_id').eq('child_id', childId).maybeSingle()
  if (child.error || !child.data) return json({ error: 'Child not found or outside your scope.' }, 404)
  if (child.data.household_id) return json({ error: 'This child already has a household.' }, 409)
  const barangayId = child.data.barangay_id as number

  let householdId = id(body?.household_id)
  if (householdId) {
    const h = await db.from('household').select('household_id, barangay_id, household_address').eq('household_id', householdId).maybeSingle()
    if (!h.data) return json({ error: 'Household not found or outside your scope.' }, 404)
    if (h.data.barangay_id !== barangayId) return json({ error: "Choose a household in the child's barangay." }, 400)
  } else if (body?.new_household && typeof body.new_household === 'object') {
    const n = body.new_household
    const householdAddress = String(n.household_address ?? '').trim()
    if (!householdAddress) return json({ error: 'Enter the household address.' }, 400)
    if (householdAddress.length > 500) return json({ error: 'The household address is too long.' }, 400)
    const created = await db.from('household').insert({
      household_address: householdAddress,
      household_no: String(n.household_no ?? '').trim() || null,
      purok: String(n.purok ?? '').trim() || null,
      is_4ps_member: Boolean(n.is_4ps_member),
      barangay_id: barangayId,
    }).select('household_id, household_address').single()
    if (created.error) {
      return json({ error: created.error.code === '42501' ? 'You are not assigned to this barangay, so you cannot create a household here.' : 'Unable to create the household. Check the details.' }, created.error.code === '42501' ? 403 : 400)
    }
    householdId = created.data.household_id
  } else {
    return json({ error: 'Choose an existing household or enter a new one.' }, 400)
  }

  // The child's household column only changes through a database function (household-transfer
  // guard); it re-checks scope, the barangay and that the child still has no household.
  const linked = await db.rpc('echims_assign_child_household', { p_child_id: childId, p_household_id: householdId })
  if (linked.error) {
    const code = linked.error.code
    const status = code === '42501' ? 403 : code === '22023' ? 409 : code === 'P0002' ? 404 : 500
    if (status === 500) console.error('Assign household:', linked.error)
    return json({ error: status === 500 ? 'Unable to link the household. Try again.' : linked.error.message }, status)
  }
  return json({ child_id: childId, household_id: householdId })
}
