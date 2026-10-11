'use client'

// CP-USR002 v2 — Philippine Address Picker (4-level cascading dropdowns).
//
// v2 switch: now reads from our own Supabase table (public.psgc_location)
// via /api/psgc, instead of the external psgc.gitlab.io API. Same cascade UX,
// same output format — the data source change is transparent to the parent.
//
// Reusable: currently wired into child-form-modal.tsx for birth place, but
// can be dropped into any form that needs a structured PH address picker.
//
// Storage contract:
//   - onChange(fullLabel) fires with "Barangay, City, Province, Region"
//     any time all 4 dropdowns are filled.
//   - If user hasn't completed the cascade, onChange fires with '' (so the
//     parent form can require it or keep the existing value).

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
  const citiesSWR = useSWR(
    provinceCode ? `/api/psgc?level=cities&parent=${encodeURIComponent(provinceCode)}` : null,
    fetcher,
  )
  const barangaysSWR = useSWR(
    cityCode ? `/api/psgc?level=barangays&parent=${encodeURIComponent(cityCode)}` : null,
    fetcher,
  )

  // ─── Reset downstream when upstream changes ──────────────────────────
  useEffect(() => {
    setProvinceCode('')
    setCityCode('')
    setBarangayCode('')
  }, [regionCode])
  useEffect(() => {
    setCityCode('')
    setBarangayCode('')
  }, [provinceCode])
  useEffect(() => {
    setBarangayCode('')
  }, [cityCode])

  // ─── Emit full label whenever all 4 are picked ───────────────────────
  useEffect(() => {
    if (!regionCode || !provinceCode || !cityCode || !barangayCode) {
      onChange('')
      return
    }
    const regionName = regionsSWR.data?.items.find((r) => r.code === regionCode)?.name ?? ''
    const provinceName = provincesSWR.data?.items.find((p) => p.code === provinceCode)?.name ?? ''
    const cityName = citiesSWR.data?.items.find((c) => c.code === cityCode)?.name ?? ''
    const barangayName = barangaysSWR.data?.items.find((b) => b.code === barangayCode)?.name ?? ''
    if (!barangayName || !cityName || !provinceName || !regionName) return
    onChange(`${barangayName}, ${cityName}, ${provinceName}, ${regionName}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCode, provinceCode, cityCode, barangayCode, regionsSWR.data, provincesSWR.data, citiesSWR.data, barangaysSWR.data])

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

      {/* Province */}
      <CascadeSelect
        value={provinceCode}
        onChange={setProvinceCode}
        placeholder={!regionCode ? 'Pick a region first' : provincesSWR.isLoading ? 'Loading provinces…' : 'Province'}
        disabled={!regionCode || provincesSWR.isLoading}
        error={provincesSWR.error?.message}
        options={provincesSWR.data?.items ?? []}
      />

      {/* City / Municipality */}
      <CascadeSelect
        value={cityCode}
        onChange={setCityCode}
        placeholder={!provinceCode ? 'Pick a province first' : citiesSWR.isLoading ? 'Loading cities…' : 'City / Municipality'}
        disabled={!provinceCode || citiesSWR.isLoading}
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