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
  const context = await getAuthorizationContext()

  if (!context) {
    return NextResponse.json(
      { error: 'Your account is not authorized.' },
      { status: 401 }
    )
  }

  // User Management is Administrator-only.
  if (context.role !== 'Administrator') {
    return NextResponse.json(
      { error: 'Administrator permission is required.' },
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
      { error: 'Invalid request body.' },
      { status: 400 }
    )
  }

  const userId = body.userId?.trim()
  const accountStatus = body.accountStatus

  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required.' },
      { status: 400 }
    )
  }

  if (
    !accountStatus ||
    !ALLOWED_STATUSES.includes(
      accountStatus as AccountStatus
    )
  ) {
    return NextResponse.json(
      { error: 'Invalid account status.' },
      { status: 400 }
    )
  }

  // Prevent an administrator from deactivating themselves.
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

  const { data, error } = await supabase
    .from('users')
    .update({
      account_status:
        accountStatus as AccountStatus,
    })
    .eq('user_id', userId)
    .select('user_id, account_status')
    .maybeSingle()

  if (error) {
    console.error(
      'USER STATUS UPDATE ERROR:',
      error.message
    )

    return NextResponse.json(
      {
        error:
          'Unable to update the account.',
      },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          'User not found or update not permitted.',
      },
      { status: 404 }
    )
  }

  return NextResponse.json({
    success: true,
    userId: data.user_id,
    accountStatus: data.account_status,
  })
}