import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('child').select('child_id, first_name, middle_name, last_name, date_of_birth, sex, address, status, household_id, barangay_id, guardian_id').order('last_name')
  if (error) return NextResponse.json({ error: 'Unable to load child records.' }, { status: 500 })
  return NextResponse.json((data ?? []).map((child) => ({ id: `CH-${child.child_id}`, householdNumber: child.household_id ? `HH-${child.household_id}` : '', name: [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(' '), relationship: '', barangay: child.barangay_id ? String(child.barangay_id) : '', address: child.address ?? '', dob: child.date_of_birth, age: 'Recorded', sex: child.sex, civilStatus: 'Single', education: '', religion: '', ethnicity: '', fourPs: 'No', philhealthId: '', philhealthType: 'None', philhealthCategory: 'None', medicalHistory: '', risk: 'Normal', lmp: '', waterSource: '', toiletFacility: '', status: child.status })))
}

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = await createClient()
  const { data, error } = await supabase.from('child').insert(body).select('child_id, first_name, middle_name, last_name, date_of_birth, sex, address, status, household_id, barangay_id, guardian_id').single()
  if (error) return NextResponse.json({ error: 'Unable to save child record.' }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
