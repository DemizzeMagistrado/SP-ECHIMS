// INV-USR003 — Allocate stock from one barangay to another.
// POST /api/inventory/allocate
//
// Wrapper for inv_allocate_stock. Idempotent via request_id. Returns both
// updated inventories so the UI can reflect the move without re-fetching.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Body = {
  source_batch_id?: number | string
  target_barangay_id?: number | string
  quantity?: number | string
  request_id?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const sourceBatchId = Number(body.source_batch_id)
  const targetBarangayId = Number(body.target_barangay_id)
  const quantity = Number(body.quantity)
  const requestId = String(body.request_id ?? '').trim()

  if (!Number.isSafeInteger(sourceBatchId) || sourceBatchId <= 0) return NextResponse.json({ error: 'source_batch_id is required.' }, { status: 400 })
  if (!Number.isSafeInteger(targetBarangayId) || targetBarangayId <= 0) return NextResponse.json({ error: 'target_barangay_id is required.' }, { status: 400 })
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'quantity must be positive.' }, { status: 400 })
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: 'request_id (UUID) is required.' }, { status: 400 })

  const { data, error } = await supabase.rpc('inv_allocate_stock', {
    p_source_batch_id: sourceBatchId,
    p_target_barangay_id: targetBarangayId,
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
