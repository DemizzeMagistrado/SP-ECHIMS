import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
const roleAliases: Record<string, UserRole> = {
  administrator: "Administrator",
  admin: "Administrator",
  "public health nurse": "Public Health Nurse",
  phn: "Public Health Nurse",
  "barangay health worker": "Barangay Health Worker",
  bhw: "Barangay Health Worker",
  "rural health midwife": "Rural Health Midwife",
  rhm: "Rural Health Midwife",
  "barangay nutrition scholar": "Barangay Nutrition Scholar",
  bns: "Barangay Nutrition Scholar",
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any) {
  const { data } = await supabase.rpc("get_my_profile").maybeSingle();
  return roleAliases[
    String(data?.role ?? "")
      .trim()
      .toLowerCase()
  ];
}

export const householdHeaders = { 'Cache-Control': 'private, no-store' }
export const householdFailure = (error: string, status: number) => NextResponse.json({error}, {status, headers: householdHeaders})
export async function householdSession(permission: 'view' | 'edit') {
  const db = await createClient()
  const {data: {user}, error} = await db.auth.getUser()
  if (error || !user) return householdFailure('Please sign in.', 401)
  const role = await trustedRole(db)
  if (!role || !canPerform(role, 'Child Profiling', permission)) return householdFailure('Child profiling permission is required.', 403)
  const account = await db.from('users').select('account_status').eq('user_id',user.id).maybeSingle()
  if (account.error) return householdFailure('Unable to verify your account.',500)
  if (account.data?.account_status !== 'ACTIVE') return householdFailure('An active account is required.',403)
  return {db,user}
}
