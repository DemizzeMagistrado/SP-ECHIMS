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

    if (
      action === 'RESCHEDULE'
    ) {
      const newDate = String(
        body.scheduleDate ?? ''
      ).trim()

      const newStartTime =
        String(
          body.startTime ?? ''
        ).trim()

      const newEndTime =
        String(
          body.endTime ?? ''
        ).trim()

      /* -----------------------------------------------
         Validate new schedule
      ----------------------------------------------- */

      if (
        !newDate ||
        !newStartTime ||
        !newEndTime
      ) {
        return NextResponse.json(
          {
            error:
              'New date, start time, and end time are required.',
          },
          {
            status: 400,
          }
        )
      }

      if (
        newEndTime <=
        newStartTime
      ) {
        return NextResponse.json(
          {
            error:
              'SCH-R003: End time must be later than start time.',
            rule:
              'SCH-R003',
          },
          {
            status: 400,
          }
        )
      }

      if (
        isPastDate(newDate)
      ) {
        return NextResponse.json(
          {
            error:
              'SCH-R014: A health activity cannot be rescheduled to a past date.',
            rule:
              'SCH-R014',
          },
          {
            status: 400,
          }
        )
      }

      /* -----------------------------------------------
         Re-run scheduling rules
      ----------------------------------------------- */

      const {
        data: conflictData,
        error: conflictError,
      } = await supabase.rpc(
        'check_health_activity_conflicts',
        {
          p_schedule_date:
            newDate,

          p_start_time:
            newStartTime,

          p_end_time:
            newEndTime,

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
          'Reschedule conflict evaluation error:',
          conflictError
        )

        return NextResponse.json(
          {
            error:
              'Unable to evaluate the proposed schedule.',
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

      /* -----------------------------------------------
         Suggestions
      ----------------------------------------------- */

      let suggestions:
        ScheduleSuggestion[] = []

      if (
        conflictRows.length > 0
      ) {
        const {
          data:
            suggestionData,
          error:
            suggestionError,
        } = await supabase.rpc(
          'suggest_health_activity_slots',
          {
            p_requested_date:
              newDate,

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
            'Reschedule suggestion error:',
            suggestionError
          )
        } else {
          suggestions =
            (suggestionData ??
              []) as ScheduleSuggestion[]
        }
      }

      /* -----------------------------------------------
         Determine conflict state

         DETECTED:
         new schedule still conflicts.

         RESOLVED:
         previous schedule had a conflict,
         new schedule is clear.

         NONE:
         no previous/current conflict.
      ----------------------------------------------- */

      const conflictStatus =
        conflictRows.length > 0
          ? 'DETECTED'
          : schedule.conflict_status ===
              'DETECTED'
            ? 'RESOLVED'
            : 'NONE'

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
          schedule_date:
            newDate,

          start_time:
            newStartTime,

          end_time:
            newEndTime,

          /*
           * SCH-R008:
           * changing scheduling-critical
           * fields does not approve it.
           */
          status:
            'PENDING',

          /*
           * PHN performed this review
           * action, but the activity is
           * still not approved.
           */
          reviewed_by:
            user.id,

          approved_by:
            null,

          reviewed_at:
            reviewedAt,

          review_remarks:
            reviewRemarks ||
            null,

          conflict_status:
            conflictStatus,
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
          'Reschedule activity error:',
          error
        )

        return NextResponse.json(
          {
            error:
              'Unable to reschedule health activity.',
          },
          {
            status: 500,
          }
        )
      }

      return NextResponse.json({
        message:
          hardConflicts.length > 0
            ? 'Schedule updated, but a worker conflict must still be resolved before approval.'
            : warnings.length > 0
              ? 'Schedule updated with a same-barangay warning and remains pending PHN approval.'
              : 'Schedule updated successfully and remains pending approval.',

        rule:
          'SCH-R008',

        activity:
          data,

        ruleEvaluation: {
          hasConflict:
            conflictRows.length >
            0,

          hasHardConflict:
            hardConflicts.length >
            0,

          conflicts:
            hardConflicts,

          warnings,

          suggestions,
        },
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
      console.error(
        'Approve activity error:',
        approveError
      )

      return NextResponse.json(
        {
          error:
            'Unable to approve health activity request.',
        },
        {
          status: 500,
        }
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