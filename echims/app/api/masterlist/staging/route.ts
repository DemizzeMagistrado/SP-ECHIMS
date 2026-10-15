// echims/app/api/masterlist/staging/route.ts
// GET    ?batch_id=N              → list staged rows (role-scoped by RLS)
// PATCH  { staging_id, patch }    → update a staged row (edits raw+normalized, re-validates)
// DELETE { staging_id }           → remove a staged row

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type NormalizedRow = Record<string, string>

const REQUIRED = new Set([
  'child_first_name','child_last_name','child_sex','child_date_of_birth',
  'barangay_name','household_address',
  'guardian_first_name','guardian_last_name',
])

async function revalidateRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raw: Record<string, string>,
): Promise<{ status: 'VALID'|'ERROR'|'DUPLICATE'; errors: string[]; normalized: NormalizedRow }> {
  const errors: string[] = []
  for (const k of REQUIRED) if (!raw[k]) errors.push(`${k} is required`)

  const sex = (raw.child_sex ?? '').toUpperCase()
  if (sex && !['MALE','FEMALE','M','F'].includes(sex)) errors.push(`child_sex must be MALE or FEMALE`)

  const dob = raw.child_date_of_birth
  if (dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(new Date(dob).getTime())) {
      errors.push(`child_date_of_birth must be YYYY-MM-DD`)
    } else {
      const now = new Date(); const d = new Date(dob)
      const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      if (months < 0) errors.push(`child_date_of_birth is in the future`)
      else if (months > 59) errors.push(`child is older than 59 months`)
    }
  }

  let barangay_id = ''
  let municipality = ''
  if (raw.barangay_name) {
    const { data: b } = await supabase.from('barangay').select('barangay_id, municipality')
      .ilike('barangay_name', raw.barangay_name.trim()).maybeSingle()
    if (!b) errors.push(`barangay_name "${raw.barangay_name}" not found`)
    else { barangay_id = String(b.barangay_id); municipality = b.municipality as string }
  }

  const normalized: NormalizedRow = {
    ...raw,
    child_sex: sex === 'M' ? 'MALE' : sex === 'F' ? 'FEMALE' : sex,
    is_4ps_member: ['true','yes','1'].includes((raw.is_4ps_member ?? '').toLowerCase()) ? 'true' : 'false',
    barangay_id,
    municipality,
  }

  // Dedup against existing children
  let isDup = false
  if (!errors.length && raw.child_first_name && raw.child_last_name && dob) {
    const { data: existing } = await supabase.from('child').select('child_id')
      .ilike('first_name', raw.child_first_name.trim())
      .ilike('last_name',  raw.child_last_name.trim())
      .eq('date_of_birth', dob)
      .eq('status', 'ACTIVE')
      .maybeSingle()
    isDup = !!existing
  }

  return {
    status: errors.length ? 'ERROR' : isDup ? 'DUPLICATE' : 'VALID',
    errors,
    normalized,
  }
}

async function recomputeBatchCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: number,
) {
  const { data } = await supabase.from('masterlist_staging').select('status').eq('batch_id', batchId)
  const by = { VALID: 0, ERROR: 0, DUPLICATE: 0 }
  for (const r of data ?? []) {
    if (r.status === 'VALID') by.VALID++
    else if (r.status === 'ERROR') by.ERROR++
    else if (r.status === 'DUPLICATE') by.DUPLICATE++
  }
  await supabase.from('masterlist_upload_batch').update({
    valid_count: by.VALID,
    error_count: by.ERROR,
    duplicate_count: by.DUPLICATE,
  }).eq('batch_id', batchId)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const batchId = Number(new URL(request.url).searchParams.get('batch_id'))
  if (!Number.isSafeInteger(batchId) || batchId <= 0) return NextResponse.json({ error: 'batch_id required' }, { status: 400 })

  const { data, error } = await supabase.from('masterlist_staging').select('*').eq('batch_id', batchId).order('row_number')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { staging_id?: number; patch?: Record<string, string> } | null
  const stagingId = Number(body?.staging_id)
  const patch = body?.patch
  if (!Number.isSafeInteger(stagingId) || stagingId <= 0 || !patch) return NextResponse.json({ error: 'staging_id and patch required' }, { status: 400 })

  const { data: existing, error: readErr } = await supabase.from('masterlist_staging').select('*').eq('staging_id', stagingId).maybeSingle()
  if (readErr || !existing) return NextResponse.json({ error: readErr?.message ?? 'Row not found' }, { status: 404 })

  const mergedRaw = { ...(existing.raw as Record<string, string>), ...patch }
  const { status, errors, normalized } = await revalidateRow(supabase, mergedRaw)

  const { error: upErr } = await supabase.from('masterlist_staging').update({
    raw: mergedRaw, normalized, status, errors, updated_at: new Date().toISOString(),
  }).eq('staging_id', stagingId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await recomputeBatchCounts(supabase, existing.batch_id as number)
  return NextResponse.json({ ok: true, status, errors })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { staging_id?: number } | null
  const stagingId = Number(body?.staging_id)
  if (!Number.isSafeInteger(stagingId) || stagingId <= 0) return NextResponse.json({ error: 'staging_id required' }, { status: 400 })

  const { data: existing } = await supabase.from('masterlist_staging').select('batch_id').eq('staging_id', stagingId).maybeSingle()
  const { error } = await supabase.from('masterlist_staging').delete().eq('staging_id', stagingId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing?.batch_id) await recomputeBatchCounts(supabase, existing.batch_id as number)
  return NextResponse.json({ ok: true })
}