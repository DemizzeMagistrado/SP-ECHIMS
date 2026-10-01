import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/* =========================================================
   TYPES
========================================================= */

type HealthWorkerRole =
  | 'PHN'
  | 'RHM'
  | 'BHW'
  | 'BNS'

type UserRole =
  | 'Administrator'
  | HealthWorkerRole

type ActivityType =
  | 'VACCINATION'
  | 'NUTRITIONAL_ASSESSMENT'
  | 'SUPPLEMENTATION'

type ConflictRow = {
  schedule_id?: number
  activity_type?: string
  schedule_date?: string
  start_time?: string
  end_time?: string
  barangay_id?: number
  created_by?: string
  conflict_rule?: string
  conflict_reason?: string
}

type ScheduleSuggestion = {
  suggested_date: string
  suggested_start_time: string
  suggested_end_time: string
}

/* =========================================================
   CONSTANTS
========================================================= */

const VALID_ACTIVITY_TYPES: ActivityType[] = [
  'VACCINATION',
  'NUTRITIONAL_ASSESSMENT',
  'SUPPLEMENTATION',
]

const ALLOWED_ACTIVITIES_BY_ROLE: Record<
  HealthWorkerRole,
  ActivityType[]
> = {
  PHN: [
    'VACCINATION',
    'NUTRITIONAL_ASSESSMENT',
    'SUPPLEMENTATION',
  ],

  RHM: [
    'VACCINATION',
    'NUTRITIONAL_ASSESSMENT',
    'SUPPLEMENTATION',
  ],

  BHW: [
    'VACCINATION',
  ],

  BNS: [
    'NUTRITIONAL_ASSESSMENT',
    'SUPPLEMENTATION',
  ],
}

/* =========================================================
   HELPERS
========================================================= */

function isActivityType(
  value: string
): value is ActivityType {
  return VALID_ACTIVITY_TYPES.includes(
    value as ActivityType
  )
}

function isPastDate(
  scheduleDate: string
) {
  const today = new Date()

  const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  return scheduleDate < localToday
}

/* =========================================================
   POST
   Create health activity request
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    const supabase = await createClient()

    /* -----------------------------------------------------
       1. AUTHENTICATION
    ----------------------------------------------------- */

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Unauthorized.',
        },
        {
          status: 401,
        }
      )
    }

    /* -----------------------------------------------------
       2. REQUEST BODY
    ----------------------------------------------------- */

    let body: Record<string, unknown>

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          error: 'Invalid request body.',
        },
        {
          status: 400,
        }
      )
    }

    const rawActivityType = String(
      body.activityType ?? ''
    ).trim()

    const scheduleDate = String(
      body.scheduleDate ?? ''
    ).trim()

    const startTime = String(
      body.startTime ?? ''
    ).trim()

    const endTime = String(
      body.endTime ?? ''
    ).trim()

    const barangayId = Number(
      body.barangayId
    )

    const remarks =
      typeof body.remarks === 'string'
        ? body.remarks.trim()
        : null

    /* -----------------------------------------------------
       3. BASIC VALIDATION
       SCH-R003 / SCH-R014 / SCH-R015 / SCH-R016
    ----------------------------------------------------- */

    if (!isActivityType(rawActivityType)) {
      return NextResponse.json(
        {
          error:
            'SCH-R016: Invalid health activity type.',
          rule: 'SCH-R016',
        },
        {
          status: 400,
        }
      )
    }

    /*
     * After isActivityType() succeeds,
     * TypeScript knows this is ActivityType.
     */
    const activityType = rawActivityType

    if (!scheduleDate) {
      return NextResponse.json(
        {
          error:
            'SCH-R015: Schedule date is required.',
          rule: 'SCH-R015',
        },
        {
          status: 400,
        }
      )
    }

    if (!startTime || !endTime) {
      return NextResponse.json(
        {
          error:
            'SCH-R015: Start time and end time are required.',
          rule: 'SCH-R015',
        },
        {
          status: 400,
        }
      )
    }

    if (
      !Number.isInteger(barangayId) ||
      barangayId <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'SCH-R015: A valid barangay is required.',
          rule: 'SCH-R015',
        },
        {
          status: 400,
        }
      )
    }

    if (endTime <= startTime) {
      return NextResponse.json(
        {
          error:
            'SCH-R003: End time must be later than start time.',
          rule: 'SCH-R003',
        },
        {
          status: 400,
        }
      )
    }

    if (isPastDate(scheduleDate)) {
      return NextResponse.json(
        {
          error:
            'SCH-R014: A health activity cannot be scheduled in the past.',
          rule: 'SCH-R014',
        },
        {
          status: 400,
        }
      )
    }

    /* -----------------------------------------------------
       4. VERIFY ACTIVE USER
    ----------------------------------------------------- */

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('users')
      .select(`
        user_id,
        account_status
      `)
      .eq('user_id', user.id)
      .maybeSingle()

    if (
      profileError ||
      !profile ||
      profile.account_status !== 'ACTIVE'
    ) {
      return NextResponse.json(
        {
          error:
            'Your account is not authorized to request health activities.',
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       5. VERIFY HEALTH WORKER
    ----------------------------------------------------- */

    const {
      data: healthWorker,
      error: healthWorkerError,
    } = await supabase
      .from('health_worker')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (
      healthWorkerError ||
      !healthWorker
    ) {
      return NextResponse.json(
        {
          error:
            'Only authorized health workers can create health activity requests.',
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       6. DETERMINE HEALTH WORKER ROLE
    ----------------------------------------------------- */

    const [
      phnResult,
      rhmResult,
      bhwResult,
      bnsResult,
    ] = await Promise.all([
      supabase
        .from('public_health_nurse')
        .select('user_id, rhu_id')
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

    let role: HealthWorkerRole | null =
      null

    if (phnResult.data) {
      role = 'PHN'
    } else if (rhmResult.data) {
      role = 'RHM'
    } else if (bhwResult.data) {
      role = 'BHW'
    } else if (bnsResult.data) {
      role = 'BNS'
    }

    if (!role) {
      return NextResponse.json(
        {
          error:
            'Unable to determine health worker role.',
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       7. ROLE + ACTIVITY AUTHORIZATION

       PHN:
       - Vaccination
       - Nutritional Assessment
       - Supplementation

       RHM:
       - Vaccination
       - Nutritional Assessment
       - Supplementation

       BHW:
       - Vaccination

       BNS:
       - Nutritional Assessment
       - Supplementation
    ----------------------------------------------------- */

    if (
      !ALLOWED_ACTIVITIES_BY_ROLE[
        role
      ].includes(activityType)
    ) {
      return NextResponse.json(
        {
          error: `${role} is not authorized to request a ${activityType
            .replaceAll('_', ' ')
            .toLowerCase()} activity.`,
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       8. GEOGRAPHIC AUTHORIZATION

       SCH-R007:
       PHN must stay inside assigned RHU.

       SCH-R006:
       RHM/BHW/BNS must have ACTIVE barangay assignment.
    ----------------------------------------------------- */

    if (role === 'PHN') {
      const phnRhuId =
        phnResult.data?.rhu_id

      if (!phnRhuId) {
        return NextResponse.json(
          {
            error:
              'No RHU is assigned to this Public Health Nurse.',
          },
          {
            status: 403,
          }
        )
      }

      const {
        data: barangay,
        error: barangayError,
      } = await supabase
        .from('barangay')
        .select(`
          barangay_id,
          rhu_id
        `)
        .eq(
          'barangay_id',
          barangayId
        )
        .eq(
          'rhu_id',
          phnRhuId
        )
        .maybeSingle()

      if (
        barangayError ||
        !barangay
      ) {
        return NextResponse.json(
          {
            error:
              'SCH-R007: The selected barangay is outside your assigned RHU.',
            rule: 'SCH-R007',
          },
          {
            status: 403,
          }
        )
      }
    } else {
      const {
        data: assignment,
        error: assignmentError,
      } = await supabase
        .from(
          'health_worker_assignment'
        )
        .select(`
          assignment_id,
          barangay_id,
          status
        `)
        .eq('user_id', user.id)
        .eq(
          'barangay_id',
          barangayId
        )
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (
        assignmentError ||
        !assignment
      ) {
        return NextResponse.json(
          {
            error:
              'SCH-R006: You are not assigned to the selected barangay.',
            rule: 'SCH-R006',
          },
          {
            status: 403,
          }
        )
      }
    }

    /* -----------------------------------------------------
       9. RULE ENGINE — CHECK CONFLICTS

       SCH-R001:
       Same barangay overlap = warning.

       SCH-R002:
       Same worker overlap = hard conflict.
    ----------------------------------------------------- */

    const {
      data: conflictData,
      error: conflictError,
    } = await supabase.rpc(
      'check_health_activity_conflicts',
      {
        p_schedule_date:
          scheduleDate,

        p_start_time:
          startTime,

        p_end_time:
          endTime,

        p_barangay_id:
          barangayId,

        p_created_by:
          user.id,

        p_exclude_schedule_id:
          null,
      }
    )

    if (conflictError) {
      console.error(
        'Conflict evaluation error:',
        conflictError
      )

      return NextResponse.json(
        {
          error:
            'Unable to evaluate scheduling rules.',
        },
        {
          status: 500,
        }
      )
    }

    const conflictRows =
      (conflictData ??
        []) as ConflictRow[]

    const hardConflicts =
      conflictRows.filter(
        (item) =>
          item.conflict_rule ===
          'SCH-R002'
      )

    const warnings =
      conflictRows.filter(
        (item) =>
          item.conflict_rule ===
          'SCH-R001'
      )

    /* -----------------------------------------------------
       10. ALTERNATIVE SCHEDULES
       SCH-R004 / SCH-R005 / SCH-R017
    ----------------------------------------------------- */

    let suggestions:
      ScheduleSuggestion[] = []

    if (conflictRows.length > 0) {
      const {
        data: suggestionData,
        error: suggestionError,
      } = await supabase.rpc(
        'suggest_health_activity_slots',
        {
          p_requested_date:
            scheduleDate,

          p_barangay_id:
            barangayId,

          p_created_by:
            user.id,

          p_exclude_schedule_id:
            null,

          p_days_to_check: 7,

          p_max_suggestions: 3,
        }
      )

      if (suggestionError) {
        console.error(
          'Schedule suggestion error:',
          suggestionError
        )
      } else {
        suggestions =
          (suggestionData ??
            []) as ScheduleSuggestion[]
      }
    }

    /* -----------------------------------------------------
       11. SAVE REQUEST

       Conflict requests may still be submitted.

       SCH-R001:
       PHN may approve an intentional barangay overlap.

       SCH-R002:
       Request remains PENDING and cannot be approved
       until the hard conflict is resolved.
    ----------------------------------------------------- */

    const conflictStatus =
      conflictRows.length > 0
        ? 'DETECTED'
        : 'NONE'

    const {
      data: schedule,
      error: insertError,
    } = await supabase
      .from(
        'health_activity_schedule'
      )
      .insert({
        activity_type:
          activityType,

        schedule_date:
          scheduleDate,

        start_time:
          startTime,

        end_time:
          endTime,

        status:
          'PENDING',

        remarks:
          remarks || null,

        created_by:
          user.id,

        barangay_id:
          barangayId,

        conflict_status:
          conflictStatus,
      })
      .select(`
        schedule_id,
        activity_type,
        schedule_date,
        start_time,
        end_time,
        status,
        remarks,
        conflict_status,
        created_at,
        barangay_id
      `)
      .single()

    if (insertError) {
      console.error(
        'Schedule insert error:',
        insertError
      )

      return NextResponse.json(
        {
          error:
            'Unable to create health activity request.',
        },
        {
          status: 500,
        }
      )
    }

    /* -----------------------------------------------------
       12. RETURN RULE ENGINE RESULT
    ----------------------------------------------------- */

    return NextResponse.json(
      {
        message:
          hardConflicts.length > 0
            ? 'Health activity request submitted with a worker scheduling conflict. It must be rescheduled before PHN approval.'
            : warnings.length > 0
              ? 'Health activity request submitted with a same-barangay scheduling warning for PHN review.'
              : 'Health activity request submitted successfully.',

        schedule,

        ruleEvaluation: {
          hasConflict:
            conflictRows.length > 0,

          hasHardConflict:
            hardConflicts.length > 0,

          conflicts:
            hardConflicts,

          warnings,

          suggestions,
        },
      },
      {
        status: 201,
      }
    )
  } catch (error) {
    console.error(
      'Health activity request error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'An unexpected error occurred.',
      },
      {
        status: 500,
      }
    )
  }
}

/* =========================================================
   GET
   Load health activities based on geographic scope
========================================================= */

export async function GET() {
  try {
    const supabase = await createClient()

    /* -----------------------------------------------------
       1. AUTHENTICATION
    ----------------------------------------------------- */

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Unauthorized.',
        },
        {
          status: 401,
        }
      )
    }

    /* -----------------------------------------------------
       2. ACTIVE ACCOUNT
    ----------------------------------------------------- */

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('users')
      .select(`
        user_id,
        full_name,
        account_status
      `)
      .eq('user_id', user.id)
      .maybeSingle()

    if (
      profileError ||
      !profile ||
      profile.account_status !== 'ACTIVE'
    ) {
      return NextResponse.json(
        {
          error:
            'Account is not active.',
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       3. DETERMINE ROLE
    ----------------------------------------------------- */

    const [
      adminResult,
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
        .select('user_id, rhu_id')
        .eq('user_id', user.id)
        .maybeSingle(),

      supabase
        .from('rural_health_midwife')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle(),

      supabase
        .from(
          'barangay_health_worker'
        )
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle(),

      supabase
        .from(
          'barangay_nutrition_scholar'
        )
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    let role: UserRole | null = null

    if (adminResult.data) {
      role = 'Administrator'
    } else if (phnResult.data) {
      role = 'PHN'
    } else if (rhmResult.data) {
      role = 'RHM'
    } else if (bhwResult.data) {
      role = 'BHW'
    } else if (bnsResult.data) {
      role = 'BNS'
    }

    if (!role) {
      return NextResponse.json(
        {
          error:
            'Unable to determine user role.',
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       4. DETERMINE VISIBLE BARANGAYS

       Administrator:
       system-wide.

       PHN:
       barangays belonging to assigned RHU.

       RHM/BHW/BNS:
       ACTIVE assigned barangays.
    ----------------------------------------------------- */

    let allowedBarangayIds:
      number[] | null = null

    if (role === 'PHN') {
      const rhuId =
        phnResult.data?.rhu_id

      if (!rhuId) {
        return NextResponse.json({
          role,
          activities: [],
        })
      }

      const {
        data: barangays,
        error: barangayError,
      } = await supabase
        .from('barangay')
        .select('barangay_id')
        .eq('rhu_id', rhuId)

      if (barangayError) {
        console.error(
          'PHN barangay load error:',
          barangayError
        )

        return NextResponse.json(
          {
            error:
              'Unable to determine PHN geographic scope.',
          },
          {
            status: 500,
          }
        )
      }

      allowedBarangayIds = (
        barangays ?? []
      ).map(
        (item) =>
          item.barangay_id
      )
    }

    if (
      role === 'RHM' ||
      role === 'BHW' ||
      role === 'BNS'
    ) {
      const {
        data: assignments,
        error: assignmentError,
      } = await supabase
        .from(
          'health_worker_assignment'
        )
        .select('barangay_id')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE')

      if (assignmentError) {
        console.error(
          'Worker assignment load error:',
          assignmentError
        )

        return NextResponse.json(
          {
            error:
              'Unable to determine assigned barangays.',
          },
          {
            status: 500,
          }
        )
      }

      allowedBarangayIds = (
        assignments ?? []
      ).map(
        (item) =>
          item.barangay_id
      )
    }

    if (
      allowedBarangayIds !== null &&
      allowedBarangayIds.length === 0
    ) {
      return NextResponse.json({
        role,
        activities: [],
      })
    }

    /* -----------------------------------------------------
       5. LOAD ACTIVITIES
    ----------------------------------------------------- */

    let query = supabase
      .from(
        'health_activity_schedule'
      )
      .select(`
        schedule_id,
        activity_type,
        schedule_date,
        start_time,
        end_time,
        status,
        remarks,
        conflict_status,
        review_remarks,
        reviewed_at,
        created_at,
        updated_at,
        created_by,
        approved_by,
        barangay_id,
        barangay (
          barangay_id,
          barangay_name,
          municipality,
          province,
          rhu_id
        )
      `)
      .order(
        'schedule_date',
        {
          ascending: true,
        }
      )
      .order(
        'start_time',
        {
          ascending: true,
        }
      )

    if (
      allowedBarangayIds !== null
    ) {
      query = query.in(
        'barangay_id',
        allowedBarangayIds
      )
    }

    const {
      data: activities,
      error: activitiesError,
    } = await query

    if (activitiesError) {
      console.error(
        'Health activities GET error:',
        activitiesError
      )

      return NextResponse.json(
        {
          error:
            'Unable to load health activities.',
        },
        {
          status: 500,
        }
      )
    }

    return NextResponse.json({
      role,
      activities:
        activities ?? [],
    })
  } catch (error) {
    console.error(
      'Health activities GET error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'An unexpected error occurred.',
      },
      {
        status: 500,
      }
    )
  }
}