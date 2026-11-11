// echims/components/geospatial/barangay-map-impl.tsx
// GEO-USR002 — polygon renderer with optional child-pin overlay.
//
// Backward-compatible with the pre-polygon version. New optional prop:
//   childrenMarkers?: ChildPoint[]  — renders each child as a small pin
// Also added:
//   emptyMessage?: string           — displayed when there is nothing to show

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import 'leaflet/dist/leaflet.css'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
  GeoJSON,
  LayersControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import type { Layer, PathOptions } from 'leaflet'

type Metric = 'coverage' | 'completeness' | 'target_population' | 'child_count'

export type BarangayPoint = {
  barangay_id: number
  barangay_name: string
  municipality: string
  lat: number
  lng: number
  value: number
  label?: string
}

export type ChildPoint = {
  child_id: number
  full_name: string
  sex?: string | null
  age_months?: number | null
  barangay_id: number
  barangay_name: string
  municipality: string
  lat: number
  lng: number
  /** Optional details for the popup (Child Profiling map). */
  child_code?: string | null
  family_serial_no?: string | null
  status?: string | null
  follow_up?: 'missed' | 'at_risk' | null
  href?: string
}

type Props = {
  barangays: BarangayPoint[]
  metric: Metric
  childrenMarkers?: ChildPoint[]
  /** If provided, only GeoJSON polygons whose barangay_id is in this set are rendered. */
  allowedBarangayIds?: number[]
  center?: [number, number]
  zoom?: number
  height?: number | string
  emptyMessage?: string
  /** Pick mode: the next map click reports its coordinates (e.g. to set a household location). */
  onPick?: (lat: number, lng: number) => void
}

// ───────────────────── Color scales ─────────────────────
function colorForPct(v: number): string {
  if (v >= 95) return '#059669'
  if (v >= 80) return '#65a30d'
  if (v >= 60) return '#eab308'
  if (v >= 40) return '#f97316'
  return '#dc2626'
}

function colorForTarget(v: number, max: number): string {
  if (max <= 0) return '#e0e7ff'
  const t = Math.min(1, Math.max(0, v / max))
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${lerp(224, 67)},${lerp(231, 56)},${lerp(255, 202)})`
}

function colorForCount(v: number, max: number): string {
  if (v === 0) return '#f9fafb' // gray-50 — empty
  if (max <= 0) return '#dcfce7'
  const t = Math.min(1, Math.max(0, v / max))
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  // emerald-100 (#dcfce7) → emerald-700 (#047857)
  return `rgb(${lerp(220, 4)},${lerp(252, 120)},${lerp(231, 87)})`
}

export default function BarangayMap({
  barangays,
  metric,
  childrenMarkers = [],
  allowedBarangayIds,
  center = [14.0, 123.0],
  zoom = 10,
  height = 500,
  emptyMessage,
  onPick,
}: Props) {
  const [daetGeoRaw, setDaetGeoRaw] = useState<FeatureCollection | null>(null)
  const [nagaGeoRaw, setNagaGeoRaw] = useState<FeatureCollection | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/geojson/daet.geojson').then((r) => (r.ok ? r.json() : null)),
      fetch('/geojson/naga.geojson').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([d, n]) => {
        if (cancelled) return
        setDaetGeoRaw(d)
        setNagaGeoRaw(n)
        if (!d && !n) setLoadError('GeoJSON files not found at /geojson/*.geojson')
      })
      .catch((e) => !cancelled && setLoadError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  // Role-scope filter: hide polygons the user is not allowed to see.
  const allowedSet = useMemo(
    () => (allowedBarangayIds ? new Set(allowedBarangayIds) : null),
    [allowedBarangayIds],
  )
  function filterFC(fc: FeatureCollection | null): FeatureCollection | null {
    if (!fc) return null
    if (!allowedSet) return fc
    return {
      ...fc,
      features: fc.features.filter((f) => {
        const id = (f.properties as { barangay_id?: number })?.barangay_id
        return id != null && allowedSet.has(id)
      }),
    }
  }
  const daetGeo = useMemo(() => filterFC(daetGeoRaw), [daetGeoRaw, allowedSet])
  const nagaGeo = useMemo(() => filterFC(nagaGeoRaw), [nagaGeoRaw, allowedSet])

  const byId = useMemo(() => {
    const m = new Map<number, BarangayPoint>()
    for (const b of barangays) m.set(b.barangay_id, b)
    return m
  }, [barangays])

  const maxValue = useMemo(
    () => (barangays.length ? Math.max(...barangays.map((b) => b.value)) : 0),
    [barangays],
  )

  function colorFor(value: number): string {
    if (metric === 'target_population') return colorForTarget(value, maxValue)
    if (metric === 'child_count') return colorForCount(value, maxValue)
    return colorForPct(value)
  }

  function metricLabel(value: number): string {
    if (metric === 'target_population') return `${value.toLocaleString()} children`
    if (metric === 'child_count') return `${value} ${value === 1 ? 'child' : 'children'}`
    return `${value.toFixed(1)}%`
  }

  function styleFor(feature?: Feature<Geometry>): PathOptions {
    const props = (feature?.properties ?? {}) as { barangay_id?: number }
    const bgy = props.barangay_id ? byId.get(props.barangay_id) : null
    const fillColor = bgy ? colorFor(bgy.value) : '#f3f4f6'
    return {
      color: '#1f2937',
      weight: 1,
      opacity: 0.8,
      fillColor,
      fillOpacity: bgy ? 0.6 : 0.15,
    }
  }

  const polygonCoveredIds = useMemo(() => {
    const ids = new Set<number>()
    for (const fc of [daetGeo, nagaGeo]) {
      if (!fc) continue
      for (const f of fc.features) {
        const id = (f.properties as { barangay_id?: number })?.barangay_id
        if (id) ids.add(id)
      }
    }
    return ids
  }, [daetGeo, nagaGeo])

  const circleFallbacks = barangays.filter((b) => !polygonCoveredIds.has(b.barangay_id))

  const showEmptyOverlay = emptyMessage && barangays.length === 0 && childrenMarkers.length === 0

  return (
    <div className="relative" style={{ height }}>
      <MapContainer center={center} zoom={zoom} className={`h-full w-full rounded-xl border border-border ${onPick ? 'cursor-crosshair [&_.leaflet-container]:cursor-crosshair' : ''}`}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Carto Light">
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* Polygon layers */}
        {daetGeo && (
          <GeoJSON
            key={`daet-${metric}-${barangays.length}`}
            data={daetGeo}
            style={styleFor}
            onEachFeature={(feature: Feature<Geometry>, layer: Layer) => {
              const props = (feature.properties ?? {}) as { barangay_id?: number; barangay_name?: string }
              const bgy = props.barangay_id ? byId.get(props.barangay_id) : null
              const name = bgy?.barangay_name ?? props.barangay_name ?? 'Unknown'
              const html = `<div class="text-sm"><div class="font-semibold">${name}</div><div class="text-xs text-gray-500">Daet</div>${bgy ? `<div class="mt-1">${bgy.label ?? metricHuman(metric)}: <span class="font-semibold">${metricLabel(bgy.value)}</span></div>` : '<div class="mt-1 text-xs text-gray-500">no data</div>'}</div>`
              layer.bindPopup(html)
              if (bgy) layer.bindTooltip(`${name}: ${metricLabel(bgy.value)}`, { sticky: true })
            }}
          />
        )}
        {nagaGeo && (
          <GeoJSON
            key={`naga-${metric}-${barangays.length}`}
            data={nagaGeo}
            style={styleFor}
            onEachFeature={(feature: Feature<Geometry>, layer: Layer) => {
              const props = (feature.properties ?? {}) as { barangay_id?: number; barangay_name?: string }
              const bgy = props.barangay_id ? byId.get(props.barangay_id) : null
              const name = bgy?.barangay_name ?? props.barangay_name ?? 'Unknown'
              const html = `<div class="text-sm"><div class="font-semibold">${name}</div><div class="text-xs text-gray-500">Naga City</div>${bgy ? `<div class="mt-1">${bgy.label ?? metricHuman(metric)}: <span class="font-semibold">${metricLabel(bgy.value)}</span></div>` : '<div class="mt-1 text-xs text-gray-500">no data</div>'}</div>`
              layer.bindPopup(html)
              if (bgy) layer.bindTooltip(`${name}: ${metricLabel(bgy.value)}`, { sticky: true })
            }}
          />
        )}

        {/* CircleMarker fallback for barangays without a polygon */}
        {circleFallbacks.map((b) => (
          <CircleMarker
            key={`bgy-${b.barangay_id}`}
            center={[b.lat, b.lng]}
            radius={10}
            pathOptions={{ color: '#1f2937', weight: 1, fillColor: colorFor(b.value), fillOpacity: 0.85 }}
          >
            <Tooltip sticky>{`${b.barangay_name}: ${metricLabel(b.value)}`}</Tooltip>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{b.barangay_name}</div>
                <div className="text-xs text-gray-500">{b.municipality}</div>
                <div className="mt-1">{b.label ?? metricHuman(metric)}: <span className="font-semibold">{metricLabel(b.value)}</span></div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Child pins, clustered when zoomed out */}
        {childrenMarkers.length > 0 && <ChildMarkers points={childrenMarkers} />}
        {onPick && <PickHandler onPick={onPick} />}
      </MapContainer>

      <Legend metric={metric} maxValue={maxValue} />
      {childrenMarkers.some((c) => c.follow_up !== undefined) && <MarkerLegend />}

      {loadError && (
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow">
          {loadError}
        </div>
      )}

      {showEmptyOverlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-border bg-white/95 px-5 py-3 text-sm text-muted-foreground shadow backdrop-blur">
            {emptyMessage}
          </div>
        </div>
      )}
    </div>
  )
}

function metricHuman(m: Metric): string {
  if (m === 'coverage') return 'Coverage'
  if (m === 'completeness') return 'Completeness'
  if (m === 'child_count') return 'Children'
  return 'Target population'
}

function Legend({ metric, maxValue }: { metric: Metric; maxValue: number }) {
  if (metric === 'target_population' || metric === 'child_count') {
    const label = metric === 'child_count' ? 'Children per barangay' : 'Target population'
    const colors = metric === 'child_count'
      ? ['#dcfce7', '#86efac', '#22c55e', '#047857']
      : ['#e0e7ff', '#a5b4fc', '#6366f1', '#4338ca']
    return (
      <div className="absolute bottom-3 right-3 z-[500] rounded-lg border border-border bg-white/95 p-3 text-xs shadow backdrop-blur">
        <div className="mb-2 font-semibold">{label}</div>
        <div className="flex items-center gap-0.5">
          {colors.map((c, i) => (
            <span key={i} className="h-3 w-6" style={{ background: c }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          <span>0</span>
          <span>{maxValue.toLocaleString()}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="absolute bottom-3 right-3 z-[500] rounded-lg border border-border bg-white/95 p-3 text-xs shadow backdrop-blur">
      <div className="mb-2 font-semibold">{metricHuman(metric)} (%)</div>
      <div className="space-y-1">
        <LegendRow color="#059669" label="≥ 95 — target" />
        <LegendRow color="#65a30d" label="80–94 — on track" />
        <LegendRow color="#eab308" label="60–79 — watch" />
        <LegendRow color="#f97316" label="40–59 — at risk" />
        <LegendRow color="#dc2626" label="< 40 — critical" />
      </div>
    </div>
  )
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-4 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}
// ── Child markers ─────────────────────────────────────────────────────────────────────────────
const FOLLOW_UP_COLOR = { missed: '#C0392B', at_risk: '#B9770E', none: '#03045E' } as const
const markerColor = (c: ChildPoint) => FOLLOW_UP_COLOR[c.follow_up ?? 'none']

/** Groups pins that fall within ~48px of each other at the current zoom into one cluster. */
function ChildMarkers({ points }: { points: ChildPoint[] }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const clusters = useMemo(() => {
    const cells = new Map<string, ChildPoint[]>()
    for (const p of points) {
      const px = map.project([p.lat, p.lng], zoom)
      const key = `${Math.floor(px.x / 48)}:${Math.floor(px.y / 48)}`
      const cell = cells.get(key)
      if (cell) cell.push(p)
      else cells.set(key, [p])
    }
    return [...cells.values()]
  }, [points, zoom, map])

  return (
    <>
      {clusters.map((group) => {
        if (group.length === 1) {
          const c = group[0]
          return (
            <CircleMarker key={`child-${c.child_id}`} center={[c.lat, c.lng]} radius={7}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: markerColor(c), fillOpacity: 0.95 }}>
              <Tooltip>{c.full_name}</Tooltip>
              <Popup><ChildPopup c={c} /></Popup>
            </CircleMarker>
          )
        }
        const lat = group.reduce((t, c) => t + c.lat, 0) / group.length
        const lng = group.reduce((t, c) => t + c.lng, 0) / group.length
        const worst = group.some((c) => c.follow_up === 'missed') ? 'missed' : group.some((c) => c.follow_up === 'at_risk') ? 'at_risk' : 'none'
        return (
          <CircleMarker key={`cluster-${group[0].child_id}`} center={[lat, lng]} radius={Math.min(22, 11 + group.length)}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: FOLLOW_UP_COLOR[worst], fillOpacity: 0.85 }}
            eventHandlers={{ click: () => map.setView([lat, lng], Math.min(map.getMaxZoom() || 18, zoom + 2)) }}>
            <Tooltip permanent direction="center" className="!border-0 !bg-transparent !p-0 !text-xs !font-bold !text-white !shadow-none">{group.length}</Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}

function ChildPopup({ c }: { c: ChildPoint }) {
  return (
    <div className="min-w-48 space-y-1 text-sm">
      <div className="font-semibold text-[#03045E]">{c.full_name}</div>
      {c.child_code !== undefined && <div className="text-xs">Child ID: <span className="font-mono font-semibold">{c.child_code ?? '—'}</span></div>}
      {c.family_serial_no !== undefined && <div className="text-xs">FSN: <span className="font-mono font-semibold">{c.family_serial_no ?? '—'}</span></div>}
      {c.status && <div className="text-xs">Status: {c.status.charAt(0) + c.status.slice(1).toLowerCase()}</div>}
      {c.follow_up && <div className="text-xs font-semibold" style={{ color: markerColor(c) }}>{c.follow_up === 'missed' ? 'Missed vaccine dose' : 'Nutrition at risk'}</div>}
      <div className="text-xs text-gray-500">{c.barangay_name}{c.municipality ? `, ${c.municipality}` : ''}</div>
      {c.href && <Link href={c.href} className="mt-1 inline-block text-xs font-semibold text-[#0077B6] underline">View profile</Link>}
    </div>
  )
}

function PickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function MarkerLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-[500] rounded-lg border border-border bg-white/95 p-3 text-xs shadow backdrop-blur">
      <div className="mb-2 font-semibold">Children</div>
      <div className="space-y-1">
        <LegendDot color={FOLLOW_UP_COLOR.missed} label="Missed vaccine dose" />
        <LegendDot color={FOLLOW_UP_COLOR.at_risk} label="Nutrition at risk" />
        <LegendDot color={FOLLOW_UP_COLOR.none} label="No follow-up flagged" />
        <div className="pt-1 text-[10px] text-gray-500">Numbers are grouped children; click to zoom in.</div>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-3 rounded-full ring-2 ring-white" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}
