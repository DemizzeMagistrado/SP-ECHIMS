// CP-USR001 — Human-readable display formatters for entity IDs.
//
// The DB keeps simple integer PKs (child_id, household_id, guardian_id). The UI
// should show scannable codes like "CH-2026-00047" that encode registration year
// and are zero-padded for consistency. This is a UI-only concern — API parsers
// still accept both plain numbers and formatted codes (see parseId helpers).
//
// Design:
// - formatChildId: prefers registration year, falls back to short format when
//   no year context is available (e.g. legacy data, abstract widgets).
// - formatHouseholdId: prefers the natural household_no (which may already be
//   barangay-coded), falls back to padded surrogate id.
// - formatGuardianId: simple padded code (guardians are not year-scoped).

export function formatChildId(childId: number, yearSource?: string | null): string {
  const padded = String(childId).padStart(5, '0')
  if (!yearSource) return `CH-${padded}`
  const date = new Date(yearSource)
  if (Number.isNaN(date.getTime())) return `CH-${padded}`
  return `CH-${date.getFullYear()}-${padded}`
}

export function formatHouseholdId(householdId: number, householdNo?: string | null): string {
  if (householdNo && householdNo.trim()) return `HH-${householdNo.trim()}`
  return `HH-${String(householdId).padStart(5, '0')}`
}

export function formatGuardianId(guardianId: number): string {
  return `G-${String(guardianId).padStart(5, '0')}`
}