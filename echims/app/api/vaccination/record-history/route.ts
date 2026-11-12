import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// NIP-REV01 — review history of one vaccination record: returns for correction (with the PHN's
// note), resubmissions and approval. GET /api/vaccination/record-history?record_id=123
// RLS: visible to whoever can see the record.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)
  const recordId = Number(new URL(request.url).searchParams.get('record_id'))
  if (!Number.isSafeInteger(recordId) || recordId <= 0) return json({ error: 'A valid record_id is required.' }, 400)

  const { data, error } = await db.from('vaccination_record_review_event')
    .select('event_id, action, from_status, to_status, note, actor_id, created_at')
    .eq('vaccination_record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    // Before migration 07 the history table does not exist yet: show an empty history.
    if (error.code === '42P01' || error.code === 'PGRST205') return json({ record_id: recordId, rows: [], unavailable: true })
    console.error('Record history GET:', error)
    return json({ error: 'Unable to load the record history.' }, 500)
  }
  const rows = (data ?? []) as { actor_id: string | null }[]
  const ids = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: users } = await db.from('users').select('user_id, full_name').in('user_id', ids)
    for (const u of (users ?? []) as { user_id: string; full_name: string | null }[]) if (u.full_name) names.set(u.user_id, u.full_name)
  }
  return json({ record_id: recordId, rows: rows.map((r) => ({ ...r, actor_name: r.actor_id ? names.get(r.actor_id) ?? null : null })) })
}
