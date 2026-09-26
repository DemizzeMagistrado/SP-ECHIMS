import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

const allowedRoles: UserRole[] = ['Administrator', 'Public Health Nurse', 'Barangay Health Worker', 'Rural Health Midwife', 'Barangay Nutrition Scholar']

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.app_metadata?.role as UserRole | undefined
  if (!user || !role || !allowedRoles.includes(role) || !canPerform(role, 'Child Profiling', 'create')) return { supabase, response: NextResponse.json({ error: 'You are not authorized to manage guardians.' }, { status: 403 }) }
  return { supabase, response: null }
}

function childIdFromParam(value: string | null) {
  const parsed = Number((value ?? '').replace(/^CH-/, '').split('-').pop())
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request) {
  const { supabase, response } = await authorize()
  if (response) return response
  const params = new URL(request.url).searchParams
  const childId = childIdFromParam(params.get('childId'))
  if (!childId) {
    const query = params.get('q')?.trim() ?? ''
    if (!query) return NextResponse.json([])
    const pattern = `%${query}%`
    const { data, error } = await supabase.from('guardian').select('guardian_id, first_name, middle_name, last_name, contact_number, address, relationship_to_child').or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`).order('last_name').limit(20)
    if (error) return NextResponse.json({ error: 'Unable to search guardians.' }, { status: 500 })
    return NextResponse.json(data ?? [])
  }
  const { data: child, error: childError } = await supabase.from('child').select('guardian_id').eq('child_id', childId).maybeSingle()
  if (childError || !child) return NextResponse.json({ error: 'Child could not be found.' }, { status: 404 })
  if (!child.guardian_id) return NextResponse.json(null)
  const { data, error } = await supabase.from('guardian').select('guardian_id, first_name, middle_name, last_name, contact_number, address, relationship_to_child').eq('guardian_id', child.guardian_id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load guardian information.' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { supabase, response } = await authorize()
  if (response) return response
  const body = await request.json().catch(() => null)
  const childId = childIdFromParam(body?.childId)
  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
  const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : ''
  const relationship = typeof body?.relationshipToChild === 'string' ? body.relationshipToChild.trim() : ''
  const contactNumber = typeof body?.contactNumber === 'string' ? body.contactNumber.trim() : ''
  const address = typeof body?.address === 'string' ? body.address.trim() : ''
  if (!childId || !firstName || !lastName || !relationship) return NextResponse.json({ error: 'First name, last name, and relationship to the child are required.' }, { status: 400 })
  if (contactNumber && !/^[+0-9()\s-]{7,20}$/.test(contactNumber)) return NextResponse.json({ error: 'Enter a valid contact number.' }, { status: 400 })
  const { data: child, error: childError } = await supabase.from('child').select('guardian_id').eq('child_id', childId).maybeSingle()
  if (childError || !child) return NextResponse.json({ error: 'Child could not be found.' }, { status: 404 })
  if (child.guardian_id) return NextResponse.json({ error: 'This child already has a registered guardian.' }, { status: 409 })
  const { data: existing } = await supabase.from('guardian').select('guardian_id').eq('first_name', firstName).eq('last_name', lastName).eq('contact_number', contactNumber || null).maybeSingle()
  const guardianId = existing?.guardian_id ?? (await supabase.from('guardian').insert({ first_name: firstName, middle_name: body?.middleName?.trim() || null, last_name: lastName, contact_number: contactNumber || null, address: address || null, relationship_to_child: relationship }).select('guardian_id').single()).data?.guardian_id
  if (!guardianId) return NextResponse.json({ error: 'Guardian could not be registered.' }, { status: 400 })
  const { error: updateError } = await supabase.from('child').update({ guardian_id: guardianId }).eq('child_id', childId)
  if (updateError) return NextResponse.json({ error: 'Guardian was saved but could not be associated with the child.' }, { status: 400 })
  return NextResponse.json({ message: 'Guardian registered successfully.', guardian_id: guardianId }, { status: 201 })
}
