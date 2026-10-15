// echims/app/api/inventory/items/route.ts
// Active items usable in inventory (vaccines + supplements).
// Fix: use the real FK names (fk_vaccine_item, fk_supplement_item) instead of
// the auto-generated ones that don't exist in this schema.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const { data, error } = await supabase
    .from('item')
    .select(`
      item_id, item_name, unit, status,
      vaccine:vaccine!fk_vaccine_item(vaccine_id, vaccine_type),
      supplement:supplement!fk_supplement_item(supplement_id, catalog_code)
    `)
    .eq('status', 'ACTIVE')
    .order('item_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data ?? []).map((row: any) => {
    const vac = Array.isArray(row.vaccine) ? row.vaccine[0] : row.vaccine
    const sup = Array.isArray(row.supplement) ? row.supplement[0] : row.supplement
    let kind: 'vaccine' | 'supplement' | null = null
    let code = ''
    if (vac?.vaccine_id) { kind = 'vaccine'; code = vac.vaccine_type ?? '' }
    else if (sup?.supplement_id) { kind = 'supplement'; code = sup.catalog_code ?? '' }
    // Fallback: if neither join matched but the item is active, still return it
    // as a plain item so stock-in doesn't silently empty. The vaccine/supplement
    // tag is for the icon only.
    if (!kind) {
      return {
        item_id: row.item_id,
        item_name: row.item_name,
        unit: row.unit,
        kind: 'supplement' as const,  // default icon
        code: '',
      }
    }
    return {
      item_id: row.item_id,
      item_name: row.item_name,
      unit: row.unit,
      kind,
      code,
    }
  })

  return NextResponse.json({ items })
}