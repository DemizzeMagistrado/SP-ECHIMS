import { NextResponse } from 'next/server'
import { guardianAuthAttempt, guardianJson, guardianRpcError, guardianSession } from '@/lib/guardian/server'
import { sameGuardianOrigin } from '@/lib/guardian/account'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!sameGuardianOrigin(request)) return guardianJson({ error: 'Invalid request origin.' }, 403)
  try {
    const body = await request.json().catch(() => null)
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    if (!currentPassword || currentPassword.length > 256) return guardianJson({ error: 'Enter your current password.' }, 400)
    if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return guardianJson({ error: 'Use a password with at least 8 characters and no more than 72 bytes.' }, 400)
    }

    const auth = await guardianSession()
    if (auth instanceof NextResponse) return auth
    const context = await auth.db.rpc('echims_guardian_context')
    if (context.error) return guardianRpcError(context.error.code)
    if (!context.data?.registered || !auth.user.phone) {
      return guardianJson({ error: 'A verified guardian account is required to change this password.' }, 403)
    }

    const verification = await guardianAuthAttempt().auth.signInWithPassword({
      phone: auth.user.phone,
      password: currentPassword,
    })
    if (verification.error || verification.data.user?.id !== auth.user.id) {
      return guardianJson({ error: 'Your current password is incorrect.' }, 400)
    }

    const updated = await auth.db.auth.updateUser({ password: newPassword })
    if (updated.error) return guardianJson({ error: 'Unable to update your password. Try again.' }, 400)
    return guardianJson({ ok: true })
  } catch {
    return guardianJson({ error: 'Unable to update your password. Try again.' }, 500)
  }
}
