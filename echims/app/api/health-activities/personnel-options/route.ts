import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const rawId = request.nextUrl.searchParams.get('barangayId')

  if (!rawId || !/^[1-9]\d*$/.test(rawId)) {
    return NextResponse.json(
      { error: 'A valid barangay ID is required.' },
      { status: 400 },
    )
  }

  const barangayId = Number(rawId)

  if (!Number.isSafeInteger(barangayId)) {
    return NextResponse.json(
      { error: 'Invalid barangay ID.' },
      { status: 400 },
    )
  }

  try {
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

    const { data, error } = await supabase.rpc(
      'get_health_activity_personnel_options',
      { p_barangay_id: barangayId },
    )

    if (error) {
      if (error.code === '42501') {
        return NextResponse.json(
          { error: 'You cannot access personnel for this barangay.' },
          { status: 403 },
        )
      }

      console.error('Personnel options error:', error)

      return NextResponse.json(
        { error: 'Unable to load personnel.' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { personnel: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Personnel options error:', error)

    return NextResponse.json(
      { error: 'Unable to load personnel.' },
      { status: 500 },
    )
  }
}