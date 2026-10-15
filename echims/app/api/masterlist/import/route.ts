// echims/app/api/masterlist/import/route.ts
// POST { batch_id } → trigger the mlu_import_batch RPC (SECURITY DEFINER).
// Imports every row with status=VALID, creating household + guardian + child.
// Rows with status=DUPLICATE get status=SKIPPED. Errors are captured per row.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { batch_id?: number } | null
  const batchId = Number(body?.batch_id)
  if (!Number.isSafeInteger(batchId) || batchId <= 0) return NextResponse.json({ error: 'batch_id required' }, { status: 400 })

  // Guard: block import if there are unresolved errors
  const { data: counts } = await supabase.from('masterlist_upload_batch').select('error_count, valid_count, status').eq('batch_id', batchId).maybeSingle()
  if (!counts) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  if (counts.status === 'IMPORTING' || counts.status === 'COMPLETED') {
    return NextResponse.json({ error: `Batch is already ${counts.status}.` }, { status: 409 })
  }
  if ((counts.error_count ?? 0) > 0) {
    return NextResponse.json({ error: `Fix or remove ${counts.error_count} error row(s) before importing.` }, { status: 400 })
  }
  if ((counts.valid_count ?? 0) === 0) {
    return NextResponse.json({ error: 'No VALID rows to import.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('mlu_import_batch', { p_batch_id: batchId })
  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(data ?? { ok: true })
}