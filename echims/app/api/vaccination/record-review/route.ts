import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/echims-data'

// NIP-USR003 — Approve / reject an administered-vaccination record.
// POST /api/vaccination/record-review
// Body: { record_id: number, action: 'APPROVE' | 'REJECT', review_remarks?: string }
//
// Only PHN or Admin can review. RHM records but does not approve.
// APPROVE is atomic in Supabase: vaccine batch, aggregate inventory,
// inventory transaction, and vaccination approval are committed together.

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator',
  admin: 'Administrator',
  'public health nurse': 'Public Health Nurse',
  phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker',
  bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife',
  rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar',
  bns: 'Barangay Nutrition Scholar',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any): Promise<UserRole | undefined> {
  const { data, error } = await supabase.rpc('get_my_profile').maybeSingle()

  if (error) return undefined

  return roleAliases[String(data?.role ?? '').trim().toLowerCase()]
}

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function parseId(value: unknown) {
  const n = Number(value)

  return Number.isSafeInteger(n) && n > 0 ? n : null
}

type ReviewBody = {
  record_id?: number
  action?: string
  review_remarks?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return invalid('Please sign in before reviewing a record.', 401)
  }

  const role = await trustedRole(supabase)

  if (role !== 'Public Health Nurse' && role !== 'Administrator') {
    return invalid(
      'Only Public Health Nurses or Administrators can review vaccination records.',
      403,
    )
  }

  const body = (await request.json().catch(() => null)) as ReviewBody | null

  const recordId = parseId(body?.record_id)

  if (!recordId) {
    return invalid('A valid record_id is required.')
  }

  const action = String(body?.action ?? '')
    .trim()
    .toUpperCase()

  if (action !== 'APPROVE' && action !== 'REJECT') {
    return invalid('action must be APPROVE or REJECT.')
  }

  const reviewRemarks = body?.review_remarks?.trim() || null

  if (action === 'REJECT' && !reviewRemarks) {
    return invalid('A reason is required when rejecting a record.')
  }

  const result = await supabase.rpc('msp_review_vaccination_record', {
    p_record_id: recordId,
    p_action: action,
    p_review_remarks: reviewRemarks,
  })

  if (result.error) {
    const code = result.error.code

    const statusByCode: Record<string, number> = {
      '42501': 403,
      P0002: 404,
      '22023': 400,
      '23505': 409,
      '23514': 409,
    }

    const status = statusByCode[code] ?? 500

    if (status === 500) {
      console.error('Vaccination review RPC failed:', result.error)
    }

    return invalid(
      result.error.message || 'Unable to review vaccination record.',
      status,
    )
  }

  const data = result.data as {
    vaccination_record_id?: number
    status?: string
    review_remarks?: string | null
    stock_deducted?: boolean
    inventory_batch_id?: number
    inventory_transaction_id?: number
  } | null

  return NextResponse.json({
    vaccination_record_id: data?.vaccination_record_id ?? recordId,
    status: data?.status ?? action,
    review_remarks: data?.review_remarks ?? reviewRemarks,
    stock_deducted: data?.stock_deducted ?? false,
    inventory_batch_id: data?.inventory_batch_id ?? null,
    inventory_transaction_id: data?.inventory_transaction_id ?? null,
  })
}