// RPT-USR001 — Data for the dashboard overview widgets, one widget per request
// so each card loads and fails on its own.
// GET /api/dashboard/widgets?widget=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD
// Scope rules match /api/dashboard/summary (lib/dashboard-scope).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scopeBarangays, trustedRole } from '@/lib/dashboard-scope'
import { GRACE_PERIOD_DAYS, computeSchedule, excludeGivenDoses, manilaTodayYMD, nipDaysBetween } from '@/lib/nip-schedule'

const headers = { 'Cache-Control': 'private, max-age=60' }
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })

type Ctx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  userId: string
  role: string
  scope: number[] | null
  from: string
  to: string
  today: string
}

const ymd = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const addYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`
const inScope = (ctx: Ctx, barangayId: unknown) => ctx.scope === null || ctx.scope.includes(Number(barangayId))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = (ctx: Ctx, q: any, column = 'barangay_id') => ctx.scope === null ? q : q.in(column, ctx.scope.length ? ctx.scope : [-1])
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null

// Throws on a Supabase error so the widget shows its error state, not a false zero.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rows<T = any>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Fetch rows for a long id list in chunks, keeping request URLs short.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function byIds<T = any>(ids: number[], query: (chunk: number[]) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 300) out.push(...await rows<T>(query(ids.slice(i, i + 300))))
  return out
}

// Active children in scope with their latest assessment and whether any NIP dose is
// past the defaulter grace period (same rule as /api/vaccination/defaulters).
async function childStatus(ctx: Ctx) {
  const children = await rows(scoped(ctx, ctx.supabase.from('child')
    .select('child_id, date_of_birth, barangay_id')
    .in('status', ['ACTIVE', 'MONITORING'])))
  const ids = children.map((c) => c.child_id)
  const [records, assessments] = await Promise.all([
    byIds(ids, (chunk) => ctx.supabase.from('vaccination_record')
      .select('child_id, dose_number, vaccine:vaccine(vaccine_type)')
      .eq('status', 'APPROVED')
      .in('child_id', chunk)),
    byIds(ids, (chunk) => ctx.supabase.from('nutritional_assessment')
      .select('child_id, assessment_date, is_at_risk, weight_for_age, height_for_age, weight_for_height, nutritional_status, bmi_for_age')
      .in('child_id', chunk)
      .order('assessment_date', { ascending: false })),
  ])
  const given = new Map<number, { vaccine_type: string; dose_number: number }[]>()
  for (const r of records) {
    const vt = one(r.vaccine)?.vaccine_type
    if (vt) given.set(r.child_id, [...(given.get(r.child_id) ?? []), { vaccine_type: vt, dose_number: r.dose_number }])
  }
  const latest = new Map<number, Record<string, unknown>>()
  for (const a of assessments) if (!latest.has(a.child_id)) latest.set(a.child_id, a)
  return children.map((c) => ({
    ...c,
    overdue: excludeGivenDoses(computeSchedule(String(c.date_of_birth)), given.get(c.child_id) ?? [])
      .some((e) => e.recommended_date <= ctx.today && nipDaysBetween(e.recommended_date, ctx.today) > GRACE_PERIOD_DAYS),
    assessment: latest.get(c.child_id) ?? null,
  }))
}

// ─── Widgets ─────────────────────────────────────────────────────────
class Forbidden extends Error {}
const only = (ctx: Ctx, roles: string[]) => { if (!roles.includes(ctx.role)) throw new Forbidden() }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function count(q: PromiseLike<{ count: number | null; error: any }>) {
  const { count: n, error } = await q
  if (error) throw error
  return n ?? 0
}

const widgets: Record<string, (ctx: Ctx) => Promise<unknown>> = {
  // Fully Immunized Child: of the active children who turned 12 months old in the
  // period, how many had every FIC dose (approved, including prior doses) by their
  // first birthday. DOH FIC antigens: BCG, 3 Penta, 3 OPV, 1 measles-containing (MMR).
  async fic(ctx) {
    const required: Record<string, number> = { BCG: 1, PENTA: 3, OPV: 3, MMR: 1 }
    const children = await rows(scoped(ctx, ctx.supabase.from('child')
      .select('child_id, date_of_birth')
      .eq('status', 'ACTIVE')
      .gte('date_of_birth', addYears(ctx.from, -1))
      .lte('date_of_birth', addYears(ctx.to, -1))))
    const vaccines = await rows(ctx.supabase.from('vaccine').select('vaccine_id, vaccine_type'))
    const code = new Map(vaccines.map((v) => [v.vaccine_id, String(v.vaccine_type).toUpperCase()]))
    const records = await byIds(children.map((c) => c.child_id), (ids) => ctx.supabase.from('vaccination_record')
      .select('child_id, vaccine_id, dose_number, vaccination_date')
      .eq('status', 'APPROVED')
      .in('child_id', ids))
    const birthday = new Map(children.map((c) => [c.child_id, addYears(c.date_of_birth, 1)]))
    const doses = new Map<number, Map<string, Set<number>>>()
    for (const r of records) {
      const vc = code.get(r.vaccine_id)
      if (!vc || !(vc in required) || r.vaccination_date > birthday.get(r.child_id)!) continue
      const byVaccine = doses.get(r.child_id) ?? new Map<string, Set<number>>()
      byVaccine.set(vc, (byVaccine.get(vc) ?? new Set()).add(r.dose_number))
      doses.set(r.child_id, byVaccine)
    }
    const fic = children.filter((c) => Object.entries(required).every(([vc, n]) => (doses.get(c.child_id)?.get(vc)?.size ?? 0) >= n)).length
    return { fully_immunized: fic, eligible: children.length, target: 95 }
  },

  // Per-barangay counts in scope: children, children with an overdue NIP dose, and
  // children whose latest assessment is at risk. Admin ranks them; BHW sees their own.
  async barangays(ctx) {
    const [barangays, children] = await Promise.all([
      rows(scoped(ctx, ctx.supabase.from('barangay').select('barangay_id, barangay_name'))),
      childStatus(ctx),
    ])
    const out = new Map(barangays.map((b) => [b.barangay_id, { id: b.barangay_id, name: b.barangay_name, children: 0, overdue: 0, at_risk: 0 }]))
    for (const c of children) {
      const b = out.get(c.barangay_id)
      if (!b) continue
      b.children++
      if (c.overdue) b.overdue++
      if (c.assessment?.is_at_risk === true) b.at_risk++
    }
    return { barangays: [...out.values()] }
  },

  // Records waiting for an approver. RLS limits PHN to their RHU.
  async approvals(ctx) {
    only(ctx, ['Administrator', 'Public Health Nurse'])
    const head = { count: 'exact', head: true }
    const [vaccinations, activities, batches, replenishment] = await Promise.all([
      count(ctx.supabase.from('vaccination_record').select('vaccination_record_id', head).eq('status', 'PENDING')),
      count(ctx.supabase.from('health_activity_schedule').select('schedule_id', head).eq('status', 'PENDING')),
      count(ctx.supabase.from('stock_request').select('stock_request_id', head).eq('status', 'PENDING').in('request_type', ['VACCINE_BATCH', 'SUPPLEMENT_BATCH'])),
      count(ctx.supabase.from('stock_request').select('stock_request_id', head).eq('status', 'PENDING').eq('request_type', 'REPLENISHMENT')),
    ])
    return { queues: { vaccinations, activities, batches, replenishment } }
  },

  // Latest assessment per active child, one category each (the most urgent wins):
  // wasted > stunted > underweight > overweight > normal. Also counts under-5s whose
  // last weighing is older than 90 days (or never weighed).
  async nutrition(ctx) {
    const children = await rows(scoped(ctx, ctx.supabase.from('child')
      .select('child_id, date_of_birth')
      .eq('status', 'ACTIVE')))
    const assessments = await byIds(children.map((c) => c.child_id), (chunk) => ctx.supabase.from('nutritional_assessment')
      .select('child_id, assessment_date, weight_for_age, height_for_age, weight_for_height, bmi_for_age, nutritional_status')
      .in('child_id', chunk)
      .order('assessment_date', { ascending: false }))
    const latest = new Map<number, Record<string, string | null>>()
    for (const a of assessments) if (!latest.has(a.child_id)) latest.set(a.child_id, a)
    const has = (v: unknown, codes: string[]) => codes.includes(String(v ?? '').toUpperCase())
    const counts = { normal: 0, underweight: 0, wasted: 0, stunted: 0, overweight: 0 }
    for (const a of latest.values()) {
      if (has(a.weight_for_height, ['WASTED', 'SEVERELY_WASTED', 'WASTING', 'SEVERE_WASTING']) || has(a.nutritional_status, ['SAM', 'MAM'])) counts.wasted++
      else if (has(a.height_for_age, ['STUNTED', 'SEVERELY_STUNTED'])) counts.stunted++
      else if (has(a.weight_for_age, ['UNDERWEIGHT', 'SEVERELY_UNDERWEIGHT'])) counts.underweight++
      else if (has(a.weight_for_height, ['OVERWEIGHT', 'OBESE', 'OBESITY']) || has(a.bmi_for_age, ['OVERWEIGHT', 'OBESE', 'OBESITY'])) counts.overweight++
      else counts.normal++
    }
    // shortcut: 90-day weighing cycle is a fixed default; move to a configurable rule if programs differ.
    const under5 = addYears(ctx.today, -5), stale = new Date(Date.parse(`${ctx.today}T00:00:00Z`) - 90 * 864e5).toISOString().slice(0, 10)
    const dueWeighing = children.filter((c) => c.date_of_birth > under5 && !((latest.get(c.child_id)?.assessment_date ?? '') > stale)).length
    return { counts, assessed: latest.size, due_weighing: dueWeighing, under5: children.filter((c) => c.date_of_birth > under5).length }
  },

  // Batches with stock left that expire within 30 days (expired ones included,
  // since they still need pulling from the shelf).
  async expiring(ctx) {
    const until = new Date(Date.parse(`${ctx.today}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10)
    const data = await rows(scoped(ctx, ctx.supabase.from('inventory_batch')
      .select('batch_id, batch_number, expiry_date, quantity_on_hand, inventory:inventory!inner(barangay_id, item:item(item_name, unit), barangay:barangay(barangay_name))')
      .gt('quantity_on_hand', 0)
      .lte('expiry_date', until)
      .order('expiry_date'), 'inventory.barangay_id'))
    return {
      today: ctx.today,
      batches: data.map((b) => {
        const inv = one(b.inventory)
        return {
          id: b.batch_id, batch_number: b.batch_number, expiry_date: b.expiry_date, quantity: Number(b.quantity_on_hand),
          item: one(inv?.item)?.item_name ?? 'Unknown item', unit: one(inv?.item)?.unit ?? '', barangay: one(inv?.barangay)?.barangay_name ?? null,
        }
      }),
    }
  },

  // Admin: accounts created in the period and accounts waiting for activation.
  async system(ctx) {
    only(ctx, ['Administrator'])
    const head = { count: 'exact', head: true }
    const [created, pending] = await Promise.all([
      count(ctx.supabase.from('users').select('user_id', head).gte('created_at', `${ctx.from}T00:00:00+08:00`).lte('created_at', `${ctx.to}T23:59:59.999+08:00`)),
      count(ctx.supabase.from('users').select('user_id', head).eq('account_status', 'PENDING')),
    ])
    return { new_accounts: created, pending_users: pending }
  },
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fail('Please sign in.', 401)
    const role = await trustedRole(supabase)
    if (!role) return fail('Unknown role.', 403)

    const url = new URL(request.url)
    const handler = widgets[url.searchParams.get('widget') ?? '']
    if (!handler) return fail('Unknown widget.', 400)
    const today = manilaTodayYMD()
    const to = ymd(url.searchParams.get('to')) ?? today
    const from = ymd(url.searchParams.get('from')) ?? to
    if (from > to) return fail('"from" must be on or before "to".', 400)

    const scope = await scopeBarangays(supabase, user.id, role)
    const data = await handler({ supabase, userId: user.id, role, scope, from, to, today })
    return NextResponse.json(data, { headers })
  } catch (error) {
    if (error instanceof Forbidden) return fail('This widget is not available for your role.', 403)
    console.error('Dashboard widget:', error)
    return fail('Unable to load this widget.', 500)
  }
}
