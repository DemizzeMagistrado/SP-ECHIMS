import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-USR003 — Edit an administered-vaccination record (while still PENDING).
// PATCH /api/vaccination/record-edit
// Body: { record_id: number, vaccination_date?, batch_number?, vaccination_site?, remarks? }
//
// Flat route (no [recordId] folder). record_id lives in the body.
// Only the recorder can edit their own PENDING. PHN/Admin can edit any PENDING in scope.
// Status/approval columns can only be changed via /api/vaccination/record-review.

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

type EditBody = {
  record_id?: number
  vaccination_date?: string
  batch_number?: string | null
  vaccination_site?: string | null
  remarks?: string | null
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before editing a record.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'edit')) {
    return invalid('You are not authorized to edit vaccination records.', 403)
  }

  const body = await request.json().catch(() => null) as EditBody | null
  if (!body) return invalid('Invalid request body.')
  const recordId = parseId(body.record_id)
  if (!recordId) return invalid('A valid record_id is required.')

  // Confirm record exists + is editable
  const existing = await supabase.from('vaccination_record')
    .select('vaccination_record_id, status, recorded_by')
    .eq('vaccination_record_id', recordId)
    .maybeSingle()
  if (existing.error || !existing.data) return invalid('Record not found or outside your scope.', 404)
  if (existing.data.status !== 'PENDING') {
    return invalid(`This record is already ${existing.data.status.toLowerCase()} and can no longer be edited.`)
  }
  const isReviewer = role === 'Public Health Nurse' || role === 'Administrator'
  if (!isReviewer && existing.data.recorded_by !== user.id) {
    return invalid('You can only edit records you yourself recorded.', 403)
  }

  // Build patch payload — only accept whitelisted editable fields
  const patch: Record<string, unknown> = {}
  if (body.vaccination_date !== undefined) {
    const d = String(body.vaccination_date).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return invalid('vaccination_date must be yyyy-mm-dd.')
    if (new Date(d + 'T23:59:59') > new Date()) return invalid('vaccination_date cannot be in the future.')
    patch.vaccination_date = d
  }
  if (body.batch_number !== undefined) patch.batch_number = (body.batch_number ?? '').toString().trim() || null
  if (body.vaccination_site !== undefined) patch.vaccination_site = (body.vaccination_site ?? '').toString().trim() || null
  if (body.remarks !== undefined) patch.remarks = (body.remarks ?? '').toString().trim() || null
  if (Object.keys(patch).length === 0) return invalid('Nothing to update.')

  const updateRes = await supabase.from('vaccination_record')
    .update(patch)
    .eq('vaccination_record_id', recordId)
    .select('vaccination_record_id, status')
    .maybeSingle()

  if (updateRes.error) {
    const code = updateRes.error.code
    if (code === '42501') return invalid('Not authorized to update this record.', 403)
    return invalid(`Unable to update record. [${code ?? 'unknown'}] ${updateRes.error.message ?? ''}`.trim(), 500)
  }
  return NextResponse.json({ vaccination_record_id: updateRes.data?.vaccination_record_id, status: updateRes.data?.status })
}