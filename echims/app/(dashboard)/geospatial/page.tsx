// echims/app/(dashboard)/geospatial/page.tsx
// Role-scoped per-barangay child-count map. No individual child pins —
// the map shows ESTIMATED population per barangay so health workers can
// see where coverage is concentrated.

'use client'

import dynamic from 'next/dynamic'
import useSWR from 'swr'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

const BarangayMap = dynamic(() => import('@/components/geospatial/barangay-map-impl'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
})

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error('Failed to load')
  return r.json()
})

type PerBarangay = {
  barangay_id: number
  barangay_name: string
  municipality: string
  child_count: number
}
type ApiResponse = {
  role: string | null
  scopeLabel: string
  allowedBarangayIds: number[]
  perBarangay: PerBarangay[]
}

const CHILD_PROFILING_TABS = [
  { label: 'Children', href: '/child-profiling/children' },
  { label: 'Map', href: '/geospatial' },
  { label: 'Masterlist Import', href: '/masterlist-upload' },
]

function ChildProfilingTabs() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-6 border-b border-border/60">
      {CHILD_PROFILING_TABS.map((t) => {
        const active = pathname === t.href || (t.href === '/geospatial' && pathname.startsWith('/geospatial'))
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              'relative pb-2 text-sm font-semibold transition ' +
              (active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </Link>
        )
      })}
    </div>
  )
}

export default function GeospatialMapPage() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    '/api/geospatial/children-map',
    fetcher,
  )

  // BarangayPoint shape for the map component.
  const barangays = useMemo(() => {
    if (!data) return []
    return data.perBarangay.map((p) => ({
      barangay_id: p.barangay_id,
      barangay_name: p.barangay_name,
      municipality: p.municipality,
      lat: 0, lng: 0, // not used — polygons are drawn from GeoJSON
      value: p.child_count,
    }))
  }, [data])

  const totals = useMemo(() => {
    const total = data?.perBarangay.reduce((s, p) => s + p.child_count, 0) ?? 0
    const brgyWithChildren = data?.perBarangay.filter((p) => p.child_count > 0).length ?? 0
    const brgyTotal = data?.perBarangay.length ?? 0
    const municipalities = Array.from(new Set((data?.perBarangay ?? []).map((p) => p.municipality)))
    const soleBarangay = brgyTotal === 1 ? data?.perBarangay[0] : null
    return { total, brgyWithChildren, brgyTotal, municipalities, soleBarangay }
  }, [data])

  // Center the map on the first in-scope barangay — avoids defaulting to Naga
  // when the user is a Daet worker (or vice versa).
  const mapCenter: [number, number] = useMemo(() => {
    const first = data?.perBarangay[0]
    if (first) {
      // Daet / Naga rough centers so we fit the municipality nicely
      if (first.municipality === 'Daet') return [14.11, 122.95]
      if (first.municipality === 'Naga City') return [13.63, 123.20]
    }
    return [14.0, 123.0]
  }, [data])

  const mapZoom = useMemo(() => {
    if (!data) return 10
    // 1 barangay → zoom close; many → zoom out
    if (data.allowedBarangayIds.length <= 2) return 14
    if (data.allowedBarangayIds.length <= 10) return 12
    return 11
  }, [data])

  const noRole = data?.role == null
  const noScope = (data?.allowedBarangayIds.length ?? 0) === 0

  return (
    <div className="space-y-5">
      <ChildProfilingTabs />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">eCHIMS Workspace</div>
          <h1 className="text-2xl font-bold text-primary">Geospatial</h1>
          <p className="text-sm text-muted-foreground">
            Estimated registered-child population per barangay in your assigned area.
          </p>
          {data?.role && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{data.role}</span>
              <span className="text-base font-semibold text-foreground">
                Scope: <span className="text-primary">{data.scopeLabel}</span>
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => mutate()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatChip label="Registered children" value={totals.total} />

        {/* Barangay widget — adapts to scope size */}
        {totals.soleBarangay ? (
          <StatChip label="Barangay" value={totals.soleBarangay.barangay_name} />
        ) : (
          <StatChip
            label="Barangays with children"
            value={`${totals.brgyWithChildren} / ${totals.brgyTotal}`}
          />
        )}

        {/* Municipality widget — adapts to scope size */}
        {totals.municipalities.length === 1 ? (
          <StatChip label="Municipality" value={totals.municipalities[0]} />
        ) : (
          <StatChip
            label="Municipalities"
            value={totals.municipalities.join(' · ')}
          />
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn&apos;t load map data: {String(error.message ?? error)}
        </div>
      )}
      {!error && !isLoading && noRole && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your account has no role assigned yet. Ask an administrator to assign you a role so you can see your barangay scope on the map.
        </div>
      )}
      {!error && !isLoading && !noRole && noScope && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have no barangays assigned yet. Ask an administrator or your PHN to add a{' '}
          <span className="font-semibold">health worker assignment</span> so the map shows your area.
        </div>
      )}

      <BarangayMap
        barangays={barangays}
        allowedBarangayIds={data?.allowedBarangayIds}
        metric="child_count"
        center={mapCenter}
        zoom={mapZoom}
        height={560}
        emptyMessage={isLoading ? 'Loading…' : (noRole || noScope ? 'No barangays in your scope' : undefined)}
      />

      {barangays.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold">Children per barangay</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4">Barangay</th>
                  <th className="pb-2 pr-4">Municipality</th>
                  <th className="pb-2 pr-4 text-right">Children</th>
                </tr>
              </thead>
              <tbody>
                {[...barangays].sort((a, b) => b.value - a.value).map((b) => (
                  <tr key={b.barangay_id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-4 font-medium">{b.barangay_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.municipality}</td>
                    <td className="py-2 pr-4 text-right font-semibold">{b.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}