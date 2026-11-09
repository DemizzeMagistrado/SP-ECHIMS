'use client'

// RPT-USR001 — Role-scoped dashboard overview.
// Reads live data from /api/dashboard/summary, which handles role scoping
// (BHW/BNS/RHM = assigned barangays; PHN = RHU-wide; Admin = everything).
// Every card is gated by the modules the role can open (roleModules / canPerform).
//
// Layout, top to bottom:
//   1. Greeting + date range
//   2. Needs attention: equal-height KPI cards
//   3. Main column (wide) beside a side column (narrow) of compact/status cards.
// Each role has its own arrangement (layoutFor) so its page stays balanced. Cards that
// sit side by side share one fixed height and columns align to the top, so a tab
// switch, a loading state or a long list never resizes a neighbouring card.

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  AlertCircle, AlertTriangle, Apple, ArrowUpRight, Baby, Bell, Boxes, CalendarClock,
  ClipboardCheck, FileText, Pill, Syringe, Users,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, roleModules, type UserRole } from '@/lib/echims-data'
import { Donut, TrendBars } from './mini-charts'
import {
  card, fetcher, focusRing, rise, stagger, SIZE,
  ApprovalsWidget, BarangayRankingWidget, ExpiringBatchesWidget, FicWidget, MasterlistWidget,
  MyBarangayWidget, NutritionBreakdownWidget, OfflineSyncWidget, QuickActionsWidget, RecentAlertsWidget,
  SystemActivityWidget, UpcomingWidget, WeighingDueWidget, type QuickAction,
} from './widgets'

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
type Metrics = Payload['metrics']

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoYMD(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

const ranges = [
  [30, '30 days'],
  [90, '90 days'],
  [365, '1 year'],
] as const

const segBtn = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-aqua'

// Quick actions per role, most-used first; anything the role cannot open is dropped.
const quickActions: Record<UserRole, (QuickAction & { module: string })[]> = {
  Administrator: [
    { label: 'Review accounts', href: '/user-management', module: 'User Management', icon: <Users size={17} strokeWidth={1.75} /> },
    { label: 'Children', href: '/child-profiling/children', module: 'Child Profiling', icon: <Baby size={17} strokeWidth={1.75} /> },
    { label: 'Stock overview', href: '/inventory/stock-overview', module: 'Inventory', icon: <Boxes size={17} strokeWidth={1.75} /> },
    { label: 'Reports', href: '/reports', module: 'Reports', icon: <FileText size={17} strokeWidth={1.75} /> },
  ],
  'Public Health Nurse': [
    { label: 'Health activities', href: '/health-activities', module: 'Health Activities', icon: <ClipboardCheck size={17} strokeWidth={1.75} /> },
    { label: 'Defaulters', href: '/vaccination/defaulters', module: 'Vaccination', icon: <AlertTriangle size={17} strokeWidth={1.75} /> },
    { label: 'Stock overview', href: '/inventory/stock-overview', module: 'Inventory', icon: <Boxes size={17} strokeWidth={1.75} /> },
    { label: 'Reports', href: '/reports', module: 'Reports', icon: <FileText size={17} strokeWidth={1.75} /> },
  ],
  'Rural Health Midwife': [
    { label: 'Vaccinations', href: '/vaccination/records', module: 'Vaccination', icon: <Syringe size={17} strokeWidth={1.75} /> },
    { label: 'Defaulters', href: '/vaccination/defaulters', module: 'Vaccination', icon: <AlertTriangle size={17} strokeWidth={1.75} /> },
    { label: 'Schedule', href: '/vaccination/schedule', module: 'Vaccination', icon: <CalendarClock size={17} strokeWidth={1.75} /> },
    { label: 'Supplementation', href: '/supplementation', module: 'Supplementation', icon: <Pill size={17} strokeWidth={1.75} /> },
  ],
  'Barangay Health Worker': [
    { label: 'Children', href: '/child-profiling/children', module: 'Child Profiling', icon: <Baby size={17} strokeWidth={1.75} /> },
    { label: 'Defaulters', href: '/vaccination/defaulters', module: 'Vaccination', icon: <AlertTriangle size={17} strokeWidth={1.75} /> },
    { label: 'Health activities', href: '/health-activities', module: 'Health Activities', icon: <ClipboardCheck size={17} strokeWidth={1.75} /> },
    { label: 'Alerts', href: '/alerts', module: 'Alerts', icon: <Bell size={17} strokeWidth={1.75} /> },
  ],
  'Barangay Nutrition Scholar': [
    { label: 'Nutrition', href: '/nutrition', module: 'Nutritional Assessment', icon: <Apple size={17} strokeWidth={1.75} /> },
    { label: 'Supplementation', href: '/supplementation', module: 'Supplementation', icon: <Pill size={17} strokeWidth={1.75} /> },
    { label: 'Children', href: '/child-profiling/children', module: 'Child Profiling', icon: <Baby size={17} strokeWidth={1.75} /> },
    { label: 'Alerts', href: '/alerts', module: 'Alerts', icon: <Bell size={17} strokeWidth={1.75} /> },
  ],
}

type Tone = 'danger' | 'warn' | 'nutrition' | 'neutral' | 'brand' | 'good'
// info = a plain count (no follow-up), so no accent bar and no "nothing to follow up" note.
type AttentionItem = { label: string; value: (m: Metrics) => number; note: (m: Metrics) => string; href: string; tone: Tone; icon: ReactNode; info?: boolean }

export function DashboardOverview() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined

  const [days, setDays] = useState<number | null>(90)
  const [from, setFrom] = useState(daysAgoYMD(90))
  const [to, setTo] = useState(todayYMD())
  const [trendKey, setTrendKey] = useState('vacc')
  const url = useMemo(() => `/api/dashboard/summary?from=${from}&to=${to}`, [from, to])

  const { data, error } = useSWR<Payload>(isReady && role ? url : null, fetcher, { keepPreviousData: true })

  if (!isReady) return <div role="status" aria-label="Loading dashboard" className="h-32 animate-pulse rounded-2xl bg-brand-navy/90 motion-reduce:animate-none" />
  if (!role) return <div className={`${card} p-10 text-center text-brand-muted`}>Dashboard unavailable for this account.</div>

  const modules = roleModules[role] ?? []
  const can = (module: string) => modules.includes(module)
  const firstName = user?.fullName?.trim().split(/\s+/)[0] ?? ''
  const range = { from, to }

  const isAdmin = role === 'Administrator'
  const isPhn = role === 'Public Health Nurse'
  const isRhm = role === 'Rural Health Midwife'
  const isBhw = role === 'Barangay Health Worker'
  const isBns = role === 'Barangay Nutrition Scholar'

  const barangayCount = data?.scope_barangay_ids?.length ?? 0
  const scopeLabel = data?.scope === 'ALL' ? 'All RHUs' :
    barangayCount > 0 ? `${barangayCount} assigned barangay${barangayCount === 1 ? '' : 's'}` : 'No barangays assigned'

  const m = data?.metrics
  const pickRange = (d: number) => { setDays(d); setFrom(daysAgoYMD(d)); setTo(todayYMD()) }

  // Card definitions depend only on the role, so the loading skeleton has the same count.
  const attention = ([
    can('Vaccination') && { label: 'Overdue vaccinations', value: (x) => x.vaccinations_overdue, note: () => 'Past their due date', href: '/vaccination/defaulters', tone: 'danger', icon: <AlertTriangle size={19} strokeWidth={1.75} /> },
    can('Vaccination') && { label: 'Due in 14 days', value: (x) => x.vaccinations_due_soon, note: () => 'Remind guardians early', href: '/vaccination/schedule', tone: 'warn', icon: <CalendarClock size={19} strokeWidth={1.75} /> },
    can('Nutritional Assessment') && { label: 'At nutritional risk', value: (x) => x.at_risk_children, note: (x) => x.children > 0 ? `${Math.round((x.at_risk_children / x.children) * 100)}% of registered children` : 'From latest assessments', href: '/nutrition', tone: 'nutrition', icon: <Apple size={19} strokeWidth={1.75} /> },
    can('Inventory') && { label: 'Low-stock items', value: (x) => x.low_stock_items, note: () => '10 or fewer on hand', href: '/inventory/stock-overview', tone: 'neutral', icon: <Boxes size={19} strokeWidth={1.75} /> },
  ] as (AttentionItem | false)[]).filter(Boolean) as AttentionItem[]
  // Roles with fewer than four follow-up cards get period counts from modules they use.
  const fillers = ([
    can('Child Profiling') && { label: 'Registered children', value: (x) => x.children, note: () => 'Active profiles in your area', href: '/child-profiling/children', tone: 'brand', icon: <Baby size={19} strokeWidth={1.75} />, info: true },
    can('Vaccination') && { label: 'Vaccinations given', value: (x) => x.vaccinations_approved, note: () => 'Approved in this period', href: '/vaccination/records', tone: 'brand', icon: <Syringe size={19} strokeWidth={1.75} />, info: true },
    can('Supplementation') && { label: 'Supplement doses', value: (x) => x.supplementation_records, note: () => 'Given in this period', href: '/supplementation', tone: 'brand', icon: <Pill size={19} strokeWidth={1.75} />, info: true },
    can('Nutritional Assessment') && { label: 'Assessments done', value: (x) => x.nutrition_assessments, note: () => 'Recorded in this period', href: '/nutrition', tone: 'brand', icon: <Apple size={19} strokeWidth={1.75} />, info: true },
  ] as (AttentionItem | false)[]).filter(Boolean) as AttentionItem[]
  // BHW works from lists (upcoming, barangay, alerts), not period KPIs.
  const cards = isBhw ? [] : [...attention, ...fillers].slice(0, 4)
  const onCard = new Set(cards.map((c) => c.label))
  // Period totals under the chart, skipping any number already shown as a card.
  const totals = ([
    can('Child Profiling') && { label: 'Registered children', value: (x: Metrics) => x.children, icon: <Baby size={15} strokeWidth={1.75} /> },
    can('Vaccination') && { label: 'Vaccinations given', value: (x: Metrics) => x.vaccinations_approved, icon: <Syringe size={15} strokeWidth={1.75} /> },
    can('Nutritional Assessment') && { label: 'Assessments done', value: (x: Metrics) => x.nutrition_assessments, icon: <Apple size={15} strokeWidth={1.75} /> },
    can('Supplementation') && { label: 'Supplement doses', value: (x: Metrics) => x.supplementation_records, icon: <Pill size={15} strokeWidth={1.75} /> },
  ].filter(Boolean) as { label: string; value: (x: Metrics) => number; icon: ReactNode }[]).filter((t) => !onCard.has(t.label))

  const trends = [
    can('Vaccination') && { key: 'vacc', label: 'Vaccinations', note: 'Approved vaccination records per month', data: data?.charts.vaccinations_by_month, color: 'var(--brand-sky)' },
    can('Supplementation') && { key: 'supp', label: 'Supplementation', note: 'Supplement doses given per month', data: data?.charts.supplementation_by_month, color: 'var(--brand-navy)' },
  ].filter(Boolean) as { key: string; label: string; note: string; data?: { month: string; count: number }[]; color: string }[]
  const showChart = !isBhw && trends.length > 0

  const nb = data?.charts.nutrition_breakdown
  const showCoverage = can('Vaccination')
  const showNutritionDonut = can('Nutritional Assessment')
  const showStatus = (isAdmin || isPhn || isRhm) && (showCoverage || showNutritionDonut)
  const vaccDenom = m ? (m.vaccinations_approved + m.vaccinations_overdue + m.vaccinations_due_soon) : 0
  const vaccPct = m && vaccDenom > 0 ? Math.round((m.vaccinations_approved / vaccDenom) * 100) : 0

  const actions = (quickActions[role] ?? []).filter((a) => can(a.module))
  const programs = [can('Vaccination') && 'VACCINATION' as const, can('Supplementation') && 'SUPPLEMENTATION' as const].filter((p) => p !== false)
  const canUpcoming = programs.length > 0

  // ─── Building blocks, each already gated by module access ──────────
  const chart = showChart && !error && (
    <ActivityChart key="chart" trends={trends} trendKey={trendKey} onTrend={setTrendKey}
      totals={totals} metrics={m} loading={!data} style={stagger(6)} />
  )
  const status = showStatus && !error && (
    <section key="status" aria-labelledby="status-heading" aria-busy={!data} className={`${card} flex flex-col p-5 sm:p-6 ${SIZE.compact} ${rise}`} style={stagger(7)}>
      <h2 id="status-heading" className="text-base font-semibold">Status</h2>
      <p className="text-sm text-brand-muted">For this period and your scope</p>
      <div className={`mt-3 grid flex-1 content-center gap-3 ${showCoverage && showNutritionDonut ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {!data ? (
          <div className="mx-auto h-24 w-24 animate-pulse rounded-full bg-brand-ice motion-reduce:animate-none" />
        ) : (
          <>
            {showCoverage && <Donut percentage={vaccPct} label="Vaccine coverage" color="var(--tone-good)" size={104} />}
            {showNutritionDonut && (nb && nb.total > 0 ? (
              <Donut percentage={Math.round((nb.at_risk / nb.total) * 100)} label={`At risk · ${nb.at_risk} of ${nb.total}`} color="var(--tone-nutrition)" size={104} />
            ) : (
              <p className="flex items-center justify-center rounded-xl bg-brand-ice/60 p-3 text-center text-sm text-brand-muted">No assessments yet.</p>
            ))}
          </>
        )}
      </div>
    </section>
  )
  const fic = can('Vaccination') && <FicWidget key="fic" range={range} size="tall" style={stagger(8)} />
  const ranking = canPerform(role, 'Geospatial', 'view') && <BarangayRankingWidget key="ranking" size="tall" style={stagger(9)} />
  const upcoming = canUpcoming && <UpcomingWidget key="upcoming" programs={programs} size="tall" style={stagger(9)} />
  // Only PHN and Admin can approve (see /api/vaccination/review).
  const approvals = (isAdmin || isPhn) && <ApprovalsWidget key="approvals" showInventory={can('Inventory')} size="compact" style={stagger(8)} />
  const expiring = can('Inventory') && <ExpiringBatchesWidget key="expiring" size="tall" style={stagger(9)} />
  const system = can('User Management') && <SystemActivityWidget key="system" range={range} size="compact" style={stagger(10)} />
  const masterlist = canPerform(role, 'Masterlist Upload', 'view') && <MasterlistWidget key="masterlist" size="compact" style={stagger(11)} />
  const myBarangay = can('Child Profiling') && <MyBarangayWidget key="my-barangay" size="tall" style={stagger(8)} />
  const alerts = can('Alerts') && <RecentAlertsWidget key="alerts" size="tall" style={stagger(10)} />
  const nutrition = can('Nutritional Assessment') && <NutritionBreakdownWidget key="nutrition" size="compact" style={stagger(8)} />
  const weighing = can('Nutritional Assessment') && <WeighingDueWidget key="weighing" size="compact" style={stagger(8)} />
  // Field roles record offline, so they see what is still on their device.
  const offline = user && <OfflineSyncWidget key="offline" user={user} size="compact" style={stagger(10)} />
  const quick = actions.length > 0 && <QuickActionsWidget key="quick" actions={actions} style={stagger(12)} />

  // Per-role arrangement. A nested array is a row of cards side by side (same size).
  const layoutFor = (): { main: (ReactNode | ReactNode[])[]; side: ReactNode[] } => {
    if (isAdmin) return { main: [chart, [fic, ranking], [system, masterlist]], side: [status, approvals, expiring, quick] }
    if (isPhn) return { main: [chart, [fic, upcoming]], side: [status, approvals, quick] }
    if (isRhm) return { main: [chart, [fic, upcoming]], side: [status, offline, quick] }
    if (isBhw) return { main: [upcoming, alerts], side: [myBarangay, quick, offline] }
    if (isBns) return { main: [chart, nutrition], side: [weighing, offline, quick] }
    return { main: [chart], side: [quick] }
  }
  const layout = layoutFor()
  const main = layout.main
    .map((row) => (Array.isArray(row) ? row.filter(Boolean) : row))
    .filter((row) => (Array.isArray(row) ? row.length > 0 : Boolean(row)))
  const side = layout.side.filter(Boolean)
  const twoColumns = main.length > 0 && side.length > 0

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* 1. Greeting + date range */}
      <header className="relative isolate overflow-hidden rounded-2xl bg-brand-navy px-5 py-4 text-white sm:px-6">
        <div aria-hidden className="absolute -right-24 -top-32 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(8,125,185,0.6),transparent)]" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className={`font-serif text-base italic text-brand-aqua ${rise}`}>{greeting()}</p>
            <h1 className={`truncate text-2xl font-bold sm:text-[1.75rem] ${rise}`} style={stagger(1)}>
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
            <div className={`mt-2 flex flex-wrap items-center gap-2 text-sm ${rise}`} style={stagger(2)}>
              <span className="rounded-md bg-white/10 px-2 py-0.5 font-medium">{role}</span>
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-brand-mist">{data ? scopeLabel : 'Loading scope…'}</span>
            </div>
          </div>

          <div className={`flex flex-col gap-2 lg:items-end ${rise}`} style={stagger(3)}>
            <div role="group" aria-label="Date range" className="flex flex-wrap gap-1 rounded-xl bg-white/10 p-1">
              {ranges.map(([d, label]) => (
                <button key={d} type="button" onClick={() => pickRange(d)} aria-pressed={days === d}
                  className={`${segBtn} ${days === d ? 'bg-white text-brand-navy' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setDays(null)} aria-pressed={days === null}
                className={`${segBtn} ${days === null ? 'bg-white text-brand-navy' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
                Custom
              </button>
            </div>
            {days === null && (
              <div className="flex flex-wrap items-center gap-2 text-sm animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
                <label className="sr-only" htmlFor="range-from">From</label>
                <input id="range-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white outline-none [color-scheme:dark] focus:border-brand-aqua" />
                <span className="text-white/60">to</span>
                <label className="sr-only" htmlFor="range-to">To</label>
                <input id="range-to" type="date" value={to} min={from} max={todayYMD()} onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white outline-none [color-scheme:dark] focus:border-brand-aqua" />
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 shrink-0" size={16} /> {error.message}
        </div>
      )}

      {/* 2. Needs attention */}
      {cards.length > 0 && !error && (
        <section aria-label="Needs attention" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4 ${cards.length >= 4 ? 'xl:grid-cols-4' : cards.length === 3 ? 'sm:grid-cols-3' : ''}`}>
          {cards.map((item, i) => m
            ? <AttentionCard key={item.label} item={item} metrics={m} style={stagger(i + 2)} />
            : <div key={item.label} role="status" aria-label={`Loading ${item.label}`} className={`h-[104px] animate-pulse ${card} bg-white/70 motion-reduce:animate-none`} />)}
        </section>
      )}

      {/* 3. Main column + side column */}
      {(main.length > 0 || side.length > 0) && (
        <div className={twoColumns ? 'grid grid-cols-1 items-start gap-5 xl:grid-cols-3 xl:gap-6' : ''}>
          {main.length > 0 && (
            <div className={`min-w-0 space-y-5 xl:space-y-6 ${twoColumns ? 'xl:col-span-2' : ''}`}>
              {main.map((row, i) => Array.isArray(row) ? (
                <div key={i} className={`grid grid-cols-1 items-start gap-5 xl:gap-6 ${row.length > 1 ? 'md:grid-cols-2' : ''}`}>{row}</div>
              ) : row)}
            </div>
          )}
          {side.length > 0 && (
            <div className={`grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2 xl:gap-6 ${twoColumns ? 'xl:grid-cols-1' : 'xl:grid-cols-3'}`}>
              {side.map((w, i) => (
                // An odd last card on the 2-up tablet grid takes the full row instead of leaving a gap.
                <div key={i} className={`min-w-0 ${i === side.length - 1 && side.length % 2 === 1 ? 'md:col-span-2 xl:col-span-1' : ''}`}>{w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────
const TONE: Record<Tone, { icon: string; bar: string }> = {
  danger: { icon: 'bg-danger-soft text-danger', bar: 'bg-danger' },
  warn: { icon: 'bg-warn-soft text-warn', bar: 'bg-warn' },
  nutrition: { icon: 'bg-nutrition-soft text-nutrition', bar: 'bg-nutrition' },
  neutral: { icon: 'bg-brand-ice text-brand-navy', bar: 'bg-brand-navy' },
  brand: { icon: 'bg-brand-ice text-brand-blue', bar: 'bg-brand-sky' },
  good: { icon: 'bg-good-soft text-good', bar: 'bg-good' },
}

function AttentionCard({ item, metrics, style }: { item: AttentionItem; metrics: Metrics; style: CSSProperties }) {
  const t = TONE[item.tone]
  const value = item.value(metrics)
  return (
    <Link href={item.href} style={style}
      className={`group relative flex h-full min-h-[104px] items-center gap-4 overflow-hidden ${card} p-4 transition-[border-color,box-shadow] duration-200 hover:border-brand-aqua hover:shadow-[0_14px_30px_-22px_rgba(3,4,94,0.45)] ${focusRing} ${rise}`}>
      <span aria-hidden className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${value > 0 && !item.info ? t.bar : 'bg-transparent'}`} />
      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>{item.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl font-bold leading-none tabular-nums">{value.toLocaleString()}</p>
        <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug">{item.label}</p>
        <p className="line-clamp-2 text-sm text-brand-muted">{value === 0 && !item.info ? 'Nothing to follow up' : item.note(metrics)}</p>
      </div>
      <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden className="shrink-0 self-start text-brand-muted/50 transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-sky group-focus-visible:text-brand-sky motion-reduce:transition-none" />
    </Link>
  )
}

type TrendDef = { key: string; label: string; note: string; data?: { month: string; count: number }[]; color: string }

// Fixed-height bars area, so switching tabs or an empty range keeps the card's size.
function ActivityChart({ trends, trendKey, onTrend, totals, metrics, loading, style }: {
  trends: TrendDef[]; trendKey: string; onTrend: (k: string) => void
  totals: { label: string; value: (x: Metrics) => number; icon: ReactNode }[]
  metrics?: Metrics; loading: boolean; style: CSSProperties
}) {
  const trend = trends.find((t) => t.key === trendKey) ?? trends[0]
  return (
    <section aria-labelledby="trend-heading" aria-busy={loading} className={`${card} p-5 sm:p-6 ${rise}`} style={style}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="trend-heading" className="text-base font-semibold">Activity over time</h2>
          <p className="line-clamp-2 text-sm text-brand-muted">{trend.note}</p>
        </div>
        {trends.length > 1 && (
          <div role="tablist" aria-label="Chart" className="flex gap-1 rounded-lg bg-brand-ice p-1">
            {trends.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={trend.key === t.key} onClick={() => onTrend(t.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${focusRing} ${
                  trend.key === t.key ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-muted hover:text-brand-navy'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6 h-[232px]">
        {loading || !trend.data ? (
          <div role="status" aria-label="Loading chart" className="h-full animate-pulse rounded-xl bg-brand-ice motion-reduce:animate-none" />
        ) : (
          <div key={trend.key}><TrendBars data={trend.data} color={trend.color} label={trend.label} /></div>
        )}
      </div>
      {totals.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-brand-ice pt-5 sm:grid-cols-4">
          {totals.map((t) => (
            <div key={t.label} className="min-w-0">
              <dt className="flex items-start gap-1.5 text-sm leading-snug text-brand-muted"><span aria-hidden className="shrink-0 text-brand-sky">{t.icon}</span>{t.label}</dt>
              <dd className="mt-1 h-7 text-xl font-semibold tabular-nums">{metrics ? t.value(metrics).toLocaleString() : <span className="block h-6 w-12 animate-pulse rounded bg-brand-ice motion-reduce:animate-none" />}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
