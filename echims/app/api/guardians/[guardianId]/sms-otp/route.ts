import { NextResponse } from 'next/server'
import { createHmac, randomInt } from 'node:crypto'
import { smsSession, smsService, json, uuid, dbFailure } from '@/lib/sms/server'
import { smsConfiguration, sendIprogSms } from '@/lib/sms/iprogsms'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ guardianId: string }> }
async function guardianId(context: Context) {
  const value = (await context.params).guardianId
  const id = Number(value)
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null
}
function hashCode(challengeId: string, code: string) {
  const secret = process.env.SMS_OTP_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('Configure SMS_OTP_SECRET with at least 32 random characters.')
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex')
}
export async function GET(_request: Request, context: Context) {
  try {
    const id = await guardianId(context)
    if (!id) return json({ error: 'Invalid guardian.' }, 400)
    const auth = await smsSession()
    if (auth instanceof NextResponse) return auth
    const result = await auth.db.rpc('echims_guardian_otp_status', { p_guardian_id: id })
    if (result.error) return dbFailure(result.error)
    return json({ ...result.data, liveEnabled: smsConfiguration().ready && (process.env.SMS_OTP_SECRET?.trim().length ?? 0) >= 32 })
  } catch { return json({ error: 'Unable to load mobile verification status.' }, 500) }
}
export async function POST(request: Request, context: Context) {
  try {
    const id = await guardianId(context)
    if (!id) return json({ error: 'Invalid guardian.' }, 400)
    const auth = await smsSession()
    if (auth instanceof NextResponse) return auth
    const input: unknown = await request.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid OTP request.' }, 400)
    const body = input as Record<string, unknown>
    if (!['REQUEST', 'VERIFY'].includes(String(body.action))) return json({ error: 'Choose REQUEST or VERIFY.' }, 400)
    const service = smsService()
    if (body.action === 'VERIFY') {
      if (!uuid(body.challengeId) || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return json({ error: 'Enter the six-digit code from the guardian phone.' }, 400)
      const result = await service.rpc('echims_verify_guardian_otp', { p_guardian_id: id, p_actor_id: auth.userId, p_challenge_id: body.challengeId, p_code_hash: hashCode(body.challengeId, body.code) })
      if (result.error) return dbFailure(result.error)
      if (result.data?.verified !== true) return json({ error: result.data?.error ?? 'Code could not be verified.' }, 400)
      return json({ verified: true, message: 'Guardian mobile number verified.' })
    }
    if (!uuid(body.requestId)) return json({ error: 'A valid request ID is required.' }, 400)
    if (!smsConfiguration().ready) return json({ error: 'OTP sending needs live iProg SMS configuration and a supported provider route.' }, 503)
    const code = String(randomInt(0, 1000000)).padStart(6, '0')
    const start = await service.rpc('echims_begin_guardian_otp', { p_guardian_id: id, p_actor_id: auth.userId, p_request_id: body.requestId, p_code_hash: hashCode(body.requestId, code) })
    if (start.error) return dbFailure(start.error)
    const challenge = start.data as { send: boolean; challenge_id: string; destination?: string; status: string; expires_at: string }
    if (!challenge.send) return json({ challengeId: challenge.challenge_id, status: challenge.status, expiresAt: challenge.expires_at, message: 'Existing OTP request found. No additional code was sent.' })
    const outcome = await sendIprogSms(challenge.destination!, `eCHIMS: Your mobile verification code is ${code}. It expires in 5 minutes. Share it only with the health worker assisting this verification.`)
    const status = outcome.status === 'SUBMITTED' ? 'SENT' : outcome.status
    const finish = await service.rpc('echims_finish_guardian_otp', { p_challenge_id: challenge.challenge_id, p_actor_id: auth.userId, p_status: status, p_provider_uid: outcome.uid, p_error_code: outcome.code })
    if (finish.error) return json({ challengeId: challenge.challenge_id, status: 'UNCERTAIN', error: 'Provider result could not be saved. Check whether a code arrived before requesting another.' }, 503)
    return json({ challengeId: challenge.challenge_id, status, expiresAt: challenge.expires_at, message: status === 'SENT' ? 'OTP submitted to iProg SMS. Ask the guardian to check their phone.' : status === 'FAILED' ? 'iProg SMS rejected the OTP message.' : 'OTP delivery is uncertain. If a code arrived, you may verify it.' })
  } catch { return json({ error: 'Unable to complete OTP processing. Check server configuration and retry the same action.' }, 500) }
}
