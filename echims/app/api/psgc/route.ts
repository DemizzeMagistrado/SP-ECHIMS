// CP-USR002 — PSGC API wrapper.
// GET /api/psgc?level=regions
// GET /api/psgc?level=provinces&parent={regionCode}
// GET /api/psgc?level=cities&parent={provinceCode OR regionCode-for-NCR}
// GET /api/psgc?level=barangays&parent={cityMunicipalityCode}
//
// Reads from public.psgc_location (hierarchical).
// Flat route (no [param] folder) per the project's URL preference.
//
// NCR note: Metro Manila has no provinces — its cities (Makati, Caloocan, etc.)
// sit DIRECTLY under the region. For `level=cities`, we accept EITHER a
// province code OR a region code as `parent`, so the picker can skip the
// province step for NCR (or any future province-less region).
//
// Response shape (consistent across levels):
//   { items: [{ code: string, name: string }, ...] }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
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

    case 'cities': {
      if (!parent) return invalid('parent (provinceCode or regionCode) is required for cities.')
      query = query.in('geographic_level', ['CITY', 'MUNICIPALITY', 'SUBMUNICIPALITY'])
      // NCR / province-less regions: parent is the region's own psgc_code
      // (ends in '0000000'). We detect that pattern and query by region_code
      // + province_code IS NULL, which is how NCR cities are stored.
      const looksLikeRegion = /^\d{2}00000000$/.test(parent)
      if (looksLikeRegion) {
        query = query.eq('region_code', parent).is('province_code', null)
      } else {
        query = query.eq('province_code', parent)
      }
      break
    }

    case 'barangays':
      if (!parent) return invalid('parent (cityMunicipalityCode) is required for barangays.')
      query = query.eq('geographic_level', 'BARANGAY').eq('city_municipality_code', parent)
      break

    default:
      return invalid('level must be one of: regions, provinces, cities, barangays.')
  }

  const { data, error } = await query
  if (error) return invalid(`Unable to load ${level}. ${error.message ?? ''}`.trim(), 500)

  const items = (data ?? []).map((row) => ({ code: row.psgc_code, name: row.name }))
  return NextResponse.json({ items })
}