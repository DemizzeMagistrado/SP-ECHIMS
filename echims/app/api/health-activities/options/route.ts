import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      )
    }

    const { data: profile } =
      await supabase
        .from('users')
        .select('account_status')
        .eq('user_id', user.id)
        .maybeSingle()

    if (
      !profile ||
      profile.account_status !==
        'ACTIVE'
    ) {
      return NextResponse.json(
        { error: 'Account is not active.' },
        { status: 403 }
      )
    }

    /* PHN */

    const { data: phn } =
      await supabase
        .from('public_health_nurse')
        .select('rhu_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (phn?.rhu_id) {
      const { data, error } =
        await supabase
          .from('barangay')
          .select(`
            barangay_id,
            barangay_name,
            municipality,
            province,
            rhu_id
          `)
          .eq('rhu_id', phn.rhu_id)
          .order('barangay_name')

      if (error) {
        return NextResponse.json(
          {
            error:
              'Unable to load barangays.',
          },
          { status: 500 }
        )
      }

      return NextResponse.json({
        barangays: data ?? [],
      })
    }

    /* RHM / BHW / BNS */

    const { data: assignments, error } =
      await supabase
        .from(
          'health_worker_assignment'
        )
        .select(`
          barangay_id,
          barangay (
            barangay_id,
            barangay_name,
            municipality,
            province,
            rhu_id
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE')

    if (error) {
      return NextResponse.json(
        {
          error:
            'Unable to load assigned barangays.',
        },
        { status: 500 }
      )
    }

    const barangays = (
      assignments ?? []
    )
      .map((item: any) => {
        if (
          Array.isArray(
            item.barangay
          )
        ) {
          return (
            item.barangay[0] ??
            null
          )
        }

        return (
          item.barangay ?? null
        )
      })
      .filter(Boolean)

    return NextResponse.json({
      barangays,
    })
  } catch (error) {
    console.error(
      'Activity options error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'An unexpected error occurred.',
      },
      { status: 500 }
    )
  }
}