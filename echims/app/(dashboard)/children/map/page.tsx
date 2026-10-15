// echims/app/(dashboard)/children/map/page.tsx
// Child Profiling · Map tab — shows all children on real HDX barangay polygons,
// colored by child count per barangay. Click a polygon or pin for details.
//
// The sidebar links to /child-profiling/map; the catch-all [...slug]/page.tsx
// should re-export this page for that URL alias (see README).

'use client'

import dynamic from 'next/dynamic'
import useSWR from 'swr'
import Link from 'next/link'
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

type ApiChild = {
  child_id: number
  full_name: string
  sex: string | null
  age_months: number | null
  barangay_id: number
  barangay_name: string
  municipality: string
  lat: number
  lng: number
}
type ApiBarangay = { barangay_id: number; child_count: number }

export default function ChildrenMapPage() {
  const { data, error, isLoading, mutate } = useSWR<{ children: ApiChild[]; perBarangay: ApiBarangay[] }>(
    '/api/geospatial/children-map',
    fetcher,
  )

  const barangays = useMemo(() => {
    if (!data) return []
    const byId = new Map<number, { name: string; muni: string; lat: number; lng: number }>()
    for (const c of data.children) {
      if (!byId.has(c.barangay_id)) {
        byId.set(c.barangay_id, { name: c.barangay_name, muni: c.municipality, lat: c.lat, lng: c.lng })
      }
    }
    return data.perBarangay.map((p) => {
      const meta = byId.get(p.barangay_id) ?? { name: '—', muni: '—', lat: 0, lng: 0 }
      return {
        barangay_id: p.barangay_id,
        barangay_name: meta.name,
        municipality: meta.muni,
        lat: meta.lat,
        lng: meta.lng,
        value: p.child_count,
      }
    })
  }, [data])

  const stats = useMemo(() => {
    const total = data?.children.length ?? 0
    const barangayCount = data?.perBarangay.length ?? 0
    const municipalities = new Set<string>()
    for (const c of data?.children ?? []) municipalities.add(c.municipality)
    return { total, barangayCount, muniCount: municipalities.size }
  }, [data])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">eCHIMS Workspace</div>
          <h1 className="text-2xl font-bold text-primary">Child Profiling · Map</h1>
          <p className="text-sm text-muted-foreground">
            Where your registered children live. Polygons show per-barangay counts.
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatChip label="Children with coordinates" value={stats.total} />
        <StatChip label="Barangays covered" value={stats.barangayCount} />
        <StatChip label="Municipalities" value={stats.muniCount} />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn&apos;t load map data: {String(error.message ?? error)}
        </div>
      )}
      {!error && !isLoading && stats.total === 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          No children have coordinates yet. Add household lat/lng via{' '}
          <Link href="/child-profiling/children" className="font-semibold text-primary hover:underline">
            Child Profiling · Children
          </Link>{' '}
          to see them on the map.
        </div>
      )}

      <BarangayMap
        barangays={barangays}
        childrenMarkers={data?.children ?? []}
        metric="child_count"
        center={[14.0, 123.0]}
        zoom={9}
        height={560}
        emptyMessage={isLoading ? 'Loading…' : undefined}
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

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}