// NIP-USR008 — Prior vaccination recording.
// POST /api/vaccination/prior → records a past (pre-eCHIMS) vaccination.
//
// Role: Admin / RHM / BHW (not PHN per NIP-USR007, not BNS).
// Insert flow:
//   - Validates child in scope + vaccine exists + date is valid + source is given
//   - Prevents duplicate dose (same child + vaccine + dose + non-REJECTED status)
//   - Inserts with status = 'APPROVED' and is_prior = TRUE
//   - The approved status means it immediately counts as COMPLETE in schedule
//     computation (/api/vaccination/history), so the kid doesn't show up as
//     a defaulter for a shot they actually received before enrollment.

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
  child_id?: number | string
  vaccine_id?: number | string
  dose_number?: number | string
  vaccination_date?: string
  batch_number?: string
  vaccination_site?: string
  prior_source?: string
  remarks?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before recording a prior vaccination.', 401)

  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'create')) {
    return invalid('You are not authorized to record vaccinations.', 403)
  }

  const body = await request.json().catch(() => null) as Body | null
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
  if (new Date(vaccinationDate + 'T23:59:59') > new Date()) {
    return invalid('vaccination_date cannot be in the future.')
  }

  const priorSource = String(body.prior_source ?? '').trim()
  if (!priorSource) {
    return invalid('A source is required for prior records (e.g. "Baby Book", "Transferred from X RHU").')
  }

  // --- Child exists and is in scope (RLS enforces barangay/RHU) ---
  const childRes = await supabase.from('child')
    .select('child_id, date_of_birth, barangay_id')
    .eq('child_id', childId)
    .maybeSingle()
  if (childRes.error || !childRes.data) {
    return invalid('Child not found or outside your scope.', 404)
  }

  const dob = new Date(String(childRes.data.date_of_birth) + 'T00:00:00')
  const vaxDate = new Date(vaccinationDate + 'T00:00:00')
  if (vaxDate < dob) return invalid('Vaccination date cannot be before the child was born.')

  // --- Duplicate check: same child + vaccine + dose, in any non-REJECTED state ---
  const dup = await supabase.from('vaccination_record')
    .select('vaccination_record_id, status, is_prior')
    .eq('child_id', childId)
    .eq('vaccine_id', vaccineId)
    .eq('dose_number', doseNumber)
    .in('status', ['PENDING', 'APPROVED'])
    .maybeSingle()
  if (dup.data) {
    const label = dup.data.is_prior
      ? 'already recorded as a prior dose'
      : `already ${String(dup.data.status).toLowerCase()}`
    return invalid(`Dose ${doseNumber} of this vaccine is ${label} for this child.`, 409)
  }

  // --- Insert as auto-APPROVED prior record ---
  const insertRes = await supabase.from('vaccination_record')
    .insert({
      child_id: childId,
      vaccine_id: vaccineId,
      dose_number: doseNumber,
      vaccination_date: vaccinationDate,
      batch_number: body.batch_number?.trim() || null,
      vaccination_site: body.vaccination_site?.trim() || null,
      remarks: body.remarks?.trim() || null,
      recorded_by: user.id,
      status: 'APPROVED',
      is_prior: true,
      prior_source: priorSource,
    })
    .select('vaccination_record_id')
    .maybeSingle()

  if (insertRes.error) {
    const code = insertRes.error.code
    if (code === '23505') {
      return invalid(`Dose ${doseNumber} already recorded for this child + vaccine.`, 409)
    }
    if (code === '42501') {
      return invalid('Not authorized to record for this child\'s barangay.', 403)
    }
    return invalid(`Unable to save prior record. [${code ?? 'unknown'}] ${insertRes.error.message ?? ''}`.trim(), 500)
  }
  if (!insertRes.data) return invalid('Record was not saved.', 500)

  return NextResponse.json({
    vaccination_record_id: insertRes.data.vaccination_record_id,
    status: 'APPROVED',
    is_prior: true,
  }, { status: 201 })
}