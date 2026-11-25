import { NextResponse } from 'next/server'
import { masterlistAccess } from '@/lib/masterlist-access'

export async function POST(request: Request) {
  const access = await masterlistAccess()
  if (access.error) return access.error
  const body = await request.json().catch(() => null)
  const batchId = Number(body?.batch_id)
  if (!Number.isSafeInteger(batchId) || batchId <= 0) return NextResponse.json({ error: 'Choose an import batch.' }, { status: 400 })

  const { data, error } = await access.supabase.rpc('mlu_import_batch', { p_batch_id: batchId })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '55000' ? 409 : 500
    return NextResponse.json({ error: status < 500 ? error.message : 'Could not import this batch.' }, { status })
  }
  return NextResponse.json(data)
}
