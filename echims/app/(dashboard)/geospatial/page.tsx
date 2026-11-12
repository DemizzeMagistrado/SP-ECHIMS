// echims/app/(dashboard)/geospatial/page.tsx
// Child Profiling › Map. Role-scoped: barangay polygons shaded by registered children, plus a pin
// per child at their household's location (siblings share a pin), coloured by follow-up need.
// Layout follows the Alerts page: header, stat cards, filters, then the map with side panels.

'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { MapPin, MapPinOff, RefreshCw, Search, X } from 'lucide-react'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { LogoLoader } from '@/components/brand/logo-loader'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/components/ui/toast'

const MAP_HEIGHT = 560
const BarangayMap = dynamic(() => import('@/components/geospatial/barangay-map-impl'), {
  ssr: false,
  // Same height as the map, so nothing below moves when it loads.
  loading: () => <div className="animate-pulse rounded-xl bg-brand-ice/70" style={{ height: MAP_HEIGHT }} />,
})

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'The map data could not be loaded. Refresh to try again.')
  return d
}

type PerBarangay = { barangay_id: number; barangay_name: string; municipality: string; child_count: number }
type MapChild = {
  child_id: number; child_code: string | null; name: string; status: string
  barangay_id: number; barangay_name: string; municipality: string
  household_id: number; family_serial_no: string | null
  lat: number | null; lng: number | null; at_risk: boolean
}
type ApiResponse = {
  role: string | null
  scopeLabel: string
  allowedBarangayIds: number[]
  perBarangay: PerBarangay[]
  children: MapChild[]
  scopeLevel?: 'barangay' | 'municipality'
  focusBarangayIds?: number[]
  municipalities?: { code: string; name: string; geojson: string | null; barangayIds: number[] }[]
}
type FollowUp = 'all' | 'any' | 'missed' | 'at_risk'

export default function GeospatialMapPage() {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined
  const canEditLocation = Boolean(role && canPerform(role, 'Child Profiling', 'edit'))
  const canSeeVaccination = Boolean(role && canPerform(role, 'Vaccination', 'view'))

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>('/api/geospatial/children-map', fetcher, { keepPreviousData: true })
  // Missed doses come from the existing defaulter computation (roles with Vaccination access).
  const { data: defaulters } = useSWR<{ defaulters: { child_id: number }[] }>(
    canSeeVaccination ? '/api/vaccination/defaulters?status=OVERDUE&limit=500' : null, fetcher)
  const missedIds = useMemo(() => new Set((defaulters?.defaulters ?? []).map((d) => d.child_id)), [defaulters])

  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('all')
  const [status, setStatus] = useState('ACTIVE')
  const [followUp, setFollowUp] = useState<FollowUp>('all')
  const [picking, setPicking] = useState<{ householdId: number; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // Admins span several municipalities: the map, stats and lists follow the one selected.
  const [muniCode, setMuniCode] = useState('')
  const municipalities = data?.municipalities ?? []
  const muni = municipalities.find((m) => m.code === muniCode) ?? municipalities[0]
  const inMuni = useMemo(() => new Set(muni?.barangayIds ?? []), [muni])

  const children = useMemo(() => (data?.children ?? []).filter((c) => !muni || inMuni.has(c.barangay_id)).map((c) => ({
    ...c,
    follow_up: (missedIds.has(c.child_id) ? 'missed' : c.at_risk ? 'at_risk' : null) as 'missed' | 'at_risk' | null,
  })), [data, missedIds, muni, inMuni])
  const scopeBarangays = useMemo(() => (data?.perBarangay ?? []).filter((b) => !muni || inMuni.has(b.barangay_id)), [data, muni, inMuni])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return children.filter((c) =>
      (!q || [c.name, c.child_code, c.family_serial_no].some((v) => v?.toLowerCase().includes(q))) &&
      (barangay === 'all' || String(c.barangay_id) === barangay) &&
      (status === 'all' || c.status === status) &&
      (followUp === 'all' || (followUp === 'any' ? c.follow_up !== null : c.follow_up === followUp)))
  }, [children, search, barangay, status, followUp])

  const mapped = filtered.filter((c) => c.lat !== null && c.lng !== null)
  const unmapped = filtered.filter((c) => c.lat === null || c.lng === null)
  const needFollowUp = filtered.filter((c) => c.follow_up !== null)
  const brgyTotal = scopeBarangays.length
  const brgyCovered = new Set(filtered.map((c) => c.barangay_id)).size

  // Barangays ranked by children needing follow-up (then by children registered).
  const ranking = useMemo(() => {
    const rows = new Map<number, { id: number; name: string; total: number; missed: number; atRisk: number }>()
    for (const c of filtered) {
      const r = rows.get(c.barangay_id) ?? { id: c.barangay_id, name: c.barangay_name, total: 0, missed: 0, atRisk: 0 }
      r.total++
      if (c.follow_up === 'missed') r.missed++
      if (c.follow_up === 'at_risk') r.atRisk++
      rows.set(c.barangay_id, r)
    }
    return [...rows.values()].sort((a, b) => (b.missed + b.atRisk) - (a.missed + a.atRisk) || b.total - a.total)
  }, [filtered])

  const polygons = useMemo(() => scopeBarangays.map((p) => ({
    barangay_id: p.barangay_id, barangay_name: p.barangay_name, municipality: p.municipality,
    lat: 0, lng: 0, // polygons come from GeoJSON
    value: p.child_count,
  })), [scopeBarangays])

  const markers = mapped.map((c) => ({
    child_id: c.child_id, full_name: c.name, barangay_id: c.barangay_id, barangay_name: c.barangay_name,
    municipality: c.municipality, lat: c.lat as number, lng: c.lng as number,
    child_code: c.child_code, family_serial_no: c.family_serial_no, status: c.status,
    follow_up: c.follow_up, href: `/child-profiling/children/${c.child_id}`,
  }))

  // Centre on the pins when there are any, else on the municipality.
  const center: [number, number] = markers.length
    ? [markers.reduce((t, m) => t + m.lat, 0) / markers.length, markers.reduce((t, m) => t + m.lng, 0) / markers.length]
    : data?.perBarangay[0]?.municipality === 'Naga City' ? [13.63, 123.2] : [14.11, 122.95]
  const zoom = (data?.allowedBarangayIds.length ?? 0) <= 2 ? 14 : (data?.allowedBarangayIds.length ?? 0) <= 10 ? 12 : 11

  async function saveLocation(lat: number, lng: number) {
    if (!picking || saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/households/location', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: picking.householdId, latitude: lat, longitude: lng }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'The location was not saved. Try again.')
      toast.success(`Location saved for ${picking.name}'s household`)
      setPicking(null)
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The location was not saved.')
    } finally {
      setSaving(false)
    }
  }

  const anyFilter = search.trim() !== '' || barangay !== 'all' || status !== 'ACTIVE' || followUp !== 'all'
  const noRole = data && data.role == null
  const noScope = data && !noRole && data.allowedBarangayIds.length === 0

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Child Profiling" role={role} />
      <PageHeader
        title="Map"
        subtitle={data?.scopeLabel ? `Where registered children live and who needs follow-up · ${data.scopeLabel}` : 'Where registered children live and who needs follow-up.'}
        actions={<Button variant="tonal" onClick={() => mutate()} disabled={isLoading}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>}
      />

      {error && !data ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
          {error.message}
          <Button variant="secondary" size="sm" onClick={() => mutate()}>Try again</Button>
        </div>
      ) : !data ? (
        <LogoLoader size="section" label="Loading the map…" />
      ) : noRole || noScope ? (
        <EmptyState
          icon={MapPinOff}
          title={noRole ? 'Your account has no role yet' : 'No barangays assigned to you yet'}
          description={noRole ? 'Ask an administrator to assign your role so the map can show your area.' : 'Ask an administrator or your PHN to add a health worker assignment, then refresh.'}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Children mapped" value={`${mapped.length} / ${filtered.length}`} hint="Household location recorded" />
            <StatCard label="Barangays covered" value={`${brgyCovered} / ${brgyTotal}`} tone="info" hint="With registered children" />
            <StatCard label="Without coordinates" value={unmapped.length} tone={unmapped.length ? 'warn' : 'good'} hint="Household location missing" />
            <StatCard
              label="Need follow-up"
              value={needFollowUp.length}
              tone={needFollowUp.length ? 'danger' : 'good'}
              hint={canSeeVaccination
                ? `${needFollowUp.filter((c) => c.follow_up === 'missed').length} missed doses · ${needFollowUp.filter((c) => c.follow_up === 'at_risk').length} nutrition at risk`
                : 'Nutrition at risk'}
            />
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search children on the map" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, Child ID or FSN" className="pl-9 pr-9" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X size={14} /></button>}
            </div>
            <Select aria-label="Barangay" value={barangay} onChange={(e) => setBarangay(e.target.value)}>
              <option value="all">All barangays</option>
              {scopeBarangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
            </Select>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {['ACTIVE', 'INACTIVE', 'MOVED', 'LOST', 'DECEASED'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </Select>
            <Select aria-label="Follow-up" value={followUp} onChange={(e) => setFollowUp(e.target.value as FollowUp)}>
              <option value="all">All children</option>
              <option value="any">Needs follow-up</option>
              {canSeeVaccination && <option value="missed">Missed vaccine dose</option>}
              <option value="at_risk">Nutrition at risk</option>
            </Select>
            {anyFilter && (
              <p className="flex items-center gap-3 text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                Showing <strong className="text-foreground">{filtered.length}</strong> of {children.length} children
                <button type="button" onClick={() => { setSearch(''); setBarangay('all'); setStatus('ACTIVE'); setFollowUp('all') }} className="font-medium text-primary underline-offset-4 hover:underline">Clear filters</button>
              </p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section aria-label="Map" className="space-y-3 rounded-2xl border border-border bg-white p-3 sm:p-4 lg:col-span-2">
              {picking && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-brand-ice px-3 py-2 text-sm text-brand-navy">
                  <span className="flex items-center gap-2"><MapPin size={16} aria-hidden="true" />Click the map where <strong>{picking.name}</strong>&rsquo;s household is.</span>
                  <Button variant="ghost" size="sm" onClick={() => setPicking(null)} disabled={saving}>Cancel</Button>
                </div>
              )}
              {municipalities.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Municipality</span>
                  <Select aria-label="Municipality" value={muni?.code ?? ''} className="h-9 w-auto"
                    onChange={(e) => { setMuniCode(e.target.value); setBarangay('all') }}>
                    {municipalities.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                  </Select>
                </div>
              )}
              <BarangayMap
                key={muni?.code ?? 'none'}
                geojsonUrls={muni?.geojson ? [muni.geojson] : []}
                lockToBounds
                focusBarangayIds={data.focusBarangayIds}
                barangays={polygons}
                allowedBarangayIds={data.allowedBarangayIds}
                metric="child_count"
                childrenMarkers={markers}
                center={center}
                zoom={zoom}
                height={MAP_HEIGHT}
                onPick={picking ? saveLocation : undefined}
                emptyMessage={markers.length === 0 ? 'No mapped children match these filters' : undefined}
              />
            </section>

            <div className="space-y-6">
              <section aria-labelledby="ranking-title" className="rounded-2xl border border-border bg-white p-5">
                <h2 id="ranking-title" className="font-semibold text-brand-navy">Barangays needing follow-up</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Ranked by children with missed doses or nutrition risk</p>
                {ranking.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">No children match these filters.</p>
                ) : (
                  <ol className="mt-3 max-h-72 divide-y divide-border overflow-y-auto">
                    {ranking.map((r, i) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => setBarangay(String(r.id))}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-brand-ice/70 focus-visible:bg-brand-ice/70 focus-visible:outline-2 focus-visible:outline-ring">
                          <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-brand-navy">{r.name}</span>
                            <span className="block text-xs text-muted-foreground">{r.total} {r.total === 1 ? 'child' : 'children'}</span>
                          </span>
                          {r.missed > 0 && <StatusBadge status="missed" tone="danger" label={`${r.missed} missed`} />}
                          {r.atRisk > 0 && <StatusBadge status="at-risk" tone="warn" label={`${r.atRisk} at risk`} />}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section aria-labelledby="unmapped-title" className="rounded-2xl border border-border bg-white p-5">
                <h2 id="unmapped-title" className="font-semibold text-brand-navy">Children without coordinates</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Their household has no map location yet</p>
                {unmapped.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Every child in this view is on the map.</p>
                ) : (
                  <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto">
                    {unmapped.map((c) => (
                      <li key={c.child_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <Link href={`/child-profiling/children/${c.child_id}`} className="min-w-0 rounded hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                          <span className="block truncate font-medium text-brand-navy">{c.name}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{c.family_serial_no ?? c.child_code ?? ''}</span>
                        </Link>
                        {canEditLocation && (
                          <Button variant="secondary" size="sm" disabled={saving}
                            onClick={() => { setPicking({ householdId: c.household_id, name: c.name }); toast.info('Click the household’s location on the map.') }}>
                            <MapPin size={14} aria-hidden="true" />Add location
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
