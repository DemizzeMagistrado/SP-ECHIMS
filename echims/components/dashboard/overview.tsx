'use client'

// RPT-USR001 — Role-scoped dashboard overview.
// Reads live data from /api/dashboard/summary, which handles role scoping
// (BHW/BNS/RHM = assigned barangays; PHN = RHU-wide; Admin = everything).
// One layout for every role; cards and charts are filtered by the modules the
// role can open (roleModules).
//
// Layout: greeting, then a 2x2 grid of number cards beside the Status donuts,
// then the activity chart (full width) with period totals.
// Alerts live in the top-bar bell and the Alerts module, so they are not repeated here.

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  AlertCircle, AlertTriangle, Apple, ArrowUpRight, Baby, Boxes, CalendarClock,
  Pill, Syringe,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, roleModules, type UserRole } from '@/lib/echims-data'
import { Donut, TrendBars } from './mini-charts'
import { card, fetcher, rise, stagger, ApprovalsWidget, BarangayRankingWidget, ExpiringBatchesWidget, FicWidget, MasterlistWidget, MyBarangayWidget, NutritionBreakdownWidget, OfflineSyncWidget, RuleTriggersWidget, WeighingDueWidget, UpcomingWidget } from './widgets'

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

const segBtn = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#90E0EF]'

type Trend = { key: string; label: string; note: string; data: { month: string; count: number }[]; color: string }

export function DashboardOverview() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined

  const [days, setDays] = useState<number | null>(90)
  const [from, setFrom] = useState(daysAgoYMD(90))
  const [to, setTo] = useState(todayYMD())
  const [trendKey, setTrendKey] = useState('vacc')
  const url = useMemo(() => `/api/dashboard/summary?from=${from}&to=${to}`, [from, to])

  const { data, error, isLoading } = useSWR<Payload>(isReady && role ? url : null, fetcher)

  if (!isReady) return <OverviewSkeleton />
  if (!role) return <div className={`${card} p-10 text-center text-[#5B6478]`}>Dashboard unavailable for this account.</div>

  const modules = roleModules[role] ?? []
  const can = (module: string) => modules.includes(module)
  const firstName = user?.fullName?.trim().split(/\s+/)[0] ?? ''

  const barangayCount = data?.scope_barangay_ids?.length ?? 0
  const scopeLabel = data?.scope === 'ALL' ? 'All RHUs' :
    barangayCount > 0 ? `${barangayCount} assigned barangay${barangayCount === 1 ? '' : 's'}` : 'No barangays assigned'

  const m = data?.metrics
  // Coverage within the window = approved / (approved + overdue + due soon)
  const vaccDenom = m ? (m.vaccinations_approved + m.vaccinations_overdue + m.vaccinations_due_soon) : 0
  const vaccPct = m && vaccDenom > 0 ? Math.round((m.vaccinations_approved / vaccDenom) * 100) : 0
  const atRiskPct = m && m.children > 0 ? Math.round((m.at_risk_children / m.children) * 100) : 0

  const pickRange = (d: number) => { setDays(d); setFrom(daysAgoYMD(d)); setTo(todayYMD()) }

  const attention = m ? [
    can('Vaccination') && { label: 'Overdue vaccinations', value: m.vaccinations_overdue, note: 'Past their due date', href: '/vaccination/defaulters', tone: 'rose' as const, icon: <AlertTriangle size={20} /> },
    can('Vaccination') && { label: 'Due in 14 days', value: m.vaccinations_due_soon, note: 'Remind guardians early', href: '/vaccination/schedule', tone: 'amber' as const, icon: <CalendarClock size={20} /> },
    can('Nutritional Assessment') && { label: 'At nutritional risk', value: m.at_risk_children, note: m.children > 0 ? `${atRiskPct}% of registered children` : 'From latest assessments', href: '/nutrition', tone: 'violet' as const, icon: <Apple size={20} /> },
    can('Inventory') && { label: 'Low-stock items', value: m.low_stock_items, note: '10 or fewer on hand', href: '/inventory/stock-overview', tone: 'slate' as const, icon: <Boxes size={20} /> },
  ].filter(Boolean) as AttentionItem[] : []

  // Roles with fewer than four follow-up cards get period counts from modules they use,
  // so every role sees a full 2x2 grid.
  const fillers = m ? [
    can('Child Profiling') && { label: 'Registered children', value: m.children, note: 'Active profiles in your area', href: '/child-profiling/children', tone: 'sky' as const, icon: <Baby size={20} />, info: true },
    can('Vaccination') && { label: 'Vaccinations given', value: m.vaccinations_approved, note: 'Approved in this period', href: '/vaccination/records', tone: 'emerald' as const, icon: <Syringe size={20} />, info: true },
    can('Supplementation') && { label: 'Supplement doses', value: m.supplementation_records, note: 'Given in this period', href: '/supplementation', tone: 'violet' as const, icon: <Pill size={20} />, info: true },
    can('Nutritional Assessment') && { label: 'Assessments done', value: m.nutrition_assessments, note: 'Recorded in this period', href: '/nutrition', tone: 'sky' as const, icon: <Apple size={20} />, info: true },
  ].filter(Boolean) as AttentionItem[] : []
  const cards = [...attention, ...fillers].slice(0, 4)
  const onCard = new Set(cards.map((c) => c.label))
  // Period totals under the chart, skipping any number already shown as a card.
  const totals = m ? ([
    can('Child Profiling') && { label: 'Registered children', value: m.children, icon: <Baby size={15} /> },
    can('Vaccination') && { label: 'Vaccinations given', value: m.vaccinations_approved, icon: <Syringe size={15} /> },
    can('Nutritional Assessment') && { label: 'Assessments done', value: m.nutrition_assessments, icon: <Apple size={15} /> },
    can('Supplementation') && { label: 'Supplement doses', value: m.supplementation_records, icon: <Pill size={15} /> },
  ].filter(Boolean) as { label: string; value: number; icon: ReactNode }[]).filter((t) => !onCard.has(t.label)) : []

  const trends = (data ? [
    can('Vaccination') && { key: 'vacc', label: 'Vaccinations', note: 'Approved vaccination records per month', data: data.charts.vaccinations_by_month, color: '#087DB9' },
    can('Supplementation') && { key: 'supp', label: 'Supplementation', note: 'Supplement doses given per month', data: data.charts.supplementation_by_month, color: '#7C3AED' },
  ] : []).filter(Boolean) as Trend[]
  const trend = trends.find((t) => t.key === trendKey) ?? trends[0]

  const nb = data?.charts.nutrition_breakdown
  const showCoverage = can('Vaccination')
  const showNutrition = can('Nutritional Assessment')
  const bothDonuts = showCoverage && showNutrition

  // Role layout: each role gets only the widgets for its daily work.
  const isAdmin = role === 'Administrator'
  const isNurse = role === 'Public Health Nurse' || role === 'Rural Health Midwife'
  const isBhw = role === 'Barangay Health Worker'
  const isBns = role === 'Barangay Nutrition Scholar'
  const panels = [
    (isAdmin || isNurse) && can('Alerts') && <RuleTriggersWidget key="rules" style={stagger(9)} />,
    (isAdmin || isNurse) && can('Vaccination') && <FicWidget key="fic" range={{ from, to }} style={stagger(10)} />,
    isAdmin && canPerform(role, 'Geospatial', 'view') && <BarangayRankingWidget key="ranking" style={stagger(11)} />,
    (isNurse || isBhw) && (can('Vaccination') || can('Supplementation')) && (
      <UpcomingWidget key="upcoming" style={stagger(11)}
        programs={[can('Vaccination') && 'VACCINATION' as const, can('Supplementation') && 'SUPPLEMENTATION' as const].filter((p) => p !== false)} />
    ),
    (isAdmin || role === 'Public Health Nurse') && <ApprovalsWidget key="approvals" showInventory={can('Inventory')} style={stagger(12)} />,
    isAdmin && can('Inventory') && <ExpiringBatchesWidget key="expiring" style={stagger(13)} />,
    isAdmin && canPerform(role, 'Masterlist Upload', 'view') && <MasterlistWidget key="masterlist" style={stagger(14)} />,
    isBhw && can('Child Profiling') && <MyBarangayWidget key="my-barangay" style={stagger(10)} />,
    isBns && can('Nutritional Assessment') && <NutritionBreakdownWidget key="nutrition" style={stagger(9)} />,
    isBns && can('Nutritional Assessment') && <WeighingDueWidget key="weighing" style={stagger(10)} />,
    // Field roles record offline, so they see what is still on their device.
    user && (isBhw || isBns || role === 'Rural Health Midwife') && <OfflineSyncWidget key="offline" user={user} style={stagger(14)} />,
  ].filter(Boolean)

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Greeting */}
      <header className="relative isolate overflow-hidden rounded-2xl bg-[#03045E] px-5 py-5 text-white sm:px-7 sm:py-6">
        <div aria-hidden className="absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(8,125,185,0.65),transparent)]" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className={`text-sm font-semibold text-[#90E0EF] ${rise}`}>{greeting()}</p>
            <h1 className={`mt-0.5 truncate text-2xl font-bold tracking-tight sm:text-3xl ${rise}`} style={stagger(1)}>
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
            <div className={`mt-3 flex flex-wrap items-center gap-2 text-sm ${rise}`} style={stagger(2)}>
              <span className="rounded-md bg-white/10 px-2.5 py-1 font-semibold">{role}</span>
              <span className="rounded-md bg-white/10 px-2.5 py-1 text-[#CAF0F8]">{data ? scopeLabel : 'Loading scope…'}</span>
            </div>
          </div>

          {/* Date range: presets, or custom dates on request */}
          <div className={`flex flex-col gap-2 lg:items-end ${rise}`} style={stagger(3)}>
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

      {isLoading || !m ? (
        !error && <OverviewSkeleton bare />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:gap-6">
            {/* Number cards, 2x2; each opens the list behind its number */}
            {cards.length > 0 && (
              <section aria-label="Key numbers" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:auto-rows-fr xl:gap-4 ${showCoverage || showNutrition ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
                {cards.map((item, i) => (
                  <AttentionCard key={item.label} item={item} style={stagger(i + 4)} />
                ))}
              </section>
            )}

            {(showCoverage || showNutrition) && (
              <section aria-labelledby="status-heading" className={`${card} flex flex-col p-5 sm:p-6 ${rise} ${cards.length === 0 ? 'xl:col-span-3' : ''}`} style={stagger(8)}>
                <h2 id="status-heading" className="text-lg font-bold">Status</h2>
                <p className="text-sm text-[#5B6478]">For this period and your scope</p>
                <div className={`mt-5 grid flex-1 content-center gap-4 ${bothDonuts ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {showCoverage && <Donut percentage={vaccPct} label="Vaccination coverage" color="#059669" size={bothDonuts ? 116 : 140} />}
                  {showNutrition && (nb && nb.total > 0 ? (
                    <Donut percentage={Math.round((nb.at_risk / nb.total) * 100)} label={`At nutritional risk (${nb.at_risk} of ${nb.total})`} color="#DC2626" size={bothDonuts ? 116 : 140} />
                  ) : (
                    <div className="flex items-center justify-center rounded-xl bg-[#F8FCFD] p-4 text-center text-sm text-[#5B6478]">No nutrition assessments yet.</div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {panels.length > 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">{panels}</div>
          )}

          {/* Activity over time, full width */}
          {(trend || totals.length > 0) && (
            <section aria-labelledby="trend-heading" className={`${card} p-5 sm:p-6 ${rise}`} style={stagger(9)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="trend-heading" className="text-lg font-bold">Activity over time</h2>
                  <p className="text-sm text-[#5B6478]">{trend ? trend.note : 'Records in this period'}</p>
                </div>
                {trends.length > 1 && (
                  <div role="tablist" aria-label="Chart" className="flex gap-1 rounded-lg bg-[#F1F7FA] p-1">
                    {trends.map((t) => (
                      <button key={t.key} type="button" role="tab" aria-selected={trend?.key === t.key} onClick={() => setTrendKey(t.key)}
                        className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] ${
                          trend?.key === t.key ? 'bg-white text-[#03045E] shadow-sm' : 'text-[#5B6478] hover:text-[#03045E]'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {trend && (
                <div key={trend.key} className="mt-6">
                  <TrendBars data={trend.data} color={trend.color} label={trend.label} />
                </div>
              )}
              {totals.length > 0 && (
                <dl className={`${trend ? 'mt-6 border-t border-[#EEF4F7] pt-5' : 'mt-4'} grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4`}>
                  {totals.map((t) => <Total key={t.label} label={t.label} value={t.value} icon={t.icon} />)}
                </dl>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────
type Tone = 'rose' | 'amber' | 'violet' | 'slate' | 'sky' | 'emerald'
// info = a plain count (no follow-up), so no accent bar and no "nothing to follow up" note.
type AttentionItem = { label: string; value: number; note: string; href: string; tone: Tone; icon: ReactNode; info?: boolean }

const TONE: Record<Tone, { icon: string; bar: string }> = {
  rose: { icon: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' },
  amber: { icon: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  violet: { icon: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  slate: { icon: 'bg-slate-100 text-slate-700', bar: 'bg-slate-500' },
  sky: { icon: 'bg-[#EAF6FA] text-[#0077B6]', bar: 'bg-[#087DB9]' },
  emerald: { icon: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
}

function AttentionCard({ item, style }: { item: AttentionItem; style: React.CSSProperties }) {
  const t = TONE[item.tone]
  return (
    <Link href={item.href} style={style}
      className={`group relative flex items-center gap-4 overflow-hidden ${card} p-4 transition-[border-color,box-shadow] duration-200 hover:border-[#90E0EF] hover:shadow-[0_14px_30px_-20px_rgba(3,4,94,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] sm:p-5 ${rise}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${item.value > 0 && !item.info ? t.bar : 'bg-transparent'}`} />
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>{item.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold leading-none tabular-nums">{item.value.toLocaleString()}</p>
        <p className="mt-1.5 truncate text-sm font-semibold">{item.label}</p>
        <p className="truncate text-sm text-[#5B6478]">{item.value === 0 && !item.info ? 'Nothing to follow up' : item.note}</p>
      </div>
      <ArrowUpRight size={16} className="shrink-0 self-start text-[#8A93A6] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#087DB9]" />
    </Link>
  )
}

function Total({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 truncate text-sm text-[#5B6478]"><span className="shrink-0 text-[#087DB9]">{icon}</span>{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  )
}

function OverviewSkeleton({ bare = false }: { bare?: boolean }) {
  const block = 'animate-pulse rounded-2xl border border-[#DCEAF0] bg-white/70'
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-5 lg:space-y-6">
      {!bare && <div className="h-32 animate-pulse rounded-2xl bg-[#03045E]/90" />}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-2 xl:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`h-28 ${block}`} />)}
        </div>
        <div className={`h-64 ${block}`} />
      </div>
      <div className={`h-96 ${block}`} />
    </div>
  )
}
