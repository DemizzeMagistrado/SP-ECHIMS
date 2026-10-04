import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Lightweight RHU list for the PHN-RHU assignment dropdown in User Management.
// Any signed-in user can read — the dropdown is read-only context, writes go through
// /api/users which enforces admin + role checks.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const { data, error } = await supabase.from('rhu').select('rhu_id, rhu_name, municipality, province').order('rhu_name')
  if (error) return NextResponse.json({ error: 'Unable to load RHUs.' }, { status: 500 })
  return NextResponse.json(data ?? [])
}