import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { EDITABLE_STATUSES, buildRecordPatch, saveRecordPatch } from '@/lib/vaccination-record-edit'

// NIP-USR003 — Edit an administered-vaccination record (while PENDING, or NEEDS_CORRECTION after
// the PHN returned it; resubmitting is /api/vaccination/record-resubmit).
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
  /** The revision the editor loaded; a newer saved revision gets a 409 conflict. */
  expected_revision?: number
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
  if (!EDITABLE_STATUSES.includes(existing.data.status)) {
    return invalid(`This record is already ${existing.data.status.toLowerCase()} and can no longer be edited.`)
  }
  const isReviewer = role === 'Public Health Nurse' || role === 'Administrator'
  if (!isReviewer && existing.data.recorded_by !== user.id) {
    return invalid('You can only edit records you yourself recorded.', 403)
  }

  // Build patch payload — only accept whitelisted editable fields
  const built = await buildRecordPatch(supabase, body)
  if ('error' in built) return invalid(built.error)
  const patch = built.patch
  if (Object.keys(patch).length === 0) return invalid('Nothing to update.')

  const saved = await saveRecordPatch(supabase, recordId, patch, body.expected_revision)
  if ('conflict' in saved) {
    return NextResponse.json({ error: 'Someone else saved this record after you opened it. Choose which version to keep.', conflict: saved.conflict }, { status: 409 })
  }
  if ('error' in saved) {
    const code = saved.error.code
    if (code === '42501') return invalid('Not authorized to update this record.', 403)
    return invalid(`Unable to update record. [${code ?? 'unknown'}] ${saved.error.message ?? ''}`.trim(), 500)
  }
  return NextResponse.json({ vaccination_record_id: recordId, status: existing.data.status, revision: saved.revision })
}