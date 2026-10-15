// INV-USR005 — Replenishment requests.
// GET /api/inventory/replenishment            → list (role-scoped by RLS)
// POST /api/inventory/replenishment           → RHM creates request
//
// Mirrors the NIP-USR010 batch-request pattern. 'REPLENISHMENT' is a new
// request_type convention on stock_request; the schema accepts it without
// migration since there's no CHECK on request_type.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status')?.toUpperCase()

  // Base rows — RLS already scopes RHM to own barangay and PHN to own RHU.
  let q = supabase.from('stock_request')
    .select(`
      stock_request_id, request_type, request_date, requested_quantity,
      status, reason, remarks, approved_at, requested_by, approved_by,
      item_id, target_barangay_id,
      item:item(item_id, item_name, unit),
      target_barangay:barangay!fk_stock_request_target_barangay(barangay_id, barangay_name)
    `)
    .eq('request_type', 'REPLENISHMENT')
    .order('request_date', { ascending: false })

  if (status && ['PENDING','APPROVED','REJECTED','COMPLETED'].includes(status)) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with requester/approver emails via a batched lookup — PostgREST
  // can't resolve the users FKs here without extra schema cache help.
  const ids = Array.from(new Set([
    ...(data ?? []).map((r) => r.requested_by),
    ...(data ?? []).map((r) => r.approved_by),
  ].filter((id): id is string => !!id)))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMap = new Map<string, any>()
  if (ids.length) {
    const u = await supabase.from('users').select('user_id, full_name, email').in('user_id', ids)
    for (const row of u.data ?? []) userMap.set(row.user_id, row)
  }

  const rows = (data ?? []).map((r) => ({
    ...r,
    requester: r.requested_by ? userMap.get(r.requested_by) ?? null : null,
    approver: r.approved_by ? userMap.get(r.approved_by) ?? null : null,
  }))

  return NextResponse.json({ requests: rows })
}

type Body = {
  item_id?: number | string
  barangay_id?: number | string
  quantity?: number | string
  remarks?: string
  request_id?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const itemId = Number(body.item_id)
  const barangayId = Number(body.barangay_id)
  const quantity = Number(body.quantity)
  const remarks = String(body.remarks ?? '').trim()
  const requestId = String(body.request_id ?? '').trim()

  if (!Number.isSafeInteger(itemId) || itemId <= 0) return NextResponse.json({ error: 'item_id is required.' }, { status: 400 })
  if (!Number.isSafeInteger(barangayId) || barangayId <= 0) return NextResponse.json({ error: 'barangay_id is required.' }, { status: 400 })
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'quantity must be positive.' }, { status: 400 })
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: 'request_id (UUID) is required.' }, { status: 400 })

  const { data, error } = await supabase.rpc('inv_create_replenishment', {
    p_item_id: itemId,
    p_barangay_id: barangayId,
    p_quantity: quantity,
    p_remarks: remarks || null,
    p_request_id: requestId,
  })

  if (error) {
    const code = error.code
    const status = code === '42501' ? 403 : code === '23505' ? 409 : code === '22023' ? 400 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(data ?? { ok: true }, { status: 201 })
}