import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizationContext } from '@/lib/auth/authorization'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { NextResponse } from 'next/server'
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const roles: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator', phn: 'Public Health Nurse', 'public health nurse': 'Public Health Nurse',
  rhm: 'Rural Health Midwife', 'rural health midwife': 'Rural Health Midwife', bhw: 'Barangay Health Worker', 'barangay health worker': 'Barangay Health Worker',
  bns: 'Barangay Nutrition Scholar', 'barangay nutrition scholar': 'Barangay Nutrition Scholar',
}
export async function smsSession(program?: string, send = false) {
  const context = await getAuthorizationContext()
  if (!context) return json({ error: 'Please sign in.' }, 401)
  const role = roles[String(context.role).trim().toLowerCase()]
  if (!role) return json({ error: 'An authorized role is required.' }, 403)
  if (program !== undefined) {
    if (!['VACCINATION', 'SUPPLEMENTATION'].includes(program)) return json({ error: 'Choose a valid SMS program.' }, 400)
    if (!canPerform(role, program === 'VACCINATION' ? 'Vaccination' : 'Supplementation', 'view')) return json({ error: 'This program is outside your permissions.' }, 403)
    if (send && role === 'Administrator') return json({ error: 'Administrators can view SMS logs but cannot send reminders.' }, 403)
    if (send && !['Rural Health Midwife', 'Barangay Health Worker'].includes(role)) return json({ error: 'Only authorized RHM/BHW accounts may send program reminders.' }, 403)
  }
  const db = await createClient()
  const account = await db.from('users').select('account_status').eq('user_id', context.authUser.id).maybeSingle()
  if (account.error) return json({ error: 'Unable to verify account access.' }, 500)
  if (account.data?.account_status !== 'ACTIVE') return json({ error: 'An active account is required.' }, 403)
  return { db, userId: context.authUser.id, role }
}
export function smsService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('The server SMS database configuration is incomplete.')
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}
export function dbFailure(error: { code?: string; message: string }) {
  const status = error.code === '42501' ? 403 : ['22023', '23514'].includes(error.code ?? '') ? 400 : error.code === '23505' ? 409 : error.code === 'P0001' ? 429 : 500
  return json({ error: status === 500 ? 'Unable to process SMS. Check the SMS migration and server configuration.' : error.message }, status)
}
