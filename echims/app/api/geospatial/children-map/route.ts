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
//   perBarangay: [{ barangay_id, barangay_name, municipality, child_count }],
//   children: [{ child_id, child_code, name, status, barangay_id, household_id,
//                family_serial_no, lat, lng, at_risk }]   // lat/lng from the household
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

  // ─── 3. Children in scope, for markers and lists (RLS applies as well) ───
  // Pins use the household's coordinates, so siblings share one location. Only the signed-in
  // worker's own scope is returned; the latest nutrition assessment gives the at-risk flag.
  const { data: kids, error: kidsErr } = await supabase
    .from('child')
    .select('child_id, child_code, first_name, middle_name, last_name, status, barangay_id, household_id, household:household(family_serial_no, latitude, longitude)')
    .in('barangay_id', allowedBarangayIds)
    .order('last_name')
  if (kidsErr) return NextResponse.json({ error: 'The children for the map could not be loaded. Refresh to try again.' }, { status: 500 })
  const ids = (kids ?? []).map((k) => k.child_id as number)
  const atRisk = new Map<number, boolean>()
  if (ids.length) {
    const { data: assessments } = await supabase
      .from('nutritional_assessment')
      .select('child_id, is_at_risk')
      .in('child_id', ids)
      .order('assessment_date', { ascending: false })
      .order('assessment_id', { ascending: false })
    for (const a of assessments ?? []) if (!atRisk.has(a.child_id as number)) atRisk.set(a.child_id as number, a.is_at_risk === true)
  }
  const byBarangay = new Map(allowed.map((b) => [b.barangay_id, b]))
  const childRows = (kids ?? []).map((k) => {
    const h = (Array.isArray(k.household) ? k.household[0] : k.household) as { family_serial_no?: string | null; latitude?: number | string | null; longitude?: number | string | null } | null
    const lat = h?.latitude == null ? null : Number(h.latitude)
    const lng = h?.longitude == null ? null : Number(h.longitude)
    const b = byBarangay.get(k.barangay_id as number)
    return {
      child_id: k.child_id,
      child_code: k.child_code ?? null,
      name: [k.first_name, k.middle_name, k.last_name].filter(Boolean).join(' '),
      status: k.status,
      barangay_id: k.barangay_id,
      barangay_name: b?.barangay_name ?? '',
      municipality: b?.municipality ?? '',
      household_id: k.household_id,
      family_serial_no: h?.family_serial_no ?? null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      at_risk: atRisk.get(k.child_id as number) ?? false,
    }
  })

  return NextResponse.json({ role, scopeLabel, allowedBarangayIds, perBarangay, children: childRows })
}