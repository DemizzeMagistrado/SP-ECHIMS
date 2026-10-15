// echims/app/api/masterlist/batches/route.ts
// GET → list upload batches (role-scoped by RLS).
//   ?batch_id=N → return a single batch
//   ?limit=N (optional, default 50)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

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

    // Enrich with uploader info via a separate lookup (users FK is to auth.users,
    // so a PostgREST join to public.users doesn't resolve automatically).
    const { data: uploader } = await supabase
      .from('users')
      .select('user_id, full_name, email')
      .eq('user_id', data.uploaded_by)
      .maybeSingle()
    return NextResponse.json({ batch: { ...data, uploader: uploader ?? null } })
  }

  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const { data, error } = await supabase
    .from('masterlist_upload_batch')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ batches: data ?? [] })
}