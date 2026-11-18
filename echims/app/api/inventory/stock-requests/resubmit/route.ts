// INV-REV01 — the requester edits a stock request the PHN returned for revision and resubmits it.
// POST /api/inventory/stock-requests/resubmit
// Body: { stock_request_id, quantity, remarks?, batch_number? (vaccine batch requests) }
// Works for replenishment, vaccine batch and supplement batch requests; the RPC checks the
// caller made the request and that it is NEEDS_REVISION, then sets it back to PENDING.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Body = {
  stock_request_id?: number | string
  quantity?: number | string
  remarks?: string | null
  batch_number?: string | null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const id = Number(body.stock_request_id)
  const quantity = Number(body.quantity)
  const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : ''
  const batchNumber = typeof body.batch_number === 'string' ? body.batch_number.trim() : ''

  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'stock_request_id is required.' }, { status: 400 })
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) return NextResponse.json({ error: 'Enter a whole quantity between 1 and 1,000,000.' }, { status: 400 })
  if (remarks.length > 2000) return NextResponse.json({ error: 'Remarks may be up to 2000 characters.' }, { status: 400 })

  const { data, error } = await supabase.rpc('inv_resubmit_stock_request', {
    p_stock_request_id: id,
    p_quantity: quantity,
    p_remarks: remarks || null,
    p_batch_number: batchNumber || null,
  })

  if (error) {
    const code = error.code
    const status = code === '42501' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : code === '22023' ? 400 : 500
    if (status === 500) console.error('Resubmit stock request:', error)
    return NextResponse.json({ error: status === 500 ? 'Unable to resubmit this request.' : error.message }, { status })
  }
  return NextResponse.json({ ...(data ?? {}), message: 'Request resubmitted for PHN review.' })
}
