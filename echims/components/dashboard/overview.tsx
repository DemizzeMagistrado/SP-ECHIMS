'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// RPT-USR001 — Role-scoped dashboard overview.
// Replaces the hardcoded content of the previous overview.tsx. Reads live data
// from /api/dashboard/summary which handles role scoping (BHW/BNS = own
// barangay; PHN = RHU-wide; Admin = everything).
//
// Also includes a date range filter (defaults to last 90 days) + simple inline
// SVG charts (no external chart library). The RecentAlerts widget is reused.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  Activity, AlertCircle, Apple, Baby, Clock, Package, Syringe, TrendingUp,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
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

export function DashboardOverview() {
  const { user, isReady } = useAuth()
  const role = user?.role

  const [from, setFrom] = useState(daysAgoYMD(90))
  const [to, setTo] = useState(todayYMD())
  const url = useMemo(() => `/api/dashboard/summary?from=${from}&to=${to}`, [from, to])

  const { data, error, isLoading } = useSWR<Payload>(isReady && role ? url : null, fetcher)

  if (!isReady) return <div className="rounded-2xl border border-sky-200 bg-white p-10 text-center text-[#6B7280]">Loading your dashboard…</div>
  if (!role) return <div className="rounded-2xl border border-sky-200 bg-white p-10 text-center text-[#6B7280]">Dashboard unavailable for this account.</div>

  const scopeLabel = data?.scope === 'ALL' ? 'RHU-wide' :
    (data?.scope_barangay_ids?.length ?? 0) > 0 ?
      `${data?.scope_barangay_ids?.length} barangay(s)` : 'No assignments'

  // Vaccination coverage % within the window = approved / (approved + overdue + due_soon)
  const m = data?.metrics
  const vaccDenom = m ? (m.vaccinations_approved + m.vaccinations_overdue + m.vaccinations_due_soon) : 0
  const vaccPct = m && vaccDenom > 0 ? Math.round((m.vaccinations_approved / vaccDenom) * 100) : 0
  // At-risk rate = at_risk / children
  const atRiskPct = m && m.children > 0 ? Math.round((m.at_risk_children / m.children) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header + role badge */}
      <header className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-6">
        <p className="text-sm font-semibold text-[#0077B6]">
          {role}
          {user?.accountStatus === 'PENDING_APPROVAL' ? ' · Pending approval' : ''}
          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-muted-foreground">Scope: {scopeLabel}</span>
        </p>
        <h1 className="mt-1 text-3xl font-bold text-[#03045E]">Dashboard</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#6B7280]">
          Live metrics for your scope. Date range changes vaccination approvals, nutrition assessments, and
          supplementation counts — everything else is current.
        </p>
      </header>

      {/* Date range filter */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 md:flex-row md:items-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date range:</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary" />
          <span className="text-xs text-muted-foreground">ΓåÆ</span>
          <input type="date" value={to} min={from} max={todayYMD()} onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary" />
          <button type="button" onClick={() => { setFrom(daysAgoYMD(30)); setTo(todayYMD()) }}
            className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">Last 30d</button>
          <button type="button" onClick={() => { setFrom(daysAgoYMD(90)); setTo(todayYMD()) }}
            className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">Last 90d</button>
          <button type="button" onClick={() => { setFrom(daysAgoYMD(365)); setTo(todayYMD()) }}
            className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">Last year</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          <AlertCircle className="mb-1 inline" size={16} /> {error.message}
        </div>
      )}

      {/* Loading placeholders */}
      {isLoading || !m ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-slate-50" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={<Baby size={18} />} tone="sky" label="Registered children" value={m.children.toLocaleString()} />
            <StatCard icon={<Syringe size={18} />} tone="emerald" label="Vaccinations approved" value={m.vaccinations_approved.toLocaleString()} sub="in range" />
            <StatCard icon={<Clock size={18} />} tone="amber" label="Vaccinations due" value={m.vaccinations_due_soon.toLocaleString()} sub="next 14 days" />
            <StatCard icon={<AlertTriangle size={18} />} tone="rose" label="Overdue vaccinations" value={m.vaccinations_overdue.toLocaleString()} sub="PENDING past due" />
            <StatCard icon={<Apple size={18} />} tone="violet" label="At-risk children" value={m.at_risk_children.toLocaleString()} sub={m.children > 0 ? `${atRiskPct}% of registered` : ''} />
            <StatCard icon={<Package size={18} />} tone="slate" label="Low stock items" value={m.low_stock_items.toLocaleString()} sub="≤ 10 on hand" />
          </div>

          {/* Charts row — 2 x 2 grid: vaccination coverage + vaccinations/mo,
              then nutrition status + supplementation/mo. All backed by live data. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 size={14} className="text-emerald-600" /> Vaccination coverage
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Approved vs pending in range</p>
              <div className="mt-4 flex justify-center">
                <Donut percentage={vaccPct} label="coverage" color="#059669" />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <TrendingUp size={14} className="text-primary" /> Vaccinations per month
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Approved records by month</p>
              <div className="mt-4">
                <MiniBars data={data!.charts.vaccinations_by_month} />
              </div>
            </div>
            {/* RPT-USR001 polish — nutrition status donut */}
            <div className="rounded-2xl border border-border bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Apple size={14} className="text-rose-600" /> Nutritional status
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Latest assessment per child</p>
              <div className="mt-4 flex justify-center">
                {data!.charts.nutrition_breakdown.total > 0 ? (
                  <Donut
                    percentage={Math.round(
                      (data!.charts.nutrition_breakdown.at_risk / data!.charts.nutrition_breakdown.total) * 100
                    )}
                    label={`at risk (${data!.charts.nutrition_breakdown.at_risk}/${data!.charts.nutrition_breakdown.total})`}
                    color="#dc2626"
                  />
                ) : (
                  <p className="py-10 text-xs italic text-muted-foreground">No assessments yet.</p>
                )}
              </div>
            </div>
            {/* RPT-USR001 polish — supplementation per month */}
            <div className="rounded-2xl border border-border bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity size={14} className="text-violet-600" /> Supplementation per month
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Doses given by month</p>
              <div className="mt-4">
                <MiniBars data={data!.charts.supplementation_by_month} color="#7c3aed" />
              </div>
            </div>
          </div>

          {/* Program activity summary (kept — complements the charts) */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity size={14} className="text-primary" /> Program activity
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Records in range</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Nutritional assessments</p>
                <p className="text-xl font-bold">{m.nutrition_assessments.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Supplementation records</p>
                <p className="text-xl font-bold">{m.supplementation_records.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Pending approvals</p>
                <p className="text-xl font-bold">{m.pending_approvals.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Open alerts</p>
                <p className="text-xl font-bold">{m.open_alerts.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Quick links + alerts widget */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-border bg-white p-5">
              <h3 className="text-sm font-semibold text-foreground">Quick links</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Link href="/vaccination/records" className="rounded-lg border border-border px-3 py-2 hover:bg-muted">Vaccination records</Link>
                <Link href="/vaccination/defaulters" className="rounded-lg border border-border px-3 py-2 hover:bg-muted">Defaulters</Link>
                <Link href="/nutrition" className="rounded-lg border border-border px-3 py-2 hover:bg-muted">Nutrition</Link>
                <Link href="/inventory/stock-overview" className="rounded-lg border border-border px-3 py-2 hover:bg-muted">Stock overview</Link>
                <Link href="/reports" className="rounded-lg border border-border px-3 py-2 hover:bg-muted">Reports</Link>
                <Link href="/alerts" className="rounded-lg border border-border px-3 py-2 hover:bg-muted">Alerts</Link>
              </div>
            </div>
            <RecentAlerts />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Local stat card (tone presets) ──────────────────────────────────
type Tone = 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'
const TONE_CLASS: Record<Tone, string> = {
  sky: 'bg-sky-50 text-sky-800 border-sky-100',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  amber: 'bg-amber-50 text-amber-800 border-amber-100',
  rose: 'bg-rose-50 text-rose-800 border-rose-100',
  violet: 'bg-violet-50 text-violet-800 border-violet-100',
  slate: 'bg-slate-50 text-slate-800 border-slate-100',
}

function StatCard({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: Tone; label: string; value: string; sub?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${TONE_CLASS[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
