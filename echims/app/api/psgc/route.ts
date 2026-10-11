// CP-USR002 — PSGC API wrapper.
// GET /api/psgc?level=regions
// GET /api/psgc?level=provinces&parent={regionCode}
// GET /api/psgc?level=cities&parent={provinceCode}
// GET /api/psgc?level=barangays&parent={cityMunicipalityCode}
//
// Reads from the existing public.psgc_location table (21k+ rows, hierarchical).
// Flat route (no [param] folder) per the project's URL preference.
//
// Response shape (consistent across levels):
//   { items: [{ code: string, name: string }, ...] }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  // Any authenticated user can read PSGC — it's public reference data.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before loading address data.', 401)

  const url = new URL(request.url)
  const level = url.searchParams.get('level')?.toLowerCase()
  const parent = url.searchParams.get('parent')

  if (!level) return invalid('level query param is required (regions|provinces|cities|barangays).')

  let query = supabase.from('psgc_location')
    .select('psgc_code, name')
    .order('name', { ascending: true })

  switch (level) {
    case 'regions':
      query = query.eq('geographic_level', 'REGION')
      break
    case 'provinces':
      if (!parent) return invalid('parent (regionCode) is required for provinces.')
      query = query.eq('geographic_level', 'PROVINCE').eq('region_code', parent)
      break
    case 'cities':
      if (!parent) return invalid('parent (provinceCode) is required for cities.')
      // Include CITY + MUNICIPALITY + SUBMUNICIPALITY under the same picker level
      // so the UI reads naturally as "City/Municipality".
      query = query
        .in('geographic_level', ['CITY', 'MUNICIPALITY', 'SUBMUNICIPALITY'])
        .eq('province_code', parent)
      break
    case 'barangays':
      if (!parent) return invalid('parent (cityMunicipalityCode) is required for barangays.')
      query = query.eq('geographic_level', 'BARANGAY').eq('city_municipality_code', parent)
      break
    default:
      return invalid('level must be one of: regions, provinces, cities, barangays.')
  }

  const { data, error } = await query
  if (error) return invalid(`Unable to load ${level}. ${error.message ?? ''}`.trim(), 500)

  // Flatten to a consistent { code, name } shape so the picker doesn't care
  // which level it's rendering.
  const items = (data ?? []).map((row) => ({ code: row.psgc_code, name: row.name }))

  return NextResponse.json({ items })
}