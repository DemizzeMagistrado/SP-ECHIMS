import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{ scheduleId: string }>
}

type LifecycleAction =
  | 'RESCHEDULE'
  | 'START'
  | 'CANCEL'
  | 'COMPLETE'

const successMessages: Record<LifecycleAction, string> = {
  RESCHEDULE:
    'Activity rescheduled and returned to pending PHN approval.',
  START: 'Activity marked as ongoing.',
  CANCEL: 'Activity cancelled.',
  COMPLETE: 'Activity marked as completed.',
}

function isValidDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)

  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function isValidTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  )
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  try {
    const { scheduleId } = await params
    const numericScheduleId = Number(scheduleId)

    if (
      !/^\d+$/.test(scheduleId) ||
      !Number.isSafeInteger(numericScheduleId) ||
      numericScheduleId <= 0
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

    const action =
      typeof body.action === 'string'
        ? body.action.trim().toUpperCase()
        : ''

    if (
      action !== 'RESCHEDULE' &&
      action !== 'START' &&
      action !== 'CANCEL' &&
      action !== 'COMPLETE'
    ) {
      return NextResponse.json(
        { error: 'Invalid lifecycle action.' },
        { status: 400 },
      )
    }

    let scheduleDate: string | null = null
    let startTime: string | null = null
    let endTime: string | null = null
    let cancellationReason: string | null = null
    let completionDate: string | null = null

    if (action === 'RESCHEDULE') {
      if (
        !isValidDate(body.scheduleDate) ||
        !isValidTime(body.startTime) ||
        !isValidTime(body.endTime)
      ) {
        return NextResponse.json(
          {
            error:
              'Provide a valid date and start/end times in HH:MM format.',
          },
          { status: 400 },
        )
      }

      if (body.endTime <= body.startTime) {
        return NextResponse.json(
          {
            error:
              'End time must be later than start time.',
          },
          { status: 400 },
        )
      }

      scheduleDate = body.scheduleDate
      startTime = body.startTime
      endTime = body.endTime
    }

    if (action === 'CANCEL') {
      if (
        typeof body.cancellationReason !== 'string' ||
        !body.cancellationReason.trim()
      ) {
        return NextResponse.json(
          {
            error: 'A cancellation reason is required.',
          },
          { status: 400 },
        )
      }

      cancellationReason =
        body.cancellationReason.trim()
    }

    if (action === 'COMPLETE') {
      if (!isValidDate(body.completionDate)) {
        return NextResponse.json(
          {
            error: 'A valid completion date is required.',
          },
          { status: 400 },
        )
      }

      completionDate = body.completionDate
    }

    const { data, error } = await supabase.rpc(
      'manage_health_activity_management',
      {
        p_schedule_id: numericScheduleId,
        p_action: action,
        p_schedule_date: scheduleDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_cancellation_reason: cancellationReason,
        p_completion_date: completionDate,
      },
    )
    if (error) {
      const errorStatuses: Record<string, number> = {
        '42501': 403,
        P0002: 404,
        '23P01': 409,
        '22023': 400,
        '22007': 400,
        '22008': 400,
      }

      const status = errorStatuses[error.code]

      if (status) {
        return NextResponse.json(
          { error: error.message },
          { status },
        )
      }

      console.error(
        'Health activity lifecycle error:',
        error,
      )

      return NextResponse.json(
        {
          error: 'Unable to update health activity.',
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      message: successMessages[action],
      activity: data,
    })
  } catch (error) {
    console.error(
      'Health activity lifecycle PATCH error:',
      error,
    )

    return NextResponse.json(
      {
        error: 'An unexpected error occurred.',
      },
      { status: 500 },
    )
  }
}