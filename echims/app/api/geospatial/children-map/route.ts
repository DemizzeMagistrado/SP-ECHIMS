// echims/app/api/geospatial/children-map/route.ts
// Role-scoped barangay-level child counts.
//
// No household lat/lng is required — we count children directly by
// child.barangay_id. The map is an estimated per-barangay population view
// for health workers; individual child locations are NOT shown.
//
// Scope rules (resolved via direct table queries, not RPCs, for reliability):
//   Administrator → every barangay in Daet + Naga
//   Public Health Nurse → every barangay in their RHU
//   Rural Health Midwife / Barangay Health Worker / Barangay Nutrition Scholar
//     → only barangays they are actively assigned to (health_worker_assignment)
//
// Response:
// {
//   role: 'Administrator' | 'Public Health Nurse' | 'Rural Health Midwife' | 'Barangay Health Worker' | 'Barangay Nutrition Scholar' | null,
//   scopeLabel: 'All barangays' | 'Daet RHU' | '3 barangays' | 'Alawihao',
//   allowedBarangayIds: number[],
//   perBarangay: [{ barangay_id, barangay_name, municipality, child_count }]
// }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BarangayRow = { barangay_id: number; barangay_name: string; municipality: string; rhu_id: number | null }

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  // ─── 1. Resolve role by checking each role table directly ───
  const [adminRow, phnRow, rhmRow, bhwRow, bnsRow] = await Promise.all([
    supabase.from('administrator').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('public_health_nurse').select('rhu_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('rural_health_midwife').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('barangay_health_worker').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('barangay_nutrition_scholar').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])

  let role: string | null = null
  let allowed: BarangayRow[] = []
  let scopeLabel = ''

  if (adminRow.data) {
    role = 'Administrator'
    const { data } = await supabase
      .from('barangay')
      .select('barangay_id, barangay_name, municipality, rhu_id')
    allowed = (data ?? []) as BarangayRow[]
    scopeLabel = `All barangays (${allowed.length})`
  } else if (phnRow.data) {
    role = 'Public Health Nurse'
    const rhuId = (phnRow.data as { rhu_id: number }).rhu_id
    const { data } = await supabase
      .from('barangay')
      .select('barangay_id, barangay_name, municipality, rhu_id')
      .eq('rhu_id', rhuId)
    allowed = (data ?? []) as BarangayRow[]
    const muni = allowed[0]?.municipality ?? 'RHU'
    scopeLabel = `${muni} RHU (${allowed.length} brgy)`
  } else if (rhmRow.data || bhwRow.data || bnsRow.data) {
    role = rhmRow.data
      ? 'Rural Health Midwife'
      : bhwRow.data
        ? 'Barangay Health Worker'
        : 'Barangay Nutrition Scholar'
    const { data: assigns } = await supabase
      .from('health_worker_assignment')
      .select('barangay_id, barangay:barangay(barangay_id, barangay_name, municipality, rhu_id)')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
    allowed = (assigns ?? []).flatMap((a) => {
      const b = Array.isArray(a.barangay) ? a.barangay[0] : a.barangay
      return b ? [b as BarangayRow] : []
    })
    if (allowed.length === 0) scopeLabel = 'No barangays assigned'
    else if (allowed.length === 1) scopeLabel = allowed[0].barangay_name
    else scopeLabel = `${allowed.length} assigned barangays`
  } else {
    // Role not resolved — return empty but don't 403; UI will show a notice.
    return NextResponse.json({
      role: null,
      scopeLabel: 'No role assigned',
      allowedBarangayIds: [],
      perBarangay: [],
    })
  }

  const allowedBarangayIds = allowed.map((b) => b.barangay_id)
  if (allowedBarangayIds.length === 0) {
    return NextResponse.json({ role, scopeLabel, allowedBarangayIds: [], perBarangay: [] })
  }

  // ─── 2. Count children per barangay — no coords needed ───
  const { data: children, error: childErr } = await supabase
    .from('child')
    .select('child_id, barangay_id')
    .eq('status', 'ACTIVE')
    .in('barangay_id', allowedBarangayIds)
  if (childErr) return NextResponse.json({ error: childErr.message }, { status: 500 })

  const counts = new Map<number, number>()
  for (const c of children ?? []) {
    counts.set(c.barangay_id as number, (counts.get(c.barangay_id as number) ?? 0) + 1)
  }

  // Return one row per allowed barangay (zero-fill those with no children, so the
  // table reads completely for the scope).
  const perBarangay = allowed.map((b) => ({
    barangay_id: b.barangay_id,
    barangay_name: b.barangay_name,
    municipality: b.municipality,
    child_count: counts.get(b.barangay_id) ?? 0,
  }))

  return NextResponse.json({ role, scopeLabel, allowedBarangayIds, perBarangay })
}