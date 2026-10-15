'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// CP-USR002 — Philippine Address Picker (4-level cascading dropdowns).
//
// Reads from Supabase (public.psgc_location) via /api/psgc. Lazy-loads
// each level only when its parent is picked.
//
// NCR exception: Metro Manila has no provinces — its cities (Makati,
// Caloocan, etc.) sit directly under the region. When a region has 0
// provinces, we auto-hide the province dropdown and query cities with
// parent = regionCode (the API handles both parent shapes).
//
// Storage contract (unchanged):
//   - onChange(fullLabel) fires with the comma-joined label when every
//     required level is picked. For NCR that's "Barangay, City, Region"
//     (no province segment). For other regions it's the full 4-level.
//   - onChange('') fires when the cascade is incomplete.
//
// Dep-array safety: the output label is computed as a derived value on
// each render, then the single useEffect depends ONLY on that computed
// string — a single, always-defined slot — so React can never see a
// dep array size change (which Turbopack's HMR has flagged in dev).

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { MapPin, ChevronDown, Loader2, AlertCircle } from 'lucide-react'

type Item = { code: string; name: string }

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'PSGC load failed.')
  return d as { items: Item[] }
}

type Props = {
  currentValue?: string
  onChange: (fullLabel: string) => void
  label?: string
  required?: boolean
}

export function PhilippineAddressPicker({
  currentValue,
  onChange,
  label = 'Birth place',
  required = false,
}: Props) {
  const [regionCode, setRegionCode] = useState('')
  const [provinceCode, setProvinceCode] = useState('')
  const [cityCode, setCityCode] = useState('')
  const [barangayCode, setBarangayCode] = useState('')

  // ─── Lazy-load each level via /api/psgc ───────────────────────────────
  const regionsSWR = useSWR('/api/psgc?level=regions', fetcher)
  const provincesSWR = useSWR(
    regionCode ? `/api/psgc?level=provinces&parent=${encodeURIComponent(regionCode)}` : null,
    fetcher,
  )

  // "Has provinces" flag — determines whether the province dropdown is shown
  // and whether cities should be queried by province OR region (NCR style).
  const hasProvinces = (provincesSWR.data?.items.length ?? 0) > 0
  const provincesLoaded = !!provincesSWR.data && !provincesSWR.isLoading

  const cityParent = hasProvinces ? provinceCode : regionCode
  const canFetchCities = hasProvinces ? !!provinceCode : (!!regionCode && provincesLoaded)
  const citiesSWR = useSWR(
    canFetchCities ? `/api/psgc?level=cities&parent=${encodeURIComponent(cityParent)}` : null,
    fetcher,
  )

  const barangaysSWR = useSWR(
    cityCode ? `/api/psgc?level=barangays&parent=${encodeURIComponent(cityCode)}` : null,
    fetcher,
  )

  // ─── Reset downstream state when upstream changes ────────────────────
  useEffect(() => { setProvinceCode(''); setCityCode(''); setBarangayCode('') }, [regionCode])
  useEffect(() => { setCityCode(''); setBarangayCode('') }, [provinceCode])
  useEffect(() => { setBarangayCode('') }, [cityCode])

  // ─── Compute the composed label as a derived value (every render) ────
  // Single string output; useEffect below only reacts to this string, so
  // the useEffect dep array is always [outputLabel] — stable size of 1.
  const outputLabel = (() => {
    if (!regionCode || !cityCode || !barangayCode) return ''
    if (hasProvinces && !provinceCode) return ''

    const regionName = regionsSWR.data?.items.find((r) => r.code === regionCode)?.name
    const provinceName = provincesSWR.data?.items.find((p) => p.code === provinceCode)?.name
    const cityName = citiesSWR.data?.items.find((c) => c.code === cityCode)?.name
    const barangayName = barangaysSWR.data?.items.find((b) => b.code === barangayCode)?.name

    if (!regionName || !cityName || !barangayName) return ''
    if (hasProvinces && !provinceName) return ''

    const parts = hasProvinces
      ? [barangayName, cityName, provinceName, regionName]
      : [barangayName, cityName, regionName]
    return parts.filter(Boolean).join(', ')
  })()

  useEffect(() => {
    onChange(outputLabel)
    // onChange is a callback prop — intentionally excluded so parent re-renders
    // don't re-trigger. The outputLabel string is the only meaningful trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputLabel])

  const hasCurrent = !!currentValue?.trim()

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1 text-sm font-semibold text-foreground">
        <MapPin size={13} /> {label} {required && <span className="text-rose-600">*</span>}
      </label>

      {/* Show existing free-text value in edit mode */}
      {hasCurrent && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <strong>Current:</strong> {currentValue}
          <span className="ml-1 text-sky-700">— pick below to replace, or leave blank to keep.</span>
        </div>
      )}

      {/* Region */}
      <CascadeSelect
        value={regionCode}
        onChange={setRegionCode}
        placeholder={regionsSWR.isLoading ? 'Loading regions…' : 'Region'}
        disabled={regionsSWR.isLoading}
        error={regionsSWR.error?.message}
        options={regionsSWR.data?.items ?? []}
      />

      {/* Province — hidden when region has no provinces (NCR, etc.) */}
      {regionCode && provincesLoaded && !hasProvinces ? (
        <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-800">
          This region has no provinces — pick a City / Municipality below.
        </div>
      ) : (
        <CascadeSelect
          value={provinceCode}
          onChange={setProvinceCode}
          placeholder={!regionCode ? 'Pick a region first' : provincesSWR.isLoading ? 'Loading provinces…' : 'Province'}
          disabled={!regionCode || provincesSWR.isLoading}
          error={provincesSWR.error?.message}
          options={provincesSWR.data?.items ?? []}
        />
      )}

      {/* City / Municipality */}
      <CascadeSelect
        value={cityCode}
        onChange={setCityCode}
        placeholder={
          !canFetchCities
            ? (hasProvinces ? 'Pick a province first' : 'Pick a region first')
            : citiesSWR.isLoading
              ? 'Loading cities…'
              : 'City / Municipality'
        }
        disabled={!canFetchCities || citiesSWR.isLoading}
        error={citiesSWR.error?.message}
        options={citiesSWR.data?.items ?? []}
      />

      {/* Barangay */}
      <CascadeSelect
        value={barangayCode}
        onChange={setBarangayCode}
        placeholder={!cityCode ? 'Pick a city first' : barangaysSWR.isLoading ? 'Loading barangays…' : 'Barangay'}
        disabled={!cityCode || barangaysSWR.isLoading}
        error={barangaysSWR.error?.message}
        options={barangaysSWR.data?.items ?? []}
      />
    </div>
  )
}

function CascadeSelect({
  value, onChange, placeholder, disabled, error, options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled: boolean
  error?: string
  options: Item[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-border bg-white px-3 py-2 pr-9 text-sm outline-none focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>{o.name}</option>
        ))}
      </select>
      {disabled && !error ? (
        <Loader2 size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      )}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-rose-700">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  )
}