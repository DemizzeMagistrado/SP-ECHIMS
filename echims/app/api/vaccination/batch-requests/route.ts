// NIP-USR010 — Vaccine batch requests.
// GET  /api/vaccination/batch-requests  → list requests (role-scoped)
// POST /api/vaccination/batch-requests  → RHM creates a request (status=PENDING)
//
// Role matrix (checked both server-side here AND by Supabase RLS):
//   Admin : view + create + approve (sees everything)
//   PHN   : view + approve           (sees everything in their RHU, approves them)
//   RHM   : view + create            (sees + creates their own requests)
//   BHW   : no access per ACCTO Client scope (this is specifically an RHM→PHN flow)
//   BNS   : no access

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

// ─── GET: list vaccine batch requests ──────────────────────────────────────
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before viewing batch requests.', 401)

  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccine Batch Requests', 'view')) {
    return invalid('You are not authorized to view batch requests.', 403)
  }

  // Optional ?status=PENDING filter for the inbox view.
  const url = new URL(request.url)
  const statusFilter = url.searchParams.get('status')?.toUpperCase()

  let query = supabase.from('stock_request')
    .select(`
      stock_request_id, request_type, request_date, requested_quantity,
      status, reason, remarks, batch_number, target_barangay_id,
      approved_at, requested_by, approved_by, item_id,
      item:item(item_id, item_name, unit),
      vaccine:vaccine!stock_request_item_id_fkey(vaccine_id, vaccine_type, dose_volume, route),
      target_barangay:barangay!fk_stock_request_target_barangay(barangay_id, barangay_name),
      requester:health_worker!fk_stock_request_requested_by(user_id, user:users!fk_health_worker_user(email)),
      approver:health_worker!fk_stock_request_approved_by(user_id, user:users!fk_health_worker_user(email))
    `)
    .eq('request_type', 'VACCINE_BATCH')
    .order('request_date', { ascending: false })

  if (statusFilter && ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(statusFilter)) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) return invalid(`Unable to load batch requests. ${error.message ?? ''}`.trim(), 500)

  return NextResponse.json({
    requests: data ?? [],
    role,
    can_create: canPerform(role, 'Vaccine Batch Requests', 'create'),
    can_approve: canPerform(role, 'Vaccine Batch Requests', 'approve'),
  })
}

// ─── POST: RHM creates a batch request ─────────────────────────────────────
type CreateBody = {
  vaccine_id?: number | string
  requested_quantity?: number | string
  batch_number?: string
  target_barangay_id?: number | string
  remarks?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before creating a batch request.', 401)

  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccine Batch Requests', 'create')) {
    return invalid('You are not authorized to create batch requests.', 403)
  }

  const body = await request.json().catch(() => null) as CreateBody | null
  if (!body) return invalid('Invalid request body.')

  // Validate fields.
  const vaccineId = Number(body.vaccine_id)
  if (!Number.isSafeInteger(vaccineId) || vaccineId <= 0) return invalid('vaccine_id is required.')

  const qty = Number(body.requested_quantity)
  if (!Number.isFinite(qty) || qty <= 0) return invalid('requested_quantity must be a positive number.')

  const batchNumber = String(body.batch_number ?? '').trim()
  if (!batchNumber) return invalid('batch_number is required for vaccine batch requests.')

  const targetBarangayId = Number(body.target_barangay_id)
  if (!Number.isSafeInteger(targetBarangayId) || targetBarangayId <= 0) {
    return invalid('target_barangay_id is required.')
  }

  // Confirm the vaccine exists AND the target barangay is reachable to the requester (RLS).
  const vaccineRow = await supabase.from('vaccine')
    .select('vaccine_id, vaccine_type')
    .eq('vaccine_id', vaccineId)
    .maybeSingle()
  if (vaccineRow.error || !vaccineRow.data) return invalid('Vaccine not found.', 404)

  const barangayRow = await supabase.from('barangay')
    .select('barangay_id, barangay_name')
    .eq('barangay_id', targetBarangayId)
    .maybeSingle()
  if (barangayRow.error || !barangayRow.data) {
    return invalid('Target barangay not found or outside your scope.', 404)
  }

  // Insert as PENDING. item_id = vaccine_id (vaccines share PK with items).
  const insertRes = await supabase.from('stock_request')
    .insert({
      request_type: 'VACCINE_BATCH',
      request_date: new Date().toISOString().slice(0, 10),
      requested_quantity: qty,
      status: 'PENDING',
      remarks: body.remarks?.trim() || null,
      batch_number: batchNumber,
      target_barangay_id: targetBarangayId,
      requested_by: user.id,
      item_id: vaccineId,
    })
    .select('stock_request_id, status')
    .maybeSingle()

  if (insertRes.error) {
    const code = insertRes.error.code
    if (code === '42501') return invalid('Not authorized to request for this scope.', 403)
    return invalid(`Unable to save the request. [${code ?? 'unknown'}] ${insertRes.error.message ?? ''}`.trim(), 500)
  }
  if (!insertRes.data) return invalid('Request was not saved.', 500)

  return NextResponse.json({
    stock_request_id: insertRes.data.stock_request_id,
    status: insertRes.data.status,
  }, { status: 201 })
}