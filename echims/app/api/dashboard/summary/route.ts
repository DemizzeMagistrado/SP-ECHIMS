// RPT-USR001 — Role-scoped dashboard summary.
// GET /api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns everything the dashboard cards + charts need in one request. Role
// scoping is enforced here (not in RLS alone) so BHW/BNS see their barangay
// only, and PHN/Admin see RHU-wide totals.
//
// Dates are optional; defaults to last 90 days.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Role = 'Administrator' | 'Public Health Nurse' | 'Rural Health Midwife'
  | 'Barangay Health Worker' | 'Barangay Nutrition Scholar' | string

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any): Promise<Role | null> {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle()
  const r = String(data?.role ?? '').trim()
  return r || null
}

function parseDate(v: string | null): string | null {
  if (!v) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoYMD(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const role = await trustedRole(supabase)
  if (!role) return NextResponse.json({ error: 'Unknown role.' }, { status: 403 })

  const url = new URL(request.url)
  const from = parseDate(url.searchParams.get('from')) ?? daysAgoYMD(90)
  const to = parseDate(url.searchParams.get('to')) ?? todayYMD()
  if (from > to) return NextResponse.json({ error: '"from" must be on or before "to".' }, { status: 400 })

  // Resolve the scope: which barangay_ids the user is allowed to count. BHW/BNS
  // only see their assignments; RHM sees assignments too; PHN sees their RHU;
  // Admin sees everything.
  let scopeBarangayIds: number[] | null = null  // null = no filter (all)
  if (role === 'Barangay Health Worker' || role === 'Barangay Nutrition Scholar' || role === 'Rural Health Midwife') {
    const assignRes = await supabase.from('health_worker_assignment')
      .select('barangay_id, status')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
    scopeBarangayIds = (assignRes.data ?? []).map((r: { barangay_id: number }) => r.barangay_id)
  } else if (role === 'Public Health Nurse') {
    const phnRes = await supabase.from('public_health_nurse').select('rhu_id').eq('user_id', user.id).maybeSingle()
    const rhuId = phnRes.data?.rhu_id
    if (rhuId) {
      const bRes = await supabase.from('barangay').select('barangay_id').eq('rhu_id', rhuId)
      scopeBarangayIds = (bRes.data ?? []).map((r: { barangay_id: number }) => r.barangay_id)
    } else {
      scopeBarangayIds = []
    }
  }
  // Admin: scopeBarangayIds stays null (see all)

  // Helper: apply the barangay scope to a child query via .in() or no-op.
  function scopeFilter<T extends { in: (col: string, vals: number[]) => T }>(q: T, col: string): T {
    if (scopeBarangayIds === null) return q
    return q.in(col, scopeBarangayIds.length > 0 ? scopeBarangayIds : [-1])
  }

  // ─── Parallel aggregations ──────────────────────────────────────────
  // All queries are small count/select operations; .select('*', { count: 'exact', head: true })
  // avoids pulling rows just to count them.
  const [
    childrenRes, overdueRes, dueSoonRes, approvedVacRes, nutritionRes,
    atRiskRes, supplementRes, lowStockRes, pendingRes, alertsRes,
    vacByMonthRes, suppByMonthRes, nutritionBreakdownRes,
  ] = await Promise.all([
    // Total registered ACTIVE children in scope
    scopeFilter(supabase.from('child').select('child_id', { count: 'exact', head: true })
      .eq('status', 'ACTIVE'), 'barangay_id'),
    // Overdue vaccinations in scope (uses existing vaccination_record approach)
    (async () => {
      const q = supabase.from('vaccination_record')
        .select('vaccination_record_id, child:child(barangay_id)', { count: 'exact', head: false })
        .eq('status', 'PENDING')
        .lte('vaccination_date', todayYMD())
      const r = await q
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (r.data ?? []).filter((v: any) => {
        if (scopeBarangayIds === null) return true
        const brgy = Array.isArray(v.child) ? v.child[0]?.barangay_id : v.child?.barangay_id
        return scopeBarangayIds.includes(brgy)
      })
      return { count: rows.length }
    })(),
    // Vaccinations due in next 14 days
    (async () => {
      const q = supabase.from('vaccination_record')
        .select('vaccination_record_id, vaccination_date, child:child(barangay_id)', { count: 'exact', head: false })
        .eq('status', 'PENDING')
        .gte('vaccination_date', todayYMD())
        .lte('vaccination_date', daysAgoYMD(-14))
      const r = await q
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (r.data ?? []).filter((v: any) => {
        if (scopeBarangayIds === null) return true
        const brgy = Array.isArray(v.child) ? v.child[0]?.barangay_id : v.child?.barangay_id
        return scopeBarangayIds.includes(brgy)
      })
      return { count: rows.length }
    })(),
    // Approved vaccinations within window (for coverage denominator ratio)
    (async () => {
      const q = supabase.from('vaccination_record')
        .select('vaccination_record_id, child:child(barangay_id)', { count: 'exact', head: false })
        .eq('status', 'APPROVED')
        .gte('vaccination_date', from)
        .lte('vaccination_date', to)
      const r = await q
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (r.data ?? []).filter((v: any) => {
        if (scopeBarangayIds === null) return true
        const brgy = Array.isArray(v.child) ? v.child[0]?.barangay_id : v.child?.barangay_id
        return scopeBarangayIds.includes(brgy)
      })
      return { count: rows.length }
    })(),
    // Nutritional assessments done in window
    (async () => {
      const q = supabase.from('nutritional_assessment')
        .select('assessment_id, child:child(barangay_id)', { count: 'exact', head: false })
        .gte('assessment_date', from)
        .lte('assessment_date', to)
      const r = await q
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (r.data ?? []).filter((a: any) => {
        if (scopeBarangayIds === null) return true
        const brgy = Array.isArray(a.child) ? a.child[0]?.barangay_id : a.child?.barangay_id
        return scopeBarangayIds.includes(brgy)
      })
      return { count: rows.length }
    })(),
    // At-risk children: latest assessment WFA or NS in SAM/MAM/SEVERELY labels
    (async () => {
      const q = supabase.from('nutritional_assessment')
        .select('assessment_id, child_id, nutritional_status, weight_for_age, weight_for_height, assessment_date, child:child(barangay_id)')
        .order('assessment_date', { ascending: false })
      const r = await q
      const seen = new Set<number>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latest: any[] = []
      for (const a of (r.data ?? [])) {
        if (seen.has(a.child_id)) continue
        seen.add(a.child_id)
        latest.push(a)
      }
      const atRiskSet = new Set(['SAM', 'MAM', 'STUNTED', 'SEVERELY STUNTED', 'UNDERWEIGHT', 'SEVERELY UNDERWEIGHT', 'WASTED', 'SEVERELY WASTED'])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const atRisk = latest.filter((a: any) => {
        if (scopeBarangayIds !== null) {
          const brgy = Array.isArray(a.child) ? a.child[0]?.barangay_id : a.child?.barangay_id
          if (!scopeBarangayIds.includes(brgy)) return false
        }
        const ns = String(a.nutritional_status ?? '').toUpperCase()
        const wfa = String(a.weight_for_age ?? '').toUpperCase()
        const wfh = String(a.weight_for_height ?? '').toUpperCase()
        return atRiskSet.has(ns) || atRiskSet.has(wfa) || atRiskSet.has(wfh)
      })
      return { count: atRisk.length }
    })(),
    // Supplementation records in window
    (async () => {
      const q = supabase.from('supplementation_record')
        .select('supplementation_record_id, child:child(barangay_id)', { count: 'exact', head: false })
        .gte('supplementation_date', from)
        .lte('supplementation_date', to)
      const r = await q
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (r.data ?? []).filter((s: any) => {
        if (scopeBarangayIds === null) return true
        const brgy = Array.isArray(s.child) ? s.child[0]?.barangay_id : s.child?.barangay_id
        return scopeBarangayIds.includes(brgy)
      })
      return { count: rows.length }
    })(),
    // Low-stock: aggregate inventory with quantity_on_hand <= 10 in scope
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from('inventory').select('inventory_id, quantity_on_hand, barangay_id').lte('quantity_on_hand', 10)
      if (scopeBarangayIds !== null) q = q.in('barangay_id', scopeBarangayIds.length > 0 ? scopeBarangayIds : [-1])
      const r = await q
      return { count: (r.data ?? []).length }
    })(),
    // Pending PENDING records (vaccination + supplementation) relevant to approvers
    (async () => {
      const vq = supabase.from('vaccination_record').select('vaccination_record_id', { count: 'exact', head: true }).eq('status', 'PENDING')
      const r = await vq
      return { count: r.count ?? 0 }
    })(),
    // Open alerts
    (async () => {
      const r = await supabase.from('alert').select('alert_id', { count: 'exact', head: true }).in('status', ['UNREAD', 'READ'])
      return { count: r.count ?? 0 }
    })(),
    // Vaccinations per month in window (chart data)
    (async () => {
      const r = await supabase.from('vaccination_record')
        .select('vaccination_date, child:child(barangay_id)')
        .eq('status', 'APPROVED')
        .gte('vaccination_date', from)
        .lte('vaccination_date', to)
      const buckets: Record<string, number> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const v of (r.data ?? []) as any[]) {
        if (scopeBarangayIds !== null) {
          const brgy = Array.isArray(v.child) ? v.child[0]?.barangay_id : v.child?.barangay_id
          if (!scopeBarangayIds.includes(brgy)) continue
        }
        const month = String(v.vaccination_date).slice(0, 7)   // yyyy-mm
        buckets[month] = (buckets[month] ?? 0) + 1
      }
      return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))
    })(),
    // RPT-USR001 polish — Supplementation records per month (chart)
    (async () => {
      const r = await supabase.from('supplementation_record')
        .select('supplementation_date, child:child(barangay_id)')
        .gte('supplementation_date', from)
        .lte('supplementation_date', to)
      const buckets: Record<string, number> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (r.data ?? []) as any[]) {
        if (scopeBarangayIds !== null) {
          const brgy = Array.isArray(s.child) ? s.child[0]?.barangay_id : s.child?.barangay_id
          if (!scopeBarangayIds.includes(brgy)) continue
        }
        const month = String(s.supplementation_date).slice(0, 7)
        buckets[month] = (buckets[month] ?? 0) + 1
      }
      return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))
    })(),
    // RPT-USR001 polish — Nutritional status breakdown of latest assessments
    // in scope (donut data: Normal vs At-risk count).
    (async () => {
      const r = await supabase.from('nutritional_assessment')
        .select('child_id, nutritional_status, weight_for_age, weight_for_height, assessment_date, child:child(barangay_id)')
        .order('assessment_date', { ascending: false })
      const seen = new Set<number>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latest: any[] = []
      for (const a of (r.data ?? [])) {
        if (seen.has(a.child_id)) continue
        seen.add(a.child_id)
        latest.push(a)
      }
      const atRiskSet = new Set(['SAM', 'MAM', 'STUNTED', 'SEVERELY STUNTED', 'UNDERWEIGHT', 'SEVERELY UNDERWEIGHT', 'WASTED', 'SEVERELY WASTED'])
      let atRisk = 0, normal = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of latest as any[]) {
        if (scopeBarangayIds !== null) {
          const brgy = Array.isArray(a.child) ? a.child[0]?.barangay_id : a.child?.barangay_id
          if (!scopeBarangayIds.includes(brgy)) continue
        }
        const ns = String(a.nutritional_status ?? '').toUpperCase()
        const wfa = String(a.weight_for_age ?? '').toUpperCase()
        const wfh = String(a.weight_for_height ?? '').toUpperCase()
        if (atRiskSet.has(ns) || atRiskSet.has(wfa) || atRiskSet.has(wfh)) atRisk++
        else normal++
      }
      return { normal, at_risk: atRisk, total: normal + atRisk }
    })(),
  ])

  return NextResponse.json({
    role,
    scope: scopeBarangayIds === null ? 'ALL' : 'BARANGAYS',
    scope_barangay_ids: scopeBarangayIds,
    date_range: { from, to },
    metrics: {
      children: childrenRes.count ?? 0,
      vaccinations_approved: approvedVacRes.count,
      vaccinations_due_soon: dueSoonRes.count,
      vaccinations_overdue: overdueRes.count,
      nutrition_assessments: nutritionRes.count,
      at_risk_children: atRiskRes.count,
      supplementation_records: supplementRes.count,
      low_stock_items: lowStockRes.count,
      pending_approvals: pendingRes.count,
      open_alerts: alertsRes.count,
    },
    charts: {
      vaccinations_by_month: vacByMonthRes,
      supplementation_by_month: suppByMonthRes,
      nutrition_breakdown: nutritionBreakdownRes,
    },
  }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
