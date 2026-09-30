import { redirect } from 'next/navigation'

import { getAuthorizationContext } from '@/lib/auth/authorization'
import UserManagementClient from './user-management-client'

type Assignment = {
  assignment_id: number
  user_id: string
  barangay_id: number
  assigned_date: string
  status: string
  barangay: {
    barangay_id: number
    barangay_name: string
    municipality: string | null
    province: string | null
    rhu_id: number
    rhu_name: string | null
  }
}

type UserRow = {
  user_id: string
  full_name: string
  username: string
  email: string
  contact_number: string | null
  account_status: string
  role: string
  assignment: Assignment | null
}

export default async function UserManagementPage() {
  const context = await getAuthorizationContext()

  if (!context) {
    redirect('/login')
  }

  if (context.role !== 'Administrator') {
    redirect('/unauthorized')
  }

  const supabase = await import('@/lib/supabase/server').then(
    (module) => module.createClient()
  )

  /* =========================================================
     LOAD USERS
  ========================================================= */

  const {
    data: users,
    error: usersError,
  } = await supabase
    .from('users')
    .select(`
      user_id,
      full_name,
      username,
      email,
      contact_number,
      account_status
    `)
    .order('created_at', {
      ascending: false,
    })

  if (usersError) {
    console.error(
      'USER MANAGEMENT: users query error:',
      usersError.message
    )

    return (
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-[#023E8A]">
          User Management
        </h1>

        <p className="mt-4 text-sm text-red-600">
          Unable to load user accounts.
        </p>
      </div>
    )
  }

  /* =========================================================
     LOAD ROLE TABLES
  ========================================================= */

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

  /* =========================================================
     BUILD ROLE MAP
  ========================================================= */

  const roleMap = new Map<string, string>()

  for (const row of administratorResult.data ?? []) {
    roleMap.set(row.user_id, 'Administrator')
  }

  for (const row of phnResult.data ?? []) {
    roleMap.set(row.user_id, 'Public Health Nurse')
  }

  for (const row of rhmResult.data ?? []) {
    roleMap.set(row.user_id, 'Rural Health Midwife')
  }

  for (const row of bhwResult.data ?? []) {
    roleMap.set(row.user_id, 'Barangay Health Worker')
  }

  for (const row of bnsResult.data ?? []) {
    roleMap.set(
      row.user_id,
      'Barangay Nutrition Scholar'
    )
  }

  /* =========================================================
     LOAD WORKPLACE ASSIGNMENTS
     
     We intentionally load PENDING and ACTIVE assignments.
     
     PENDING = waiting for administrator verification
     ACTIVE  = approved workplace
  ========================================================= */

  const {
    data: assignments,
    error: assignmentsError,
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
        municipality,
        province,
        rhu_id,
        rhu (
          rhu_id,
          rhu_name
        )
      )
    `)
    .in('status', ['PENDING', 'ACTIVE'])
    .order('assigned_date', {
      ascending: false,
    })

  if (assignmentsError) {
    console.error(
      'USER MANAGEMENT: assignment query error:',
      assignmentsError.message
    )
  }

  /* =========================================================
     BUILD ASSIGNMENT MAP
     
     If a user somehow has more than one assignment,
     prefer PENDING because it requires verification.
     
     NOTE:
     Your database supports multiple barangays for workers.
     This first UI displays the most relevant assignment.
  ========================================================= */

  const assignmentMap = new Map<
    string,
    Assignment
  >()

  for (const rawAssignment of assignments ?? []) {
    const rawBarangay = Array.isArray(
      rawAssignment.barangay
    )
      ? rawAssignment.barangay[0]
      : rawAssignment.barangay

    if (!rawBarangay) {
      continue
    }

    const rawRhu = Array.isArray(rawBarangay.rhu)
      ? rawBarangay.rhu[0]
      : rawBarangay.rhu

    const assignment: Assignment = {
      assignment_id:
        rawAssignment.assignment_id,

      user_id:
        rawAssignment.user_id,

      barangay_id:
        rawAssignment.barangay_id,

      assigned_date:
        rawAssignment.assigned_date,

      status:
        rawAssignment.status,

      barangay: {
        barangay_id:
          rawBarangay.barangay_id,

        barangay_name:
          rawBarangay.barangay_name,

        municipality:
          rawBarangay.municipality,

        province:
          rawBarangay.province,

        rhu_id:
          rawBarangay.rhu_id,

        rhu_name:
          rawRhu?.rhu_name ?? null,
      },
    }

    const existing =
      assignmentMap.get(
        assignment.user_id
      )

    /*
     * Prefer PENDING over ACTIVE.
     */
    if (
      !existing ||
      (
        assignment.status === 'PENDING' &&
        existing.status !== 'PENDING'
      )
    ) {
      assignmentMap.set(
        assignment.user_id,
        assignment
      )
    }
  }

  /* =========================================================
     FORMAT USERS FOR CLIENT
  ========================================================= */

  const formattedUsers: UserRow[] =
    (users ?? []).map((user) => ({
      user_id: user.user_id,

      full_name:
        user.full_name ?? 'Unnamed User',

      username:
        user.username ?? '',

      email:
        user.email ?? '',

      contact_number:
        user.contact_number ?? null,

      account_status:
        user.account_status ?? 'PENDING',

      role:
        roleMap.get(user.user_id) ??
        'Unassigned',

      assignment:
        assignmentMap.get(user.user_id) ??
        null,
    }))

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <UserManagementClient
      users={formattedUsers}
    />
  )
}