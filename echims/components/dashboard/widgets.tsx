'use client'
import { offlineFetch as fetch, offlineScope } from '@/lib/offline/fetch'
import type { AuthUser } from '@/components/auth/auth-provider'
import { listActivityDrafts } from '@/lib/activity-drafts'
import { listChildDrafts } from '@/lib/child-registration-drafts'
import { getQueuedUsageCount } from '@/lib/inventory-offline'
import { listQueue } from '@/lib/nutrition-offline'
import { listSupplementDrafts } from '@/lib/supplementation-offline'
import { listQueuedVaccinations } from '@/lib/vaccination-offline'

// RPT-USR001 — Overview widgets. Each one loads /api/dashboard/widgets?widget=<name>
// on its own, so a slow or failing widget never blocks the rest of the dashboard.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertCircle, ArrowUpRight } from 'lucide-react'
import { manilaTodayYMD } from '@/lib/nip-schedule'
import { Donut } from './mini-charts'

export const stagger = (i: number) => ({ animationDelay: `${i * 60}ms` })
export const rise = 'animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none'
export const card = 'rounded-2xl border border-[#DCEAF0] bg-white'

export const fetcher = async (url: string) => {
  const r = await fetch(url); const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Load failed.'); return d
}

export type Range = { from: string; to: string }

function useWidget<T>(name: string, range?: Range) {
  const qs = new URLSearchParams({ widget: name, ...(range ?? {}) })
  return useSWR<T>(`/api/dashboard/widgets?${qs}`, fetcher)
}

type ShellProps = {
  id: string
  title: string
  note: string
  link?: { href: string; label: string }
  style?: CSSProperties
  className?: string
  loading: boolean
  error?: Error
  empty?: string | false
  children?: ReactNode
}

// Card frame with the three states every widget needs: loading, error, empty.
export function WidgetShell({ id, title, note, link, style, className = '', loading, error, empty, children }: ShellProps) {
  return (
    <section aria-labelledby={`${id}-heading`} aria-busy={loading} className={`${card} flex flex-col p-5 sm:p-6 ${rise} ${className}`} style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-[#5B6478]">{note}</p>
        </div>
        {link && (
          <Link href={link.href} className="group inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-semibold text-[#087DB9] hover:text-[#03045E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
            {link.label}
            <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        )}
      </div>
      <div className="mt-4 flex-1">
        {loading ? (
          <div role="status" aria-label={`Loading ${title}`} className="space-y-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="h-7 animate-pulse rounded-lg bg-[#EEF4F7] motion-reduce:animate-none" />)}
          </div>
        ) : error ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error.message}
          </p>
        ) : empty ? (
          <p className="flex h-full min-h-20 items-center justify-center rounded-xl bg-[#F8FCFD] p-4 text-center text-sm text-[#5B6478]">{empty}</p>
        ) : children}
      </div>
    </section>
  )
}

// Horizontal bars for a short ranked list; each row can link to its detail.
export function BarList({ items, color, label }: { items: { key: string; label: string; value: number; href?: string; hint?: string }[]; color: string; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul aria-label={label} className="space-y-2">
      {items.map((item, i) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold">{item.label}{item.hint && <span className="font-normal text-[#5B6478]"> · {item.hint}</span>}</span>
              <span className="shrink-0 font-bold tabular-nums">{item.value.toLocaleString()}</span>
            </span>
            <span aria-hidden className="mt-1 block h-2 overflow-hidden rounded-full bg-[#EEF4F7]">
              <span className="grow-x block h-full rounded-full" style={{ width: `${Math.max(3, (item.value / max) * 100)}%`, background: color, animationDelay: `${i * 50}ms` }} />
            </span>
          </>
        )
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="block rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-200 hover:bg-[#F1F7FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">{body}</Link>
            ) : <div className="py-1.5">{body}</div>}
          </li>
        )
      })}
    </ul>
  )
}

// ─── 1. Rule engine triggers today ───────────────────────────────────
const RULE_LABELS: Record<string, string> = {
  NIP_DOSE_OVERDUE: 'Missed vaccine dose',
  MSP_DOSE_OVERDUE: 'Missed supplement dose',
  MSP_DOSE_DUE: 'Supplement dose due',
  NUTRITION: 'Nutritional risk',
  INV_LOW_STOCK: 'Low stock',
  INV_NEAR_EXPIRY: 'Stock near expiry',
  HEALTH_ACTIVITY: 'Health activity',
}
const humanize = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

type RulesData = { total: number; by_rule: { type: string; program: string; count: number }[] }

export function RuleTriggersWidget({ style }: { style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<RulesData>('rules')
  return (
    <WidgetShell id="rules" title="Rule engine today" note="Alerts the rules created since midnight"
      link={{ href: '/alerts', label: 'View all' }} style={style}
      loading={isLoading} error={error} empty={data?.total === 0 && 'No rules have fired yet today.'}>
      {data && (
        <>
          <p className="text-3xl font-bold leading-none tabular-nums">{data.total.toLocaleString()}</p>
          <p className="mt-1 text-sm text-[#5B6478]">alert{data.total === 1 ? '' : 's'} triggered today</p>
          <div className="mt-4">
            <BarList label="Alerts by rule" color="#087DB9" items={data.by_rule.map((r) => ({
              key: r.type, label: RULE_LABELS[r.type] ?? humanize(r.type), value: r.count,
              href: `/alerts?program=${encodeURIComponent(r.program)}`,
            }))} />
          </div>
        </>
      )}
    </WidgetShell>
  )
}

// ─── 2. FIC progress ─────────────────────────────────────────────────
type FicData = { fully_immunized: number; eligible: number; target: number }

export function FicWidget({ range, style }: { range: Range; style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<FicData>('fic', range)
  const pct = data && data.eligible > 0 ? Math.round((data.fully_immunized / data.eligible) * 100) : 0
  const gap = data ? Math.max(0, data.target - pct) : 0
  // Children still needed to reach the target, so the gap reads as work, not only points.
  const needed = data ? Math.max(0, Math.ceil((data.target / 100) * data.eligible) - data.fully_immunized) : 0
  return (
    <WidgetShell id="fic" title="Fully immunized children" note="Children who turned 1 in this period"
      link={{ href: '/vaccination/defaulters', label: 'Defaulters' }} style={style}
      loading={isLoading} error={error} empty={data?.eligible === 0 && 'No children turned 12 months old in this period.'}>
      {data && (
        <div className="flex flex-wrap items-center gap-5">
          <Donut percentage={pct} label={`FIC rate, target ${data.target}%`} color={gap === 0 ? '#059669' : '#D97706'} size={128} />
          <dl className="min-w-0 flex-1 space-y-3 text-sm">
            <div>
              <dt className="text-[#5B6478]">Fully immunized</dt>
              <dd className="text-xl font-bold tabular-nums">{data.fully_immunized.toLocaleString()} <span className="text-sm font-normal text-[#5B6478]">of {data.eligible.toLocaleString()} children</span></dd>
            </div>
            <div>
              <dt className="text-[#5B6478]">Gap to DOH target</dt>
              <dd className={`font-semibold ${gap === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {gap === 0 ? 'Target reached' : `${gap} points · ${needed.toLocaleString()} more child${needed === 1 ? '' : 'ren'}`}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </WidgetShell>
  )
}

// ─── 3. Barangay ranking / My barangay ───────────────────────────────
type BarangayRow = { id: number; name: string; children: number; overdue: number; at_risk: number }

export function BarangayRankingWidget({ style }: { style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<{ barangays: BarangayRow[] }>('barangays')
  const [by, setBy] = useState<'overdue' | 'at_risk'>('overdue')
  const top = (data?.barangays ?? []).filter((b) => b[by] > 0).sort((a, b) => b[by] - a[by]).slice(0, 5)
  return (
    <WidgetShell id="ranking" title="Barangays at risk" note="Top 5 by children needing follow-up"
      link={{ href: '/geospatial', label: 'Open map' }} style={style}
      loading={isLoading} error={error}>
      <div role="tablist" aria-label="Rank barangays by" className="mb-3 flex gap-1 rounded-lg bg-[#F1F7FA] p-1">
        {([['overdue', 'Overdue vaccines'], ['at_risk', 'Malnourished']] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={by === key} onClick={() => setBy(key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] ${by === key ? 'bg-white text-[#03045E] shadow-sm' : 'text-[#5B6478] hover:text-[#03045E]'}`}>
            {label}
          </button>
        ))}
      </div>
      {top.length === 0 ? (
        <p className="rounded-xl bg-[#F8FCFD] p-4 text-center text-sm text-[#5B6478]">No barangay has {by === 'overdue' ? 'overdue vaccinations' : 'malnourished children'}.</p>
      ) : (
        <BarList label={`Barangays by ${by === 'overdue' ? 'overdue vaccinations' : 'malnourished children'}`}
          color={by === 'overdue' ? '#E11D48' : '#7C3AED'}
          items={top.map((b) => ({ key: String(b.id), label: b.name, value: b[by], hint: `${b.children.toLocaleString()} children` }))} />
      )}
    </WidgetShell>
  )
}

export function MyBarangayWidget({ style }: { style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<{ barangays: BarangayRow[] }>('barangays')
  const list = data?.barangays ?? []
  return (
    <WidgetShell id="my-barangay" title="My barangay" note="Children in your assigned area"
      link={{ href: '/child-profiling/children', label: 'Children' }} style={style}
      loading={isLoading} error={error} empty={data && list.length === 0 && 'No barangay is assigned to you yet.'}>
      <ul className="space-y-3">
        {list.map((b) => (
          <li key={b.id} className="rounded-xl bg-[#F8FCFD] p-3">
            <p className="font-semibold">{b.name}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-[#5B6478]">Children</dt><dd className="text-lg font-bold tabular-nums">{b.children.toLocaleString()}</dd></div>
              <div><dt className="text-[#5B6478]">Overdue</dt><dd className={`text-lg font-bold tabular-nums ${b.overdue ? 'text-rose-700' : ''}`}>{b.overdue.toLocaleString()}</dd></div>
              <div><dt className="text-[#5B6478]">At risk</dt><dd className={`text-lg font-bold tabular-nums ${b.at_risk ? 'text-violet-700' : ''}`}>{b.at_risk.toLocaleString()}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

// ─── 4. Upcoming schedule (next 7 days) ──────────────────────────────
// Reuses the SMS reminder follow-ups (/api/sms/reminders), which already compute
// who is due per program within the viewer's scope.
type Followup = { child_id: number; child_name: string; service_key: string; service_name: string; due_date: string }

const addDaysYMD = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10)
}
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })

export function UpcomingWidget({ programs, style }: { programs: ('VACCINATION' | 'SUPPLEMENTATION')[]; style?: CSSProperties }) {
  const { data, error, isLoading } = useSWR<Followup[]>(programs.length ? ['upcoming', ...programs] : null, async () => {
    const panels = await Promise.all(programs.map((p) => fetcher(`/api/sms/reminders?program=${p}`)))
    return panels.flatMap((p, i) => ((p.rows ?? []) as Followup[]).map((r) => ({ ...r, service_name: `${programs[i] === 'VACCINATION' ? '' : 'Supplement: '}${r.service_name}` })))
  })
  const today = manilaTodayYMD()
  const end = addDaysYMD(today, 7)
  // shortcut: the reminders API returns its first 200 follow-ups (oldest due first); a large overdue backlog can hide upcoming ones.
  const upcoming = (data ?? []).filter((r) => r.due_date >= today && r.due_date <= end).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const children = new Set(upcoming.map((r) => r.child_id)).size
  return (
    <WidgetShell id="upcoming" title="Due in the next 7 days" note={data ? `${children} child${children === 1 ? '' : 'ren'}, ${upcoming.length} dose${upcoming.length === 1 ? '' : 's'}` : 'Vaccination and supplementation'}
      link={{ href: '/vaccination/sms', label: 'Send SMS reminder' }} style={style}
      loading={isLoading} error={error} empty={data && upcoming.length === 0 && 'Nobody is due in the next 7 days.'}>
      <ul className="max-h-72 divide-y divide-[#EEF4F7] overflow-y-auto pr-1">
        {upcoming.slice(0, 30).map((r) => (
          <li key={`${r.child_id}:${r.service_key}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <Link href={`/children/${r.child_id}`} className="min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
              <span className="block truncate font-semibold hover:text-[#087DB9]">{r.child_name}</span>
              <span className="block truncate text-[#5B6478]">{r.service_name}</span>
            </Link>
            <span className="shrink-0 rounded-md bg-[#EAF6FA] px-2 py-0.5 text-xs font-semibold text-[#0077B6]">{shortDate(r.due_date)}</span>
          </li>
        ))}
      </ul>
      {upcoming.length > 30 && <p className="mt-2 text-xs text-[#5B6478]">Showing 30 of {upcoming.length}. Open SMS reminders for the full list.</p>}
    </WidgetShell>
  )
}

// ─── 5. Pending approvals ────────────────────────────────────────────
type ApprovalData = { queues: { vaccinations: number; activities: number; batches: number; replenishment: number } }

export function ApprovalsWidget({ showInventory, style }: { showInventory: boolean; style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<ApprovalData>('approvals')
  const q = data?.queues
  const items = q ? [
    { key: 'vacc', label: 'Vaccination records', value: q.vaccinations, href: '/vaccination/records' },
    { key: 'act', label: 'Health activities', value: q.activities, href: '/health-activities' },
    { key: 'batch', label: 'Vaccine & supplement batches', value: q.batches, href: '/vaccination/batch-requests' },
    ...(showInventory ? [{ key: 'repl', label: 'Stock replenishment', value: q.replenishment, href: '/inventory/replenishment' }] : []),
  ] : []
  const total = items.reduce((n, i) => n + i.value, 0)
  return (
    <WidgetShell id="approvals" title="Waiting for approval" note={q ? `${total} record${total === 1 ? '' : 's'} to review` : 'Records awaiting your review'}
      style={style} loading={isLoading} error={error} empty={q && total === 0 && 'Nothing is waiting for approval.'}>
      <ul className="space-y-1">
        {items.filter((i) => i.value > 0).map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors duration-200 hover:bg-[#F1F7FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
              <span className="min-w-0 truncate font-semibold">{i.label}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-md bg-amber-50 px-2 py-0.5 font-bold tabular-nums text-amber-700">{i.value.toLocaleString()}</span>
                <span className="text-[#087DB9]">Review</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

// ─── 6. Nutrition status breakdown + due for weighing ────────────────
type NutritionData = { counts: Record<'normal' | 'underweight' | 'wasted' | 'stunted' | 'overweight', number>; assessed: number; due_weighing: number; under5: number }
const NUTRITION_SEGMENTS = [
  ['normal', 'Normal', '#059669'],
  ['underweight', 'Underweight', '#D97706'],
  ['wasted', 'Wasted', '#DC2626'],
  ['stunted', 'Stunted', '#7C3AED'],
  ['overweight', 'Overweight', '#0284C7'],
] as const

export function NutritionBreakdownWidget({ style }: { style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<NutritionData>('nutrition')
  const total = data?.assessed ?? 0
  const summary = data ? NUTRITION_SEGMENTS.map(([k, label]) => `${label} ${data.counts[k]}`).join(', ') : ''
  return (
    <WidgetShell id="nutrition" title="Nutrition status" note={`Latest assessment of ${total.toLocaleString()} child${total === 1 ? '' : 'ren'}`}
      link={{ href: '/nutrition', label: 'Records' }} style={style}
      loading={isLoading} error={error} empty={data && total === 0 && 'No assessments recorded yet.'}>
      {data && (
        <>
          <div role="img" aria-label={`Nutrition status: ${summary}`} className="flex h-4 overflow-hidden rounded-full bg-[#EEF4F7]">
            {NUTRITION_SEGMENTS.map(([k, , color], i) => data.counts[k] > 0 && (
              <span key={k} className="grow-x h-full" style={{ width: `${(data.counts[k] / total) * 100}%`, background: color, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {NUTRITION_SEGMENTS.map(([k, label, color]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-[#5B6478]"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</dt>
                <dd className="font-bold tabular-nums">{data.counts[k].toLocaleString()} <span className="font-normal text-[#5B6478]">{Math.round((data.counts[k] / total) * 100)}%</span></dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </WidgetShell>
  )
}

export function WeighingDueWidget({ style }: { style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<NutritionData>('nutrition')
  return (
    <WidgetShell id="weighing" title="Due for weighing" note="Under-5s not weighed in 90 days"
      link={{ href: '/nutrition', label: 'Record weight' }} style={style}
      loading={isLoading} error={error} empty={data && data.under5 === 0 && 'No under-5 children in your area.'}>
      {data && (
        <div>
          <p className="text-3xl font-bold leading-none tabular-nums">{data.due_weighing.toLocaleString()}</p>
          <p className="mt-1 text-sm text-[#5B6478]">of {data.under5.toLocaleString()} children under 5 {data.due_weighing === 0 ? '· all weighed recently' : 'need a new weight'}</p>
          <div aria-hidden className="mt-4 h-2 overflow-hidden rounded-full bg-[#EEF4F7]">
            <span className="grow-x block h-full rounded-full bg-amber-500" style={{ width: `${(data.due_weighing / data.under5) * 100}%` }} />
          </div>
        </div>
      )}
    </WidgetShell>
  )
}

// ─── 7. Expiring batches ─────────────────────────────────────────────
type ExpiringData = { today: string; batches: { id: number; batch_number: string; expiry_date: string; quantity: number; item: string; unit: string; barangay: string | null }[] }

export function ExpiringBatchesWidget({ style }: { style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<ExpiringData>('expiring')
  const list = data?.batches ?? []
  return (
    <WidgetShell id="expiring" title="Expiring batches" note="Stock that expires within 30 days"
      link={{ href: '/inventory/batch-trace', label: 'Batch trace' }} style={style}
      loading={isLoading} error={error} empty={data && list.length === 0 && 'No batches expire in the next 30 days.'}>
      <ul className="max-h-72 divide-y divide-[#EEF4F7] overflow-y-auto pr-1">
        {list.map((b) => {
          const expired = b.expiry_date < (data?.today ?? '')
          return (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.item}</p>
                <p className="truncate text-[#5B6478]">Batch {b.batch_number}{b.barangay ? ` · ${b.barangay}` : ''} · {b.quantity.toLocaleString()} {b.unit}</p>
              </div>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${expired ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                {expired ? 'Expired' : 'Expires'} {shortDate(b.expiry_date)}
              </span>
            </li>
          )
        })}
      </ul>
    </WidgetShell>
  )
}

// ─── 8. Offline sync status ──────────────────────────────────────────
// Reads this device's offline queues (IndexedDB/localStorage); nothing here is on the server yet.
const QUEUE_EVENTS = ['echims-vaccination-queue', 'echims-activity-drafts', 'echims-child-drafts', 'online']

async function loadQueues(user: AuthUser) {
  const scope = offlineScope(user)
  const sources: [string, string, () => Promise<number>][] = [
    ['Vaccinations', '/vaccination/records', async () => (await listQueuedVaccinations(user.id)).length],
    ['Assessments', '/nutrition', async () => (await listQueue(user.id)).length],
    ['Supplement doses', '/supplementation', async () => (await listSupplementDrafts(user.id)).length],
    ['Child registrations', '/child-profiling/children', async () => (await listChildDrafts(user.id, scope)).length],
    ['Health activities', '/health-activities', async () => (await listActivityDrafts(user.id, scope)).length],
    ['Stock usage', '/inventory/usage', async () => getQueuedUsageCount()],
  ]
  // A store this device never opened (or one locked to another session) counts as nothing queued.
  const results = await Promise.allSettled(sources.map(([, , load]) => load()))
  if (results.every((r) => r.status === 'rejected')) throw new Error('Unable to read this device’s offline storage.')
  return sources.map(([label, href], i) => ({ label, href, count: results[i].status === 'fulfilled' ? results[i].value : 0 }))
}

export function OfflineSyncWidget({ user, style }: { user: AuthUser; style?: CSSProperties }) {
  const { data, error, isLoading, mutate } = useSWR(['offline-queues', user.id], () => loadQueues(user))
  useEffect(() => {
    const refresh = () => { void mutate() }
    QUEUE_EVENTS.forEach((e) => window.addEventListener(e, refresh))
    return () => QUEUE_EVENTS.forEach((e) => window.removeEventListener(e, refresh))
  }, [mutate])
  const queued = (data ?? []).filter((q) => q.count > 0)
  const total = queued.reduce((n, q) => n + q.count, 0)
  return (
    <WidgetShell id="offline" title="Offline sync" note="Records saved on this device, not yet sent"
      style={style} loading={isLoading} error={error} empty={data && total === 0 && 'Everything on this device is synced.'}>
      <p className="text-3xl font-bold leading-none tabular-nums text-amber-700">{total.toLocaleString()}</p>
      <p className="mt-1 text-sm text-[#5B6478]">record{total === 1 ? '' : 's'} waiting to sync · reconnect and open each module to send</p>
      <ul className="mt-3 space-y-1">
        {queued.map((q) => (
          <li key={q.label}>
            <Link href={q.href} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-200 hover:bg-[#F1F7FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
              <span className="truncate font-semibold">{q.label}</span>
              <span className="shrink-0 font-bold tabular-nums">{q.count.toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

// ─── 9. Recent masterlist upload ─────────────────────────────────────
type UploadBatch = { batch_id: number; file_name: string; status: string; row_count: number; valid_count: number; error_count: number; duplicate_count: number; imported_count: number; uploaded_at: string }

export function MasterlistWidget({ style }: { style?: CSSProperties }) {
  const { data, error, isLoading } = useSWR<{ batches: UploadBatch[] }>('/api/masterlist/batches?limit=1', fetcher)
  const b = data?.batches[0]
  const done = b && b.imported_count > 0
  const stats = b ? [
    [done ? 'Imported' : 'Valid', done ? b.imported_count : b.valid_count, 'text-emerald-700'],
    ['Errors', b.error_count, b.error_count ? 'text-rose-700' : ''],
    ['Duplicates', b.duplicate_count, b.duplicate_count ? 'text-amber-700' : ''],
  ] as const : []
  return (
    <WidgetShell id="masterlist" title="Latest masterlist upload" note={b ? new Date(b.uploaded_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Most recent import'}
      link={{ href: '/masterlist-upload', label: 'Open imports' }} style={style}
      loading={isLoading} error={error} empty={data && !b && 'No masterlist has been uploaded yet.'}>
      {b && (
        <>
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold" title={b.file_name}>{b.file_name}</span>
            <span className="shrink-0 rounded-md bg-[#EAF6FA] px-2 py-0.5 text-xs font-semibold text-[#0077B6]">{humanize(b.status)}</span>
          </p>
          <p className="mt-0.5 text-sm text-[#5B6478]">{b.row_count.toLocaleString()} rows</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
            {stats.map(([label, value, tone]) => (
              <div key={label}><dt className="text-[#5B6478]">{label}</dt><dd className={`text-lg font-bold tabular-nums ${tone}`}>{value.toLocaleString()}</dd></div>
            ))}
          </dl>
        </>
      )}
    </WidgetShell>
  )
}

// ─── System activity (Admin) ─────────────────────────────────────────
export function SystemActivityWidget({ range, style }: { range: Range; style?: CSSProperties }) {
  const { data, error, isLoading } = useWidget<{ new_accounts: number; pending_users: number }>('system', range)
  return (
    <WidgetShell id="system" title="System activity" note="User accounts in this period"
      link={{ href: '/user-management', label: 'Manage users' }} style={style}
      loading={isLoading} error={error}>
      {data && (
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#F8FCFD] p-3">
            <dt className="text-sm text-[#5B6478]">New accounts</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{data.new_accounts.toLocaleString()}</dd>
          </div>
          <div className="rounded-xl bg-[#F8FCFD] p-3">
            <dt className="text-sm text-[#5B6478]">Pending activation</dt>
            <dd className={`mt-1 text-2xl font-bold tabular-nums ${data.pending_users ? 'text-amber-700' : ''}`}>{data.pending_users.toLocaleString()}</dd>
          </div>
        </dl>
      )}
    </WidgetShell>
  )
}
