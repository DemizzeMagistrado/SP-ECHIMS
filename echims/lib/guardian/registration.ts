export const guardianRelationships = ['Mother', 'Father', 'Grandparent', 'Other Relative', 'Legal Guardian'] as const
export function guardianAddress(parts: { detail: string; barangay?: string; city?: string; province?: string; region?: string }) {
  if (!parts.detail.trim() || !parts.barangay || !parts.city || !parts.region) return ''
  return [parts.detail.trim(), parts.barangay, parts.city, parts.province, parts.region].filter(Boolean).join(', ')
}
