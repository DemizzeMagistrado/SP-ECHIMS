import { guardianAuthAttempt, guardianCookieClient, guardianEnabled, guardianJson } from '@/lib/guardian/server'
import { registerVerifiedGuardian, sameGuardianOrigin } from '@/lib/guardian/account'
import { guardianPhone } from '@/lib/guardian/registration'
import { smsService } from '@/lib/sms/server'

export const dynamic = 'force-dynamic'

const invalid = () => guardianJson({ error: 'Unable to sign in. Check your name or mobile number and password. If your name is shared by another guardian, use your mobile number.' }, 401)
const unavailable = () => guardianJson({ error: 'Guardian access is unavailable. Please try again.' }, 503)

export async function POST(request: Request) {
  if (!guardianEnabled()) return unavailable()
  if (!sameGuardianOrigin(request)) return guardianJson({ error: 'Invalid request origin.' }, 403)

  try {
    const body = await request.json().catch(() => null)
    const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!identifier || identifier.length > 302 || !password || password.length > 256) return invalid()

    let phone = guardianPhone(identifier)
    if (!phone) {
      if (!/\p{L}/u.test(identifier)) return invalid()
      // The service-role-only RPC returns a phone only for a unique, enabled match.
      const lookup = await smsService().rpc('echims_guardian_login_phone', { p_full_name: identifier })
      if (lookup.error) return unavailable()
      if (typeof lookup.data !== 'string') return invalid()
      phone = guardianPhone(lookup.data)
      if (!phone) return invalid()
    }

    const db = guardianAuthAttempt()
    const { data, error } = await db.auth.signInWithPassword({ phone, password })
    if (error?.status === 429) return guardianJson({ error: 'Too many sign-in attempts. Please wait and try again.' }, 429)
    if (error || !data.session || !data.user) return invalid()
    const context = await db.rpc('echims_guardian_context')
    if (context.error) return context.error.code === '42501' ? invalid() : unavailable()

    // A verified signup can be retried if the original registration request was interrupted.
    if (!context.data?.registered || !context.data?.linked) {
      if (data.user.user_metadata?.account_type !== 'guardian') return invalid()
      const enrollment = await registerVerifiedGuardian(db, data.user)
      if (enrollment.error) return guardianJson({ error: 'Unable to finish registration. Contact your BHS/RHU if this continues.' }, 409)
    }

    const session = await guardianCookieClient()
    const saved = await session.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    if (saved.error || !saved.data.session) return unavailable()
    return guardianJson({ ok: true })
  } catch {
    return unavailable()
  }
}

export async function DELETE(request: Request) {
  if (!sameGuardianOrigin(request)) return guardianJson({ error: 'Invalid request origin.' }, 403)
  try {
    const db = await guardianCookieClient()
    const { error } = await db.auth.signOut({ scope: 'local' })
    return error ? unavailable() : guardianJson({ ok: true })
  } catch {
    return unavailable()
  }
}
