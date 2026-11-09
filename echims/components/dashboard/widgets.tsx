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
// Every widget has a fixed height for its size, so loading, empty, tab switches and
// long lists never resize the cards beside it; long lists scroll or cap at 5 rows.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertCircle, AlertTriangle, ArrowUpRight, BellOff, Info } from 'lucide-react'
import { manilaTodayYMD } from '@/lib/nip-schedule'
import { alertDestination } from '@/lib/alerts/alert-destination'
import { Donut } from './mini-charts'

// Whole entrance under ~500ms: 35ms steps capped at 6 (210ms) + a 300ms rise.
export const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 6) * 35}ms` })
export const rise = 'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:slide-in-from-bottom-0 motion-reduce:duration-150'
export const card = 'rounded-2xl border border-brand-line bg-white'
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky'

// Fixed card heights. Cards placed side by side always share one size.
export const SIZE = { compact: 'h-[260px]', tall: 'h-[380px]' } as const
export type Size = keyof typeof SIZE
const SHOWN = 5

export const fetcher = async (url: string) => {
  const r = await fetch(url); const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Load failed.'); return d
}

export type Range = { from: string; to: string }
type WidgetProps = { style?: CSSProperties; size?: Size }

// isLoading is the first load only. A new range keeps the previous numbers on screen
// (refreshing) so the card dims instead of emptying.
function useWidget<T>(name: string, range?: Range) {
  const qs = new URLSearchParams({ widget: name, ...(range ?? {}) })
  const { data, error, isLoading } = useSWR<T>(`/api/dashboard/widgets?${qs}`, fetcher, { keepPreviousData: true })
  return { data, error, isLoading: isLoading && !data, refreshing: isLoading && !!data }
}


const humanize = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

// One thin arrow per card: muted at rest, tinted and nudged 2px on hover/focus.
export function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={`group inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-brand-muted transition-colors duration-200 hover:text-brand-sky ${focusRing}`}>
      {label}
      <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-focus-visible:-translate-y-0.5 group-focus-visible:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  )
}

type ShellProps = WidgetProps & {
  id: string
  title: string
  note: ReactNode
  link?: { href: string; label: string }
  action?: ReactNode
  className?: string
  loading: boolean
  /** New data on its way for content already shown: dims the body instead of replacing it. */
  refreshing?: boolean
  error?: Error
  empty?: string | false
  children?: ReactNode
}

// Card frame with the three states every widget needs: loading, error, empty.
export function WidgetShell({ id, title, note, link, action, style, size, className = '', loading, refreshing = false, error, empty, children }: ShellProps) {
  return (
    <section aria-labelledby={`${id}-heading`} aria-busy={loading || refreshing}
      className={`${card} flex min-w-0 flex-col p-5 sm:p-6 ${size ? SIZE[size] : ''} ${rise} ${className}`} style={style}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2 id={`${id}-heading`} className="line-clamp-2 text-base font-semibold leading-snug">{title}</h2>
          <p className="line-clamp-2 text-sm text-brand-muted">{note}</p>
        </div>
        {link ? <CardLink {...link} /> : action}
      </div>
      {/* The card itself carries the entrance animation (opacity held at 1), so dimming goes on this inner box. */}
      <div className={`scroll-subtle mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto transition-opacity duration-200 ${refreshing ? 'opacity-50' : ''}`}>
        {loading ? (
          // Only reached when a card has no data after the page is showing; first loads stay behind the page loader.
          <div role="status" aria-label={`Loading ${title}`} className="space-y-2.5">
            {Array.from({ length: size === 'tall' ? 5 : 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-brand-ice motion-reduce:animate-none" />)}
          </div>
        ) : error ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error.message}
          </p>
        ) : empty ? (
          <p className="flex flex-1 items-center justify-center rounded-xl bg-brand-ice/60 p-4 text-center text-sm text-brand-muted">{empty}</p>
        ) : children}
      </div>
    </section>
  )
}

// Horizontal bars for a short ranked list; each row can link to its detail.
export function BarList({ items, color, label }: { items: { key: string; label: string; value: number; href?: string; hint?: string }[]; color: string; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul aria-label={label} className="space-y-1">
      {items.map((item, i) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold">{item.label}{item.hint && <span className="font-normal text-brand-muted"> · {item.hint}</span>}</span>
              <span className="shrink-0 font-semibold tabular-nums">{item.value.toLocaleString()}</span>
            </span>
            <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-brand-ice">
              <span className="grow-x block h-full rounded-full opacity-70" style={{ width: `${Math.max(3, (item.value / max) * 100)}%`, background: color, animationDelay: `${i * 50}ms` }} />
            </span>
          </>
        )
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={`-mx-2 block rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-brand-ice ${focusRing}`}>{body}</Link>
            ) : <div className="py-1.5">{body}</div>}
          </li>
        )
      })}
    </ul>
  )
}

const addDaysYMD = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10)
}
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })
const more = (total: number) => total > SHOWN && <p className="mt-auto pt-2 text-xs text-brand-muted">Showing {SHOWN} of {total.toLocaleString()}</p>

// ─── FIC progress ────────────────────────────────────────────────────
type FicData = { fully_immunized: number; eligible: number; target: number }

export function FicWidget({ range, style, size = 'tall' }: WidgetProps & { range: Range }) {
  const { data, error, isLoading, refreshing } = useWidget<FicData>('fic', range)
  const pct = data && data.eligible > 0 ? Math.round((data.fully_immunized / data.eligible) * 100) : 0
  const gap = data ? Math.max(0, data.target - pct) : 0
  // Children still needed to reach the target, so the gap reads as work, not only points.
  const needed = data ? Math.max(0, Math.ceil((data.target / 100) * data.eligible) - data.fully_immunized) : 0
  return (
    <WidgetShell id="fic" title="Fully immunized (FIC)" note="Turned 1 in this period"
      link={{ href: '/vaccination/defaulters', label: 'Defaulters' }} style={style} size={size}
      loading={isLoading} refreshing={refreshing} error={error} empty={data?.eligible === 0 && 'No children turned 12 months old in this period.'}>
      {data && (
        <div className="flex flex-1 flex-wrap items-center justify-center gap-6">
          <Donut percentage={pct} label={`FIC rate, target ${data.target}%`} color={gap === 0 ? 'var(--tone-good)' : 'var(--brand-sky)'} size={136} />
          <dl className="min-w-40 flex-1 space-y-3 text-sm">
            <div>
              <dt className="text-brand-muted">Fully immunized</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{data.fully_immunized.toLocaleString()} <span className="font-sans text-sm font-normal text-brand-muted">of {data.eligible.toLocaleString()}</span></dd>
            </div>
            <div>
              <dt className="text-brand-muted">Gap to DOH target</dt>
              <dd className={`font-semibold ${gap === 0 ? 'text-good' : 'text-warn'}`}>
                {gap === 0 ? 'Target reached' : `${gap} points · ${needed.toLocaleString()} more child${needed === 1 ? '' : 'ren'}`}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </WidgetShell>
  )
}

// ─── Barangay ranking / My barangay ──────────────────────────────────
type BarangayRow = { id: number; name: string; children: number; overdue: number; at_risk: number }

export function BarangayRankingWidget({ style, size = 'tall' }: WidgetProps) {
  const { data, error, isLoading } = useWidget<{ barangays: BarangayRow[] }>('barangays')
  const [by, setBy] = useState<'overdue' | 'at_risk'>('overdue')
  const top = (data?.barangays ?? []).filter((b) => b[by] > 0).sort((a, b) => b[by] - a[by]).slice(0, SHOWN)
  const what = by === 'overdue' ? 'overdue vaccinations' : 'malnourished children'
  return (
    <WidgetShell id="ranking" title="Barangays at risk" note="Top 5 by children needing follow-up"
      link={{ href: '/geospatial', label: 'Map' }} style={style} size={size}
      loading={isLoading} error={error}>
      <div role="tablist" aria-label="Rank barangays by" className="mb-3 flex shrink-0 gap-1 rounded-lg bg-brand-ice p-1">
        {([['overdue', 'Overdue vaccines'], ['at_risk', 'Malnourished']] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={by === key} onClick={() => setBy(key)}
            className={`flex-1 rounded-md leading-tight px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${focusRing} ${by === key ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-muted hover:text-brand-navy'}`}>
            {label}
          </button>
        ))}
      </div>
      {top.length === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-xl bg-brand-ice/60 p-4 text-center text-sm text-brand-muted">No barangay has {what}.</p>
      ) : (
        <BarList label={`Barangays by ${what}`} color={by === 'overdue' ? 'var(--tone-danger)' : 'var(--tone-nutrition)'}
          items={top.map((b) => ({ key: String(b.id), label: b.name, value: b[by], hint: `${b.children.toLocaleString()} children` }))} />
      )}
    </WidgetShell>
  )
}

export function MyBarangayWidget({ style, size = 'tall' }: WidgetProps) {
  const { data, error, isLoading } = useWidget<{ barangays: BarangayRow[] }>('barangays')
  const list = data?.barangays ?? []
  return (
    <WidgetShell id="my-barangay" title="My barangay" note="Children in your assigned area"
      link={{ href: '/child-profiling/children', label: 'Children' }} style={style} size={size}
      loading={isLoading} error={error} empty={data && list.length === 0 && 'No barangay is assigned to you yet.'}>
      <ul className="space-y-3">
        {list.map((b) => (
          <li key={b.id} className="rounded-xl bg-brand-ice/60 p-3">
            <p className="truncate font-semibold">{b.name}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-brand-muted">Children</dt><dd className="text-xl font-semibold tabular-nums">{b.children.toLocaleString()}</dd></div>
              <div><dt className="text-brand-muted">Overdue</dt><dd className={`text-xl font-semibold tabular-nums ${b.overdue ? 'text-danger' : ''}`}>{b.overdue.toLocaleString()}</dd></div>
              <div><dt className="text-brand-muted">At risk</dt><dd className={`text-xl font-semibold tabular-nums ${b.at_risk ? 'text-nutrition' : ''}`}>{b.at_risk.toLocaleString()}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

// ─── Upcoming schedule (next 7 days) ─────────────────────────────────
// Reuses the SMS reminder follow-ups (/api/sms/reminders), which already compute
// who is due per program within the viewer's scope.
type Followup = { child_id: number; child_name: string; service_key: string; service_name: string; due_date: string }

export function UpcomingWidget({ programs, style, size = 'tall' }: WidgetProps & { programs: ('VACCINATION' | 'SUPPLEMENTATION')[] }) {
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
      link={{ href: '/vaccination/sms', label: 'Send SMS reminder' }} style={style} size={size}
      loading={isLoading} error={error} empty={data && upcoming.length === 0 && 'Nobody is due in the next 7 days.'}>
      <ul className="divide-y divide-brand-ice">
        {upcoming.slice(0, SHOWN).map((r) => (
          <li key={`${r.child_id}:${r.service_key}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <Link href={`/children/${r.child_id}`} className={`min-w-0 rounded ${focusRing}`}>
              <span className="block truncate font-semibold hover:text-brand-sky">{r.child_name}</span>
              <span className="block truncate text-brand-muted">{r.service_name}</span>
            </Link>
            <span className="shrink-0 rounded-md bg-brand-ice px-2 py-0.5 text-xs font-semibold text-brand-blue">{shortDate(r.due_date)}</span>
          </li>
        ))}
      </ul>
      {more(upcoming.length)}
    </WidgetShell>
  )
}

// ─── Pending approvals ───────────────────────────────────────────────
type ApprovalData = { queues: { vaccinations: number; activities: number; batches: number; replenishment: number } }

export function ApprovalsWidget({ showInventory, style, size = 'compact' }: WidgetProps & { showInventory: boolean }) {
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
      style={style} size={size} loading={isLoading} error={error} empty={q && total === 0 && 'Nothing is waiting for approval.'}>
      <ul className="space-y-0.5">
        {items.filter((i) => i.value > 0).map((i) => (
          <li key={i.key}>
            <Link href={i.href} aria-label={`Review ${i.value} ${i.label}`} className={`-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors duration-200 hover:bg-brand-ice ${focusRing}`}>
              <span className="min-w-0 font-medium leading-snug">{i.label}</span>
              <span className="shrink-0 rounded-md bg-warn-soft px-2 py-0.5 font-semibold tabular-nums text-warn">{i.value.toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}

// ─── Nutrition status breakdown + due for weighing ───────────────────
type NutritionData = { counts: Record<'normal' | 'underweight' | 'wasted' | 'stunted' | 'overweight', number>; assessed: number; due_weighing: number; under5: number }
const NUTRITION_SEGMENTS = [
  ['normal', 'Normal', 'var(--tone-good)'],
  ['underweight', 'Underweight', 'var(--tone-warn)'],
  ['wasted', 'Wasted', 'var(--tone-danger)'],
  ['stunted', 'Stunted', 'var(--tone-nutrition)'],
  ['overweight', 'Overweight', 'var(--brand-blue)'],
] as const

export function NutritionBreakdownWidget({ style, size = 'compact' }: WidgetProps) {
  const { data, error, isLoading } = useWidget<NutritionData>('nutrition')
  const total = data?.assessed ?? 0
  const summary = data ? NUTRITION_SEGMENTS.map(([k, label]) => `${label} ${data.counts[k]}`).join(', ') : ''
  return (
    <WidgetShell id="nutrition" title="Nutrition status" note={`Latest assessment of ${total.toLocaleString()} child${total === 1 ? '' : 'ren'}`}
      link={{ href: '/nutrition', label: 'Records' }} style={style} size={size}
      loading={isLoading} error={error} empty={data && total === 0 && 'No assessments recorded yet.'}>
      {data && (
        <>
          <div role="img" aria-label={`Nutrition status: ${summary}`} className="flex h-3 shrink-0 gap-0.5 overflow-hidden rounded-full bg-brand-ice">
            {NUTRITION_SEGMENTS.map(([k, , color], i) => data.counts[k] > 0 && (
              <span key={k} className="grow-x h-full" style={{ width: `${(data.counts[k] / total) * 100}%`, background: color, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3">
            {NUTRITION_SEGMENTS.map(([k, label, color]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="flex min-w-0 items-center gap-1.5 truncate text-brand-muted"><span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />{label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">{data.counts[k].toLocaleString()} <span className="font-normal text-brand-muted">{Math.round((data.counts[k] / total) * 100)}%</span></dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </WidgetShell>
  )
}

export function WeighingDueWidget({ style, size = 'compact' }: WidgetProps) {
  const { data, error, isLoading } = useWidget<NutritionData>('nutrition')
  return (
    <WidgetShell id="weighing" title="Due for weighing" note="Under-5s not weighed in 90 days"
      link={{ href: '/nutrition', label: 'Record' }} style={style} size={size}
      loading={isLoading} error={error} empty={data && data.under5 === 0 && 'No under-5 children in your area.'}>
      {data && (
        <div className="flex flex-1 flex-col justify-center">
          <p className={`font-display text-4xl font-bold leading-none tabular-nums ${data.due_weighing ? 'text-warn' : ''}`}>{data.due_weighing.toLocaleString()}</p>
          <p className="mt-2 text-sm text-brand-muted">of {data.under5.toLocaleString()} children under 5 {data.due_weighing === 0 ? '· all weighed recently' : 'need a new weight'}</p>
          <div aria-hidden className="mt-4 h-1 overflow-hidden rounded-full bg-brand-ice">
            <span className="grow-x block h-full rounded-full bg-warn/70" style={{ width: `${(data.due_weighing / data.under5) * 100}%` }} />
          </div>
        </div>
      )}
    </WidgetShell>
  )
}

// ─── Expiring batches ────────────────────────────────────────────────
type ExpiringData = { today: string; batches: { id: number; batch_number: string; expiry_date: string; quantity: number; item: string; unit: string; barangay: string | null }[] }

export function ExpiringBatchesWidget({ style, size = 'tall' }: WidgetProps) {
  const { data, error, isLoading } = useWidget<ExpiringData>('expiring')
  const list = data?.batches ?? []
  return (
    <WidgetShell id="expiring" title="Expiring batches" note="Stock that expires within 30 days"
      link={{ href: '/inventory/batch-trace', label: 'Batch trace' }} style={style} size={size}
      loading={isLoading} error={error} empty={data && list.length === 0 && 'No batches expire in the next 30 days.'}>
      <ul className="divide-y divide-brand-ice">
        {list.slice(0, SHOWN).map((b) => {
          const expired = b.expiry_date < (data?.today ?? '')
          return (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.item}</p>
                <p className="truncate text-brand-muted">Batch {b.batch_number}{b.barangay ? ` · ${b.barangay}` : ''} · {b.quantity.toLocaleString()} {b.unit}</p>
              </div>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${expired ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'}`}>
                {expired ? 'Expired' : 'Expires'} {shortDate(b.expiry_date)}
              </span>
            </li>
          )
        })}
      </ul>
      {more(list.length)}
    </WidgetShell>
  )
}

// ─── Offline sync status ─────────────────────────────────────────────
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

export function OfflineSyncWidget({ user, style, size = 'compact' }: WidgetProps & { user: AuthUser }) {
  const { data, error, isLoading, mutate } = useSWR(['offline-queues', user.id], () => loadQueues(user))
  useEffect(() => {
    const refresh = () => { void mutate() }
    QUEUE_EVENTS.forEach((e) => window.addEventListener(e, refresh))
    return () => QUEUE_EVENTS.forEach((e) => window.removeEventListener(e, refresh))
  }, [mutate])
  const queued = (data ?? []).filter((q) => q.count > 0)
  const total = queued.reduce((n, q) => n + q.count, 0)
  return (
    <WidgetShell id="offline" title="Offline sync" note={data && total > 0 ? `${total} record${total === 1 ? '' : 's'} waiting to sync` : 'Records saved on this device'}
      style={style} size={size} loading={isLoading} error={error} empty={data && total === 0 && 'Everything on this device is synced.'}>
      <ul className="space-y-0.5">
        {queued.map((q) => (
          <li key={q.label}>
            <Link href={q.href} className={`-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-200 hover:bg-brand-ice ${focusRing}`}>
              <span className="truncate font-medium">{q.label}</span>
              <span className="shrink-0 rounded-md bg-warn-soft px-2 py-0.5 font-semibold tabular-nums text-warn">{q.count.toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-2 text-xs text-brand-muted">Reconnect and open each module to send.</p>
    </WidgetShell>
  )
}

// ─── Latest masterlist upload ────────────────────────────────────────
type UploadBatch = { batch_id: number; file_name: string; status: string; row_count: number; valid_count: number; error_count: number; duplicate_count: number; imported_count: number; uploaded_at: string }

export function MasterlistWidget({ style, size = 'compact' }: WidgetProps) {
  const { data, error, isLoading } = useSWR<{ batches: UploadBatch[] }>('/api/masterlist/batches?limit=1', fetcher)
  const b = data?.batches[0]
  const done = b && b.imported_count > 0
  const stats = b ? [
    [done ? 'Imported' : 'Valid', done ? b.imported_count : b.valid_count, 'text-good'],
    ['Errors', b.error_count, b.error_count ? 'text-danger' : ''],
    ['Duplicates', b.duplicate_count, b.duplicate_count ? 'text-warn' : ''],
  ] as const : []
  return (
    <WidgetShell id="masterlist" title="Latest masterlist upload" note={b ? new Date(b.uploaded_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Most recent import'}
      link={{ href: '/masterlist-upload', label: 'Imports' }} style={style} size={size}
      loading={isLoading} error={error} empty={data && !b && 'No masterlist has been uploaded yet.'}>
      {b && (
        <>
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold" title={b.file_name}>{b.file_name}</span>
            <span className="shrink-0 rounded-md bg-brand-ice px-2 py-0.5 text-xs font-semibold text-brand-blue">{humanize(b.status)}</span>
          </p>
          <p className="mt-0.5 text-sm text-brand-muted">{b.row_count.toLocaleString()} rows</p>
          <dl className="mt-auto grid grid-cols-3 gap-2 text-sm">
            {stats.map(([label, value, tone]) => (
              <div key={label}><dt className="text-brand-muted">{label}</dt><dd className={`font-display text-2xl font-bold tabular-nums ${tone}`}>{value.toLocaleString()}</dd></div>
            ))}
          </dl>
        </>
      )}
    </WidgetShell>
  )
}

// ─── System activity (Admin) ─────────────────────────────────────────
export function SystemActivityWidget({ range, style, size = 'compact' }: WidgetProps & { range: Range }) {
  const { data, error, isLoading, refreshing } = useWidget<{ new_accounts: number; pending_users: number }>('system', range)
  return (
    <WidgetShell id="system" title="System activity" note="User accounts in this period"
      link={{ href: '/user-management', label: 'Users' }} style={style} size={size}
      loading={isLoading} refreshing={refreshing} error={error}>
      {data && (
        <dl className="grid flex-1 grid-cols-2 content-center gap-3">
          <div className="rounded-xl bg-brand-ice/60 p-3">
            <dt className="text-sm text-brand-muted">New accounts</dt>
            <dd className="mt-1 font-display text-3xl font-bold tabular-nums">{data.new_accounts.toLocaleString()}</dd>
          </div>
          <div className="rounded-xl bg-brand-ice/60 p-3">
            <dt className="text-sm text-brand-muted">Pending activation</dt>
            <dd className={`mt-1 font-display text-3xl font-bold tabular-nums ${data.pending_users ? 'text-warn' : ''}`}>{data.pending_users.toLocaleString()}</dd>
          </div>
        </dl>
      )}
    </WidgetShell>
  )
}

// ─── Recent alerts ───────────────────────────────────────────────────
// Same recipient-scoped feed as the top-bar bell.
type Notification = { alert_id: number; alert_type: string; alert_message: string; severity: string; status: string; created_at: string; source_module: string | null; child_id: number | null; schedule_id: number | null }

function timeAgo(value: string) {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

function severityTone(severity: string) {
  if (severity === 'CRITICAL' || severity === 'HIGH') return { icon: <AlertTriangle size={15} />, cls: 'bg-danger-soft text-danger' }
  if (severity === 'MEDIUM') return { icon: <AlertCircle size={15} />, cls: 'bg-warn-soft text-warn' }
  return { icon: <Info size={15} />, cls: 'bg-brand-ice text-brand-blue' }
}

export function RecentAlertsWidget({ style, size = 'tall' }: WidgetProps) {
  const { data, error, isLoading } = useSWR<{ notifications: Notification[] }>('/api/notifications', fetcher, { refreshInterval: 60_000 })
  const open = (data?.notifications ?? []).filter((n) => n.status !== 'RESOLVED')
  return (
    <WidgetShell id="recent-alerts" title="Recent alerts" note={data ? `${open.length} open` : 'Rule engine and system alerts'}
      link={{ href: '/alerts', label: 'View all' }} style={style} size={size}
      loading={isLoading} error={error} empty={data && open.length === 0 && 'No open alerts. New ones appear here.'}>
      <ul className="divide-y divide-brand-ice">
        {open.slice(0, SHOWN).map((n) => {
          const t = severityTone(n.severity)
          return (
            <li key={n.alert_id}>
              <Link href={alertDestination(n).primaryHref ?? "/alerts"} className={`-mx-2 flex gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-brand-ice ${focusRing}`}>
                <span aria-hidden className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.cls}`}>{t.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold">
                      {n.status === 'UNREAD' && <span aria-label="Unread" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-sky align-middle" />}
                      {humanize(n.alert_type)}
                    </span>
                    <span className="shrink-0 text-xs text-brand-muted">{timeAgo(n.created_at)}</span>
                  </span>
                  <span className="block truncate text-sm text-brand-muted">{n.alert_message}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {more(open.length)}
    </WidgetShell>
  )
}

// ─── Quick actions ───────────────────────────────────────────────────
export type QuickAction = { label: string; href: string; icon: ReactNode }

export function QuickActionsWidget({ actions, style }: WidgetProps & { actions: QuickAction[] }) {
  return (
    <WidgetShell id="quick-actions" title="Quick actions" note="Jump to your most-used pages" style={style} loading={false}>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {actions.map((a) => (
          <li key={a.href}>
            <Link href={a.href} className={`flex h-full items-center gap-2.5 rounded-xl border border-brand-line px-3 py-2.5 text-sm font-medium transition-colors duration-200 hover:border-brand-aqua hover:bg-brand-ice ${focusRing}`}>
              <span aria-hidden className="shrink-0 text-brand-sky">{a.icon}</span>
              <span className="min-w-0 leading-snug">{a.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}
