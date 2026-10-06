import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
const TYPE = 'NUTRITIONAL_ASSESSMENT'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

async function authenticate() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}
async function nutritionAccess(supabase: Supabase, userId: string) {
  const [account, profile] = await Promise.all([
    supabase.from('users').select('account_status').eq('user_id', userId).maybeSingle(),
    supabase.rpc('get_my_profile').maybeSingle(),
  ])
  if (account.error || profile.error) throw new Error('Unable to verify nutrition sync permissions.')
  const data: unknown = profile.data
  const role = data && typeof data === 'object' && 'role' in data
    ? String(data.role ?? '').trim().toLowerCase() : ''
  return account.data?.account_status === 'ACTIVE' && [
    'bns', 'barangay nutrition scholar',
  ].includes(role)
}

// An upload-only sync run. The database generates sync_id and timestamps.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await authenticate()
    if (!user) return fail('Unauthorized.', 401)
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('request_owner_id' in body)
        || body.request_owner_id !== user.id) return fail('The sync belongs to another account.', 403)
    if (!await nutritionAccess(supabase, user.id)) return fail('Only active Barangay Nutrition Scholars can upload assessment drafts.', 403)
    const { data, error } = await supabase.from('sync_log').insert({
      user_id: user.id, sync_type: TYPE, sync_status: 'STARTED',
      records_uploaded: 0, records_downloaded: 0,
    }).select('sync_id').single()
    if (error) { console.error('Nutrition sync log start failed:', error); return fail('Unable to start the nutrition sync log.', 500) }
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Nutrition sync log POST failed:', error)
    return fail('Unable to start the nutrition sync log.', 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await authenticate()
    if (!user) return fail('Unauthorized.', 401)
    const payload: unknown = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('Invalid sync result.', 400)
    const body = payload as Record<string, unknown>
    if (body.request_owner_id !== user.id) return fail('The sync belongs to another account.', 403)
    const syncId = Number(body.sync_id)
    if (!Number.isSafeInteger(syncId) || syncId <= 0) return fail('Invalid sync ID.', 400)
    if (!Array.isArray(body.confirmed_request_ids) || body.confirmed_request_ids.length > 10000
        || body.confirmed_request_ids.some((id) => typeof id !== 'string' || !uuid.test(id))) {
      return fail('Invalid confirmed assessment request identifiers.', 400)
    }
    if (body.error_message != null && typeof body.error_message !== 'string') return fail('Invalid sync error.', 400)
    const { data: log, error: logError } = await supabase.from('sync_log')
      .select('sync_id, sync_status, sync_started_at, records_uploaded, records_downloaded')
      .eq('sync_id', syncId).eq('user_id', user.id).eq('sync_type', TYPE).maybeSingle()
    if (logError) return fail('Unable to load this sync run.', 500)
    if (!log) return fail('Sync run not found for this account.', 404)
    // Repeating finalization never changes a finished run's counters.
    if (log.sync_status !== 'STARTED') return NextResponse.json({ data: log, replayed: true })
    const ids = [...new Set(body.confirmed_request_ids as string[])]
    let confirmed = 0
    let uploaded = 0
    for (let offset = 0; offset < ids.length; offset += 200) {
      const { data, error } = await supabase.from('nutritional_assessment')
        .select('client_request_id, created_at').eq('assessed_by', user.id)
        .in('client_request_id', ids.slice(offset, offset + 200))
      if (error) return fail('Unable to verify uploaded assessments.', 500)
      confirmed += data?.length ?? 0
      // An acknowledged replay from a previous run is not another upload.
      uploaded += (data ?? []).filter((row) => new Date(row.created_at).getTime() >= new Date(log.sync_started_at).getTime()).length
    }
    if (confirmed !== ids.length) return fail('Some confirmed assessments are unavailable to this account.', 409)
    const errorMessage = typeof body.error_message === 'string' ? body.error_message.trim().slice(0, 2000) || null : null
    if (!errorMessage && confirmed === 0) return fail('A successful run must confirm at least one assessment.', 400)
    const status = errorMessage ? confirmed > 0 ? 'PARTIAL' : 'FAILED' : 'SUCCESS'
    const { data, error } = await supabase.from('sync_log').update({
      sync_status: status, sync_completed_at: new Date().toISOString(),
      records_uploaded: uploaded, records_downloaded: 0, error_message: errorMessage,
    }).eq('sync_id', syncId).eq('user_id', user.id).eq('sync_type', TYPE)
      .eq('sync_status', 'STARTED').select('sync_id, sync_status, records_uploaded, records_downloaded').maybeSingle()
    if (error) { console.error('Nutrition sync log finish failed:', error); return fail('Unable to finalize the sync log.', 500) }
    if (!data) return fail('This run was finalized by another request. Refresh its sync history.', 409)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Nutrition sync log PATCH failed:', error)
    return fail('Unable to finalize the nutrition sync log.', 500)
  }
}
