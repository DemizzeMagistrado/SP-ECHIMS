export function guardianDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—'
  return new Date(value + 'T00:00:00Z').toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
  })
}

export function guardianLabel(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/^./, first => first.toUpperCase()) : '—'
}
