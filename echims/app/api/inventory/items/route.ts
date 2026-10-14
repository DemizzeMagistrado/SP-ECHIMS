// INV-USR001/002/003 — Active items usable in inventory (vaccines + supplements).
// GET /api/inventory/items
//
// Returns the shortlist of items the stock-in / allocation modals can target.
// Mirrors the eligibility check inside inv_receive_stock: active items that are
// either a vaccine or a supplement with a catalog_code.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  // Join via a double LEFT so we can tag each item as vaccine vs supplement
  // without a second round-trip. We filter out items that are not either.
  const { data, error } = await supabase
    .from('item')
    .select(`
      item_id, item_name, unit, status,
      vaccine:vaccine!vaccine_vaccine_id_fkey(vaccine_id, vaccine_type),
      supplement:supplement!supplement_supplement_id_fkey(supplement_id, catalog_code)
    `)
    .eq('status', 'ACTIVE')
    .order('item_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data ?? []).map((row: any) => {
    const vac = Array.isArray(row.vaccine) ? row.vaccine[0] : row.vaccine
    const sup = Array.isArray(row.supplement) ? row.supplement[0] : row.supplement
    let kind: 'vaccine' | 'supplement' | null = null
    if (vac?.vaccine_id) kind = 'vaccine'
    else if (sup?.supplement_id && sup.catalog_code) kind = 'supplement'
    return kind ? {
      item_id: row.item_id,
      item_name: row.item_name,
      unit: row.unit,
      kind,
      code: kind === 'vaccine' ? vac.vaccine_type : sup.catalog_code,
    } : null
  }).filter(Boolean)

  return NextResponse.json({ items })
}
