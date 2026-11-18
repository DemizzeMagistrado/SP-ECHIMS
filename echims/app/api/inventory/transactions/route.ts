// INV-REV01 — read-only history for the Inventory › Stock & distribution sections.
// GET /api/inventory/transactions?kind=allocation  → batch moves between barangays (ALLOC: pairs)
// GET /api/inventory/transactions?kind=usage       → usage and waste entries
// Scope comes from RLS on inventory_transaction (PHN/Admin: all; assigned workers: their barangays).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Named = { item_name?: string; unit?: string; barangay_name?: string } | null
type Row = {
  transaction_id: number
  transaction_type: string
  movement_subtype: string | null
  quantity: number
  transaction_date: string
  reference_number: string | null
  remarks: string | null
  performed_by: string | null
  inventory: { item: Named | Named[]; barangay: Named | Named[] } | null
  inventory_batch: { batch_number: string; expiry_date: string } | { batch_number: string; expiry_date: string }[] | null
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))
const LIMIT = 500 // shortcut: newest 500 only; add server paging if a barangay's history outgrows it

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const kind = new URL(request.url).searchParams.get('kind')
  if (kind !== 'allocation' && kind !== 'usage') return NextResponse.json({ error: 'kind must be allocation or usage.' }, { status: 400 })

  let q = supabase.from('inventory_transaction')
    .select(`
      transaction_id, transaction_type, movement_subtype, quantity, transaction_date, reference_number, remarks, performed_by,
      inventory:inventory(item:item(item_name, unit), barangay:barangay(barangay_name)),
      inventory_batch:inventory_batch(batch_number, expiry_date)
    `)
    .order('transaction_date', { ascending: false })
    .limit(LIMIT)
  q = kind === 'allocation'
    ? q.like('reference_number', 'ALLOC:%')
    : q.eq('transaction_type', 'STOCK_OUT').in('movement_subtype', ['USAGE', 'WASTE'])

  const { data, error } = await q
  if (error) {
    console.error('Inventory transactions:', error)
    return NextResponse.json({ error: 'Unable to load inventory history.' }, { status: 500 })
  }
  const rows = (data ?? []) as unknown as Row[]

  // Names of who recorded each entry (one lookup).
  const ids = [...new Set(rows.map((r) => r.performed_by).filter((id): id is string => Boolean(id)))]
  const names = new Map<string, string>()
  if (ids.length) {
    const u = await supabase.from('users').select('user_id, full_name').in('user_id', ids)
    for (const row of u.data ?? []) names.set(row.user_id, row.full_name)
  }

  const base = (r: Row) => {
    const item = one(r.inventory?.item)
    const batch = one(r.inventory_batch)
    return {
      item_name: item?.item_name ?? null,
      unit: item?.unit ?? null,
      batch_number: batch?.batch_number ?? null,
      expiry_date: batch?.expiry_date ?? null,
      quantity: Number(r.quantity),
      date: r.transaction_date,
      recorded_by: r.performed_by ? names.get(r.performed_by) ?? null : null,
    }
  }

  if (kind === 'usage') {
    return NextResponse.json({
      entries: rows.map((r) => ({
        id: r.transaction_id,
        ...base(r),
        subtype: r.movement_subtype,
        barangay_name: one(one(r.inventory)?.barangay)?.barangay_name ?? null,
        remarks: r.remarks,
      })),
    })
  }

  // An allocation is two rows sharing one ALLOC: reference: STOCK_OUT at the source, STOCK_IN at the target.
  // A viewer who can read only one side still sees the move, with the other barangay unknown.
  const moves = new Map<string, ReturnType<typeof base> & { id: string; from: string | null; to: string | null }>()
  for (const r of rows) {
    const key = r.reference_number ?? `tx-${r.transaction_id}`
    const barangay = one(one(r.inventory)?.barangay)?.barangay_name ?? null
    const move = moves.get(key) ?? { id: key, ...base(r), from: null, to: null }
    if (r.transaction_type === 'STOCK_OUT') move.from = barangay
    else move.to = barangay
    moves.set(key, move)
  }
  return NextResponse.json({ entries: [...moves.values()] })
}
