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

  if (level === 'offline-reference') {
    const account = await supabase.from('users').select('account_status').eq('user_id', user.id).maybeSingle()
    if (account.error) return invalid('Unable to verify offline preparation access.', 500)
    if (account.data?.account_status !== 'ACTIVE') return invalid('An active account is required.', 403)
    const rows: unknown[] = []
    let total: number | null = null
    // An exact total and actual page lengths also handle a server row cap below 1,000.
    for (let offset = 0; offset < 100000;) {
      const result = await supabase.from('psgc_location')
        .select('psgc_code,name,geographic_level,region_code,province_code,city_municipality_code', offset === 0 ? {count:'exact'} : {})
        .order('psgc_code', {ascending:true}).range(offset, offset + 999)
      if (result.error) return invalid('Unable to prepare location references.', 500)
      if (offset === 0) {
        total = result.count
        if (total == null) return invalid('Unable to confirm the complete location reference.', 500)
        if (total === 0) return invalid('No PSGC location reference is installed.', 503)
        if (total > 100000) break
      }
      const page = result.data ?? []
      if (!page.length) return invalid('Location preparation was incomplete. Please retry online.', 500)
      rows.push(...page)
      offset += page.length
      if (rows.length === total) return NextResponse.json({currentUserId:user.id, rows}, {headers:{'Cache-Control':'private, no-store'}})
      if (rows.length > total!) return invalid('The location reference changed during preparation. Retry online.', 409)
    }
    return invalid('Location reference exceeds the preparation limit; no partial reference was returned.', 500)
  }
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