'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// RPT-USR001 — Role-scoped dashboard overview.
// Reads live data from /api/dashboard/summary, which handles role scoping
// (BHW/BNS/RHM = assigned barangays; PHN = RHU-wide; Admin = everything).
// One layout for every role; widgets are filtered by the modules the role can open (roleModules).
//
// Layout: greeting, one row of "needs attention" cards, then the monthly chart and
// recent alerts (main column) beside vaccination progress and period counts (side column).
// Each widget gets one pastel accent matching what it is about.

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  AlertCircle, AlertTriangle, Apple, ArrowRight, Baby, Boxes, CalendarClock,
  CheckCircle2, ClipboardCheck, Pill,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { roleModules, type UserRole } from '@/lib/echims-data'
import { RecentAlerts } from './recent-alerts'
import { Donut, TrendBars } from './mini-charts'

type Payload = {
  role: string
  scope: 'ALL' | 'BARANGAYS'
  scope_barangay_ids: number[] | null
  date_range: { from: string; to: string }
  metrics: {
    children: number
    vaccinations_approved: number
    vaccinations_due_soon: number
    vaccinations_overdue: number
    nutrition_assessments: number
    at_risk_children: number
    supplementation_records: number
    low_stock_items: number
    pending_approvals: number
    open_alerts: number
  }
  charts: {
    vaccinations_by_month: { month: string; count: number }[]
    supplementation_by_month: { month: string; count: number }[]
    nutrition_breakdown: { normal: number; at_risk: number; total: number }
  }
}

const fetcher = async (url: string) => {
  const r = await fetch(url); const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Load failed.'); return d
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayYMD = () => ymd(new Date())
const daysAgoYMD = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return ymd(d) }

function greeting(): string {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

const ranges = [
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last year'],
] as const

// Pastel accents, one per subject: rose = overdue, amber = upcoming, peach = nutrition,
// sky = supplies/children, lavender = supplements, mint = vaccines given.
type Tone = 'rose' | 'amber' | 'peach' | 'sky' | 'lavender' | 'mint'
const TONE: Record<Tone, { card: string; chip: string; text: string }> = {
  rose: { card: 'border-rose-100 bg-rose-50/70', chip: 'bg-rose-100 text-rose-700', text: 'text-rose-700' },
  amber: { card: 'border-amber-100 bg-amber-50/70', chip: 'bg-amber-100 text-amber-700', text: 'text-amber-700' },
  peach: { card: 'border-orange-100 bg-orange-50/70', chip: 'bg-orange-100 text-orange-700', text: 'text-orange-700' },
  sky: { card: 'border-sky-100 bg-sky-50/70', chip: 'bg-sky-100 text-sky-700', text: 'text-sky-700' },
  lavender: { card: 'border-violet-100 bg-violet-50/70', chip: 'bg-violet-100 text-violet-700', text: 'text-violet-700' },
  mint: { card: 'border-emerald-100 bg-emerald-50/70', chip: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
}

const rise = 'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out motion-reduce:animate-none'
const card = 'rounded-2xl border border-[#DCEAF0] bg-white'
const segBtn = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#90E0EF]'

type Trend = { key: string; label: string; unit: string; data: { month: string; count: number }[]; color: string }

export function DashboardOverview() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined

  const [days, setDays] = useState<number | null>(90)
  const [from, setFrom] = useState(daysAgoYMD(90))
  const [to, setTo] = useState(todayYMD())
  const [trendKey, setTrendKey] = useState('vacc')
  const url = useMemo(() => `/api/dashboard/summary?from=${from}&to=${to}`, [from, to])

  const { data, error, isLoading } = useSWR<Payload>(isReady && role ? url : null, fetcher, { keepPreviousData: true })

  if (!isReady) return <OverviewSkeleton />
  if (!role) return <div className={`${card} p-10 text-center text-[#5B6478]`}>Dashboard unavailable for this account.</div>

  const modules = roleModules[role] ?? []
  const can = (module: string) => modules.includes(module)
  const firstName = user?.fullName?.trim().split(/\s+/)[0] ?? ''

  const barangayCount = data?.scope_barangay_ids?.length ?? 0
  const scopeLabel = data?.scope === 'ALL' ? 'All RHUs' :
    barangayCount > 0 ? `${barangayCount} assigned barangay${barangayCount === 1 ? '' : 's'}` : 'No barangays assigned'

  const m = data?.metrics
  const atRiskPct = m && m.children > 0 ? Math.round((m.at_risk_children / m.children) * 100) : 0

  const pickRange = (d: number) => { setDays(d); setFrom(daysAgoYMD(d)); setTo(todayYMD()) }

  const attention = m ? [
    can('Vaccination') && { label: 'Overdue vaccinations', value: m.vaccinations_overdue, note: 'Past the due date and not yet given', href: '/vaccination/defaulters', tone: 'rose' as const, icon: <AlertTriangle size={20} /> },
    can('Vaccination') && { label: 'Due in the next 14 days', value: m.vaccinations_due_soon, note: 'Remind guardians before the date', href: '/vaccination/schedule', tone: 'amber' as const, icon: <CalendarClock size={20} /> },
    can('Nutritional Assessment') && { label: 'At nutritional risk', value: m.at_risk_children, note: m.children > 0 ? `${atRiskPct}% of registered children` : 'Based on latest assessments', href: '/nutrition', tone: 'peach' as const, icon: <Apple size={20} /> },
    can('Inventory') && { label: 'Running low on stock', value: m.low_stock_items, note: 'Items with 10 or fewer left', href: '/inventory/stock-overview', tone: 'sky' as const, icon: <Boxes size={20} /> },
  ].filter(Boolean) as AttentionItem[] : []

  const trends = (data ? [
    can('Vaccination') && { key: 'vacc', label: 'Vaccinations', unit: 'vaccinations given', data: data.charts.vaccinations_by_month, color: '#5AAFDB' },
    can('Supplementation') && { key: 'supp', label: 'Supplements', unit: 'supplement doses given', data: data.charts.supplementation_by_month, color: '#A78BFA' },
  ] : []).filter(Boolean) as Trend[]
  const trend = trends.find((t) => t.key === trendKey) ?? trends[0]
  const trendTotal = trend ? trend.data.reduce((s, d) => s + d.count, 0) : 0

  const counts = m ? ([
    { label: 'Registered children', value: m.children, tone: 'sky', icon: <Baby size={16} /> },
    can('Nutritional Assessment') && { label: 'Nutrition assessments', value: m.nutrition_assessments, tone: 'peach', icon: <Apple size={16} /> },
    can('Supplementation') && { label: 'Supplement doses', value: m.supplementation_records, tone: 'lavender', icon: <Pill size={16} /> },
    { label: 'Waiting for approval', value: m.pending_approvals, tone: 'amber', icon: <ClipboardCheck size={16} /> },
    { label: 'Open alerts', value: m.open_alerts, tone: 'rose', icon: <AlertCircle size={16} /> },
  ].filter(Boolean) as { label: string; value: number; tone: Tone; icon: ReactNode }[]) : []

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Greeting */}
      <header className={`relative isolate overflow-hidden rounded-2xl bg-[#03045E] px-5 py-5 text-white sm:px-7 sm:py-6`}>
        <div aria-hidden className="absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(8,125,185,0.65),transparent)]" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#90E0EF]">{greeting()}</p>
            <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md bg-white/10 px-2.5 py-1 font-semibold">{role}</span>
              <span className="rounded-md bg-white/10 px-2.5 py-1 text-[#CAF0F8]">{data ? scopeLabel : 'Loading your area…'}</span>
            </div>
          </div>

          {/* Date range: presets, or custom dates on request */}
          <div className="flex flex-col gap-2 lg:items-end">
            <div role="group" aria-label="Date range" className="flex flex-wrap gap-1 rounded-xl bg-white/10 p-1">
              {ranges.map(([d, label]) => (
                <button key={d} type="button" onClick={() => pickRange(d)} aria-pressed={days === d}
                  className={`${segBtn} ${days === d ? 'bg-white text-[#03045E]' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setDays(null)} aria-pressed={days === null}
                className={`${segBtn} ${days === null ? 'bg-white text-[#03045E]' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
                Custom
              </button>
            </div>
            {days === null && (
              <div className="flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                <label className="sr-only" htmlFor="range-from">From</label>
                <input id="range-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white outline-none [color-scheme:dark] focus:border-[#90E0EF]" />
                <span className="text-white/60">to</span>
                <label className="sr-only" htmlFor="range-to">To</label>
                <input id="range-to" type="date" value={to} min={from} max={todayYMD()} onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white outline-none [color-scheme:dark] focus:border-[#90E0EF]" />
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 shrink-0" size={16} /> {error.message}
        </div>
      )}

      {isLoading && !m ? (
        <OverviewSkeleton bare />
      ) : m && (
        // Fade the whole body in once, rather than each widget on its own.
        <div className={`space-y-5 lg:space-y-6 ${rise}`} style={{ animationDelay: '80ms' }}>
          {/* Needs attention: each card opens the list behind its number */}
          {attention.length > 0 && (
            <section aria-labelledby="attention-heading">
              <h2 id="attention-heading" className="mb-3 text-base font-bold">Needs your attention</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
                {attention.map((item) => <AttentionCard key={item.label} item={item} />)}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:gap-6">
            {/* Main column */}
            <div className="space-y-5 xl:col-span-2 xl:space-y-6">
              {trend && (
                <section aria-labelledby="trend-heading" className={`${card} p-5 sm:p-6`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 id="trend-heading" className="text-lg font-bold">Monthly activity</h2>
                      <p className="text-sm text-[#5B6478]">
                        <span className="font-semibold text-[#03045E]">{trendTotal.toLocaleString()}</span> {trend.unit} in this period
                      </p>
                    </div>
                    {trends.length > 1 && (
                      <div role="tablist" aria-label="Chart" className="flex gap-1 rounded-lg bg-[#F1F7FA] p-1">
                        {trends.map((t) => (
                          <button key={t.key} type="button" role="tab" aria-selected={trend.key === t.key} onClick={() => setTrendKey(t.key)}
                            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] ${
                              trend.key === t.key ? 'bg-white text-[#03045E] shadow-sm' : 'text-[#5B6478] hover:text-[#03045E]'
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div key={trend.key} className="mt-6">
                    <TrendBars data={trend.data} color={trend.color} label={trend.label} />
                  </div>
                </section>
              )}

              <RecentAlerts />
            </div>

            {/* Side column */}
            <div className="space-y-5 xl:space-y-6">
              {can('Vaccination') && <VaccineProgress given={m.vaccinations_approved} overdue={m.vaccinations_overdue} upcoming={m.vaccinations_due_soon} />}

              <section aria-labelledby="counts-heading" className={`${card} p-5 sm:p-6`}>
                <h2 id="counts-heading" className="text-lg font-bold">In this period</h2>
                <ul className="mt-3 divide-y divide-[#EEF4F7]">
                  {counts.map((c) => (
                    <li key={c.label} className="flex items-center gap-3 py-2.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE[c.tone].chip}`}>{c.icon}</span>
                      <span className="flex-1 text-sm text-[#2D3A55]">{c.label}</span>
                      <span className="text-base font-bold tabular-nums">{c.value.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────
type AttentionItem = { label: string; value: number; note: string; href: string; tone: Tone; icon: ReactNode }

function AttentionCard({ item }: { item: AttentionItem }) {
  const clear = item.value === 0
  const t = TONE[clear ? 'mint' : item.tone]
  return (
    <Link href={item.href}
      className={`group flex flex-col rounded-2xl border p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(3,4,94,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] motion-reduce:hover:translate-y-0 sm:p-5 ${t.card}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.chip}`}>
          {clear ? <CheckCircle2 size={20} /> : item.icon}
        </span>
        <p className="min-w-0 text-sm font-semibold leading-snug text-[#2D3A55]">{item.label}</p>
      </div>
      <p className="mt-4 text-3xl font-bold leading-none tabular-nums">{item.value.toLocaleString()}</p>
      <p className="mt-1.5 text-sm text-[#5B6478]">{clear ? 'All clear for now' : item.note}</p>
      <span className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${t.text}`}>
        View list <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

// Doses due in the period: how many were given, are overdue, or are still coming up.
function VaccineProgress({ given, overdue, upcoming }: { given: number; overdue: number; upcoming: number }) {
  const total = given + overdue + upcoming
  const pct = total > 0 ? Math.round((given / total) * 100) : 0
  const rows = [
    { label: 'Given', value: given, dot: 'bg-emerald-500' },
    { label: 'Overdue', value: overdue, dot: 'bg-rose-400' },
    { label: 'Coming up', value: upcoming, dot: 'bg-amber-400' },
  ]
  return (
    <section aria-labelledby="vacc-heading" className={`rounded-2xl border p-5 sm:p-6 ${TONE.mint.card}`}>
      <h2 id="vacc-heading" className="text-lg font-bold">Vaccination progress</h2>
      <p className="text-sm text-[#5B6478]">
        {total > 0 ? `${given.toLocaleString()} of ${total.toLocaleString()} doses in this period have been given` : 'No doses due in this period'}
      </p>
      <div className="mt-4 flex items-center gap-5">
        <Donut percentage={pct} label="" color="#10B981" size={116} />
        <ul className="flex-1 space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
              <span className="flex-1 text-[#2D3A55]">{r.label}</span>
              <span className="font-bold tabular-nums">{r.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function OverviewSkeleton({ bare = false }: { bare?: boolean }) {
  const block = 'animate-pulse rounded-2xl border border-[#DCEAF0] bg-white/70'
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-5 lg:space-y-6">
      {!bare && <div className="h-32 animate-pulse rounded-2xl bg-[#03045E]/90" />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`h-40 ${block}`} />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:gap-6">
        <div className={`h-96 xl:col-span-2 ${block}`} />
        <div className={`h-96 ${block}`} />
      </div>
    </div>
  )
}
