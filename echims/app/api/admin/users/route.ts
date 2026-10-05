import {
  NextResponse,
} from 'next/server'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  getAuthorizationContext,
} from '@/lib/auth/authorization'

const ALLOWED_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
] as const

type AccountStatus =
  (typeof ALLOWED_STATUSES)[number]

export async function PATCH(
  request: Request
) {
  try {
    /* =====================================================
       AUTHORIZATION
    ===================================================== */

    const context =
      await getAuthorizationContext()

    if (!context) {
      return NextResponse.json(
        {
          error:
            'Your account is not authorized.',
        },
        {
          status: 401,
        }
      )
    }

    if (
      context.role !==
      'Administrator'
    ) {
      return NextResponse.json(
        {
          error:
            'Administrator permission is required.',
        },
        {
          status: 403,
        }
      )
    }

    /* =====================================================
       REQUEST BODY
    ===================================================== */

    let body: {
      userId?: string
      accountStatus?: string
    }

    try {
      body =
        await request.json()
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

    const userId =
      body.userId?.trim()

    const accountStatus =
      body.accountStatus
        ?.trim()
        .toUpperCase()

    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!userId) {
      return NextResponse.json(
        {
          error:
            'User ID is required.',
        },
        {
          status: 400,
        }
      )
    }

    if (
      !accountStatus ||
      !ALLOWED_STATUSES.includes(
        accountStatus as AccountStatus
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid account status.',
        },
        {
          status: 400,
        }
      )
    }

    /*
     * Prevent the logged-in administrator
     * from disabling their own account.
     */
    if (
      userId ===
      context.authUser.id
    ) {
      return NextResponse.json(
        {
          error:
            'You cannot change your own account status.',
        },
        {
          status: 400,
        }
      )
    }

    const supabase =
      await createClient()

    /* =====================================================
       TARGET USER
    ===================================================== */

    const {
      data: targetUser,
      error: targetUserError,
    } = await supabase
      .from('users')
      .select(`
        user_id,
        full_name,
        email,
        account_status
      `)
      .eq(
        'user_id',
        userId
      )
      .maybeSingle()

    if (targetUserError) {
      console.error(
        'USER LOOKUP ERROR:',
        targetUserError.message
      )

      return NextResponse.json(
        {
          error:
            'Unable to find the user.',
        },
        {
          status: 500,
        }
      )
    }

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            'User not found.',
        },
        {
          status: 404,
        }
      )
    }

    /* =====================================================
       DETERMINE ROLE / WORKPLACE TYPE
    ===================================================== */

    const {
      data: administrator,
      error: administratorError,
    } = await supabase
      .from('administrator')
      .select('user_id')
      .eq(
        'user_id',
        userId
      )
      .maybeSingle()

    if (administratorError) {
      console.error(
        'ADMIN ROLE LOOKUP ERROR:',
        administratorError.message
      )

      return NextResponse.json(
        {
          error:
            'Unable to verify the user role.',
        },
        {
          status: 500,
        }
      )
    }

    const {
      data: phn,
      error: phnError,
    } = await supabase
      .from(
        'public_health_nurse'
      )
      .select(
        'user_id, rhu_id'
      )
      .eq(
        'user_id',
        userId
      )
      .maybeSingle()

    if (phnError) {
      console.error(
        'PHN ROLE LOOKUP ERROR:',
        phnError.message
      )

      return NextResponse.json(
        {
          error:
            'Unable to verify the PHN workplace.',
        },
        {
          status: 500,
        }
      )
    }

    const isAdministrator =
      Boolean(administrator)

    const isPhn =
      Boolean(phn)

    /* =====================================================
       VALIDATE WORKPLACE BEFORE ACTIVATION
    ===================================================== */

    if (
      accountStatus ===
      'ACTIVE'
    ) {
      /*
       * Administrator does not need
       * a geographic workplace.
       */
      if (isAdministrator) {
        // Valid.
      }

      /*
       * PHN must have one RHU.
       */
      else if (isPhn) {
        if (!phn?.rhu_id) {
          return NextResponse.json(
            {
              error:
                'This Public Health Nurse does not have an RHU assignment.',
            },
            {
              status: 400,
            }
          )
        }

        const {
          data: rhu,
          error: rhuError,
        } = await supabase
          .from('rhu')
          .select(
            'rhu_id, account_status'
          )
          .eq(
            'rhu_id',
            phn.rhu_id
          )
          .maybeSingle()

        if (rhuError) {
          console.error(
            'PHN RHU LOOKUP ERROR:',
            rhuError.message
          )

          return NextResponse.json(
            {
              error:
                'Unable to verify the PHN RHU.',
            },
            {
              status: 500,
            }
          )
        }

        if (!rhu) {
          return NextResponse.json(
            {
              error:
                'The assigned RHU no longer exists.',
            },
            {
              status: 400,
            }
          )
        }

        if (
          rhu.account_status !==
          'ACTIVE'
        ) {
          return NextResponse.json(
            {
              error:
                'The assigned RHU is not active.',
            },
            {
              status: 400,
            }
          )
        }
      }

      /*
       * RHM / BHW / BNS require
       * at least one geographic
       * assignment.
       */
      else {
        const {
          data:
            existingAssignments,
          error:
            existingAssignmentError,
        } = await supabase
          .from(
            'health_worker_assignment'
          )
          .select(`
            assignment_id,
            barangay_id,
            status
          `)
          .eq(
            'user_id',
            userId
          )

        if (
          existingAssignmentError
        ) {
          console.error(
            'ASSIGNMENT LOOKUP ERROR:',
            existingAssignmentError
              .message
          )

          return NextResponse.json(
            {
              error:
                'Unable to verify the workplace assignment.',
            },
            {
              status: 500,
            }
          )
        }

        if (
          !existingAssignments ||
          existingAssignments.length ===
            0
        ) {
          return NextResponse.json(
            {
              error:
                'This health worker does not have a workplace assignment.',
            },
            {
              status: 400,
            }
          )
        }
      }
    }

    /* =====================================================
       UPDATE USER ACCOUNT
    ===================================================== */

    const {
      data: updatedUser,
      error: userUpdateError,
    } = await supabase
      .from('users')
      .update({
        account_status:
          accountStatus as AccountStatus,
      })
      .eq(
        'user_id',
        userId
      )
      .select(`
        user_id,
        full_name,
        email,
        account_status
      `)
      .single()

    if (userUpdateError) {
      console.error(
        'USER STATUS UPDATE ERROR:',
        userUpdateError.message
      )

      return NextResponse.json(
        {
          error:
            'Unable to update the account status.',
        },
        {
          status: 500,
        }
      )
    }

    /* =====================================================
       SYNCHRONIZE WORKER ASSIGNMENTS

       PHN:
       - no health_worker_assignment rows
       - public_health_nurse.rhu_id defines scope

       Administrator:
       - no geographic assignment

       RHM/BHW/BNS:
       - assignment rows follow account
         activation/deactivation.
    ===================================================== */

    if (
      !isAdministrator &&
      !isPhn &&
      (
        accountStatus ===
          'ACTIVE' ||
        accountStatus ===
          'INACTIVE'
      )
    ) {
      const assignmentStatus =
        accountStatus ===
        'ACTIVE'
          ? 'ACTIVE'
          : 'INACTIVE'

      const {
        data: assignments,
        error: assignmentError,
      } = await supabase
        .from(
          'health_worker_assignment'
        )
        .update({
          status:
            assignmentStatus,
        })
        .eq(
          'user_id',
          userId
        )

        /*
         * Include INACTIVE.
         *
         * This is necessary for:
         * INACTIVE → ACTIVE
         * reactivation.
         */
        .in(
          'status',
          [
            'PENDING',
            'ACTIVE',
            'INACTIVE',
          ]
        )
        .select(`
          assignment_id,
          user_id,
          barangay_id,
          status
        `)

      if (assignmentError) {
        console.error(
          'ASSIGNMENT STATUS UPDATE ERROR:',
          assignmentError.message
        )

        /*
         * Best-effort rollback.
         */
        await supabase
          .from('users')
          .update({
            account_status:
              targetUser.account_status,
          })
          .eq(
            'user_id',
            userId
          )

        return NextResponse.json(
          {
            error:
              'The account status could not be synchronized with the workplace assignment.',
          },
          {
            status: 500,
          }
        )
      }

      return NextResponse.json({
        success: true,

        userId:
          updatedUser.user_id,

        accountStatus:
          updatedUser.account_status,

        workplaceType:
          'BARANGAY_ASSIGNMENT',

        assignmentsUpdated:
          assignments?.length ??
          0,
      })
    }

    /* =====================================================
       PHN / ADMIN / SUSPENSION
    ===================================================== */

    return NextResponse.json({
      success: true,

      userId:
        updatedUser.user_id,

      accountStatus:
        updatedUser.account_status,

      workplaceType:
        isAdministrator
          ? 'SYSTEM'
          : isPhn
            ? 'RHU'
            : 'BARANGAY_ASSIGNMENT',

      assignmentsUpdated: 0,
    })
  } catch (error) {
    console.error(
      'USER MANAGEMENT PATCH ERROR:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Internal server error.',
      },
      {
        status: 500,
      }
    )
  }
}