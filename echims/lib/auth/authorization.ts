import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

import {
  hasPermission,
  type Permission,
  type Role,
} from './permissions'

export async function getAuthorizationContext() {
  const supabase = await createClient()

  console.log('AUTH DEBUG: Starting authorization check')

  // ---------------------------------------------------------
  // 1. Supabase Auth
  // ---------------------------------------------------------

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    console.error(
      'AUTH DEBUG: auth.getUser() error:',
      authError.message
    )
    return null
  }

  if (!user) {
    console.error('AUTH DEBUG: No authenticated user')
    return null
  }

  console.log(
    'AUTH DEBUG: Authenticated user:',
    user.id
  )

  // ---------------------------------------------------------
  // 2. users table
  // ---------------------------------------------------------

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (profileError) {
    console.error(
      'AUTH DEBUG: users query error:',
      profileError.message
    )
    return null
  }

  if (!profile) {
    console.error(
      'AUTH DEBUG: No users record found for auth.uid()'
    )
    return null
  }

  console.log(
    'AUTH DEBUG: User profile found:',
    profile.full_name,
    profile.account_status
  )

  // ---------------------------------------------------------
  // 3. Account status
  // ---------------------------------------------------------

  if (
    String(profile.account_status).toLowerCase() !== 'active'
  ) {
    console.error(
      'AUTH DEBUG: Account is not active:',
      profile.account_status
    )
    return null
  }

  console.log('AUTH DEBUG: Account is active')

  // ---------------------------------------------------------
  // 4. Role tables
  // ---------------------------------------------------------

  const [
    administratorResult,
    phnResult,
    rhmResult,
    bhwResult,
    bnsResult,
  ] = await Promise.all([
    supabase
      .from('administrator')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),

    supabase
      .from('public_health_nurse')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),

    supabase
      .from('rural_health_midwife')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),

    supabase
      .from('barangay_health_worker')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),

    supabase
      .from('barangay_nutrition_scholar')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  console.log('AUTH DEBUG: Role query results:', {
    administrator: administratorResult.data,
    administratorError:
      administratorResult.error?.message,

    phn: phnResult.data,
    phnError: phnResult.error?.message,

    rhm: rhmResult.data,
    rhmError: rhmResult.error?.message,

    bhw: bhwResult.data,
    bhwError: bhwResult.error?.message,

    bns: bnsResult.data,
    bnsError: bnsResult.error?.message,
  })

  // ---------------------------------------------------------
  // 5. Determine role
  // ---------------------------------------------------------

  const roleMatches: Role[] = []

  if (administratorResult.data) {
    roleMatches.push('Administrator')
  }

  if (phnResult.data) {
    roleMatches.push('PHN')
  }

  if (rhmResult.data) {
    roleMatches.push('RHM')
  }

  if (bhwResult.data) {
    roleMatches.push('BHW')
  }

  if (bnsResult.data) {
    roleMatches.push('BNS')
  }

  console.log(
    'AUTH DEBUG: Detected roles:',
    roleMatches
  )

  if (roleMatches.length !== 1) {
    console.error(
      'AUTH DEBUG: Expected exactly one role, found:',
      roleMatches.length
    )
    return null
  }

  const role = roleMatches[0]

  console.log(
    'AUTH DEBUG: Resolved role:',
    role
  )

  // ---------------------------------------------------------
  // 6. Get assignments
  // ---------------------------------------------------------

  const {
    data: assignments,
    error: assignmentError,
  } = await supabase
    .from('health_worker_assignment')
    .select(`
      assignment_id,
      user_id,
      barangay_id,
      assigned_date,
      status,
      barangay (
        barangay_id,
        barangay_name,
        barangay_coordinates,
        municipality,
        province,
        rhu_id,
        rhu (
          rhu_id,
          rhu_name,
          municipality,
          province,
          account_status
        )
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'Active')

  if (assignmentError) {
    console.error(
      'AUTH DEBUG: Assignment query error:',
      assignmentError.message
    )
    return null
  }

  console.log(
    'AUTH DEBUG: Assignments:',
    assignments
  )

  // ---------------------------------------------------------
  // 7. Success
  // ---------------------------------------------------------

  console.log(
    'AUTH DEBUG: Authorization context successfully created'
  )

  return {
    authUser: user,
    profile,
    role,
    assignments: assignments ?? [],
  }
}

export async function requirePermission(
  permission: Permission
) {
  const context = await getAuthorizationContext()

  if (!context) {
    console.error(
      'AUTH DEBUG: getAuthorizationContext() returned null'
    )

    redirect('/login')
  }

  console.log(
    'AUTH DEBUG: Checking permission:',
    permission,
    'for role:',
    context.role
  )

  if (!hasPermission(context.role, permission)) {
    console.error(
      'AUTH DEBUG: Permission denied:',
      permission
    )

    redirect('/unauthorized')
  }

  return context
}