import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Admin-only user administration endpoint.
// GET  → every user with role + status + active barangay assignments + PHN rhu assignment.
// PATCH → change account_status (approve pending, suspend, etc.) or set a PHN's rhu_id.
// All writes go through the RLS admin_all_* policies — handler just checks auth upfront.

type Profile = { role?: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAdmin(): Promise<{ supabase: any; response: null } | { supabase: null; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, response: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) }
  const { data: profile } = await supabase.rpc('get_my_profile').maybeSingle() as { data: Profile | null }
  if (profile?.role !== 'Administrator') return { supabase: null, response: NextResponse.json({ error: 'Admin access only.' }, { status: 403 }) }
  return { supabase, response: null }
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth.response) return auth.response
  const supabase = auth.supabase
  const { data: users, error } = await supabase.from('users').select('user_id, full_name, username, email, contact_number, account_status, created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load users.' }, { status: 500 })
  const userIds = (users ?? []).map((u: { user_id: string }) => u.user_id)
  if (userIds.length === 0) return NextResponse.json([])

  const [admins, phns, bhws, bnses, rhms, hws, assignments] = await Promise.all([
    supabase.from('administrator').select('user_id').in('user_id', userIds),
    supabase.from('public_health_nurse').select('user_id, rhu_id').in('user_id', userIds),
    supabase.from('barangay_health_worker').select('user_id').in('user_id', userIds),
    supabase.from('barangay_nutrition_scholar').select('user_id').in('user_id', userIds),
    supabase.from('rural_health_midwife').select('user_id').in('user_id', userIds),
    supabase.from('health_worker').select('user_id, employee_id, license_number').in('user_id', userIds),
    supabase.from('health_worker_assignment').select('assignment_id, user_id, barangay_id, status, assigned_date').in('user_id', userIds).eq('status', 'ACTIVE'),
  ])

  const barangayIds = [...new Set((assignments.data ?? []).map((a: { barangay_id: number }) => a.barangay_id))]
  const rhuIds = [...new Set(((phns.data ?? []) as { rhu_id: number | null }[]).map((p) => p.rhu_id).filter(Boolean) as number[])]
  const [barangays, rhus] = await Promise.all([
    barangayIds.length ? supabase.from('barangay').select('barangay_id, barangay_name, rhu_id').in('barangay_id', barangayIds) : Promise.resolve({ data: [] }),
    rhuIds.length ? supabase.from('rhu').select('rhu_id, rhu_name').in('rhu_id', rhuIds) : Promise.resolve({ data: [] }),
  ])

  const roleOf = (uid: string) => {
    if (admins.data?.find((a: { user_id: string }) => a.user_id === uid)) return 'Administrator'
    if (phns.data?.find((p: { user_id: string }) => p.user_id === uid)) return 'Public Health Nurse'
    if (rhms.data?.find((r: { user_id: string }) => r.user_id === uid)) return 'Rural Health Midwife'
    if (bhws.data?.find((b: { user_id: string }) => b.user_id === uid)) return 'Barangay Health Worker'
    if (bnses.data?.find((b: { user_id: string }) => b.user_id === uid)) return 'Barangay Nutrition Scholar'
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barangayById = new Map<number, { barangay_name: string }>((barangays.data ?? []).map((b: any) => [b.barangay_id, b]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rhuById = new Map<number, { rhu_name: string }>((rhus.data ?? []).map((r: any) => [r.rhu_id, r]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (users ?? []).map((u: any) => {
    const hw = hws.data?.find((h: { user_id: string }) => h.user_id === u.user_id)
    const phn = (phns.data ?? []).find((p: { user_id: string }) => p.user_id === u.user_id) as { rhu_id?: number | null } | undefined
    const rhu = phn?.rhu_id ? rhuById.get(phn.rhu_id) : null
    return {
      ...u,
      role: roleOf(u.user_id),
      employee_id: (hw as { employee_id?: string | null } | undefined)?.employee_id ?? null,
      license_number: (hw as { license_number?: string | null } | undefined)?.license_number ?? null,
      rhu_id: phn?.rhu_id ?? null,
      rhu_name: rhu?.rhu_name ?? null,
      assignments: (assignments.data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((a: any) => a.user_id === u.user_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((a: any) => ({ assignment_id: a.assignment_id, barangay_id: a.barangay_id, barangay_name: barangayById.get(a.barangay_id)?.barangay_name ?? `#${a.barangay_id}` })),
    }
  })
  return NextResponse.json(result)
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.response) return auth.response
  const supabase = auth.supabase
  const body = await request.json().catch(() => null) as { user_id?: string; account_status?: string; rhu_id?: number | null } | null
  if (!body?.user_id) return NextResponse.json({ error: 'user_id is required.' }, { status: 400 })

  if (body.account_status !== undefined) {
    if (!['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(body.account_status)) return NextResponse.json({ error: 'Invalid account status.' }, { status: 400 })
    const { error } = await supabase.from('users').update({ account_status: body.account_status }).eq('user_id', body.user_id)
    if (error) return NextResponse.json({ error: 'Unable to update account status.' }, { status: 500 })
  }

  if (body.rhu_id !== undefined) {
    // Only PHN users have an rhu_id — guard so a stray payload can't poke another role.
    const { data: phnRow } = await supabase.from('public_health_nurse').select('user_id').eq('user_id', body.user_id).maybeSingle()
    if (!phnRow) return NextResponse.json({ error: 'Only Public Health Nurses can be assigned to an RHU.' }, { status: 400 })
    const { error } = await supabase.from('public_health_nurse').update({ rhu_id: body.rhu_id }).eq('user_id', body.user_id)
    if (error) return NextResponse.json({ error: 'Unable to update RHU assignment.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}