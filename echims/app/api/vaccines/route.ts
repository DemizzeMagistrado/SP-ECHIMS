import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// NIP-USR003 — Vaccines catalog.
// GET /api/vaccines → list all vaccines (seeded by migration), with item name for display.
// Used by the "Record vaccination" modal and anywhere a vaccine picker is shown.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  // Companion medicines are optional: if that table/embed is unavailable, list vaccines without them.
  const select = (withCompanions: boolean) => supabase.from('vaccine')
    .select((withCompanions ? `
      vaccine_id, vaccine_type, dose_volume, route, target_age, total_doses,
      item:item!fk_vaccine_item(item_id, item_name, description, status),
      companions:vaccine_companion_item(quantity, note, active, item:item(item_id, item_name, unit, status))
    ` : `
      vaccine_id, vaccine_type, dose_volume, route, target_age, total_doses,
      item:item!fk_vaccine_item(item_id, item_name, description, status)
    `) as string)
    .order('vaccine_id', { ascending: true })
  let { data, error } = await select(true)
  if (error && ['PGRST200', 'PGRST201', '42P01'].includes(error.code)) {
    console.warn('Vaccines: companion medicines unavailable, loading without them.', error)
    ;({ data, error } = await select(false))
  }

  if (error) {
    console.error('Vaccines GET:', error)
    return NextResponse.json({ error: `Unable to load vaccines. ${error.message ?? ''}`.trim() }, { status: 500 })
  }

  // Filter out inactive items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).filter((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item: any = Array.isArray(v.item) ? v.item[0] : v.item
    return !item?.status || item.status === 'ACTIVE'
  })

  return NextResponse.json({ vaccines: rows })
}