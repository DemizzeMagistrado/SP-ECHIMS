import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return failure('Please sign in.', 401)
    }

    const accountResult = await supabase
      .from('users')
      .select('account_status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (accountResult.error) {
      console.error('Barangay account lookup:', accountResult.error)
      return failure('Unable to verify account.', 500)
    }

    if (accountResult.data?.account_status !== 'ACTIVE') {
      return failure('An active account is required.', 403)
    }

    const profileResult = await supabase
      .rpc('get_my_profile')
      .maybeSingle()

    if (profileResult.error) {
      console.error('Barangay role lookup:', profileResult.error)
      return failure('Unable to verify your role.', 500)
    }

    const profile = profileResult.data as {
      role?: unknown
    } | null

    const role = String(profile?.role ?? '').trim().toLowerCase()

    let query = supabase
      .from('barangay')
      .select('barangay_id, barangay_name')

    if (['administrator', 'admin'].includes(role)) {
      // Administrators can view all registered barangays.
    } else if (['public health nurse', 'phn'].includes(role)) {
      const assignmentResult = await supabase
        .from('public_health_nurse')
        .select('rhu_id')
        .eq('user_id', user.id)

      if (assignmentResult.error) {
        console.error('PHN scope lookup:', assignmentResult.error)
        return failure('Unable to load your RHU assignment.', 500)
      }

      const rhuIds = [
        ...new Set(
          (assignmentResult.data ?? [])
            .map((row) => row.rhu_id)
            .filter((id) => id !== null && id !== undefined),
        ),
      ]

      if (rhuIds.length === 0) {
        return NextResponse.json([], {
          headers: { 'Cache-Control': 'private, no-store' },
        })
      }

      query = query.in('rhu_id', rhuIds)
    } else if (
      [
        'rural health midwife',
        'rhm',
        'barangay health worker',
        'bhw',
        'barangay nutrition scholar',
        'bns',
      ].includes(role)
    ) {
      const assignmentResult = await supabase
        .from('health_worker_assignment')
        .select('barangay_id')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE')

      if (assignmentResult.error) {
        console.error('Worker scope lookup:', assignmentResult.error)
        return failure('Unable to load your barangay assignments.', 500)
      }

      const barangayIds = [
        ...new Set(
          (assignmentResult.data ?? [])
            .map((row) => row.barangay_id)
            .filter((id) => id !== null && id !== undefined),
        ),
      ]

      if (barangayIds.length === 0) {
        return NextResponse.json([], {
          headers: { 'Cache-Control': 'private, no-store' },
        })
      }

      query = query.in('barangay_id', barangayIds)
    } else {
      return failure('You are not authorized to access barangays.', 403)
    }

    const { data, error } = await query.order('barangay_name')

    if (error) {
      console.error('Scoped barangay lookup:', error)
      return failure('Unable to load barangays.', 500)
    }

    return NextResponse.json(data ?? [], {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Barangays GET:', error)
    return failure('An unexpected error occurred.', 500)
  }
}