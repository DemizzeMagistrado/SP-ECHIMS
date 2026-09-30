import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizationContext } from '@/lib/auth/authorization'

const ALLOWED_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
] as const

type AccountStatus = (typeof ALLOWED_STATUSES)[number]

export async function PATCH(request: Request) {
  try {
    const context = await getAuthorizationContext()

    if (!context) {
      return NextResponse.json(
        {
          error: 'Your account is not authorized.',
        },
        { status: 401 }
      )
    }

    // Only Administrators can manage user accounts.
    if (context.role !== 'Administrator') {
      return NextResponse.json(
        {
          error: 'Administrator permission is required.',
        },
        { status: 403 }
      )
    }

    let body: {
      userId?: string
      accountStatus?: string
    }

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          error: 'Invalid request body.',
        },
        { status: 400 }
      )
    }

    const userId = body.userId?.trim()
    const accountStatus = body.accountStatus?.trim().toUpperCase()

    /* =========================================================
       VALIDATE USER ID
    ========================================================= */

    if (!userId) {
      return NextResponse.json(
        {
          error: 'User ID is required.',
        },
        { status: 400 }
      )
    }

    /* =========================================================
       VALIDATE ACCOUNT STATUS
    ========================================================= */

    if (
      !accountStatus ||
      !ALLOWED_STATUSES.includes(
        accountStatus as AccountStatus
      )
    ) {
      return NextResponse.json(
        {
          error: 'Invalid account status.',
        },
        { status: 400 }
      )
    }

    /* =========================================================
       PREVENT ADMIN FROM CHANGING THEIR OWN STATUS
    ========================================================= */

    if (userId === context.authUser.id) {
      return NextResponse.json(
        {
          error:
            'You cannot change your own account status.',
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    /* =========================================================
       VERIFY TARGET USER EXISTS
    ========================================================= */

    const { data: targetUser, error: targetUserError } =
      await supabase
        .from('users')
        .select(
          'user_id, full_name, email, account_status'
        )
        .eq('user_id', userId)
        .maybeSingle()

    if (targetUserError) {
      console.error(
        'USER LOOKUP ERROR:',
        targetUserError.message
      )

      return NextResponse.json(
        {
          error: 'Unable to find the user.',
        },
        { status: 500 }
      )
    }

    if (!targetUser) {
      return NextResponse.json(
        {
          error: 'User not found.',
        },
        { status: 404 }
      )
    }

    /* =========================================================
       UPDATE ACCOUNT STATUS
    ========================================================= */

    const { data: updatedUser, error: userUpdateError } =
      await supabase
        .from('users')
        .update({
          account_status:
            accountStatus as AccountStatus,
        })
        .eq('user_id', userId)
        .select(
          'user_id, full_name, email, account_status'
        )
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
        { status: 500 }
      )
    }

    /* =========================================================
       SYNCHRONIZE WORKPLACE ASSIGNMENT
       
       Registration creates:
       
       users.account_status = PENDING
       health_worker_assignment.status = PENDING

       Administrator approval:
       
       users.account_status = ACTIVE
       health_worker_assignment.status = ACTIVE

       Administrator rejection/deactivation:
       
       users.account_status = INACTIVE
       health_worker_assignment.status = INACTIVE
    ========================================================= */

    if (
      accountStatus === 'ACTIVE' ||
      accountStatus === 'INACTIVE'
    ) {
      const assignmentStatus =
        accountStatus === 'ACTIVE'
          ? 'ACTIVE'
          : 'INACTIVE'

      const {
        data: assignments,
        error: assignmentError,
      } = await supabase
        .from('health_worker_assignment')
        .update({
          status: assignmentStatus,
        })
        .eq('user_id', userId)
        .in('status', ['PENDING', 'ACTIVE'])
        .select(
          'assignment_id, user_id, barangay_id, status'
        )

      if (assignmentError) {
        console.error(
          'ASSIGNMENT STATUS UPDATE ERROR:',
          assignmentError.message
        )

        /*
         * Roll back the account status if the workplace
         * assignment could not be synchronized.
         */
        await supabase
          .from('users')
          .update({
            account_status:
              targetUser.account_status,
          })
          .eq('user_id', userId)

        return NextResponse.json(
          {
            error:
              'The account status could not be synchronized with the workplace assignment.',
          },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        userId: updatedUser.user_id,
        accountStatus:
          updatedUser.account_status,
        assignmentsUpdated:
          assignments?.length ?? 0,
      })
    }

    /* =========================================================
       SUSPENDED ACCOUNT
       
       Keep assignment status unchanged.
       Suspension prevents normal account access while
       preserving the workplace assignment history.
    ========================================================= */

    return NextResponse.json({
      success: true,
      userId: updatedUser.user_id,
      accountStatus:
        updatedUser.account_status,
      assignmentsUpdated: 0,
    })
  } catch (error) {
    console.error(
      'USER MANAGEMENT PATCH ERROR:',
      error
    )

    return NextResponse.json(
      {
        error: 'Internal server error.',
      },
      { status: 500 }
    )
  }
}