// RPT-USR001 — Data for the dashboard overview widgets, one widget per request
// so each card loads and fails on its own.
// GET /api/dashboard/widgets?widget=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD
// Scope rules match /api/dashboard/summary (lib/dashboard-scope).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scopeBarangays, trustedRole } from '@/lib/dashboard-scope'
import { manilaTodayYMD } from '@/lib/nip-schedule'

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

// ─── Widgets ─────────────────────────────────────────────────────────
const widgets: Record<string, (ctx: Ctx) => Promise<unknown>> = {
  // Alerts the rule engine created today (Manila), per rule type. The feed view is
  // already scoped to the viewer; one event can reach several recipients, so count
  // each event_key once.
  async rules(ctx) {
    // shortcut: reads at most 5000 of today's alerts, fine for one RHU; aggregate in SQL if a day ever exceeds that.
    const data = await rows(ctx.supabase.from('alert_notification_feed')
      .select('alert_id, alert_type, source_module, event_key')
      .gte('created_at', `${ctx.today}T00:00:00+08:00`)
      .range(0, 4999))
    const seen = new Set<string>()
    const groups = new Map<string, { type: string; program: string; count: number }>()
    for (const a of data) {
      const key = String(a.event_key ?? `id:${a.alert_id}`)
      if (seen.has(key)) continue
      seen.add(key)
      const g = groups.get(a.alert_type) ?? { type: a.alert_type, program: a.source_module ?? a.alert_type, count: 0 }
      g.count++
      groups.set(a.alert_type, g)
    }
    const byRule = [...groups.values()].sort((a, b) => b.count - a.count)
    return { total: seen.size, by_rule: byRule }
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
    console.error('Dashboard widget:', error)
    return fail('Unable to load this widget.', 500)
  }
}
