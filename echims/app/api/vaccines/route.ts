import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// NIP-USR003 — Vaccines catalog.
// GET /api/vaccines → list all vaccines (seeded by migration), with item name for display.
// Used by the "Record vaccination" modal and anywhere a vaccine picker is shown.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const { data, error } = await supabase.from('vaccine')
    .select(`
      vaccine_id, vaccine_type, dose_volume, route, target_age,
      item:item(item_id, item_name, description, status)
    `)
    .order('vaccine_id', { ascending: true })

  if (error) {
    return NextResponse.json({ error: `Unable to load vaccines. ${error.message ?? ''}`.trim() }, { status: 500 })
  }

  // Filter out inactive items
  const rows = (data ?? []).filter((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item: any = Array.isArray(v.item) ? v.item[0] : v.item
    return !item?.status || item.status === 'ACTIVE'
  })

  return NextResponse.json({ vaccines: rows })
}