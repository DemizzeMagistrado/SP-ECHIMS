import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Sets a household's map location (from the Map tab's "Add location"). Flat route: the household
// ID is in the body. RLS decides who may update which household; the household guard trigger
// records who changed it.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in to save a location.' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const householdId = Number(body?.household_id)
  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  if (!Number.isSafeInteger(householdId) || householdId <= 0)
    return NextResponse.json({ error: 'Choose a household first.' }, { status: 400 })
  // Rough bounding box of the Philippines: catches clicks far outside the service area.
  if (!(latitude >= 4 && latitude <= 22 && longitude >= 116 && longitude <= 127))
    return NextResponse.json({ error: 'That point is outside the Philippines. Click the household’s location on the map.' }, { status: 400 })
  const { data, error } = await supabase
    .from('household')
    .update({ latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) })
    .eq('household_id', householdId)
    .select('household_id, latitude, longitude')
    .maybeSingle()
  if (error)
    return NextResponse.json({ error: error.code === '42501' ? 'You can’t change this household. Your account may not be assigned to its barangay.' : 'The location was not saved. Try again.' }, { status: error.code === '42501' ? 403 : 500 })
  if (!data) return NextResponse.json({ error: 'You can’t change this household. Your account may not be assigned to its barangay.' }, { status: 403 })
  return NextResponse.json(data)
}
