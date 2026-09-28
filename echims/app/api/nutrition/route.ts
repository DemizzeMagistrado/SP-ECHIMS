import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

const roleAliases: Record<string, UserRole> = { admin: 'Administrator', administrator: 'Administrator', phn: 'Public Health Nurse', 'public health nurse': 'Public Health Nurse', bns: 'Barangay Nutrition Scholar', 'barangay nutrition scholar': 'Barangay Nutrition Scholar' }

async function authorize(permission: 'view' | 'create') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.rpc('get_my_profile').maybeSingle() : { data: null }
  const role = roleAliases[String(profile?.role ?? '').trim().toLowerCase()]
  if (!user || !role || !canPerform(role, 'Nutritional Assessment', permission)) return { supabase, response: NextResponse.json({ error: 'You are not authorized to access nutrition records.' }, { status: 403 }) }
  return { supabase, response: null }
}

export async function GET() {
  const { supabase, response } = await authorize('view')
  if (response) return response
  const { data, error } = await supabase.from('nutritional_assessment').select('assessment_id, child_id, assessment_date, weight_kg, height_cm, weight_for_age, height_for_age, weight_for_height, nutritional_status, remarks').order('assessment_date', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load nutrition records.' }, { status: 500 })
  return NextResponse.json((data ?? []).map((item) => ({ id: `N-${item.assessment_id}`, child: `Child ${item.child_id}`, date: item.assessment_date, weight: `${item.weight_kg} kg`, height: `${item.height_cm} cm`, muac: '', weightAge: item.weight_for_age ?? 'Normal', heightAge: item.height_for_age ?? 'Normal', weightHeight: item.weight_for_height ?? 'Normal', status: item.nutritional_status, edema: 'None', ipGroup: 'No', disability: 'No', remarks: item.remarks ?? '' })))
}

export async function POST(request: Request) {
  const { supabase, response } = await authorize('create')
  if (response) return response
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  const { data, error } = await supabase.from('nutritional_assessment').insert(body).select('assessment_id').single()
  if (error) return NextResponse.json({ error: 'Unable to save nutrition record.' }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}