'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// RPT-USR001 — Overview widgets. Each one loads /api/dashboard/widgets?widget=<name>
// on its own, so a slow or failing widget never blocks the rest of the dashboard.

import { useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertCircle, ArrowUpRight } from 'lucide-react'
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
