import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (process.env.GUARDIAN_PORTAL_ENABLED !== 'true') return NextResponse.json({ error: 'Guardian registration is unavailable.' }, { status: 503 })
  const params = new URL(request.url).searchParams
  const level = params.get('level')
  const parent = params.get('parent')
  if (!level || !['regions', 'provinces', 'cities', 'barangays'].includes(level) || (level !== 'regions' && (!parent || !/^\d{10}$/.test(parent)))) return NextResponse.json({ error: 'Select a valid location.' }, { status: 400 })
  try {
    const db = await createClient()
    const { data, error } = await db.rpc('echims_guardian_registration_locations', { p_level: level, p_parent: level === 'regions' ? null : parent })
    if (error) return NextResponse.json({ error: 'Unable to load locations. Try again.' }, { status: 503 })
    return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return NextResponse.json({ error: 'Unable to load locations. Try again.' }, { status: 503 }) }
}
