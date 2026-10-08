import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type UserRole } from '@/lib/echims-data'

// NIP-USR006 — Vaccine catalog admin API.
// GET    /api/vaccines/catalog              → list all vaccines + schedule rules + status + last-change
// POST   /api/vaccines/catalog              → create a new vaccine (admin only)
// PATCH  /api/vaccines/catalog              → update vaccine_id in body (admin only, flat per preference)
//
// Separate endpoint for activate/deactivate at /api/vaccines/catalog/toggle (same folder).
// All writes are logged to vaccine_audit_log automatically.

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

function parseId(value: unknown): number | null {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

// --- GET: list vaccines with schedule rules + status + last audit entry ---
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in.', 401)
  const role = await trustedRole(supabase)
  // Catalog is readable by anyone authenticated (so pickers / displays can use it);
  // write actions below are admin-only. BNS still gets the catalog for context.
  if (!role) return invalid('Unknown role.', 403)

  const { data: vaccines, error } = await supabase.from('vaccine')
    .select(`
      vaccine_id, vaccine_type, dose_volume, route, target_age,
      min_age_days, interval_days, total_doses, updated_at,
      item:item(item_id, item_name, description, unit, status)
    `)
    .order('vaccine_id', { ascending: true })

  if (error) return invalid(`Unable to load catalog. ${error.message ?? ''}`.trim(), 500)

  // Attach the latest audit entry per vaccine for the "last change by" column
  const vaccineIds = (vaccines ?? []).map((v) => v.vaccine_id)
  const auditRes = vaccineIds.length
    ? await supabase.from('vaccine_audit_log')
        .select('audit_id, vaccine_id, action, changed_at, changed_by')
        .in('vaccine_id', vaccineIds)
        .order('changed_at', { ascending: false })
    : { data: [] }

  const latestByVaccine = new Map<number, unknown>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (auditRes.data ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    if (r.vaccine_id && !latestByVaccine.has(r.vaccine_id)) latestByVaccine.set(r.vaccine_id, r)
  }

  const rows = (vaccines ?? []).map((v) => ({ ...v, latest_change: latestByVaccine.get(v.vaccine_id) ?? null }))

  return NextResponse.json({
    vaccines: rows,
    can_edit: role === 'Administrator',
    role,
  })
}

// --- POST: create a new vaccine entry ---
type CreateBody = {
  item_name?: string
  description?: string | null
  unit?: string
  vaccine_type?: string
  dose_volume?: string | null
  route?: string | null
  target_age?: string | null
  min_age_days?: number
  interval_days?: number | null
  total_doses?: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in.', 401)
  const role = await trustedRole(supabase)
  if (role !== 'Administrator') return invalid('Only administrators can create vaccine entries.', 403)

  const body = await request.json().catch(() => null) as CreateBody | null
  if (!body) return invalid('Invalid request body.')

  const itemName = String(body.item_name ?? '').trim()
  const vaccineType = String(body.vaccine_type ?? '').trim().toUpperCase()
  if (!itemName) return invalid('item_name is required.')
  if (!vaccineType) return invalid('vaccine_type is required (short code like BCG, PENTA).')
  if (vaccineType.length > 32) return invalid('vaccine_type must be ≤ 32 characters.')

  const minAgeDays = Number(body.min_age_days ?? 0)
  const totalDoses = Number(body.total_doses ?? 1)
  const intervalDays = body.interval_days == null ? null : Number(body.interval_days)
  if (!Number.isSafeInteger(minAgeDays) || minAgeDays < 0) return invalid('min_age_days must be a non-negative integer.')
  if (!Number.isSafeInteger(totalDoses) || totalDoses < 1 || totalDoses > 10) return invalid('total_doses must be 1-10.')
  if (intervalDays != null && (!Number.isSafeInteger(intervalDays) || intervalDays <= 0)) {
    return invalid('interval_days must be a positive integer or null.')
  }
  if (totalDoses > 1 && intervalDays == null) {
    return invalid('interval_days is required when total_doses > 1.')
  }

  // Phase A: create item (vaccine.vaccine_id FKs to item.item_id)
  const itemRes = await supabase.from('item')
    .insert({
      item_name: itemName,
      description: body.description?.trim() || null,
      unit: body.unit?.trim() || 'dose',
      status: 'ACTIVE',
    })
    .select('item_id')
    .maybeSingle()
  if (itemRes.error || !itemRes.data) {
    return invalid(`Unable to create item. ${itemRes.error?.message ?? ''}`.trim(), 500)
  }
  const newVaccineId = itemRes.data.item_id

  // Phase B: create vaccine
  const vaccineRes = await supabase.from('vaccine')
    .insert({
      vaccine_id: newVaccineId,
      vaccine_type: vaccineType,
      dose_volume: body.dose_volume?.trim() || null,
      route: body.route?.trim() || null,
      target_age: body.target_age?.trim() || null,
      min_age_days: minAgeDays,
      interval_days: intervalDays,
      total_doses: totalDoses,
    })
    .select('*')
    .maybeSingle()
  if (vaccineRes.error || !vaccineRes.data) {
    // Roll back item on failure to avoid orphan
    await supabase.from('item').delete().eq('item_id', newVaccineId)
    return invalid(`Unable to create vaccine. ${vaccineRes.error?.message ?? ''}`.trim(), 500)
  }

  await supabase.from('vaccine_audit_log').insert({
    vaccine_id: newVaccineId,
    action: 'CREATE',
    changed_by: user.id,
    after_values: vaccineRes.data,
  })

  return NextResponse.json({ vaccine_id: newVaccineId, vaccine: vaccineRes.data })
}

// --- PATCH: update an existing vaccine (admin only, vaccine_id in body) ---
// Also handles activate/deactivate — pass { vaccine_id, is_active: boolean } alone
// (no other fields) and the handler logs it as DEACTIVATE / REACTIVATE in the audit.
// Mixed patches (is_active + other fields in one body) are allowed and logged as UPDATE.
type UpdateBody = Partial<CreateBody> & { vaccine_id?: number; is_active?: boolean }

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in.', 401)
  const role = await trustedRole(supabase)
  if (role !== 'Administrator') return invalid('Only administrators can edit vaccine entries.', 403)

  const body = await request.json().catch(() => null) as UpdateBody | null
  if (!body) return invalid('Invalid request body.')
  const vaccineId = parseId(body.vaccine_id)
  if (!vaccineId) return invalid('vaccine_id is required.')

  // Load current state (for audit before/after)
  const beforeRes = await supabase.from('vaccine')
    .select('*, item:item(item_name, description, unit, status)')
    .eq('vaccine_id', vaccineId)
    .maybeSingle()
  if (beforeRes.error || !beforeRes.data) return invalid('Vaccine not found.', 404)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beforeItem: any = Array.isArray(beforeRes.data.item) ? beforeRes.data.item[0] : beforeRes.data.item

  // Build patches for vaccine + item separately
  const vaccinePatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.vaccine_type !== undefined) {
    const t = String(body.vaccine_type).trim().toUpperCase()
    if (!t) return invalid('vaccine_type cannot be empty.')
    vaccinePatch.vaccine_type = t
  }
  if (body.dose_volume !== undefined) vaccinePatch.dose_volume = (body.dose_volume ?? '').toString().trim() || null
  if (body.route !== undefined) vaccinePatch.route = (body.route ?? '').toString().trim() || null
  if (body.target_age !== undefined) vaccinePatch.target_age = (body.target_age ?? '').toString().trim() || null
  if (body.min_age_days !== undefined) {
    const n = Number(body.min_age_days)
    if (!Number.isSafeInteger(n) || n < 0) return invalid('min_age_days must be a non-negative integer.')
    vaccinePatch.min_age_days = n
  }
  if (body.interval_days !== undefined) {
    if (body.interval_days === null) vaccinePatch.interval_days = null
    else {
      const n = Number(body.interval_days)
      if (!Number.isSafeInteger(n) || n <= 0) return invalid('interval_days must be a positive integer or null.')
      vaccinePatch.interval_days = n
    }
  }
  if (body.total_doses !== undefined) {
    const n = Number(body.total_doses)
    if (!Number.isSafeInteger(n) || n < 1 || n > 10) return invalid('total_doses must be 1-10.')
    vaccinePatch.total_doses = n
  }

  // Cross-field: total_doses > 1 requires interval_days
  const resolvedTotal = (vaccinePatch.total_doses ?? beforeRes.data.total_doses) as number
  const resolvedInterval = ('interval_days' in vaccinePatch ? vaccinePatch.interval_days : beforeRes.data.interval_days) as number | null
  if (resolvedTotal > 1 && resolvedInterval == null) {
    return invalid('interval_days is required when total_doses > 1.')
  }

  const itemPatch: Record<string, unknown> = {}
  if (body.item_name !== undefined) {
    const n = String(body.item_name).trim()
    if (!n) return invalid('item_name cannot be empty.')
    itemPatch.item_name = n
  }
  if (body.description !== undefined) itemPatch.description = (body.description ?? '').toString().trim() || null
  if (body.unit !== undefined) itemPatch.unit = (body.unit ?? '').toString().trim() || 'dose'
  // Status toggle lives on item.status — handled here so there's no separate endpoint
  let statusChange: 'ACTIVATE' | 'DEACTIVATE' | null = null
  if (typeof body.is_active === 'boolean') {
    const newStatus = body.is_active ? 'ACTIVE' : 'INACTIVE'
    if (newStatus !== beforeItem?.status) {
      itemPatch.status = newStatus
      statusChange = body.is_active ? 'ACTIVATE' : 'DEACTIVATE'
    }
  }

  // Nothing to update?
  const hasVaccineChanges = Object.keys(vaccinePatch).some((k) => k !== 'updated_at')
  const hasItemChanges = Object.keys(itemPatch).length > 0
  if (!hasVaccineChanges && !hasItemChanges) {
    return invalid('Nothing to update.')
  }

  // Apply updates
  if (hasItemChanges) {
    const u = await supabase.from('item').update(itemPatch).eq('item_id', vaccineId)
    if (u.error) return invalid(`Unable to update item. ${u.error.message ?? ''}`.trim(), 500)
  }
  const vacUpd = await supabase.from('vaccine')
    .update(vaccinePatch)
    .eq('vaccine_id', vaccineId)
    .select('*, item:item(item_name, description, unit, status)')
    .maybeSingle()
  if (vacUpd.error) return invalid(`Unable to update vaccine. ${vacUpd.error.message ?? ''}`.trim(), 500)

  // Pick the audit action: pure toggle → DEACTIVATE/REACTIVATE; everything else → UPDATE
  const auditAction = statusChange && !hasVaccineChanges && Object.keys(itemPatch).length === 1
    ? (statusChange === 'DEACTIVATE' ? 'DEACTIVATE' : 'REACTIVATE')
    : 'UPDATE'

  await supabase.from('vaccine_audit_log').insert({
    vaccine_id: vaccineId,
    action: auditAction,
    changed_by: user.id,
    before_values: beforeRes.data,
    after_values: vacUpd.data,
  })

  return NextResponse.json({ vaccine_id: vaccineId, vaccine: vacUpd.data })
}