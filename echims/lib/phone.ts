// Philippine mobile numbers. Stored everywhere as 09XXXXXXXXX (11 digits); the SMS gateway
// format (639XXXXXXXXX) is derived from it when sending (DB: normalize_guardian_mobile).
// Accepts what people type or paste: 09979875431, 9979875431, 639979875431, +639979875431,
// with spaces, dashes, dots or brackets.

/** Typed/pasted text → local digits (starts with 0, at most 11). Used while typing. */
export function toLocalMobileDigits(input: string): string {
  let d = String(input ?? '').replace(/\D/g, '')
  if (d.startsWith('63')) d = '0' + d.slice(2)
  else if (d.startsWith('9')) d = '0' + d
  return d.slice(0, 11)
}

/** Canonical 09XXXXXXXXX, or null when it is not a valid PH mobile number. */
export function normalizePhMobile(input: string | null | undefined): string | null {
  const d = String(input ?? '').trim().replace(/[\s\-().]/g, '')
  if (/^09\d{9}$/.test(d)) return d
  if (/^9\d{9}$/.test(d)) return `0${d}`
  if (/^\+?639\d{9}$/.test(d)) return `0${d.slice(-10)}`
  return null
}

/** 09979875431 → "0997 987 5431" (also formats partial input while typing). */
export function formatPhMobile(input: string | null | undefined): string {
  const d = toLocalMobileDigits(String(input ?? ''))
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(' ')
}

/** SMS gateway format 639XXXXXXXXX, or null. */
export function toSmsGatewayNumber(input: string | null | undefined): string | null {
  const local = normalizePhMobile(input)
  return local ? `63${local.slice(1)}` : null
}

export const MOBILE_HINT = 'e.g. 0917 123 4567'
export const MOBILE_ERROR = 'Enter an 11-digit mobile number that starts with 09, like 0917 123 4567.'
