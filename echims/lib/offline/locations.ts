export type LocationReference = {
  psgc_code: string; name: string; geographic_level: string;
  region_code: string | null; province_code: string | null;
  city_municipality_code: string | null;
}
// Match the existing authenticated PSGC endpoint, including province-less NCR.
export function selectLocationItems(rows: LocationReference[], level: string | null, parent: string | null) {
  if (!['regions', 'provinces', 'cities', 'barangays'].includes(level ?? '')) return null
  if (level !== 'regions' && !parent) return null
  return rows.filter(row => {
    if (level === 'regions') return row.geographic_level === 'REGION'
    if (level === 'provinces') return row.geographic_level === 'PROVINCE' && row.region_code === parent
    if (level === 'barangays') return row.geographic_level === 'BARANGAY' && row.city_municipality_code === parent
    return ['CITY', 'MUNICIPALITY', 'SUBMUNICIPALITY'].includes(row.geographic_level)
      && (/^\d{2}00000000$/.test(parent!) ? row.region_code === parent && row.province_code === null : row.province_code === parent)
  }).map(row => ({code: row.psgc_code, name: row.name}))
    .sort((a,b) => a.name.localeCompare(b.name))
}
