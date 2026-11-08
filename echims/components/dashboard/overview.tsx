'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// RPT-USR001 — Role-scoped dashboard overview.
// Reads live data from /api/dashboard/summary, which handles role scoping
// (BHW/BNS/RHM = assigned barangays; PHN = RHU-wide; Admin = everything).
// The layout is shared by every role; cards, quick actions and charts are
// filtered by the modules the role can open (roleModules).

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  Activity, AlertCircle, AlertTriangle, Apple, ArrowUpRight, Baby, Boxes, CalendarClock,
  CheckCircle2, ClipboardCheck, FileText, Pill, Syringe, TrendingUp, Users,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { roleModules, type UserRole } from '@/lib/echims-data'
import { RecentAlerts } from './recent-alerts'
import { Donut, MiniBars } from './mini-charts'

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
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last year'],
] as const

// Quick actions per role, most-used first; anything the role cannot open is dropped.
const quickActions: Record<UserRole, { label: string; href: string; module: string; icon: ReactNode }[]> = {
  Administrator: [
    { label: 'Review accounts', href: '/user-management', module: 'User Management', icon: <Users size={18} /> },
    { label: 'Children', href: '/child-profiling/children', module: 'Child Profiling', icon: <Baby size={18} /> },
    { label: 'Stock overview', href: '/inventory/stock-overview', module: 'Inventory', icon: <Boxes size={18} /> },
    { label: 'Reports', href: '/reports', module: 'Reports', icon: <FileText size={18} /> },
  ],
  'Public Health Nurse': [
    { label: 'Health activities', href: '/health-activities', module: 'Health Activities', icon: <ClipboardCheck size={18} /> },
    { label: 'Defaulters', href: '/vaccination/defaulters', module: 'Vaccination', icon: <AlertTriangle size={18} /> },
    { label: 'Stock overview', href: '/inventory/stock-overview', module: 'Inventory', icon: <Boxes size={18} /> },
    { label: 'Reports', href: '/reports', module: 'Reports', icon: <FileText size={18} /> },
  ],
  'Rural Health Midwife': [
    { label: 'Vaccination records', href: '/vaccination/records', module: 'Vaccination', icon: <Syringe size={18} /> },
    { label: 'Defaulters', href: '/vaccination/defaulters', module: 'Vaccination', icon: <AlertTriangle size={18} /> },
    { label: 'Schedule', href: '/vaccination/schedule', module: 'Vaccination', icon: <CalendarClock size={18} /> },
    { label: 'Supplementation', href: '/supplementation', module: 'Supplementation', icon: <Pill size={18} /> },
  ],
  'Barangay Health Worker': [
    { label: 'Children', href: '/child-profiling/children', module: 'Child Profiling', icon: <Baby size={18} /> },
    { label: 'Defaulters', href: '/vaccination/defaulters', module: 'Vaccination', icon: <AlertTriangle size={18} /> },
    { label: 'Health activities', href: '/health-activities', module: 'Health Activities', icon: <ClipboardCheck size={18} /> },
    { label: 'Alerts', href: '/alerts', module: 'Alerts', icon: <AlertCircle size={18} /> },
  ],
  'Barangay Nutrition Scholar': [
    { label: 'Nutrition', href: '/nutrition', module: 'Nutritional Assessment', icon: <Apple size={18} /> },
    { label: 'Supplementation', href: '/supplementation', module: 'Supplementation', icon: <Pill size={18} /> },
    { label: 'Children', href: '/child-profiling/children', module: 'Child Profiling', icon: <Baby size={18} /> },
    { label: 'Alerts', href: '/alerts', module: 'Alerts', icon: <AlertCircle size={18} /> },
  ],
}

const stagger = (i: number) => ({ animationDelay: `${i * 60}ms` })
const rise = 'animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none'

export function DashboardOverview() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined

  const [days, setDays] = useState<number | null>(90)
  const [from, setFrom] = useState(daysAgoYMD(90))
  const [to, setTo] = useState(todayYMD())
  const url = useMemo(() => `/api/dashboard/summary?from=${from}&to=${to}`, [from, to])

  const { data, error, isLoading } = useSWR<Payload>(isReady && role ? url : null, fetcher)

  if (!isReady) return <OverviewSkeleton />
  if (!role) return <div className="rounded-2xl border border-[#DCEAF0] bg-white p-10 text-center text-[#5B6478]">Dashboard unavailable for this account.</div>

  const modules = roleModules[role] ?? []
  const can = (module: string) => modules.includes(module)
  const firstName = user?.fullName?.trim().split(/\s+/)[0] ?? ''

  const scopeLabel = data?.scope === 'ALL' ? 'All RHUs' :
    (data?.scope_barangay_ids?.length ?? 0) > 0 ?
      `${data?.scope_barangay_ids?.length} assigned barangay${data?.scope_barangay_ids?.length === 1 ? '' : 's'}` : 'No barangays assigned'

  const m = data?.metrics
  // Coverage within the window = approved / (approved + overdue + due soon)
  const vaccDenom = m ? (m.vaccinations_approved + m.vaccinations_overdue + m.vaccinations_due_soon) : 0
  const vaccPct = m && vaccDenom > 0 ? Math.round((m.vaccinations_approved / vaccDenom) * 100) : 0
  const atRiskPct = m && m.children > 0 ? Math.round((m.at_risk_children / m.children) * 100) : 0

  const pickRange = (d: number) => { setDays(d); setFrom(daysAgoYMD(d)); setTo(todayYMD()) }

  const attention = m ? [
    can('Vaccination') && { label: 'Overdue vaccinations', value: m.vaccinations_overdue, note: 'Past their due date', href: '/vaccination/defaulters', tone: 'rose' as const, icon: <AlertTriangle size={18} /> },
    can('Vaccination') && { label: 'Due in the next 14 days', value: m.vaccinations_due_soon, note: 'Remind guardians early', href: '/vaccination/schedule', tone: 'amber' as const, icon: <CalendarClock size={18} /> },
    can('Nutritional Assessment') && { label: 'Children at nutritional risk', value: m.at_risk_children, note: m.children > 0 ? `${atRiskPct}% of registered children` : 'From latest assessments', href: '/nutrition', tone: 'violet' as const, icon: <Apple size={18} /> },
    can('Inventory') && { label: 'Low-stock items', value: m.low_stock_items, note: '10 or fewer on hand', href: '/inventory/stock-overview', tone: 'slate' as const, icon: <Boxes size={18} /> },
  ].filter(Boolean) as AttentionItem[] : []

  const actions = (quickActions[role] ?? []).filter((a) => can(a.module))

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Greeting */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-[#03045E] px-6 py-7 text-white sm:px-8 sm:py-8">
        <div aria-hidden className="absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(8,125,185,0.65),transparent)]" />
        <div aria-hidden className="absolute -bottom-32 left-1/3 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(144,224,239,0.16),transparent)]" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={`text-sm font-semibold text-[#90E0EF] ${rise}`}>{greeting()}</p>
            <h1 className={`mt-1 text-3xl font-bold tracking-tight sm:text-4xl ${rise}`} style={stagger(1)}>
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
            <div className={`mt-4 flex flex-wrap items-center gap-2 text-sm ${rise}`} style={stagger(2)}>
              <span className="rounded-lg bg-white/10 px-3 py-1 font-semibold">{role}</span>
              <span className="rounded-lg bg-white/10 px-3 py-1 text-[#CAF0F8]">{data ? scopeLabel : 'Loading scope…'}</span>
            </div>
          </div>

          {/* Date range */}
          <div className={`flex flex-col gap-2 ${rise}`} style={stagger(3)}>
            <div role="group" aria-label="Date range" className="flex flex-wrap gap-1 rounded-xl bg-white/10 p-1">
              {ranges.map(([d, label]) => (
                <button key={d} type="button" onClick={() => pickRange(d)} aria-pressed={days === d}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#90E0EF] ${
                    days === d ? 'bg-white text-[#03045E]' : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="sr-only" htmlFor="range-from">From</label>
              <input id="range-from" type="date" value={from} max={to} onChange={(e) => { setDays(null); setFrom(e.target.value) }}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white outline-none [color-scheme:dark] focus:border-[#90E0EF]" />
              <span className="text-white/60">to</span>
              <label className="sr-only" htmlFor="range-to">To</label>
              <input id="range-to" type="date" value={to} min={from} max={todayYMD()} onChange={(e) => { setDays(null); setTo(e.target.value) }}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white outline-none [color-scheme:dark] focus:border-[#90E0EF]" />
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 shrink-0" size={16} /> {error.message}
        </div>
      )}

      {isLoading || !m ? (
        !error && <OverviewSkeleton bare />
      ) : (
        <>
          {/* Needs attention: each card links to the list behind the number */}
          {attention.length > 0 && (
            <section aria-labelledby="attention-heading">
              <h2 id="attention-heading" className="text-lg font-bold">Needs attention</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {attention.map((item, i) => (
                  <AttentionCard key={item.label} item={item} style={stagger(i + 4)} />
                ))}
              </div>
            </section>
          )}

          {/* Totals in range */}
          <section aria-labelledby="totals-heading" className={`rounded-2xl border border-[#DCEAF0] bg-white p-5 sm:p-6 ${rise}`} style={stagger(8)}>
            <h2 id="totals-heading" className="text-lg font-bold">In this period</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
              <Total label="Registered children" value={m.children} icon={<Baby size={16} />} />
              {can('Vaccination') && <Total label="Vaccinations approved" value={m.vaccinations_approved} icon={<Syringe size={16} />} />}
              {can('Nutritional Assessment') && <Total label="Nutrition assessments" value={m.nutrition_assessments} icon={<Apple size={16} />} />}
              {can('Supplementation') && <Total label="Supplements given" value={m.supplementation_records} icon={<Pill size={16} />} />}
              <Total label="Pending approvals" value={m.pending_approvals} icon={<ClipboardCheck size={16} />} />
              <Total label="Open alerts" value={m.open_alerts} icon={<AlertCircle size={16} />} />
            </dl>
          </section>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {can('Vaccination') && (
              <ChartCard title="Vaccination coverage" note="Approved out of all due in range" icon={<CheckCircle2 size={16} className="text-emerald-600" />} style={stagger(9)}>
                <div className="flex justify-center"><Donut percentage={vaccPct} label="coverage" color="#059669" /></div>
              </ChartCard>
            )}
            {can('Vaccination') && (
              <ChartCard title="Vaccinations per month" note="Approved records" icon={<TrendingUp size={16} className="text-[#087DB9]" />} style={stagger(10)}>
                <MiniBars data={data!.charts.vaccinations_by_month} />
              </ChartCard>
            )}
            {can('Nutritional Assessment') && (
              <ChartCard title="Nutritional status" note="Latest assessment per child" icon={<Apple size={16} className="text-rose-600" />} style={stagger(11)}>
                <div className="flex justify-center">
                  {data!.charts.nutrition_breakdown.total > 0 ? (
                    <Donut
                      percentage={Math.round((data!.charts.nutrition_breakdown.at_risk / data!.charts.nutrition_breakdown.total) * 100)}
                      label={`at risk (${data!.charts.nutrition_breakdown.at_risk}/${data!.charts.nutrition_breakdown.total})`}
                      color="#dc2626"
                    />
                  ) : (
                    <p className="py-10 text-sm text-[#5B6478]">No assessments yet.</p>
                  )}
                </div>
              </ChartCard>
            )}
            {can('Supplementation') && (
              <ChartCard title="Supplementation per month" note="Doses given" icon={<Activity size={16} className="text-violet-600" />} style={stagger(12)}>
                <MiniBars data={data!.charts.supplementation_by_month} color="#7c3aed" />
              </ChartCard>
            )}
          </div>

          {/* Quick actions + alerts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
            <section aria-labelledby="actions-heading" className={`rounded-2xl border border-[#DCEAF0] bg-white p-5 sm:p-6 ${rise}`} style={stagger(13)}>
              <h2 id="actions-heading" className="text-lg font-bold">Quick actions</h2>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {actions.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href}
                      className="group flex items-center gap-3 rounded-xl border border-[#E3EEF3] px-3.5 py-3 text-sm font-semibold transition-colors duration-200 hover:border-[#90E0EF] hover:bg-[#F4FBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF6FA] text-[#0077B6] transition-colors duration-200 group-hover:bg-[#087DB9] group-hover:text-white">{a.icon}</span>
                      <span className="flex-1">{a.label}</span>
                      <ArrowUpRight size={16} className="text-[#8A93A6] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#087DB9]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <div className={rise} style={stagger(14)}>
              <RecentAlerts />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────
type Tone = 'rose' | 'amber' | 'violet' | 'slate'
type AttentionItem = { label: string; value: number; note: string; href: string; tone: Tone; icon: ReactNode }

const TONE: Record<Tone, { icon: string; bar: string }> = {
  rose: { icon: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' },
  amber: { icon: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  violet: { icon: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  slate: { icon: 'bg-slate-100 text-slate-700', bar: 'bg-slate-500' },
}

function AttentionCard({ item, style }: { item: AttentionItem; style: React.CSSProperties }) {
  const t = TONE[item.tone]
  return (
    <Link href={item.href} style={style}
      className={`group relative block overflow-hidden rounded-2xl border border-[#DCEAF0] bg-white p-5 transition-[border-color,box-shadow] duration-200 hover:border-[#90E0EF] hover:shadow-[0_14px_30px_-20px_rgba(3,4,94,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] ${rise}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${item.value > 0 ? t.bar : 'bg-transparent'}`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.icon}`}>{item.icon}</span>
        <ArrowUpRight size={16} className="text-[#8A93A6] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#087DB9]" />
      </div>
      <p className="mt-4 text-3xl font-bold tabular-nums">{item.value.toLocaleString()}</p>
      <p className="mt-1 text-sm font-semibold">{item.label}</p>
      <p className="mt-0.5 text-sm text-[#5B6478]">{item.value === 0 ? 'Nothing to follow up' : item.note}</p>
    </Link>
  )
}

function Total({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-sm text-[#5B6478]"><span className="text-[#087DB9]">{icon}</span>{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  )
}

function ChartCard({ title, note, icon, children, style }: { title: string; note: string; icon: ReactNode; children: ReactNode; style: React.CSSProperties }) {
  return (
    <section style={style} className={`rounded-2xl border border-[#DCEAF0] bg-white p-5 ${rise}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h3>
      <p className="mt-0.5 text-sm text-[#5B6478]">{note}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function OverviewSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-6">
      {!bare && <div className="h-40 animate-pulse rounded-3xl bg-[#03045E]/90" />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl border border-[#DCEAF0] bg-white/70" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-2xl border border-[#DCEAF0] bg-white/70" />
    </div>
  )
}
