import { requirePermission } from '@/lib/auth/authorization'
import { createClient } from '@/lib/supabase/server'
import UserManagementClient from './user-management-client'

export default async function UserManagementPage() {
  await requirePermission('users.view')

  const supabase = await createClient()

  const { data: users, error } = await supabase
    .from('users')
    .select(`
      user_id,
      full_name,
      username,
      email,
      contact_number,
      account_status,
      created_at
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  /*
   * Get actual role membership.
   * Role is determined from the role tables,
   * not from registration metadata.
   */

  const [
    administratorResult,
    phnResult,
    rhmResult,
    bhwResult,
    bnsResult,
  ] = await Promise.all([
    supabase
      .from('administrator')
      .select('user_id'),

    supabase
      .from('public_health_nurse')
      .select('user_id'),

    supabase
      .from('rural_health_midwife')
      .select('user_id'),

    supabase
      .from('barangay_health_worker')
      .select('user_id'),

    supabase
      .from('barangay_nutrition_scholar')
      .select('user_id'),
  ])

  const roleMap = new Map<
    string,
    string
  >()

  administratorResult.data?.forEach((row) => {
    roleMap.set(row.user_id, 'Administrator')
  })

  phnResult.data?.forEach((row) => {
    roleMap.set(row.user_id, 'PHN')
  })

  rhmResult.data?.forEach((row) => {
    roleMap.set(row.user_id, 'RHM')
  })

  bhwResult.data?.forEach((row) => {
    roleMap.set(row.user_id, 'BHW')
  })

  bnsResult.data?.forEach((row) => {
    roleMap.set(row.user_id, 'BNS')
  })

  /*
   * Get active worker assignments.
   */

  const { data: assignments, error: assignmentError } =
    await supabase
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
          municipality,
          province,
          rhu_id,
          rhu (
            rhu_id,
            rhu_name
          )
        )
      `)
      .eq('status', 'ACTIVE')

  if (assignmentError) {
    throw new Error(assignmentError.message)
  }

  const assignmentMap = new Map<
    string,
    {
      barangayName: string
      municipality: string
      province: string
      rhuName: string
    }
  >()

  assignments?.forEach((assignment: any) => {
    const barangay = assignment.barangay

    if (!barangay) {
      return
    }

    const rhu = barangay.rhu

    assignmentMap.set(assignment.user_id, {
      barangayName: barangay.barangay_name,
      municipality: barangay.municipality,
      province: barangay.province,
      rhuName: rhu?.rhu_name ?? 'No RHU',
    })
  })

  const enrichedUsers = (users ?? []).map((user) => {
    const assignment = assignmentMap.get(user.user_id)

    return {
      ...user,

      role: roleMap.get(user.user_id) ?? 'No Role',

      assignment: assignment
        ? {
            barangayName: assignment.barangayName,
            municipality: assignment.municipality,
            province: assignment.province,
            rhuName: assignment.rhuName,
          }
        : null,
    }
  })

  return (
    <UserManagementClient
      users={enrichedUsers}
    />
  )
}