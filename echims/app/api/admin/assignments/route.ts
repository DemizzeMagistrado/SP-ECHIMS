import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizationContext } from '@/lib/auth/authorization'

/* =========================================================
   GET — Load barangays/RHUs
========================================================= */


export async function GET() {
  try {
    const context = await getAuthorizationContext()

    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      )
    }

    if (context.role !== 'Administrator') {
      return NextResponse.json(
        { error: 'Administrator access required.' },
        { status: 403 }
      )
    }

    const supabase = await createClient()

    const { data: barangays, error } = await supabase
      .from('barangay')
      .select(`
        barangay_id,
        barangay_name,
        municipality,
        province,
        rhu_id,
        rhu (
          rhu_id,
          rhu_name
        )
      `)
      .order('rhu_id', { ascending: true })
      .order('barangay_name', { ascending: true })

    if (error) {
      console.error(
        'ASSIGNMENT API: barangay query error:',
        error.message
      )

      return NextResponse.json(
        { error: 'Failed to load barangays.' },
        { status: 500 }
      )
    }

    const formattedBarangays = (barangays ?? []).map(
      (barangay) => {
        const rhu = Array.isArray(barangay.rhu)
          ? barangay.rhu[0]
          : barangay.rhu

        return {
          barangay_id: barangay.barangay_id,
          barangay_name: barangay.barangay_name,
          municipality: barangay.municipality,
          province: barangay.province,
          rhu_id: barangay.rhu_id,
          rhu_name: rhu?.rhu_name ?? null,
        }
      }
    )

    return NextResponse.json({
      barangays: formattedBarangays,
    })
  } catch (error) {
    console.error(
      'ASSIGNMENT API: unexpected GET error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

/* =========================================================
   POST — CREATE / REACTIVATE ASSIGNMENT
========================================================= */

export async function POST(request: Request) {
  try {
    const context = await getAuthorizationContext()

    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      )
    }

    if (context.role !== 'Administrator') {
      return NextResponse.json(
        { error: 'Administrator access required.' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const userId = body.user_id
    const barangayId = Number(body.barangay_id)
    const status = body.status || 'ACTIVE'

    if (!userId || !Number.isInteger(barangayId)) {
      return NextResponse.json(
        {
          error: 'user_id and a valid barangay_id are required.',
        },
        { status: 400 }
      )
    }

    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid assignment status.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    /* =====================================================
       VERIFY TARGET USER
    ===================================================== */

    const { data: targetUser, error: targetUserError } =
      await supabase
        .from('users')
        .select(`
          user_id,
          full_name,
          account_status
        `)
        .eq('user_id', userId)
        .maybeSingle()

    if (targetUserError) {
      console.error(
        'ASSIGNMENT API: target user query error:',
        targetUserError.message
      )

      return NextResponse.json(
        { error: 'Failed to verify health worker.' },
        { status: 500 }
      )
    }

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 404 }
      )
    }

    /* =====================================================
       VERIFY TARGET IS A HEALTH WORKER
    ===================================================== */

    const [
      phnResult,
      rhmResult,
      bhwResult,
      bnsResult,
    ] = await Promise.all([
      supabase
        .from('public_health_nurse')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle(),

      supabase
        .from('rural_health_midwife')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle(),

      supabase
        .from('barangay_health_worker')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle(),

      supabase
        .from('barangay_nutrition_scholar')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle(),
    ])

    const isHealthWorker =
      !!phnResult.data ||
      !!rhmResult.data ||
      !!bhwResult.data ||
      !!bnsResult.data

    if (!isHealthWorker) {
      return NextResponse.json(
        {
          error:
            'Assignments can only be given to health workers.',
        },
        { status: 400 }
      )
    }

    /* =====================================================
       VERIFY BARANGAY
    ===================================================== */

    const { data: barangay, error: barangayError } =
      await supabase
        .from('barangay')
        .select(`
          barangay_id,
          barangay_name,
          municipality,
          province,
          rhu_id,
          rhu (
            rhu_id,
            rhu_name
          )
        `)
        .eq('barangay_id', barangayId)
        .maybeSingle()

    if (barangayError) {
      console.error(
        'ASSIGNMENT API: barangay query error:',
        barangayError.message
      )

      return NextResponse.json(
        { error: 'Failed to verify barangay.' },
        { status: 500 }
      )
    }

    if (!barangay) {
      return NextResponse.json(
        { error: 'Barangay not found.' },
        { status: 404 }
      )
    }

    /* =====================================================
       CHECK FOR EXISTING ASSIGNMENT
    ===================================================== */

    const { data: existingAssignment, error: existingError } =
      await supabase
        .from('health_worker_assignment')
        .select(`
          assignment_id,
          user_id,
          barangay_id,
          assigned_date,
          status
        `)
        .eq('user_id', userId)
        .eq('barangay_id', barangayId)
        .maybeSingle()

    if (existingError) {
      console.error(
        'ASSIGNMENT API: existing assignment query error:',
        existingError.message
      )

      return NextResponse.json(
        { error: 'Failed to check existing assignment.' },
        { status: 500 }
      )
    }

    /* =====================================================
       REACTIVATE EXISTING ASSIGNMENT
    ===================================================== */

    if (existingAssignment) {
      const { data: updatedAssignment, error: updateError } =
        await supabase
          .from('health_worker_assignment')
          .update({
            status,
          })
          .eq(
            'assignment_id',
            existingAssignment.assignment_id
          )
          .select(`
            assignment_id,
            user_id,
            barangay_id,
            assigned_date,
            status
          `)
          .single()

      if (updateError) {
        console.error(
          'ASSIGNMENT API: update error:',
          updateError.message
        )

        return NextResponse.json(
          { error: 'Failed to update assignment.' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        message: 'Assignment updated successfully.',
        assignment: updatedAssignment,
      })
    }

    /* =====================================================
       CREATE NEW ASSIGNMENT
    ===================================================== */

    const { data: newAssignment, error: insertError } =
      await supabase
        .from('health_worker_assignment')
        .insert({
          user_id: userId,
          barangay_id: barangayId,
          assigned_date: new Date()
            .toISOString()
            .split('T')[0],
          status,
        })
        .select(`
          assignment_id,
          user_id,
          barangay_id,
          assigned_date,
          status
        `)
        .single()

    if (insertError) {
      console.error(
        'ASSIGNMENT API: insert error:',
        insertError.message
      )

      return NextResponse.json(
        {
          error:
            insertError.message ||
            'Failed to create assignment.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: 'Assignment created successfully.',
        assignment: newAssignment,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error(
      'ASSIGNMENT API: unexpected error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

/* =========================================================
   PATCH — CHANGE ASSIGNMENT STATUS
========================================================= */

export async function PATCH(request: Request) {
  try {
    const context = await getAuthorizationContext()

    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      )
    }

    if (context.role !== 'Administrator') {
      return NextResponse.json(
        { error: 'Administrator access required.' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const assignmentId = Number(body.assignment_id)
    const status = body.status

    if (!Number.isInteger(assignmentId)) {
      return NextResponse.json(
        { error: 'Valid assignment_id is required.' },
        { status: 400 }
      )
    }

    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid assignment status.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: assignment, error: assignmentError } =
      await supabase
        .from('health_worker_assignment')
        .select(`
          assignment_id,
          user_id,
          barangay_id,
          assigned_date,
          status
        `)
        .eq('assignment_id', assignmentId)
        .maybeSingle()

    if (assignmentError) {
      console.error(
        'ASSIGNMENT API: assignment lookup error:',
        assignmentError.message
      )

      return NextResponse.json(
        { error: 'Failed to find assignment.' },
        { status: 500 }
      )
    }

    if (!assignment) {
      return NextResponse.json(
        { error: 'Assignment not found.' },
        { status: 404 }
      )
    }

    const { data: updatedAssignment, error: updateError } =
      await supabase
        .from('health_worker_assignment')
        .update({
          status,
        })
        .eq('assignment_id', assignmentId)
        .select(`
          assignment_id,
          user_id,
          barangay_id,
          assigned_date,
          status
        `)
        .single()

    if (updateError) {
      console.error(
        'ASSIGNMENT API: status update error:',
        updateError.message
      )

      return NextResponse.json(
        { error: 'Failed to update assignment status.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Assignment status updated successfully.',
      assignment: updatedAssignment,
    })
  } catch (error) {
    console.error(
      'ASSIGNMENT API: unexpected PATCH error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}