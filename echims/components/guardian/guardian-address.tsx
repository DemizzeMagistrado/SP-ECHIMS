'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Field, Input, Select } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { guardianAddress } from '@/lib/guardian/registration'

type Location = { code: string; name: string }
async function locations(url: string): Promise<Location[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const result = await response.json()
  if (!response.ok || !Array.isArray(result.items)) throw new Error(result.error || 'Unable to load locations.')
  return result.items
}
const key = (level: string, parent?: string) => `/api/guardian/locations?level=${level}${parent ? `&parent=${encodeURIComponent(parent)}` : ''}`
export function GuardianAddress({ onChange }: { onChange: (address: string) => void }) {
  const [region, setRegion] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [barangay, setBarangay] = useState('')
  const [detail, setDetail] = useState('')
  const options = { revalidateOnFocus: false, shouldRetryOnError: false }
  const regions = useSWR(key('regions'), locations, options)
  const provinces = useSWR(region ? key('provinces', region) : null, locations, options)
  const noProvinces = Boolean(provinces.data && !provinces.data.length)
  const cityParent = noProvinces || province === '__NONE__' ? region : province
  const cities = useSWR(region && provinces.data && cityParent ? key('cities', cityParent) : null, locations, options)
  const barangays = useSWR(city ? key('barangays', city) : null, locations, options)
  const find = (rows: Location[] | undefined, code: string) => rows?.find(row => row.code === code)?.name
  const address = guardianAddress({ detail, region: find(regions.data, region), province: noProvinces || province === '__NONE__' ? undefined : find(provinces.data, province), city: find(cities.data, city), barangay: find(barangays.data, barangay) })
  useEffect(() => { onChange(address) }, [address, onChange])
  const errors = [regions, provinces, cities, barangays].filter(query => query.error)
  return <fieldset className="space-y-4 rounded-xl border border-brand-line p-4">
    <legend className="px-1 text-sm font-semibold">Address</legend>
    <Field label="Region" required><Select disabled={regions.isLoading} value={region} onChange={e => { setRegion(e.target.value); setProvince(''); setCity(''); setBarangay('') }}><option value="">{regions.isLoading ? 'Loading regions…' : 'Select region'}</option>{regions.data?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</Select></Field>
    {!noProvinces && <Field label="Province" required><Select disabled={!region || provinces.isLoading} value={province} onChange={e => { setProvince(e.target.value); setCity(''); setBarangay('') }}><option value="">{provinces.isLoading ? 'Loading provinces…' : 'Select province'}</option>{provinces.data?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}{provinces.data && <option value="__NONE__">Independent city / no province</option>}</Select></Field>}
    {noProvinces && <p className="text-xs text-brand-muted">This region has no provinces. Select the city or municipality below.</p>}
    <Field label="City / Municipality" required><Select disabled={!cityParent || cities.isLoading || !provinces.data} value={city} onChange={e => { setCity(e.target.value); setBarangay('') }}><option value="">{cities.isLoading ? 'Loading cities…' : 'Select city / municipality'}</option>{cities.data?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</Select></Field>
    <Field label="Barangay" required><Select disabled={!city || barangays.isLoading} value={barangay} onChange={e => setBarangay(e.target.value)}><option value="">{barangays.isLoading ? 'Loading barangays…' : 'Select barangay'}</option>{barangays.data?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</Select></Field>
    <Field label="House / street / purok / landmark" required hint="Enter the details that identify your address within the barangay."><Input autoComplete="street-address" maxLength={150} value={detail} onChange={e => setDetail(e.target.value)} /></Field>
    {address && <p className="break-words rounded-lg bg-brand-ice p-3 text-xs"><strong>Complete address:</strong> {address}</p>}
    {errors.length > 0 && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Unable to load address options. Check your connection.<Button variant="secondary" size="sm" className="mt-2" onClick={() => { for (const query of errors) void query.mutate() }}>Retry locations</Button></div>}
    {cities.data?.length === 0 && <p role="status" className="text-xs text-brand-muted">No cities found under this selection. Check the province or independent-city option.</p>}
  </fieldset>
}
