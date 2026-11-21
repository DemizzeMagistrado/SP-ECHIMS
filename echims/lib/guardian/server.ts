import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase configuration is incomplete.')
  return { url, key }
}

export function guardianAuthAttempt() {
  const { url, key } = credentials()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export async function guardianCookieClient() {
  const { url, key } = credentials()
  const jar = await cookies()
  const secure = (await headers()).get('x-forwarded-proto') === 'https' || process.env.VERCEL === '1'
  return createServerClient(url, key, {
    cookieOptions: { name: 'echims-guardian-session', httpOnly: true, sameSite: 'lax', secure, path: '/' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (changes) => changes.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  })
}

export function guardianJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } })
}

export function guardianEnabled() {
  return process.env.GUARDIAN_PORTAL_ENABLED === 'true'
}

export async function guardianSession() {
  if (!guardianEnabled()) return guardianJson({ error: 'Guardian access is not available yet.' }, 503)
  const db = await guardianCookieClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) return guardianJson({ error: 'Please sign in.' }, 401)
  return { db, user }
}

export function guardianRpcError(code?: string) {
  if (code === '42501') return guardianJson({ error: 'Access could not be verified. Contact your BHS/RHU if this continues.' }, 403)
  if (code === '22023') return guardianJson({ error: 'Check the supplied information.' }, 400)
  return guardianJson({ error: 'Unable to load guardian records. Try again.' }, 500)
}
