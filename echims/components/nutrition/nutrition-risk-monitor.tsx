'use client'
import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { labelClassification } from '@/lib/nutrition-history'
import type { RiskMonitoring } from '@/lib/nutrition-risk'
import { formatChildId } from '@/lib/formatters'
export function NutritionRiskMonitor({ monitoring, error, loading, offline, onRefresh }: { monitoring?: RiskMonitoring; error?: string; loading: boolean; offline: boolean; onRefresh: () => void }) {
  const [barangay, setBarangay] = useState('All')
  const [classification, setClassification] = useState('All')
  const [severity, setSeverity] = useState('All')
  const [worsenedOnly, setWorsenedOnly] = useState(false)
  const records = monitoring?.records ?? []
  const barangays = Array.from(new Map(records.map((row) => [String(row.barangay_id), row.barangay_name])).entries()).sort((a, b) => a[1].localeCompare(b[1]))
  const codes = Array.from(new Set(records.flatMap((row) => row.classifications.map((item) => item.code)))).sort()
  const visible = records.filter((row) => (barangay === 'All' || String(row.barangay_id) === barangay)
    && (classification === 'All' || row.classifications.some((item) => item.code === classification))
    && (severity === 'All' || row.severity === severity) && (!worsenedOnly || row.worsening.length > 0))
  const counts = monitoring?.counts
  return <section className="nutrition-no-print space-y-5" aria-label="Nutritional risk monitoring">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><AlertCircle size={20} />Nutritional risk monitoring</h2><p className="mt-1 text-sm text-muted-foreground">Current risks use the latest saved assessment per active child across all years.</p></div><button type="button" disabled={loading || offline} onClick={onRefresh} className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></div>
    {offline && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Offline: this is the last account-specific snapshot. Reconnect and refresh to verify current risks and assignments.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}{monitoring && ' Showing the last available results; refresh successfully before treating them as current.'}</p>}
    {loading && !monitoring ? <p role="status">Loading risk monitoring...</p> : !monitoring ? <p className="rounded-lg bg-muted p-4 text-sm">Risk monitoring data is unavailable. Refresh online after installing the updated API and SQL migration.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['At-risk children', counts!.at_risk], ['Critical', counts!.critical], ['High priority', counts!.high], ['Worsened', counts!.worsened], ['Needs review', counts!.needs_review]].map(([label, count]) => <div key={label} className="rounded-xl border border-border bg-white p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{count}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">Counts cover your full accessible scope. Needs review includes unavailable risk flags or incomplete latest evaluations; those children are not assumed to be normal.</p>
      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-white p-4">
        <label className="text-sm"><select value={barangay} onChange={(event) => setBarangay(event.target.value)} className="ml-2 rounded-lg border border-border px-3 py-2"><option value="All">All accessible barangays</option>{barangays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="text-sm"><select value={classification} onChange={(event) => setClassification(event.target.value)} className="ml-2 rounded-lg border border-border px-3 py-2"><option value="All">All classifications</option>{codes.map((code) => <option key={code} value={code}>{labelClassification(code)}</option>)}</select></label>
        <label className="text-sm"><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="ml-2 rounded-lg border border-border px-3 py-2">{['All', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value === 'All' ? 'All priorities' : value}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={worsenedOnly} onChange={(event) => setWorsenedOnly(event.target.checked)} />Worsened only</label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-white"><table className="w-full text-sm"><thead className="bg-muted"><tr>{['Child', 'Barangay', 'Latest assessment', 'Recorded risks', 'Priority', 'Change', 'Action'].map((title) => <th key={title} className="px-4 py-3 text-left">{title}</th>)}</tr></thead><tbody className="divide-y divide-border">{visible.map((row) => <tr key={row.child_id} className={row.worsening.length ? 'bg-red-50/40' : ''}>
        <td className="px-4 py-3 font-medium">{row.child_name}<span className="block text-xs text-muted-foreground">{formatChildId(row.child_id)}</span></td><td className="px-4 py-3">{row.barangay_name}</td><td className="whitespace-nowrap px-4 py-3">#{row.assessment_id}<br />{row.assessment_date}</td>
        <td className="min-w-[220px] px-4 py-3">{row.classifications.length ? row.classifications.map((item) => <p key={item.field} className="text-xs">{item.label}: {labelClassification(item.code)}</p>) : 'Stored risk flag requires review'}</td>
        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : row.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'}`}>{row.severity}</span></td>
        <td className="min-w-[230px] px-4 py-3">{row.worsening.length ? <><span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">Worsened</span>{row.worsening.map((item) => <p key={item.label} className="mt-1 text-xs">{item.label}: {labelClassification(item.previous)} → {labelClassification(item.current)}</p>)}<p className="mt-1 text-xs text-muted-foreground">Compared with #{row.previous_assessment_id} · {row.previous_date}</p></> : <span className="text-xs text-muted-foreground">{row.previous_assessment_id ? 'No comparable worsening detected' : 'No earlier assessment date'}</span>}</td>
        <td className="px-4 py-3"><Link href={`/child-profiling/children/${row.child_id}`} className="whitespace-nowrap text-primary underline">View child record</Link></td>
      </tr>)}{!visible.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{records.length ? 'No at-risk children match these filters.' : 'No children with a recorded current risk in your scope.'}</td></tr>}</tbody></table></div>
      <p className="text-xs text-muted-foreground">Priority uses active alert-rule settings with a medium monitoring baseline. Worsening compares valid saved classifications from the same evaluator version and an earlier assessment date.</p>
    </>}
  </section>
}