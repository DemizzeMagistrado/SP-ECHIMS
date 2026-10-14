// INV-USR002 — View Stock Levels.
// GET /api/inventory/stock-overview?item_id=&barangay_id=
//
// Returns inventory rows + their batches, scoped by RLS (RHM sees only their
// assigned barangays; PHN/Admin see RHU-wide; BHW/BNS see what RLS allows).
// Includes per-batch expiry and quantity so the UI can draw badges and sort
// by soonest expiry.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const url = new URL(request.url)
  const itemId = url.searchParams.get('item_id')
  const barangayId = url.searchParams.get('barangay_id')

  let query = supabase.from('inventory')
    .select(`
      inventory_id, quantity_on_hand, updated_at,
      item_id, barangay_id,
      item:item(item_id, item_name, unit, status),
      barangay:barangay(barangay_id, barangay_name),
      batches:inventory_batch(
        batch_id, batch_number, expiry_date, received_date, quantity_on_hand, created_at
      )
    `)
    .order('updated_at', { ascending: false })

  if (itemId && /^\d+$/.test(itemId)) query = query.eq('item_id', Number(itemId))
  if (barangayId && /^\d+$/.test(barangayId)) query = query.eq('barangay_id', Number(barangayId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute low-stock threshold once per response from the active LOW_STOCK
  // rules so the UI can draw a badge without round-tripping to alert_rule.
  const rulesRes = await supabase.from('alert_rule')
    .select('rule_id, condition_parameters')
    .eq('evaluator_type', 'INVENTORY_LOW_STOCK')
    .eq('status', 'ACTIVE')
  const lowStockRules = rulesRes.data ?? []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((inv: any) => {
    const batches = (inv.batches ?? []).sort((a: { expiry_date: string }, b: { expiry_date: string }) =>
      a.expiry_date.localeCompare(b.expiry_date),
    )
    const totalBatchQty = batches.reduce((sum: number, b: { quantity_on_hand: number }) => sum + Number(b.quantity_on_hand ?? 0), 0)
    return {
      ...inv,
      batches,
      // Discrepancy flag — aggregate should equal sum of batch balances.
      batch_sum: totalBatchQty,
      has_drift: Math.abs(totalBatchQty - Number(inv.quantity_on_hand ?? 0)) > 0.0001,
    }
  })

  return NextResponse.json({ inventories: rows, low_stock_rules_count: lowStockRules.length })
}
