import { NextResponse } from 'next/server'
import { smsSession, smsService, json, uuid, dbFailure } from '@/lib/sms/server'
import { smsConfiguration, sendIprogSms } from '@/lib/sms/iprogsms'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const program = new URL(request.url).searchParams.get('program') ?? ''
    const auth = await smsSession(program)
    if (auth instanceof NextResponse) return auth
    const result = await auth.db.rpc('echims_sms_program_overview', { p_program: program })
    if (result.error) return dbFailure(result.error)
    const panel = result.data as unknown as Record<string, unknown> | null
    if (!panel || panel.currentUserId !== auth.userId) return json({ error: 'Session changed. Refresh the page.' }, 409)
    const config = smsConfiguration()
    return json({ ...panel, mode: config.mode, canSend: auth.role !== 'Administrator' && (config.mode === 'simulation' ? panel.canSimulate === true : panel.canSend === true),
      liveEnabled: config.ready, simulationEnabled: config.mode === 'simulation' && process.env.SMS_SIMULATION_ENABLED === 'true',
      previewEnabled: config.mode === 'simulation' && process.env.SMS_PRESENTATION_PREVIEW_ENABLED === 'true' })
  } catch { return json({ error: 'Unable to load SMS reminders.' }, 500) }
}
export async function POST(request: Request) {
  try {
    const input: unknown = await request.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid SMS request.' }, 400)
    const body = input as Record<string, unknown>
    const program = String(body.program ?? '')
    const auth = await smsSession(program, true)
    if (auth instanceof NextResponse) return auth
    if (typeof body.serviceKey !== 'string' || !body.serviceKey || body.serviceKey.length > 500 || !uuid(body.requestId) || !['UPCOMING', 'OVERDUE'].includes(String(body.messageType))) return json({ error: 'Choose a valid saved reminder and request ID.' }, 400)
    const config = smsConfiguration()
    if (body.action !== 'SEND') {
      if (!['Rural Health Midwife', 'Barangay Health Worker'].includes(auth.role)) return json({ error: 'This account cannot run SMS simulations.' }, 403)
      if (config.mode !== 'simulation' || process.env.SMS_SIMULATION_ENABLED !== 'true') return json({ error: 'Simulation is disabled.' }, 403)
      if (!['SIMULATED_SENT', 'SIMULATED_FAILED'].includes(String(body.outcome)) || (body.outcome === 'SIMULATED_SENT' && body.errorCode !== null) || (body.outcome === 'SIMULATED_FAILED' && !['NETWORK_ERROR', 'INSUFFICIENT_CREDITS', 'PROVIDER_ERROR'].includes(String(body.errorCode))) || (body.preview !== undefined && typeof body.preview !== 'boolean')) return json({ error: 'Choose a valid simulation scenario.' }, 400)
      if (body.preview === true && process.env.SMS_PRESENTATION_PREVIEW_ENABLED !== 'true') return json({ error: 'Presentation preview is disabled.' }, 403)
      const result = await auth.db.rpc(body.preview === true ? 'simulate_staff_sms_preview' : 'simulate_staff_program_sms', {
        p_program: program, p_service_key: body.serviceKey, p_phase: body.messageType, p_request_id: body.requestId, p_outcome: body.outcome, p_error_code: body.errorCode,
      })
      if (result.error) return dbFailure(result.error)
      return json({ currentUserId: auth.userId, result: result.data, message: 'Simulation saved. No SMS was sent.' })
    }
    if (!config.ready) return json({ error: 'Live sending is disabled. Configure iProg SMS credentials and SMS_MODE=live. Sender and network availability follow the approved provider account route.' }, 503)
    if (body.preview === true) return json({ error: 'Presentation previews cannot be sent as live SMS.' }, 400)
    if (body.requestOwnerId !== auth.userId) return json({ error: 'Session changed. Refresh before sending.' }, 409)
    if (body.batchId != null && !uuid(body.batchId)) return json({ error: 'Invalid SMS batch reference.' }, 400)
    if (typeof body.reviewedMessage !== 'string' || !body.reviewedMessage.trim() || body.reviewedMessage.length > 300) {
      return json({ error: 'Refresh and review the reminder before sending.' }, 400)
    }
    const service = smsService() // Fail before reserving an attempt if server credentials are missing.
    const prepared = await auth.db.rpc('echims_prepare_reviewed_live_sms', {
      p_program: program, p_service_key: body.serviceKey, p_phase: body.messageType,
      p_request_id: body.requestId, p_batch_id: body.batchId ?? null, p_message: body.reviewedMessage,
    })
    if (prepared.error) return prepared.error.code === '40001' ? json({ error: prepared.error.message }, 409) : dbFailure(prepared.error)
    const attempt = prepared.data as { attempt_id: number; status: string; can_claim?: boolean }
    if (attempt.can_claim === false) return json({
      currentUserId: auth.userId,
      result: { mode: 'LIVE', attempt_id: attempt.attempt_id, status: attempt.status, replayed: true },
      message: 'An existing attempt is recorded for this reminder.',
    })
    const claimed = await service.rpc('echims_claim_live_sms', { p_attempt_id: attempt.attempt_id, p_actor_id: auth.userId })
    if (claimed.error) return dbFailure(claimed.error)
    const dispatch = claimed.data as { send: boolean; destination?: string; message?: string; status: string }
    if (!dispatch.send) return json({ currentUserId: auth.userId, result: { mode: 'LIVE', attempt_id: attempt.attempt_id, status: dispatch.status, replayed: true }, message: 'Existing attempt found. No additional SMS was submitted.' })
    const outcome = await sendIprogSms(dispatch.destination!, dispatch.message!)
    const finished = await service.rpc('echims_finish_live_sms', { p_attempt_id: attempt.attempt_id, p_actor_id: auth.userId, p_status: outcome.status, p_provider_uid: outcome.uid, p_error_code: outcome.code })
    if (finished.error) return json({ error: 'The provider call finished but its saved status is uncertain. Retry this same action; do not create a new send.' }, 503)
    return json({ currentUserId: auth.userId, result: { mode: 'LIVE', ...finished.data }, message: outcome.status === 'SUBMITTED' ? 'Submitted to iProg SMS. Delivery is not yet confirmed.' : outcome.status === 'FAILED' ? 'iProg SMS rejected this attempt.' : 'Sending result is uncertain. Check the provider report before retrying.' })
  } catch { return json({ error: 'Unable to complete SMS processing. Retry the same request to inspect its saved result.' }, 500) }
}
