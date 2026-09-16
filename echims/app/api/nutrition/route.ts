import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('nutritional_assessment').select('assessment_id, child_id, assessment_date, weight_kg, height_cm, weight_for_age, height_for_age, weight_for_height, nutritional_status, remarks').order('assessment_date', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load nutrition records.' }, { status: 500 })
  return NextResponse.json((data ?? []).map((item) => ({ id: `N-${item.assessment_id}`, child: `Child ${item.child_id}`, date: item.assessment_date, weight: `${item.weight_kg} kg`, height: `${item.height_cm} cm`, muac: '', weightAge: item.weight_for_age ?? 'Normal', heightAge: item.height_for_age ?? 'Normal', weightHeight: item.weight_for_height ?? 'Normal', status: item.nutritional_status, edema: 'None', ipGroup: 'No', disability: 'No', remarks: item.remarks ?? '' })))
}

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = await createClient()
  const { data, error } = await supabase.from('nutritional_assessment').insert(body).select('assessment_id').single()
  if (error) return NextResponse.json({ error: 'Unable to save nutrition record.' }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
