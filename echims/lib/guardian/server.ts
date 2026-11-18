import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export function guardianJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' } })
}
export async function guardianSession() {
  if (process.env.GUARDIAN_PORTAL_ENABLED !== 'true') return guardianJson({ error: 'Guardian access is not available yet.' }, 503)
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) return guardianJson({ error: 'Please sign in.' }, 401)
  // The RPC independently checks Auth phone confirmation, staff exclusion, and links.
  return { db, user }
}
export function guardianRpcError(code?: string) {
  return guardianJson({ error: code === '42501' ? 'Access could not be verified. Contact your BHS/RHU if this continues.' : code === '22023' ? 'Check the supplied information.' : 'Unable to load guardian records. Try again.' }, code === '42501' ? 403 : code === '22023' ? 400 : 500)
}
