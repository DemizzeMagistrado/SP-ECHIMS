import { redirect } from 'next/navigation'

import { getAuthorizationContext } from '@/lib/auth/authorization'
import { createClient } from '@/lib/supabase/server'

import UserManagementClient from './user-management-client'

/* =========================================================
   TYPES
========================================================= */

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

type PhnWorkplace = {
  rhu_id: number
  rhu_name: string
  municipality: string | null
  province: string | null
}

type UserRow = {
  user_id: string
  full_name: string
  username: string
  email: string
  contact_number: string | null
  account_status: string
  role: string

  assignments: Assignment[]

  phn_workplace: PhnWorkplace | null
}

/* =========================================================
   PAGE
========================================================= */

export default async function UserManagementPage() {
  const context =
    await getAuthorizationContext()

  if (!context) {
    redirect('/login')
  }

  if (
    context.role !==
    'Administrator'
  ) {
    redirect('/unauthorized')
  }

  const supabase =
    await createClient()

  /* =======================================================
     LOAD USERS
  ======================================================= */

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
    .order(
      'created_at',
      {
        ascending: false,
      }
    )

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

  /* =======================================================
     LOAD ROLE TABLES
  ======================================================= */

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
      .select(`
        user_id,
        rhu_id,
        rhu (
          rhu_id,
          rhu_name,
          municipality,
          province
        )
      `),

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

  /* =======================================================
     LOG ROLE QUERY ERRORS
  ======================================================= */

  if (administratorResult.error) {
    console.error(
      'ADMINISTRATOR QUERY ERROR:',
      administratorResult.error.message
    )
  }

  if (phnResult.error) {
    console.error(
      'PHN QUERY ERROR:',
      phnResult.error.message
    )
  }

  if (rhmResult.error) {
    console.error(
      'RHM QUERY ERROR:',
      rhmResult.error.message
    )
  }

  if (bhwResult.error) {
    console.error(
      'BHW QUERY ERROR:',
      bhwResult.error.message
    )
  }

  if (bnsResult.error) {
    console.error(
      'BNS QUERY ERROR:',
      bnsResult.error.message
    )
  }

  /* =======================================================
     BUILD ROLE MAP
  ======================================================= */

  const roleMap =
    new Map<string, string>()

  for (
    const row of
    administratorResult.data ?? []
  ) {
    roleMap.set(
      row.user_id,
      'Administrator'
    )
  }

  for (
    const row of
    phnResult.data ?? []
  ) {
    roleMap.set(
      row.user_id,
      'Public Health Nurse'
    )
  }

  for (
    const row of
    rhmResult.data ?? []
  ) {
    roleMap.set(
      row.user_id,
      'Rural Health Midwife'
    )
  }

  for (
    const row of
    bhwResult.data ?? []
  ) {
    roleMap.set(
      row.user_id,
      'Barangay Health Worker'
    )
  }

  for (
    const row of
    bnsResult.data ?? []
  ) {
    roleMap.set(
      row.user_id,
      'Barangay Nutrition Scholar'
    )
  }

  /* =======================================================
     BUILD PHN WORKPLACE MAP

     PHN:
     public_health_nurse.rhu_id
              ↓
             RHU
              ↓
     all barangays in that RHU
  ======================================================= */

  const phnWorkplaceMap =
    new Map<
      string,
      PhnWorkplace
    >()

  for (
    const row of
    phnResult.data ?? []
  ) {
    if (!row.rhu_id) {
      continue
    }

    const rawRhu =
      Array.isArray(row.rhu)
        ? row.rhu[0]
        : row.rhu

    if (!rawRhu) {
      continue
    }

    phnWorkplaceMap.set(
      row.user_id,
      {
        rhu_id:
          rawRhu.rhu_id,

        rhu_name:
          rawRhu.rhu_name,

        municipality:
          rawRhu.municipality,

        province:
          rawRhu.province,
      }
    )
  }

  /* =======================================================
     LOAD HEALTH WORKER ASSIGNMENTS

     We load:
     PENDING
     ACTIVE
     INACTIVE

     because Administrator must be able to inspect pending
     registrations and reactivate inactive accounts.
  ======================================================= */

  const {
    data: assignments,
    error: assignmentsError,
  } = await supabase
    .from(
      'health_worker_assignment'
    )
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
    .in(
      'status',
      [
        'PENDING',
        'ACTIVE',
        'INACTIVE',
      ]
    )
    .order(
      'assigned_date',
      {
        ascending: false,
      }
    )

  if (assignmentsError) {
    console.error(
      'USER MANAGEMENT: assignment query error:',
      assignmentsError.message
    )
  }

  /* =======================================================
     BUILD MULTIPLE ASSIGNMENT MAP

     RHM can have multiple barangays.

     user_id
       ↓
     Assignment[]
  ======================================================= */

  const assignmentMap =
    new Map<
      string,
      Assignment[]
    >()

  for (
    const rawAssignment of
    assignments ?? []
  ) {
    const rawBarangay =
      Array.isArray(
        rawAssignment.barangay
      )
        ? rawAssignment.barangay[0]
        : rawAssignment.barangay

    if (!rawBarangay) {
      continue
    }

    const rawRhu =
      Array.isArray(
        rawBarangay.rhu
      )
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
          rawRhu?.rhu_name ??
          null,
      },
    }

    const existing =
      assignmentMap.get(
        assignment.user_id
      ) ?? []

    existing.push(
      assignment
    )

    assignmentMap.set(
      assignment.user_id,
      existing
    )
  }

  /* =======================================================
     SORT ASSIGNMENTS

     PENDING first so requested workplaces are obvious.
  ======================================================= */

  const assignmentPriority:
    Record<string, number> = {
      PENDING: 0,
      ACTIVE: 1,
      INACTIVE: 2,
    }

  for (
    const [
      userId,
      userAssignments,
    ] of assignmentMap
  ) {
    userAssignments.sort(
      (a, b) => {
        const statusDifference =
          (
            assignmentPriority[
              a.status
            ] ?? 99
          ) -
          (
            assignmentPriority[
              b.status
            ] ?? 99
          )

        if (
          statusDifference !== 0
        ) {
          return statusDifference
        }

        return (
          a.barangay.barangay_name.localeCompare(
            b.barangay.barangay_name
          )
        )
      }
    )

    assignmentMap.set(
      userId,
      userAssignments
    )
  }

  /* =======================================================
     FORMAT USERS FOR CLIENT
  ======================================================= */

  const formattedUsers:
    UserRow[] =
    (users ?? []).map(
      (user) => ({
        user_id:
          user.user_id,

        full_name:
          user.full_name ??
          'Unnamed User',

        username:
          user.username ??
          '',

        email:
          user.email ??
          '',

        contact_number:
          user.contact_number ??
          null,

        account_status:
          user.account_status ??
          'PENDING',

        role:
          roleMap.get(
            user.user_id
          ) ??
          'Unassigned',

        assignments:
          assignmentMap.get(
            user.user_id
          ) ?? [],

        phn_workplace:
          phnWorkplaceMap.get(
            user.user_id
          ) ?? null,
      })
    )

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <UserManagementClient
      users={formattedUsers}
    />
  )
}