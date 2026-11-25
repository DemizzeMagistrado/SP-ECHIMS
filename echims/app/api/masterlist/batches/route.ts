// echims/app/api/masterlist/batches/route.ts
// GET → list upload batches (role-scoped by RLS).
//   ?batch_id=N → return a single batch
//   ?limit=N (optional, default 50)

import { NextResponse } from 'next/server'
import { masterlistAccess } from '@/lib/masterlist-access'

export async function GET(request: Request) {
  const access = await masterlistAccess()
  if (access.error) return access.error
  const { supabase } = access

  const url = new URL(request.url)
  const batchId = url.searchParams.get('batch_id')

  if (batchId) {
    const { data, error } = await supabase
      .from('masterlist_upload_batch')
      .select('*')
      .eq('batch_id', Number(batchId))
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

    return NextResponse.json({ batch: data })
  }

  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, 200))
  const { data, error } = await supabase
    .from('masterlist_upload_batch')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ batches: data ?? [] })
}