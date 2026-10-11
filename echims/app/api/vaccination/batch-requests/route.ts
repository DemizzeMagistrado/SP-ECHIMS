// NIP-USR010 — Vaccine batch requests.
// GET  /api/vaccination/batch-requests  → list requests (role-scoped)
// POST /api/vaccination/batch-requests  → RHM creates a request (status=PENDING)
//
// v3: Minimizes PostgREST embeds — multiple joins through FKs that PostgREST's
// schema cache can't reliably resolve (stock_request ↔ vaccine via shared PK,
// stock_request ↔ health_worker via requested_by/approved_by). Instead we do
// a base SELECT with just the item embed, then batch-fetch everything else
// in parallel and splice client-side. One extra round-trip, but bulletproof.

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

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get('status')?.toUpperCase()

  // Step 1: Base rows + item (only reliable embed).
  let query = supabase.from('stock_request')
    .select(`
      stock_request_id, request_type, request_date, requested_quantity,
      status, reason, remarks, batch_number, target_barangay_id,
      approved_at, requested_by, approved_by, item_id,
      item:item(item_id, item_name, unit)
    `)
    .eq('request_type', 'VACCINE_BATCH')
    .order('request_date', { ascending: false })

  if (statusFilter && ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(statusFilter)) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) return invalid(`Unable to load batch requests. ${error.message ?? ''}`.trim(), 500)
  const rows = data ?? []

  // Step 2: Batch-fetch vaccine, barangay, and health_worker rows in parallel.
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id).filter((id): id is number => id != null)))
  const barangayIds = Array.from(new Set(rows.map((r) => r.target_barangay_id).filter((id): id is number => id != null)))
  const userIds = Array.from(new Set([
    ...rows.map((r) => r.requested_by),
    ...rows.map((r) => r.approved_by),
  ].filter((id): id is string => !!id)))

  const [vaxRes, brgyRes, hwRes] = await Promise.all([
    itemIds.length
      ? supabase.from('vaccine').select('vaccine_id, vaccine_type, dose_volume, route').in('vaccine_id', itemIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    barangayIds.length
      ? supabase.from('barangay').select('barangay_id, barangay_name').in('barangay_id', barangayIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    userIds.length
      ? supabase.from('users').select('id, email').in('id', userIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])

  // Build lookup maps. Errors on the lookup queries are non-fatal — we still
  // return the base rows and the UI shows "—" for the missing fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vaccineById = new Map<number, any>()
  for (const v of (vaxRes.data ?? []) as Array<{ vaccine_id: number }>) vaccineById.set(v.vaccine_id, v)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barangayById = new Map<number, any>()
  for (const b of (brgyRes.data ?? []) as Array<{ barangay_id: number }>) barangayById.set(b.barangay_id, b)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userById = new Map<string, any>()
  for (const u of (hwRes.data ?? []) as Array<{ id: string }>) userById.set(u.id, u)

  // Step 3: Splice everything back into each row in the shape the UI expects.
  const requests = rows.map((r) => ({
    ...r,
    vaccine: vaccineById.get(r.item_id) ?? null,
    target_barangay: r.target_barangay_id ? barangayById.get(r.target_barangay_id) ?? null : null,
    requester: r.requested_by ? { user_id: r.requested_by, user: userById.get(r.requested_by) ?? null } : null,
    approver: r.approved_by ? { user_id: r.approved_by, user: userById.get(r.approved_by) ?? null } : null,
  }))

  return NextResponse.json({
    requests,
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