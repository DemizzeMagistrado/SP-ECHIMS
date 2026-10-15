// INV-USR004 — Log stock usage or waste.
// POST /api/inventory/usage
//
// Body: { source_batch_id, quantity, subtype: 'USAGE'|'WASTE', reason?, request_id }
// Thin wrapper over inv_log_usage; all enforcement (RHM-only, assigned
// barangay, quantity guard, idempotency) lives in SQL.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Body = {
  source_batch_id?: number | string
  quantity?: number | string
  subtype?: 'USAGE' | 'WASTE' | string
  reason?: string
  request_id?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const batchId = Number(body.source_batch_id)
  const quantity = Number(body.quantity)
  const subtype = String(body.subtype ?? '').toUpperCase()
  const reason = String(body.reason ?? '').trim()
  const requestId = String(body.request_id ?? '').trim()

  if (!Number.isSafeInteger(batchId) || batchId <= 0) return NextResponse.json({ error: 'source_batch_id is required.' }, { status: 400 })
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'quantity must be positive.' }, { status: 400 })
  if (subtype !== 'USAGE' && subtype !== 'WASTE') return NextResponse.json({ error: 'subtype must be USAGE or WASTE.' }, { status: 400 })
  if (subtype === 'WASTE' && !reason) return NextResponse.json({ error: 'A reason is required when logging waste.' }, { status: 400 })
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: 'request_id (UUID) is required.' }, { status: 400 })

  const { data, error } = await supabase.rpc('inv_log_usage', {
    p_source_batch_id: batchId,
    p_quantity: quantity,
    p_subtype: subtype,
    p_reason: reason || null,
    p_request_id: requestId,
  })

  if (error) {
    const code = error.code
    const status = code === '42501' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : code === '22023' ? 400 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(data ?? { ok: true }, { status: 201 })
}
