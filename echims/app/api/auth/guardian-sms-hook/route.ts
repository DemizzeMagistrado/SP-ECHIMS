import { guardianJson } from '@/lib/guardian/server'
import { verifyGuardianHook } from '@/lib/guardian/hook-signature'
import { smsService } from '@/lib/sms/server'
import { sendIprogSms, smsConfiguration } from '@/lib/sms/iprogsms'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20
const fail = (status: number) => guardianJson({ error: { http_code: status, message: 'Unable to send a login code. Wait before trying again.' } }, status)
  export async function POST(request: Request) {
  const hookSecret = process.env.GUARDIAN_SMS_HOOK_SECRET

  if (!hookSecret) {
    return guardianJson({
      error: {
        http_code: 503,
        message: 'GUARDIAN_SMS_HOOK_SECRET is missing',
      },
    }, 503)
  }

  // Keep your remaining configuration checks below.
  const config = smsConfiguration()

console.info('Guardian hook configuration', {
  portalEnabled: process.env.GUARDIAN_PORTAL_ENABLED === 'true',
  hookSecretPresent: Boolean(process.env.GUARDIAN_SMS_HOOK_SECRET),
  smsLive: config.mode === 'live',
  providerSupported: ['iprogsms', 'iprog'].includes(config.provider),
  tokenPresent: Boolean(config.token),
  configurationValid: config.configured,
})
  const smsCheck = smsConfiguration()

const missingSettings = [
  process.env.GUARDIAN_PORTAL_ENABLED !== 'true'
    ? 'GUARDIAN_PORTAL_ENABLED must equal true'
    : null,
  !process.env.GUARDIAN_SMS_HOOK_SECRET
    ? 'GUARDIAN_SMS_HOOK_SECRET is missing'
    : null,
  smsCheck.mode !== 'live'
    ? 'SMS_MODE must equal live'
    : null,
  !smsCheck.configured
    ? 'Check IPROG_SMS_API_TOKEN, SMS_PROVIDER=iprogsms, and IPROG_SMS_PROVIDER=0'
    : null,
].filter(Boolean)

if (missingSettings.length) {
  return guardianJson({
    error: {
      http_code: 503,
      message: 'SMS configuration incomplete',
    },
    missingSettings,
  }, 503)
}
  try {
    // Bounded streaming read before verification; never log the OTP or payload.
    const reader = request.body?.getReader()
    if (!reader) return fail(400)
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32768) { await reader.cancel(); return fail(413) }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks).toString('utf8')
    let verified: ReturnType<typeof verifyGuardianHook>
    try {
      verified = verifyGuardianHook(body, request.headers, hookSecret)
    } catch {
      return fail(401)
    }    
    const payload = JSON.parse(body)
    const phone = String(payload?.user?.phone ?? '').replace(/^\+/, '')
    const otp = payload?.sms?.otp
    if (payload?.user?.user_metadata?.account_type !== 'guardian' || !/^639\d{9}$/.test(phone) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) return fail(400)
    const db = smsService()
    const reserve = await db.rpc('echims_guardian_sms_reserve', { p_event_id: verified.id, p_payload_hash: verified.payloadHash, p_phone_hash: verified.hashPhone(phone) })
    if (reserve.error) return fail(503)
    if (reserve.data === 'SUBMITTED') return guardianJson({})
    if (reserve.data !== 'RESERVED') return fail(reserve.data === 'LIMITED' ? 429 : 503)
    let outcome: 'SUBMITTED' | 'FAILED' | 'UNCERTAIN' = 'UNCERTAIN'
    try { outcome = (await sendIprogSms(phone, `Login code: ${otp}. Huwag ibahagi / Do not share.`, 3000)).status } catch { /* Keep delivery uncertain; never blindly replay. */ }
    const finished = await db.rpc('echims_guardian_sms_finish', { p_event_id: verified.id, p_payload_hash: verified.payloadHash, p_status: outcome })
    if (finished.error || finished.data !== true || outcome !== 'SUBMITTED') return fail(503)
    return guardianJson({})
  } catch { return fail(503) }
}
