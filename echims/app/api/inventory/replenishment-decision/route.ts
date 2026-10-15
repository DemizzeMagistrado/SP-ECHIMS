// INV-USR005 — PHN decides on a replenishment request.
// POST /api/inventory/replenishment-decision
//
// Flat route (no [param] folder) per the project preference; the request id
// comes in the body. 'APPROVE' simply flips status + records approver; a
// follow-up allocation (USR003) can be linked back by passing the request_id
// as p_source_stock_request_id to inv_allocate_stock.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Body = {
  stock_request_id?: number | string
  decision?: 'APPROVE' | 'REJECT' | string
  reason?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const id = Number(body.stock_request_id)
  const decision = String(body.decision ?? '').toUpperCase()
  const reason = String(body.reason ?? '').trim()

  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'stock_request_id is required.' }, { status: 400 })
  if (decision !== 'APPROVE' && decision !== 'REJECT') return NextResponse.json({ error: 'decision must be APPROVE or REJECT.' }, { status: 400 })
  if (decision === 'REJECT' && !reason) return NextResponse.json({ error: 'reason is required when rejecting.' }, { status: 400 })

  const { data, error } = await supabase.rpc('inv_decide_replenishment', {
    p_stock_request_id: id,
    p_decision: decision,
    p_reason: reason || null,
  })

  if (error) {
    const code = error.code
    const status = code === '42501' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : code === '22023' ? 400 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(data ?? { ok: true })
}
