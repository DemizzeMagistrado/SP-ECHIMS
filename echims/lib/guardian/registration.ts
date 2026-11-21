export const guardianRelationships = ['Mother', 'Father', 'Grandparent', 'Other Relative', 'Legal Guardian'] as const
export function guardianAddress(parts: { detail: string; barangay?: string; city?: string; province?: string; region?: string }) {
  if (!parts.detail.trim() || !parts.barangay || !parts.city || !parts.region) return ''
  return [parts.detail.trim(), parts.barangay, parts.city, parts.province, parts.region].filter(Boolean).join(', ')
}

export function guardianPhone(value: string): string | null {
  if (!/^[+0-9()\s-]+$/.test(value)) return null
  const digits = value.replace(/\D/g, '')
  if (/^09\d{9}$/.test(digits)) return '+63' + digits.slice(1)
  return /^639\d{9}$/.test(digits) ? '+' + digits : null
}
