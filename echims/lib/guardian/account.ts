import 'server-only'
import type { User } from '@supabase/supabase-js'
import type { guardianAuthAttempt } from '@/lib/guardian/server'
import { guardianRelationships } from '@/lib/guardian/registration'

export function guardianSignupDetails(input: Record<string, unknown>) {
  const text = (key: string) => typeof input[key] === 'string' ? input[key].trim() : ''
  const first_name = text('first_name')
  const last_name = text('last_name')
  const middle_name = text('middle_name')
  const address = text('address')
  const relationship_to_child = text('relationship_to_child')

  if (!first_name || !last_name || [first_name, middle_name, last_name].some(name => name.length > 100)) return null
  if (!address || address.length > 500 || !guardianRelationships.some(relationship => relationship === relationship_to_child)) return null
  return { account_type: 'guardian', first_name, last_name, middle_name, address, relationship_to_child }
}

export function registerVerifiedGuardian(db: ReturnType<typeof guardianAuthAttempt>, user: User) {
  const metadata = user.user_metadata
  const text = (key: string) => typeof metadata[key] === 'string' ? metadata[key] : null
  return db.rpc('echims_guardian_register', {
    p_first_name: text('first_name'),
    p_last_name: text('last_name'),
    p_middle_name: text('middle_name'),
    p_address: text('address'),
    p_relationship_to_child: text('relationship_to_child'),
  })
}

export function sameGuardianOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false

  // Next can reconstruct Request.url with an internal hostname. Compare against
  // the requested host, keeping the actual transport scheme from the proxy.
  const forwarded = request.headers.get('x-forwarded-proto')
  const protocol = forwarded === 'https' || forwarded === 'http'
    ? forwarded
    : new URL(request.url).protocol.slice(0, -1)
  return origin === `${protocol}://${host}`
}
