import { NextResponse } from 'next/server'
import { getAuthorizationContext } from '@/lib/auth/authorization'
import { hasPermission } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'
import type { MasterlistLocation } from '@/lib/masterlist-roster'

export async function masterlistAccess() {
  const context = await getAuthorizationContext()
  if (!context) {
    return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) }
  }
  if (context.accountStatus !== 'ACTIVE' || !context.role || !hasPermission(context.role, 'masterlist.import')) {
    return { error: NextResponse.json({ error: 'Only active PHN, RHM, BHW or Administrator accounts can manage masterlists.' }, { status: 403 }) }
  }
  return { userId: context.authUser.id, supabase: await createClient() }
}

export async function masterlistLocations(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.rpc('mlu_locations')
  if (error) throw new Error('Could not load masterlist locations. Try again.')
  return data as MasterlistLocation[]
}
