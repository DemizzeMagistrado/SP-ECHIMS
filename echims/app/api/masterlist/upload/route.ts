// echims/app/api/masterlist/upload/route.ts
// POST a CSV masterlist file → create batch + staging rows (validated).
// Role: PHN or Administrator only (enforced by RLS on insert).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const EXPECTED_HEADERS = [
  'child_first_name','child_middle_name','child_last_name','child_sex','child_date_of_birth',
  'child_birth_place',
  'barangay_name',
  'household_address','purok','household_no','is_4ps_member',
  'guardian_first_name','guardian_middle_name','guardian_last_name',
  'guardian_contact_number','guardian_relationship',
]
const REQUIRED = new Set([
  'child_first_name','child_last_name','child_sex','child_date_of_birth',
  'barangay_name','household_address',
  'guardian_first_name','guardian_last_name',
])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

// — tiny CSV parser (handles quotes, CRLF; no streaming, fine up to 2 MB)
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = '', row: string[] = [], inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  // Role gate
  const [{ data: adminRow }, { data: phnRow }] = await Promise.all([
    supabase.from('administrator').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('public_health_nurse').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!adminRow && !phnRow) {
    return NextResponse.json({ error: 'Only PHN or Administrator can upload masterlists.' }, { status: 403 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
  if (!/\.csv$/i.test(file.name)) {
    return NextResponse.json({ error: 'Only .csv files are accepted. Save your Excel file as CSV first.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${(file.size/1024/1024).toFixed(2)} MB). Max 2 MB.` }, { status: 400 })
  }

  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length < 2) return NextResponse.json({ error: 'File is empty or has no data rows.' }, { status: 400 })

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length) {
    return NextResponse.json({ error: `Missing columns: ${missing.join(', ')}. Download the template to see the required format.` }, { status: 400 })
  }

  // Load lookup tables once
  const [{ data: brgys }, { data: existing }] = await Promise.all([
    supabase.from('barangay').select('barangay_id, barangay_name, municipality'),
    supabase.from('child').select('first_name, last_name, date_of_birth').eq('status', 'ACTIVE'),
  ])
  const brgyByName = new Map<string, { barangay_id: number; municipality: string }>()
  for (const b of brgys ?? []) brgyByName.set(String(b.barangay_name).toLowerCase().trim(), { barangay_id: b.barangay_id as number, municipality: b.municipality as string })
  const dupKey = (fn: string, ln: string, dob: string) => `${fn.toLowerCase().trim()}|${ln.toLowerCase().trim()}|${dob}`
  const existingKeys = new Set((existing ?? []).map((c) => dupKey(c.first_name as string, c.last_name as string, c.date_of_birth as string)))

  // Create batch
  const { data: batch, error: batchErr } = await supabase
    .from('masterlist_upload_batch')
    .insert({
      uploaded_by: user.id,
      file_name: file.name,
      file_size_bytes: file.size,
      row_count: rows.length - 1,
      status: 'UPLOADED',
    })
    .select('batch_id')
    .single()
  if (batchErr || !batch) return NextResponse.json({ error: batchErr?.message ?? 'Failed to create batch.' }, { status: 500 })

  // Build staging rows with validation
  const stagingPayload: Array<{ batch_id: number; row_number: number; raw: Record<string, string>; normalized: Record<string, string>; status: string; errors: string[] }> = []
  let valid = 0, errors = 0, duplicates = 0

  for (let i = 1; i < rows.length; i++) {
    const raw: Record<string, string> = {}
    headers.forEach((h, j) => { raw[h] = (rows[i][j] ?? '').trim() })
    const rowErrors: string[] = []

    // Required
    for (const k of REQUIRED) if (!raw[k]) rowErrors.push(`${k} is required`)

    // Sex
    const sex = raw.child_sex?.toUpperCase()
    if (sex && !['MALE','FEMALE','M','F'].includes(sex)) rowErrors.push(`child_sex must be MALE or FEMALE`)

    // DOB
    const dob = raw.child_date_of_birth
    const dobDate = dob ? new Date(dob) : null
    if (dob && (isNaN(dobDate!.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(dob))) {
      rowErrors.push(`child_date_of_birth must be YYYY-MM-DD`)
    } else if (dobDate) {
      const now = new Date()
      const months = (now.getFullYear() - dobDate.getFullYear()) * 12 + (now.getMonth() - dobDate.getMonth())
      if (months < 0) rowErrors.push(`child_date_of_birth is in the future`)
      else if (months > 59) rowErrors.push(`child is older than 59 months (${months} mo)`)
    }

    // Barangay
    const brgy = brgyByName.get(raw.barangay_name?.toLowerCase().trim() ?? '')
    if (raw.barangay_name && !brgy) rowErrors.push(`barangay_name "${raw.barangay_name}" not found`)

    // 4Ps
    if (raw.is_4ps_member && !['true','false','yes','no','1','0',''].includes(raw.is_4ps_member.toLowerCase())) {
      rowErrors.push(`is_4ps_member must be true/false`)
    }

    // Normalize
    const normalized: Record<string, string> = {
      ...raw,
      child_sex: sex === 'M' ? 'MALE' : sex === 'F' ? 'FEMALE' : sex ?? '',
      is_4ps_member: ['true','yes','1'].includes((raw.is_4ps_member ?? '').toLowerCase()) ? 'true' : 'false',
      barangay_id: brgy ? String(brgy.barangay_id) : '',
      municipality: brgy?.municipality ?? '',
    }

    // Duplicate check against existing children
    let isDup = false
    if (!rowErrors.length) {
      const k = dupKey(raw.child_first_name, raw.child_last_name, raw.child_date_of_birth)
      if (existingKeys.has(k)) isDup = true
    }

    const status = rowErrors.length ? 'ERROR' : isDup ? 'DUPLICATE' : 'VALID'
    if (status === 'VALID') valid++
    else if (status === 'ERROR') errors++
    else duplicates++

    stagingPayload.push({
      batch_id: batch.batch_id as number,
      row_number: i,
      raw,
      normalized,
      status,
      errors: rowErrors,
    })
  }

  // Insert in chunks of 500 to stay well under PostgREST limits
  for (let i = 0; i < stagingPayload.length; i += 500) {
    const slice = stagingPayload.slice(i, i + 500)
    const { error: stageErr } = await supabase.from('masterlist_staging').insert(slice)
    if (stageErr) {
      await supabase.from('masterlist_upload_batch').update({ status: 'FAILED', notes: stageErr.message }).eq('batch_id', batch.batch_id)
      return NextResponse.json({ error: `Failed to stage rows: ${stageErr.message}` }, { status: 500 })
    }
  }

  // Update batch totals
  await supabase.from('masterlist_upload_batch').update({
    status: 'VALIDATED',
    valid_count: valid,
    error_count: errors,
    duplicate_count: duplicates,
  }).eq('batch_id', batch.batch_id)

  return NextResponse.json({ batch_id: batch.batch_id, valid, errors, duplicates, total: rows.length - 1 }, { status: 201 })
}