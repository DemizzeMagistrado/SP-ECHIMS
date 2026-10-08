import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-USR003 — Approve / reject an administered-vaccination record.
// POST /api/vaccination/record-review
// Body: { record_id: number, action: 'APPROVE' | 'REJECT', review_remarks?: string }
//
// Flat route (no [recordId] folder). record_id lives in the body.
// Only PHN or Admin can review. RHM records but does not approve (per manuscript).
// On APPROVE: soft-deduct stock from the child's barangay inventory.

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

function parseId(value: unknown) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

type ReviewBody = { record_id?: number; action?: string; review_remarks?: string }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before reviewing a record.', 401)
  const role = await trustedRole(supabase)
  if (role !== 'Public Health Nurse' && role !== 'Administrator') {
    return invalid('Only Public Health Nurses or Administrators can review vaccination records.', 403)
  }

  const body = await request.json().catch(() => null) as ReviewBody | null
  const recordId = parseId(body?.record_id)
  if (!recordId) return invalid('A valid record_id is required.')
  const action = String(body?.action ?? '').trim().toUpperCase()
  if (action !== 'APPROVE' && action !== 'REJECT') return invalid('action must be APPROVE or REJECT.')
  const reviewRemarks = body?.review_remarks?.trim() || null
  if (action === 'REJECT' && !reviewRemarks) {
    return invalid('A reason is required when rejecting a record.')
  }

  // Fetch the record + child barangay (RLS blocks if out of RHU scope)
  const existing = await supabase.from('vaccination_record')
    .select(`
      vaccination_record_id, status, child_id, vaccine_id, dose_number,
      child:child(child_id, barangay_id)
    `)
    .eq('vaccination_record_id', recordId)
    .maybeSingle()
  if (existing.error || !existing.data) return invalid('Record not found or outside your scope.', 404)
  if (existing.data.status !== 'PENDING') {
    return invalid(`This record is already ${existing.data.status.toLowerCase()}.`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child: any = Array.isArray(existing.data.child) ? existing.data.child[0] : existing.data.child
  const barangayId = child?.barangay_id as number | undefined

  const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  let finalRemarks = reviewRemarks

  // Stock deduction on APPROVE (soft fail — never blocks approval)
  if (action === 'APPROVE' && barangayId) {
    const stockResult = await deductStock(supabase, {
      barangayId,
      vaccineId: existing.data.vaccine_id,
      recordId,
      performedBy: user.id,
    })
    if (stockResult.note) {
      finalRemarks = finalRemarks
        ? `${finalRemarks}\n\n[Stock] ${stockResult.note}`
        : `[Stock] ${stockResult.note}`
    }
  }

  const updateRes = await supabase.from('vaccination_record')
    .update({
      status: newStatus,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      review_remarks: finalRemarks,
    })
    .eq('vaccination_record_id', recordId)
    .select('vaccination_record_id, status, review_remarks')
    .maybeSingle()

  if (updateRes.error) {
    const code = updateRes.error.code
    if (code === '42501') return invalid('Not authorized to update this record.', 403)
    return invalid(`Unable to update record. [${code ?? 'unknown'}] ${updateRes.error.message ?? ''}`.trim(), 500)
  }
  if (!updateRes.data) return invalid('Record was not updated.', 403)

  return NextResponse.json({
    vaccination_record_id: updateRes.data.vaccination_record_id,
    status: updateRes.data.status,
    review_remarks: updateRes.data.review_remarks,
  })
}

// --- Helper: deduct stock for the given barangay + vaccine ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deductStock(
  supabase: any,
  args: { barangayId: number; vaccineId: number; recordId: number; performedBy: string },
): Promise<{ note: string | null }> {
  const invRes = await supabase.from('inventory')
    .select('inventory_id, quantity_on_hand')
    .eq('barangay_id', args.barangayId)
    .eq('item_id', args.vaccineId)
    .maybeSingle()

  if (invRes.error || !invRes.data) {
    return { note: 'No inventory configured for this barangay + vaccine. Approval went through; please seed inventory to track stock going forward.' }
  }
  const onHand = Number(invRes.data.quantity_on_hand ?? 0)
  if (onHand <= 0) {
    return { note: 'Inventory shows 0 doses on hand for this barangay + vaccine. Approval went through; refill stock to resume tracking.' }
  }

  const updateInv = await supabase.from('inventory')
    .update({ quantity_on_hand: onHand - 1, updated_at: new Date().toISOString() })
    .eq('inventory_id', invRes.data.inventory_id)
  if (updateInv.error) {
    return { note: `Stock deduction skipped: ${updateInv.error.message ?? 'unknown error'}` }
  }

  await supabase.from('inventory_transaction').insert({
    inventory_id: invRes.data.inventory_id,
    transaction_type: 'STOCK_OUT',
    quantity: 1,
    reference_number: `vaccination_record:${args.recordId}`,
    remarks: `Dose administered — approved vaccination record ${args.recordId}`,
    performed_by: args.performedBy,
    transaction_date: new Date().toISOString(),
  })

  return { note: null }
}