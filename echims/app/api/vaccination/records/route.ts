import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-USR003 — Extended records backend.
// GET  /api/vaccination/records?q=juan&status=PENDING  → list records
// POST /api/vaccination/records                        → create a new record (PENDING)
//
// RLS does the barangay/RHU scoping. Role gating here mirrors the role matrix.

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

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
type Status = typeof VALID_STATUSES[number]

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in to view vaccination records.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'view')) {
    return invalid('You are not authorized to view vaccination records.', 403)
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const status = (url.searchParams.get('status') ?? '').toUpperCase()
  if (status && !VALID_STATUSES.includes(status as Status)) {
    return invalid(`status must be one of: ${VALID_STATUSES.join(', ')}`)
  }

  let query = supabase.from('vaccination_record')
    .select(`
      vaccination_record_id, vaccination_date, dose_number, batch_number,
      vaccination_site, remarks, created_at, schedule_id,
      status, approved_by, approved_at, review_remarks, client_request_id,
      child:child(child_id, first_name, middle_name, last_name, date_of_birth, barangay_id,
        barangay:barangay(barangay_id, barangay_name)),
      vaccine:vaccine(vaccine_id, vaccine_type, dose_volume, route, target_age,
        item:item(item_id, item_name)),
      recorder:health_worker!fk_vaccination_recorded_by(
        user_id,
        user:users!fk_health_worker_user(user_id, full_name)
      ),
      approver:users!fk_vaccination_approved_by(user_id, full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return invalid(`Unable to load vaccination records. ${error.message ?? ''}`.trim(), 500)

  const rows = (data ?? []).filter((row) => {
    if (!q) return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = Array.isArray(row.child) ? row.child[0] : row.child
    if (!c) return false
    const name = `${c.first_name ?? ''} ${c.middle_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
    return name.includes(q.toLowerCase())
  })

  return NextResponse.json({
    rows,
    can_create: canPerform(role, 'Vaccination', 'create'),
    can_review: canPerform(role, 'Vaccination', 'approve'),
    can_export: canPerform(role, 'Vaccination', 'export'),
    role,
  })
}

// --- POST: create a new vaccination record (PENDING) ---
type CreateBody = {
  child_id?: number
  vaccine_id?: number
  dose_number?: number
  vaccination_date?: string            // yyyy-mm-dd
  batch_number?: string | null
  vaccination_site?: string | null
  remarks?: string | null
  schedule_id?: number | null
  client_request_id?: string | null    // for offline idempotency
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before recording a vaccination.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'create')) {
    return invalid('You are not authorized to record vaccinations.', 403)
  }

  const body = await request.json().catch(() => null) as CreateBody | null
  if (!body) return invalid('Invalid request body.')

  // --- Validate inputs ---
  const childId = Number(body.child_id)
  if (!Number.isSafeInteger(childId) || childId <= 0) return invalid('child_id is required.')
  const vaccineId = Number(body.vaccine_id)
  if (!Number.isSafeInteger(vaccineId) || vaccineId <= 0) return invalid('vaccine_id is required.')
  const doseNumber = Number(body.dose_number)
  if (!Number.isSafeInteger(doseNumber) || doseNumber <= 0) return invalid('dose_number must be a positive integer.')
  const vaccinationDate = String(body.vaccination_date ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vaccinationDate)) return invalid('vaccination_date must be yyyy-mm-dd.')
  // Future date would be impossible for an administered shot
  if (new Date(vaccinationDate + 'T23:59:59') > new Date()) {
    return invalid('vaccination_date cannot be in the future — the shot was already given.')
  }

  // --- Rule-based check: dose vs child age ---
  const childRes = await supabase.from('child')
    .select('child_id, date_of_birth, barangay_id')
    .eq('child_id', childId).maybeSingle()
  if (childRes.error || !childRes.data) return invalid('Child not found or outside your scope.', 404)
  const dob = new Date(childRes.data.date_of_birth + 'T00:00:00')
  const vaxDate = new Date(vaccinationDate + 'T00:00:00')
  const ageDays = Math.floor((vaxDate.getTime() - dob.getTime()) / 86400000)
  if (ageDays < 0) return invalid('Vaccination date cannot be before the child was born.')

  // --- Idempotency: if client_request_id was already saved, return that row ---
  const requestId = body.client_request_id ? String(body.client_request_id).trim() : null
  if (requestId) {
    const existing = await supabase.from('vaccination_record')
      .select('vaccination_record_id, status')
      .eq('client_request_id', requestId)
      .maybeSingle()
    if (existing.data) {
      return NextResponse.json({
        vaccination_record_id: existing.data.vaccination_record_id,
        status: existing.data.status,
        idempotent: true,
      })
    }
  }

  // --- Duplicate dose check (also enforced by partial unique index) ---
  const dup = await supabase.from('vaccination_record')
    .select('vaccination_record_id, status')
    .eq('child_id', childId)
    .eq('vaccine_id', vaccineId)
    .eq('dose_number', doseNumber)
    .in('status', ['PENDING', 'APPROVED'])
    .maybeSingle()
  if (dup.data) {
    return invalid(`Dose ${doseNumber} of this vaccine is already ${dup.data.status.toLowerCase()} for this child.`, 409)
  }

  // --- Insert PENDING record ---
  const insertRes = await supabase.from('vaccination_record')
    .insert({
      child_id: childId,
      vaccine_id: vaccineId,
      dose_number: doseNumber,
      vaccination_date: vaccinationDate,
      batch_number: body.batch_number?.trim() || null,
      vaccination_site: body.vaccination_site?.trim() || null,
      remarks: body.remarks?.trim() || null,
      schedule_id: body.schedule_id && Number(body.schedule_id) > 0 ? Number(body.schedule_id) : null,
      recorded_by: user.id,
      status: 'PENDING',
      client_request_id: requestId,
    })
    .select('vaccination_record_id, status')
    .maybeSingle()

  if (insertRes.error) {
    const code = insertRes.error.code
    // 23505 = unique_violation (likely race with partial unique index)
    if (code === '23505') {
      return invalid(`Dose ${doseNumber} already recorded for this child + vaccine.`, 409)
    }
    if (code === '42501') {
      return invalid('Your account is not authorized to record for this child\'s barangay.', 403)
    }
    return invalid(`Unable to save the record. [${code ?? 'unknown'}] ${insertRes.error.message ?? ''}`.trim(), 500)
  }
  if (!insertRes.data) return invalid('Record was not saved.', 500)

  return NextResponse.json({
    vaccination_record_id: insertRes.data.vaccination_record_id,
    status: insertRes.data.status,
  })
}