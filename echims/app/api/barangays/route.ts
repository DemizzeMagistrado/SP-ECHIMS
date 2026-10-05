import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const { data, error } = await supabase.from('barangay').select('barangay_id, barangay_name').order('barangay_name')
  if (error) return NextResponse.json({ error: 'Unable to load barangays.' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
