import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildRecordPatch, type RecordEdits } from '@/lib/vaccination-record-edit'

// NIP-REV01 — send a record that "Needs correction" back for approval.
// POST /api/vaccination/record-resubmit   { record_id, note?, edits?: { vaccination_date, batch_number, vaccination_site, remarks } }
// Saves the corrections (same rules as record-edit), then echims_resubmit_vaccination_record sets it
// back to Awaiting approval, keeps the note in the review history and alerts the RHU's PHNs.
// Who: the recorder (BHW/RHM, still assigned), or the RHU's PHN / Admin — enforced in the database.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)

  const body = await request.json().catch(() => null) as { record_id?: number; note?: string | null; edits?: RecordEdits } | null
  const recordId = Number(body?.record_id)
  if (!Number.isSafeInteger(recordId) || recordId <= 0) return json({ error: 'A valid record_id is required.' }, 400)
  const note = (body?.note ?? '').toString().trim() || null
  if (note && note.length > 2000) return json({ error: 'The note is too long (2000 characters at most).' }, 400)

  const existing = await db.from('vaccination_record').select('vaccination_record_id, status').eq('vaccination_record_id', recordId).maybeSingle()
  if (existing.error || !existing.data) return json({ error: 'Record not found or outside your scope.' }, 404)
  if (existing.data.status === 'REJECTED') return json({ error: 'This record can be corrected once the latest database update is applied. Ask your administrator.' }, 503)
  if (existing.data.status !== 'NEEDS_CORRECTION') return json({ error: 'Only records that need correction can be resubmitted.' }, 409)

  if (body?.edits && Object.keys(body.edits).length) {
    const built = await buildRecordPatch(db, body.edits)
    if ('error' in built) return json({ error: built.error }, 400)
    if (Object.keys(built.patch).length) {
      const up = await db.from('vaccination_record').update(built.patch).eq('vaccination_record_id', recordId).select('vaccination_record_id').maybeSingle()
      if (up.error || !up.data) {
        console.error('Record resubmit (edit):', up.error)
        return json({ error: up.error?.code === '42501' ? 'You can only correct records you recorded.' : 'The corrections were not saved. Try again.' }, up.error?.code === '42501' ? 403 : 500)
      }
    }
  }

  const { data, error } = await db.rpc('echims_resubmit_vaccination_record', { p_record_id: recordId, p_note: note })
  if (error) {
    if (error.code === 'PGRST202') return json({ error: 'Resubmitting needs the latest database update. Ask your administrator.' }, 503)
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 409 : error.code === 'P0002' ? 404 : 500
    if (status === 500) console.error('Record resubmit RPC:', error)
    return json({ error: status === 403 ? 'You can only resubmit records you recorded (or as the PHN for this RHU).' : error.message || 'Unable to resubmit the record.' }, status)
  }
  return json(data ?? { vaccination_record_id: recordId, status: 'PENDING' })
}
