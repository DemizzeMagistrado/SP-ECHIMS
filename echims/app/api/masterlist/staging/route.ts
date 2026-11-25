import { NextResponse } from 'next/server'
import { masterlistAccess, masterlistLocations } from '@/lib/masterlist-access'
import { masterlistRaw, validateMasterlistRow } from '@/lib/masterlist-roster'

export async function GET(request: Request) {
  const access = await masterlistAccess()
  if (access.error) return access.error
  const batchId = Number(new URL(request.url).searchParams.get('batch_id'))
  if (!Number.isSafeInteger(batchId) || batchId <= 0) return NextResponse.json({ error: 'Choose an import batch.' }, { status: 400 })

  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await access.supabase.from('masterlist_staging').select('*')
      .eq('batch_id', batchId).order('row_number').order('staging_id').range(offset, offset + 499)
    if (error) return NextResponse.json({ error: 'Could not load the import rows.' }, { status: 500 })
    rows.push(...data)
    if (data.length < 500) break
  }
  const { data: matches, error } = await access.supabase.rpc('mlu_preview_matches', { p_batch_id: batchId })
  if (error) return NextResponse.json({ error: 'Could not check possible duplicates.' }, { status: 500 })
  const matched = new Map<number, number | null>(matches.map((match: { staging_id: number; child_id: number | null }) => [match.staging_id, match.child_id]))
  return NextResponse.json({ rows: rows.map(row => matched.has(row.staging_id)
    ? { ...row, possible_duplicate: true, matched_child_id: matched.get(row.staging_id) }
    : row) })
}

export async function PATCH(request: Request) {
  const access = await masterlistAccess()
  if (access.error) return access.error
  const { supabase } = access
  const body = await request.json().catch(() => null)
  const stagingId = Number(body?.staging_id)
  if (!Number.isSafeInteger(stagingId) || stagingId <= 0 || !body?.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
    return NextResponse.json({ error: 'Choose a row and enter the corrected details.' }, { status: 400 })
  }

  const { data: existing } = await supabase.from('masterlist_staging').select('raw,status,scope_barangay_id,updated_at')
    .eq('staging_id', stagingId).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Row not found in your scope.' }, { status: 404 })
  if (existing.status === 'IMPORTED') return NextResponse.json({ error: 'Edit the registered child from Child Profiling.' }, { status: 409 })

  let locations
  try {
    locations = await masterlistLocations(supabase)
  } catch {
    return NextResponse.json({ error: 'Could not load assigned locations.' }, { status: 500 })
  }
  const raw = masterlistRaw({ ...existing.raw, ...body.patch })
  const { errors, normalized, location } = validateMasterlistRow(raw, locations)
  if (location && !location.allowed) return NextResponse.json({ error: 'This barangay is outside your assignment.' }, { status: 403 })
  if (existing.scope_barangay_id && location?.barangay_id !== existing.scope_barangay_id) {
    return NextResponse.json({ error: 'The import row is already assigned to a barangay. Use the child transfer workflow to change a registered child’s barangay.' }, { status: 409 })
  }
  const status = errors.length ? 'ERROR' : 'VALID'
  const update = supabase.from('masterlist_staging').update({
    raw, normalized, scope_barangay_id: location?.barangay_id ?? null, status, errors, updated_at: new Date().toISOString(),
  }).eq('staging_id', stagingId).neq('status', 'IMPORTED')
  const { data: saved, error } = await (existing.updated_at ? update.eq('updated_at', existing.updated_at) : update.is('updated_at', null))
    .select('staging_id').maybeSingle()
  if (error || !saved) return NextResponse.json({ error: 'This row changed or is outside your scope. Refresh the batch and try again.' }, { status: 409 })
  return NextResponse.json({ ok: true, status, errors })
}

export async function DELETE(request: Request) {
  const access = await masterlistAccess()
  if (access.error) return access.error
  const body = await request.json().catch(() => null)
  const stagingId = Number(body?.staging_id)
  if (!Number.isSafeInteger(stagingId) || stagingId <= 0) return NextResponse.json({ error: 'Choose a row.' }, { status: 400 })
  const { data, error } = await access.supabase.from('masterlist_staging').delete()
    .eq('staging_id', stagingId).in('status', ['VALID', 'PENDING', 'ERROR']).select('staging_id').maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Row could not be removed.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
