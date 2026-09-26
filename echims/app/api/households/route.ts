import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const query = params.get('q')?.trim() ?? ''
  const barangayId = Number(params.get('barangayId'))
  if (!query || !Number.isSafeInteger(barangayId) || barangayId <= 0) return NextResponse.json([])
  const pattern = `%${query}%`
  const { data, error } = await supabase.from('household').select('household_id, household_no, household_address, purok, barangay_id').eq('barangay_id', barangayId).or(`household_no.ilike.${pattern},household_address.ilike.${pattern}`).order('household_no').limit(20)
  if (error) return NextResponse.json({ error: 'Unable to search households.' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
