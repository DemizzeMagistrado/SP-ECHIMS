// INV-USR001 — Record Stock-In.
// POST /api/inventory/stock-in
//
// Thin wrapper around the existing inv_receive_stock DB function. All business
// logic (PHN-only guard, validation, idempotency, atomic batch + aggregate +
// transaction + alert evaluation) lives in SQL. We just translate the HTTP
// body + response.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Body = {
  item_id?: number | string
  barangay_id?: number | string
  batch_number?: string
  expiry_date?: string
  received_date?: string
  quantity?: number | string
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
  const batchNumber = String(body.batch_number ?? '').trim()
  const expiryDate = String(body.expiry_date ?? '').trim()
  const receivedDate = String(body.received_date ?? '').trim()
  const requestId = String(body.request_id ?? '').trim()

  if (!Number.isSafeInteger(itemId) || itemId <= 0) return NextResponse.json({ error: 'item_id is required.' }, { status: 400 })
  if (!Number.isSafeInteger(barangayId) || barangayId <= 0) return NextResponse.json({ error: 'barangay_id is required.' }, { status: 400 })
  if (!batchNumber) return NextResponse.json({ error: 'batch_number is required.' }, { status: 400 })
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'quantity must be positive.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return NextResponse.json({ error: 'expiry_date must be yyyy-mm-dd.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return NextResponse.json({ error: 'received_date must be yyyy-mm-dd.' }, { status: 400 })
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: 'request_id (UUID) is required.' }, { status: 400 })

  const { data, error } = await supabase.rpc('inv_receive_stock', {
    p_item_id: itemId,
    p_barangay_id: barangayId,
    p_batch_number: batchNumber,
    p_expiry_date: expiryDate,
    p_received_date: receivedDate,
    p_quantity: quantity,
    p_request_id: requestId,
  })

  if (error) {
    const code = error.code
    const status = code === '42501' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : code === '22023' ? 400 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json(data ?? { ok: true }, { status: 201 })
}
