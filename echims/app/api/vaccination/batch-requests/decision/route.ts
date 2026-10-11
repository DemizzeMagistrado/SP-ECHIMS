// NIP-USR010 — PHN approve/reject a vaccine batch request.
// POST /api/vaccination/batch-requests/decision
//
// Body: { stock_request_id, decision: 'APPROVE' | 'REJECT', reason?: string }
//
// On APPROVE:
//   1. Update stock_request → status='APPROVED', approved_by, approved_at
//   2. Upsert inventory row for (item_id, target_barangay_id)
//   3. INCREMENT target barangay's inventory.quantity_on_hand by requested_quantity
//      (The vaccines physically arrive at that barangay, so from the barangay's
//      point of view this is a STOCK_IN event.)
//   4. INSERT inventory_transaction with transaction_type='STOCK_IN',
//      reference_number='SR-{stock_request_id}' — full audit trail.
//
// On REJECT:
//   1. Update stock_request → status='REJECTED', approved_by, approved_at
//   2. Save the reason text so RHM knows why
//   3. No inventory side-effects.
//
// Role gate: canPerform(role, 'Vaccine Batch Requests', 'approve') — Admin / PHN only.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator',
  'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any): Promise<UserRole | undefined> {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle()
  return roleAliases[String(data?.role ?? '').trim().toLowerCase()]
}

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

type Body = {
  stock_request_id?: number | string
  decision?: 'APPROVE' | 'REJECT' | string
  reason?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before reviewing a batch request.', 401)

  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccine Batch Requests', 'approve')) {
    return invalid('Only PHN or Admin can approve/reject batch requests.', 403)
  }

  const body = await request.json().catch(() => null) as Body | null
  if (!body) return invalid('Invalid request body.')

  const stockRequestId = Number(body.stock_request_id)
  if (!Number.isSafeInteger(stockRequestId) || stockRequestId <= 0) {
    return invalid('stock_request_id is required.')
  }

  const decision = String(body.decision ?? '').toUpperCase()
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    return invalid('decision must be APPROVE or REJECT.')
  }

  const reason = String(body.reason ?? '').trim()
  if (decision === 'REJECT' && !reason) {
    return invalid('A reason is required when rejecting a batch request.')
  }

  // Load the request. Must be PENDING, must be a VACCINE_BATCH.
  const existing = await supabase.from('stock_request')
    .select('stock_request_id, status, request_type, item_id, target_barangay_id, requested_quantity, batch_number')
    .eq('stock_request_id', stockRequestId)
    .maybeSingle()
  if (existing.error || !existing.data) {
    return invalid('Batch request not found or outside your scope.', 404)
  }
  if (existing.data.request_type !== 'VACCINE_BATCH') {
    return invalid('This endpoint only handles VACCINE_BATCH requests.', 400)
  }
  if (existing.data.status !== 'PENDING') {
    return invalid(`Request is already ${String(existing.data.status).toLowerCase()}.`, 409)
  }

  // ─── REJECT branch ─────────────────────────────────────────────────────
  if (decision === 'REJECT') {
    const upd = await supabase.from('stock_request')
      .update({
        status: 'REJECTED',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        reason: reason,
      })
      .eq('stock_request_id', stockRequestId)
      .eq('status', 'PENDING') // race-condition guard
      .select('stock_request_id')
      .maybeSingle()
    if (upd.error) return invalid(`Unable to reject. ${upd.error.message ?? ''}`.trim(), 500)
    if (!upd.data) return invalid('Request was already acted upon by someone else.', 409)
    return NextResponse.json({ stock_request_id: stockRequestId, status: 'REJECTED' })
  }

  // ─── APPROVE branch ────────────────────────────────────────────────────
  const itemId = existing.data.item_id
  const targetBarangayId = existing.data.target_barangay_id
  const qty = Number(existing.data.requested_quantity)
  const batchNumber = existing.data.batch_number

  if (!itemId || !targetBarangayId || !Number.isFinite(qty) || qty <= 0) {
    return invalid('This request is missing fields required for approval.', 400)
  }

  // 1. Flip the request to APPROVED first (optimistic). If anything downstream fails,
  //    we roll it back manually by writing status back to PENDING with a diagnostic.
  const upd = await supabase.from('stock_request')
    .update({
      status: 'APPROVED',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('stock_request_id', stockRequestId)
    .eq('status', 'PENDING')
    .select('stock_request_id')
    .maybeSingle()
  if (upd.error) return invalid(`Unable to approve. ${upd.error.message ?? ''}`.trim(), 500)
  if (!upd.data) return invalid('Request was already acted upon by someone else.', 409)

  // 2. Upsert the inventory row for (item_id, target_barangay_id).
  const existingInv = await supabase.from('inventory')
    .select('inventory_id, quantity_on_hand')
    .eq('item_id', itemId)
    .eq('barangay_id', targetBarangayId)
    .maybeSingle()

  let inventoryId: number
  if (existingInv.data) {
    inventoryId = existingInv.data.inventory_id
    const newQty = Number(existingInv.data.quantity_on_hand) + qty
    const incRes = await supabase.from('inventory')
      .update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() })
      .eq('inventory_id', inventoryId)
      .select('inventory_id')
      .maybeSingle()
    if (incRes.error) {
      // Attempt a rollback of the status flip so the request can be retried.
      await supabase.from('stock_request')
        .update({ status: 'PENDING', approved_by: null, approved_at: null })
        .eq('stock_request_id', stockRequestId)
      return invalid(`Approved but inventory update failed. ${incRes.error.message ?? ''}`.trim(), 500)
    }
  } else {
    const newInv = await supabase.from('inventory')
      .insert({ item_id: itemId, barangay_id: targetBarangayId, quantity_on_hand: qty })
      .select('inventory_id')
      .maybeSingle()
    if (newInv.error || !newInv.data) {
      await supabase.from('stock_request')
        .update({ status: 'PENDING', approved_by: null, approved_at: null })
        .eq('stock_request_id', stockRequestId)
      return invalid(`Approved but could not create inventory row. ${newInv.error?.message ?? ''}`.trim(), 500)
    }
    inventoryId = newInv.data.inventory_id
  }

  // 3. Record the transaction as STOCK_IN for the receiving barangay.
  //    reference_number uses the SR-{id} convention so audits can trace it back.
  const txnRes = await supabase.from('inventory_transaction')
    .insert({
      transaction_type: 'STOCK_IN',
      quantity: qty,
      inventory_id: inventoryId,
      performed_by: user.id,
      reference_number: `SR-${stockRequestId}`,
      remarks: `Vaccine batch ${batchNumber} approved via stock request #${stockRequestId}.`,
    })
    .select('transaction_id')
    .maybeSingle()
  if (txnRes.error) {
    // Don't rollback here — the inventory and request state are consistent;
    // the transaction log is best-effort. Surface the warning in the response.
    return NextResponse.json({
      stock_request_id: stockRequestId,
      status: 'APPROVED',
      inventory_id: inventoryId,
      warning: `Approved and inventory updated, but the audit log entry could not be created: ${txnRes.error.message ?? 'unknown'}`,
    })
  }

  return NextResponse.json({
    stock_request_id: stockRequestId,
    status: 'APPROVED',
    inventory_id: inventoryId,
    transaction_id: txnRes.data?.transaction_id,
  })
}