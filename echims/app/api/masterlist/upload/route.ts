import { NextResponse } from 'next/server'
import { masterlistAccess, masterlistLocations } from '@/lib/masterlist-access'
import { readMasterlist, validateMasterlistRow } from '@/lib/masterlist-roster'

export const runtime = 'nodejs'

export async function GET() {
  const access = await masterlistAccess()
  if (access.error) return access.error
  try {
    const locations = await masterlistLocations(access.supabase)
    return NextResponse.json({ locations: locations.filter(location => location.allowed) })
  } catch {
    return NextResponse.json({ error: 'Could not load assigned locations.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const access = await masterlistAccess()
  if (access.error) return access.error
  const { supabase, userId } = access
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || !/\.csv$/i.test(file.name) || file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Choose a CSV file up to 2 MB.' }, { status: 400 })
  }

  let locations
  try {
    locations = await masterlistLocations(supabase)
  } catch {
    return NextResponse.json({ error: 'Could not load assigned locations.' }, { status: 500 })
  }
  if (!locations.some(location => location.allowed)) {
    return NextResponse.json({ error: 'An active location assignment is required to upload a masterlist.' }, { status: 403 })
  }
  const selectedId = Number(form?.get('barangay_id'))
  const selected = locations.find(location => location.barangay_id === selectedId && location.allowed)
  let roster
  try {
    roster = readMasterlist(await file.text(), file.name, selected)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read this CSV.' }, { status: 400 })
  }

  let outsideScope = 0
  const rows = roster.rows.flatMap(row => {
    const { location, normalized, errors } = validateMasterlistRow(row.raw, locations)
    if (location && !location.allowed) {
      outsideScope++
      return []
    }
    return [{
      row_number: row.rowNumber,
      raw: row.raw,
      normalized,
      scope_barangay_id: location?.barangay_id ?? null,
      status: errors.length ? 'ERROR' : 'VALID',
      errors,
    }]
  })
  if (rows.length === 0) {
    return NextResponse.json({ error: `No rows to save. Outside age range: ${roster.outsideAge}. Outside your assignment: ${outsideScope}.` }, { status: 400 })
  }

  const valid = rows.filter(row => row.status === 'VALID').length
  const { data: batch, error: batchError } = await supabase.from('masterlist_upload_batch').insert({
    uploaded_by: userId, file_name: file.name, file_size_bytes: file.size, row_count: rows.length,
    valid_count: valid, error_count: rows.length - valid, status: 'UPLOADED',
  }).select('batch_id').single()
  if (batchError || !batch) return NextResponse.json({ error: 'Could not create an import batch.' }, { status: 500 })

  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabase.from('masterlist_staging').insert(rows.slice(index, index + 200).map(row => ({ ...row, batch_id: batch.batch_id })))
    if (error) {
      await supabase.from('masterlist_upload_batch').update({ status: 'FAILED' }).eq('batch_id', batch.batch_id)
      return NextResponse.json({ error: 'The import batch could not be saved. Upload the file again.' }, { status: 500 })
    }
  }

  const { error } = await supabase.from('masterlist_upload_batch').update({ status: 'VALIDATED' }).eq('batch_id', batch.batch_id)
  if (error) return NextResponse.json({ error: 'Could not finish preparing the batch.' }, { status: 500 })
  return NextResponse.json({ batch_id: batch.batch_id, outsideAge: roster.outsideAge, outsideScope }, { status: 201 })
}
