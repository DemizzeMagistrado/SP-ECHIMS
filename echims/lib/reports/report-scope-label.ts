export type ReportLocation = {
  barangay_name?: string;
  municipality?: string;
  province?: string;
};
export function reportScopeLabel(
  locations: readonly ReportLocation[] | undefined,
) {
  if (!locations?.length) return "Saved report scope";
  if (locations.length === 1) {
    const l = locations[0];
    return [
      l.barangay_name ? `Barangay: ${l.barangay_name}` : "",
      l.municipality,
      l.province,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const municipalities = new Set(
      locations.map((l) => l.municipality).filter(Boolean),
    ),
    provinces = new Set(locations.map((l) => l.province).filter(Boolean));
  return (
    `Coverage: ${locations.length} barangays` +
    (municipalities.size === 1 ? ` · ${Array.from(municipalities)[0]}` : "") +
    (provinces.size === 1 ? ` · ${Array.from(provinces)[0]}` : "")
  );
}
