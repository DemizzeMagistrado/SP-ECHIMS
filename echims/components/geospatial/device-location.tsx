'use client'

// Device geolocation for household map locations (registration, child profile, Map tab). Reads the
// browser's location once, never watches it. Every failure gets a plain message; the caller keeps
// its manual path (the Map tab's tap-to-pin) available.

import { useState } from 'react'
import { LocateFixed, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type DeviceCoords = { latitude: number; longitude: number; accuracy: number }

const HINT = 'You can still pin it by tapping the map on Child Profiling › Map.'

/** One reading of the device's location, or an Error whose message can be shown as is. */
export function getDeviceLocation(): Promise<DeviceCoords> {
  if (typeof window === 'undefined' || !window.isSecureContext)
    return Promise.reject(new Error(`Location only works on a secure page (HTTPS or localhost). ${HINT}`))
  if (!('geolocation' in navigator))
    return Promise.reject(new Error(`This browser cannot share its location. ${HINT}`))
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(
        e.code === e.PERMISSION_DENIED ? `Location permission was denied. Allow location for this site in the browser settings and try again. ${HINT}`
          : e.code === e.TIMEOUT ? `Getting your location took too long. Try again, ideally outdoors or near a window. ${HINT}`
          : `Your location is unavailable right now (no GPS or network fix). Try again. ${HINT}`,
      )),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  })
}

export const formatCoords = (c: { latitude: number; longitude: number; accuracy?: number }) =>
  `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}${c.accuracy ? ` (± ${Math.round(c.accuracy)} m)` : ''}`

/** Button that captures the device's location, then shows the coordinates so they can be checked. */
export function DeviceLocationField({ value, onChange, label = 'Enable location', disabled }: {
  value: DeviceCoords | null
  onChange: (value: DeviceCoords | null) => void
  label?: string
  disabled?: boolean
}) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  async function locate() {
    setLocating(true); setError('')
    try { onChange(await getDeviceLocation()) } catch (e) { setError(e instanceof Error ? e.message : 'Your location could not be read.') } finally { setLocating(false) }
  }
  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-line bg-brand-ice px-3 py-2 text-sm text-brand-navy">
          <LocateFixed size={16} aria-hidden="true" className="shrink-0" />
          <span>Captured: <span className="font-mono">{formatCoords(value)}</span></span>
          <Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={disabled || locating} onClick={() => void locate()}>Capture again</Button>
          <Button type="button" variant="ghost" size="sm" aria-label="Clear the captured location" disabled={disabled} onClick={() => onChange(null)}><X size={14} aria-hidden="true" /></Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" loading={locating} disabled={disabled} onClick={() => void locate()}>
          <LocateFixed size={16} aria-hidden="true" />{locating ? 'Getting your location…' : label}
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-severe">{error}</p>}
    </div>
  )
}

/** Child profile: a household with no map location can take this device's location (checked, then saved). */
export function HouseholdLocationCapture({ householdId, onSaved }: { householdId: number; onSaved: () => void }) {
  const [coords, setCoords] = useState<DeviceCoords | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (!coords) return
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/households/location', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, latitude: coords.latitude, longitude: coords.longitude }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'The location was not saved. Try again.')
      setCoords(null)
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'The location was not saved.') } finally { setSaving(false) }
  }
  return (
    <div className="space-y-2">
      <DeviceLocationField value={coords} onChange={(c) => { setCoords(c); setError('') }} label="Use my location" disabled={saving} />
      {coords && <Button type="button" size="sm" loading={saving} onClick={() => void save()}>Save this location</Button>}
      {error && <p role="alert" className="text-sm text-severe">{error}</p>}
    </div>
  )
}
