import { guardianAuthAttempt, guardianEnabled, guardianJson, guardianRpcError } from '@/lib/guardian/server'
import { guardianSignupDetails, registerVerifiedGuardian, sameGuardianOrigin } from '@/lib/guardian/account'
import { guardianPhone } from '@/lib/guardian/registration'

export const dynamic = 'force-dynamic'

function validPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password, 'utf8') <= 72
}

export async function POST(request: Request) {
  if (!guardianEnabled()) return guardianJson({ error: 'Guardian access is not available yet.' }, 503)
  if (!sameGuardianOrigin(request)) return guardianJson({ error: 'Invalid request origin.' }, 403)

  try {
    const body = await request.json().catch(() => null)
    const phone = typeof body?.phone === 'string' && body.phone.length <= 32 ? guardianPhone(body.phone) : null
    if (!phone) return guardianJson({ error: 'Enter a valid Philippine mobile number.' }, 400)
    const db = guardianAuthAttempt()
    const noCode = () => guardianJson({ error: 'Unable to send a code. Check the mobile number, wait a moment, or sign in if you already set a password.' }, 400)

    if (body.action === 'start') {
      const details = guardianSignupDetails(body.details ?? {})
      if (!details || !validPassword(body.password) || body.acceptedTerms !== true) {
        return guardianJson({ error: 'Complete the registration details, terms, and password (at least 8 characters, up to 72 bytes).' }, 400)
      }
      const signup = await db.auth.signUp({ phone, password: body.password, options: { channel: 'sms', data: details } })
      if (signup.error) return noCode()
      if (signup.data.session) {
        await db.auth.signOut({ scope: 'local' })
        return guardianJson({ error: 'Phone confirmation must be enabled before guardian registration can continue.' }, 503)
      }
      return guardianJson({ ok: true })
    }

    if (body.action === 'resend' || body.action === 'activate') {
      const sent = body.action === 'resend'
        ? await db.auth.resend({ type: 'sms', phone })
        : await db.auth.signInWithOtp({ phone, options: { channel: 'sms', shouldCreateUser: false } })
      return sent.error ? noCode() : guardianJson({ ok: true })
    }

    if (body.action !== 'verify' || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      return guardianJson({ error: 'Enter the six-digit verification code.' }, 400)
    }

    const verified = await db.auth.verifyOtp({ phone, token: body.code, type: 'sms' })
    if (verified.error || !verified.data.session || !verified.data.user) {
      return guardianJson({ error: 'The verification code is invalid or expired.' }, 400)
    }

    try {
      const { data: canSetPassword, error } = await db.rpc('echims_guardian_can_set_password')
      if (error) return guardianRpcError(error.code)
      if (canSetPassword) {
        if (body.activation !== true || !validPassword(body.password)) {
          return guardianJson({ error: 'Set a password through the existing guardian account option.' }, 400)
        }
        const updated = await db.auth.updateUser({ password: body.password })
        if (updated.error) return guardianJson({ error: 'Unable to set your password. Request a new code and try again.' }, 400)
      } else if (body.activation === true) {
        return guardianJson({ error: 'This account already has a password. Please sign in.' }, 409)
      }

      const context = await db.rpc('echims_guardian_context')
      if (context.error) return guardianRpcError(context.error.code)
      if (!context.data?.registered || !context.data?.linked) {
        const enrollment = await registerVerifiedGuardian(db, verified.data.user)
        if (enrollment.error) return guardianRpcError(enrollment.error.code)
      }
      return guardianJson({ ok: true })
    } finally {
      await db.auth.signOut({ scope: 'local' })
    }
  } catch {
    return guardianJson({ error: 'Unable to complete guardian registration. Try again.' }, 500)
  }
}
