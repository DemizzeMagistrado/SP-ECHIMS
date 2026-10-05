import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/* =========================================================
   TYPES
========================================================= */

type ReviewAction =
  | 'APPROVE'
  | 'REJECT'
  | 'RESCHEDULE'

type RouteContext = {
  params: Promise<{
    scheduleId: string
  }>
}

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
   HELPERS
========================================================= */

function isReviewAction(
  value: string
): value is ReviewAction {
  return [
    'APPROVE',
    'REJECT',
    'RESCHEDULE',
  ].includes(value)
}

function isPastDate(date: string) {
  const today = new Date()

  const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  return date < localToday
}

function personnelValidationResponse(error: {
  code?: string
  message: string
}) {
  if (error.code === '23P01') {
    return NextResponse.json(
      { error: error.message },
      { status: 409 },
    )
  }

  if (error.code === '22023') {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    )
  }

  if (error.code === '42501') {
    return NextResponse.json(
      { error: 'You cannot access personnel for this barangay.' },
      { status: 403 },
    )
  }

  return null
}

/* =========================================================
   PATCH
   PHN reviews health activity request
========================================================= */

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = await createClient()

    const { scheduleId } =
      await context.params

    const numericScheduleId =
      Number(scheduleId)

    if (
      !Number.isInteger(
        numericScheduleId
      ) ||
      numericScheduleId <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid schedule ID.',
        },
        {
          status: 400,
        }
      )
    }

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
       2. ACTIVE USER
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
      profile.account_status !==
        'ACTIVE'
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
       3. VERIFY PHN
    ----------------------------------------------------- */

    const {
      data: phn,
      error: phnError,
    } = await supabase
      .from('public_health_nurse')
      .select(`
        user_id,
        rhu_id
      `)
      .eq('user_id', user.id)
      .maybeSingle()

    if (
      phnError ||
      !phn?.rhu_id
    ) {
      return NextResponse.json(
        {
          error:
            'Only an assigned Public Health Nurse can review health activity requests.',
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       4. REQUEST BODY
    ----------------------------------------------------- */

    let body: Record<
      string,
      unknown
    >

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid request body.',
        },
        {
          status: 400,
        }
      )
    }

    const rawAction = String(
      body.action ?? ''
    )
      .trim()
      .toUpperCase()

    if (
      !isReviewAction(rawAction)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid review action.',
        },
        {
          status: 400,
        }
      )
    }

    const action = rawAction

    const reviewRemarks =
      typeof body.reviewRemarks ===
      'string'
        ? body.reviewRemarks.trim()
        : ''

    if (
      action === 'REJECT' &&
      !reviewRemarks
    ) {
      return NextResponse.json(
        {
          error:
            'A reason is required when rejecting an activity request.',
        },
        {
          status: 400,
        }
      )
    }

    /* -----------------------------------------------------
       5. LOAD REQUEST
    ----------------------------------------------------- */

    const {
      data: schedule,
      error: scheduleError,
    } = await supabase
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
        barangay_id,
        created_by,
        conflict_status,
        reviewed_by,
        approved_by,
        barangay (
          barangay_id,
          barangay_name,
          rhu_id
        )
      `)
      .eq(
        'schedule_id',
        numericScheduleId
      )
      .maybeSingle()

    if (
      scheduleError ||
      !schedule
    ) {
      return NextResponse.json(
        {
          error:
            'Health activity request not found.',
        },
        {
          status: 404,
        }
      )
    }

    /* -----------------------------------------------------
       6. SCH-R007
       PHN MAY ONLY REVIEW OWN RHU
    ----------------------------------------------------- */

    const barangay =
      Array.isArray(
        schedule.barangay
      )
        ? schedule.barangay[0]
        : schedule.barangay

    if (
      !barangay ||
      barangay.rhu_id !==
        phn.rhu_id
    ) {
      return NextResponse.json(
        {
          error:
            'SCH-R007: This health activity is outside your assigned RHU.',
          rule: 'SCH-R007',
        },
        {
          status: 403,
        }
      )
    }

    /* -----------------------------------------------------
       7. SCH-R013
       REVIEW OPERATIONS REQUIRE PENDING
    ----------------------------------------------------- */

    if (
      schedule.status !==
      'PENDING'
    ) {
      return NextResponse.json(
        {
          error:
            `SCH-R013: ${schedule.status} activities cannot be reviewed as pending requests.`,
          rule: 'SCH-R013',
        },
        {
          status: 409,
        }
      )
    }

    /* =====================================================
       REJECT
       SCH-R009
    ===================================================== */

    if (action === 'REJECT') {
      const reviewedAt =
        new Date().toISOString()

      const {
        data,
        error,
      } = await supabase
        .from(
          'health_activity_schedule'
        )
        .update({
          status:
            'REJECTED',

          reviewed_by:
            user.id,

          /*
           * A rejected activity was
           * reviewed, not approved.
           */
          approved_by:
            null,

          reviewed_at:
            reviewedAt,

          review_remarks:
            reviewRemarks,
        })
        .eq(
          'schedule_id',
          numericScheduleId
        )
        .eq(
          'status',
          'PENDING'
        )
        .select()
        .single()

      if (error) {
        console.error(
          'Reject activity error:',
          error
        )

        return NextResponse.json(
          {
            error:
              'Unable to reject health activity request.',
          },
          {
            status: 500,
          }
        )
      }

      return NextResponse.json({
        message:
          'Health activity request rejected.',

        rule:
          'SCH-R009',

        activity:
          data,
      })
    }

    /* =====================================================
       RESCHEDULE
       SCH-R008
    ===================================================== */

    if (action === 'RESCHEDULE') {
      if (!reviewRemarks.trim()) {
        return NextResponse.json(
          { error: 'Explain what the requester needs to revise.' },
          { status: 400 },
        )
      }

      const { data, error } = await supabase.rpc(
        'return_health_activity_for_revision',
        {
          p_schedule_id: numericScheduleId,
          p_review_remarks: reviewRemarks,
        },
      )

      if (error) {
        const status =
          error.code === '42501'
            ? 403
            : error.code === 'P0002'
              ? 404
              : error.code === '22023'
                ? 400
                : 500

        if (status === 500) {
          console.error('Return for revision error:', error)
        }

        return NextResponse.json(
          {
            error:
              status === 500
                ? 'Unable to return this request for revision.'
                : error.message,
          },
          { status },
        )
      }

      return NextResponse.json({
        message: 'Request returned to its creator for revision.',
        activity: data,
      })
    }

    /* =====================================================
       APPROVE
       SCH-R010

       Re-evaluate immediately before approval.
    ===================================================== */

    const {
      data: currentConflictData,
      error: conflictError,
    } = await supabase.rpc(
      'check_health_activity_conflicts',
      {
        p_schedule_date:
          schedule.schedule_date,

        p_start_time:
          schedule.start_time,

        p_end_time:
          schedule.end_time,

        p_barangay_id:
          schedule.barangay_id,

        p_created_by:
          schedule.created_by,

        p_exclude_schedule_id:
          numericScheduleId,
      }
    )

    if (conflictError) {
      console.error(
        'Approval conflict evaluation error:',
        conflictError
      )

      return NextResponse.json(
        {
          error:
            'Unable to evaluate scheduling rules before approval.',
        },
        {
          status: 500,
        }
      )
    }

    const currentConflicts =
      (currentConflictData ??
        []) as ConflictRow[]

    const hardConflicts =
      currentConflicts.filter(
        (item) =>
          item.conflict_rule ===
          'SCH-R002'
      )

    /* -----------------------------------------------------
       SCH-R002
       Worker double-booking blocks approval
    ----------------------------------------------------- */

    if (
      hardConflicts.length > 0
    ) {
      let suggestions:
        ScheduleSuggestion[] = []

      const {
        data:
          suggestionData,
        error:
          suggestionError,
      } = await supabase.rpc(
        'suggest_health_activity_slots',
        {
          p_requested_date:
            schedule.schedule_date,

          p_barangay_id:
            schedule.barangay_id,

          p_created_by:
            schedule.created_by,

          p_exclude_schedule_id:
            numericScheduleId,

          p_days_to_check:
            7,

          p_max_suggestions:
            3,
        }
      )

      if (
        suggestionError
      ) {
        console.error(
          'Approval suggestion error:',
          suggestionError
        )
      } else {
        suggestions =
          (suggestionData ??
            []) as ScheduleSuggestion[]
      }

      return NextResponse.json(
        {
          error:
            'SCH-R002: This health worker has an overlapping activity. Reschedule the request before approval.',

          rule:
            'SCH-R002',

          conflicts:
            hardConflicts,

          suggestions,
        },
        {
          status: 409,
        }
      )
    }

    /* -----------------------------------------------------
       SCH-R001
       Same-barangay warning does not block PHN approval
    ----------------------------------------------------- */

    const barangayWarnings =
      currentConflicts.filter(
        (item) =>
          item.conflict_rule ===
          'SCH-R001'
      )

    const reviewedAt =
      new Date().toISOString()

    const {
      data: approved,
      error: approveError,
    } = await supabase
      .from(
        'health_activity_schedule'
      )
      .update({
        status:
          'APPROVED',

        reviewed_by:
          user.id,

        approved_by:
          user.id,

        reviewed_at:
          reviewedAt,

        review_remarks:
          reviewRemarks ||
          null,

        conflict_status:
          barangayWarnings.length >
          0
            ? 'DETECTED'
            : schedule.conflict_status ===
                'DETECTED'
              ? 'RESOLVED'
              : 'NONE',
      })
      .eq(
        'schedule_id',
        numericScheduleId
      )
      .eq(
        'status',
        'PENDING'
      )
      .select()
      .single()

      if (approveError) {
        console.error('Approve activity error:', approveError)

        const validationResponse =
          personnelValidationResponse(approveError)

        if (validationResponse) {
          return validationResponse
        }

        // Temporary diagnostic response for local development.
        return NextResponse.json(
          {
            error:
              process.env.NODE_ENV === 'development'
                ? approveError.message
                : 'Unable to approve health activity request.',
          },
          { status: 500 },
        )
}

    return NextResponse.json({
      message:
        barangayWarnings.length > 0
          ? 'Health activity approved with a same-barangay schedule warning.'
          : 'Health activity approved successfully.',

      rule:
        'SCH-R010',

      activity:
        approved,

      warnings:
        barangayWarnings,
    })
  } catch (error) {
    console.error(
      'Health activity review error:',
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