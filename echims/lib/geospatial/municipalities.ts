// Municipality boundary files for the Child Profiling map, keyed by the municipality's PSGC code
// (first 7 digits of a barangay's psgc_barangay_code). To add a municipality: put its barangay
// polygons in public/geojson/<name>.geojson (each feature with properties.barangay_id and
// barangay_name) and add one line here. A municipality without a file shows an empty state.
export const MUNICIPALITY_GEOJSON: Record<string, string> = {
  '0501603': '/geojson/daet.geojson', // Daet, Camarines Norte
  '0501724': '/geojson/naga.geojson', // Naga City, Camarines Sur
}

export const municipalityCode = (psgcBarangayCode: string | null | undefined) =>
  psgcBarangayCode && /^\d{10}$/.test(psgcBarangayCode) ? psgcBarangayCode.slice(0, 7) : null
