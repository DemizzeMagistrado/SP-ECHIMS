import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type NotificationContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}

async function authorize(): Promise<
  NotificationContext | NextResponse
> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401 },
    )
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('account_status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Notification account lookup error:', error)

    return NextResponse.json(
      { error: 'Unable to verify account.' },
      { status: 500 },
    )
  }

  if (!profile || profile.account_status !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'Account is not active.' },
      { status: 403 },
    )
  }

  return { supabase, userId: user.id }
}

/* Load the latest 50 notifications and total unread count. */
export async function GET() {
  try {
    const context = await authorize()

    if (context instanceof NextResponse) return context

    const { supabase, userId } = context

    const [listResult, countResult] = await Promise.all([
      supabase
        .from('alert')
        .select(`
          alert_id,
          alert_type,
          alert_message,
          severity,
          status,
          created_at,
          read_at,
          source_module,
          schedule_id
        `)
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .order('alert_id', { ascending: false })
        .limit(50),

      supabase
        .from('alert')
        .select('alert_id', {
          count: 'exact',
          head: true,
        })
        .eq('recipient_id', userId)
        .eq('status', 'UNREAD'),
    ])

    if (listResult.error || countResult.error) {
      console.error(
        'Notification load error:',
        listResult.error ?? countResult.error,
      )

      return NextResponse.json(
        { error: 'Unable to load notifications.' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        notifications: listResult.data ?? [],
        unreadCount: countResult.count ?? 0,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (error) {
    console.error('Notifications GET error:', error)

    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 },
    )
  }
}

/* Update one notification or mark all unread ones as read. */
export async function PATCH(request: Request) {
  try {
    const context = await authorize()

    if (context instanceof NextResponse) return context

    const { supabase, userId } = context

    let payload: unknown

    try {
      payload = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Request body must be valid JSON.' },
        { status: 400 },
      )
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 },
      )
    }

    const body = payload as Record<string, unknown>

    if (body.action === 'MARK_ALL_READ') {
      const { error } = await supabase
        .from('alert')
        .update({ status: 'READ' })
        .eq('recipient_id', userId)
        .eq('status', 'UNREAD')

      if (error) {
        console.error('Mark all notifications read error:', error)

        return NextResponse.json(
          { error: 'Unable to mark notifications as read.' },
          { status: 500 },
        )
      }

      return NextResponse.json({
        message: 'Notifications marked as read.',
      })
    }

    if (
      typeof body.alertId !== 'number' ||
      !Number.isSafeInteger(body.alertId) ||
      body.alertId <= 0 ||
      (body.status !== 'READ' && body.status !== 'UNREAD')
    ) {
      return NextResponse.json(
        {
          error:
            'A valid alertId and READ or UNREAD status are required.',
        },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('alert')
      .update({ status: body.status })
      .eq('alert_id', body.alertId)
      .eq('recipient_id', userId)
      .select('alert_id, status, read_at')
      .maybeSingle()

    if (error) {
      console.error('Notification update error:', error)

      return NextResponse.json(
        { error: 'Unable to update notification.' },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Notification not found or inaccessible.' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      message: 'Notification updated.',
      notification: data,
    })
  } catch (error) {
    console.error('Notifications PATCH error:', error)

    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 },
    )
  }
}