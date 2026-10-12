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

  const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

  // Flip the record first so the atomic consume RPC can trust the APPROVED
  // state when it runs. For REJECT we just save the review remarks and exit.
  const updateRes = await supabase.from('vaccination_record')
    .update({
      status: newStatus,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      review_remarks: reviewRemarks,
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

  // NIP-USR013 — Stock movement is now a single atomic DB call that handles
  // batch balance, aggregate inventory, inventory_transaction logging, and
  // the alert evaluator (low-stock + near-expiry) in one transaction. The
  // RPC is a no-op for prior/historical records and short-circuits with a
  // human-readable note when inventory is missing or empty.
  let stockNote: string | null = null
  if (action === 'APPROVE') {
    const consume = await supabase.rpc('nip_consume_vaccine_dose', {
      p_record_id: recordId,
      p_performed_by: user.id,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = consume.data ?? null
    if (consume.error) {
      stockNote = `Stock update skipped: ${consume.error.message ?? 'unknown error'}`
    } else if (payload?.ok === false) {
      stockNote = `Stock update skipped: ${payload.error ?? 'unknown error'}`
    } else if (payload?.note) {
      stockNote = String(payload.note)
    }
  }

  // Append the stock note into review_remarks only when there's something
  // meaningful to tell the reviewer — keeps clean approvals noise-free.
  let finalRemarks = updateRes.data.review_remarks
  if (stockNote) {
    const combined = finalRemarks
      ? `${finalRemarks}\n\n[Stock] ${stockNote}`
      : `[Stock] ${stockNote}`
    const noteUpdate = await supabase.from('vaccination_record')
      .update({ review_remarks: combined })
      .eq('vaccination_record_id', recordId)
      .select('review_remarks')
      .maybeSingle()
    if (!noteUpdate.error && noteUpdate.data) {
      finalRemarks = noteUpdate.data.review_remarks
    }
  }

  return NextResponse.json({
    vaccination_record_id: updateRes.data.vaccination_record_id,
    status: updateRes.data.status,
    review_remarks: finalRemarks,
    stock_note: stockNote,
  })
}