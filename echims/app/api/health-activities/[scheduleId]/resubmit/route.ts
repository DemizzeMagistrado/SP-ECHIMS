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
    const numericId = Number(scheduleId)

    if (
      !/^[1-9]\d*$/.test(scheduleId) ||
      !Number.isSafeInteger(numericId)
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

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 },
      )
    }

    const fields = body as Record<string, unknown>
    const { scheduleDate, startTime, endTime, remarks } = fields

    if (
      typeof scheduleDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) ||
      typeof startTime !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      typeof endTime !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
      (remarks !== undefined && typeof remarks !== 'string')
    ) {
      return NextResponse.json(
        { error: 'Provide a valid date, start time, and end time.' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc(
      'resubmit_health_activity',
      {
        p_schedule_id: numericId,
        p_schedule_date: scheduleDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_remarks: remarks ?? '',
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
              : ['22023', '22007', '22008'].includes(error.code)
                ? 400
                : 500

      if (status === 500) {
        console.error('Activity resubmission error:', error)
      }

      return NextResponse.json(
        {
          error:
            status === 500
              ? 'Unable to resubmit this activity.'
              : error.message,
        },
        { status },
      )
    }

    return NextResponse.json({
      message: 'Activity resubmitted for PHN review.',
      activity: data,
    })
  } catch (error) {
    console.error('Activity resubmission error:', error)

    return NextResponse.json(
      { error: 'Unable to resubmit this activity.' },
      { status: 500 },
    )
  }
}