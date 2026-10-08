import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{ scheduleId: string }>
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { scheduleId } = await context.params

    if (
      !/^[1-9]\d*$/.test(scheduleId) ||
      !Number.isSafeInteger(Number(scheduleId))
    ) {
      return NextResponse.json(
        { error: 'Invalid schedule ID.' },
        { status: 400 },
      )
    }

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

    let body: unknown

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 },
      )
    }

    const userIds =
      body && typeof body === 'object' && 'userIds' in body
        ? body.userIds
        : null

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      userIds.length > 100 ||
      !userIds.every(
        (id) => typeof id === 'string' && uuidPattern.test(id),
      )
    ) {
      return NextResponse.json(
        { error: 'Select between 1 and 100 valid personnel.' },
        { status: 400 },
      )
    }

    const { error } = await supabase.rpc(
      'set_health_activity_personnel',
      {
        p_schedule_id: Number(scheduleId),
        p_user_ids: [...new Set(userIds)],
      },
    )

    if (error) {
      const status =
        error.code === '42501'
          ? 403
          : error.code === 'P0002'
            ? 404
            : error.code === '23P01'
              ? 409
              : error.code === '22023'
                ? 400
                : 500

      if (status === 500) {
        console.error('Personnel assignment error:', error)
      }

      return NextResponse.json(
        {
          error:
            status === 500
              ? 'Unable to save personnel.'
              : error.message,
        },
        { status },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Personnel assignment error:', error)

    return NextResponse.json(
      { error: 'Unable to save personnel.' },
      { status: 500 },
    )
  }
}