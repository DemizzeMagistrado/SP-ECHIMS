// Medical history: catalog conditions (codes) + "Other" free text + notes.
// Saved in child_profile_record.medical_history_structured, shaped for the DB validation trigger:
//   { state: 'REPORTED' | 'NONE_REPORTED' | 'UNKNOWN', condition_codes: string[], other_details, notes }
// Form state keeps plain strings (offline drafts store the form as-is):
//   medical_codes  "ASTHMA|DENGUE"     medical_others  "Kawasaki disease; Mumps"

export type Condition = { code: string; label: string }
export type MedicalHistory = {
  state: 'REPORTED' | 'NONE_REPORTED' | 'UNKNOWN'
  condition_codes: string[]
  other_details: string | null
  notes: string | null
}

export function splitOtherConditions(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(';')) {
    const label = part.trim().replace(/\s+/g, ' ')
    if (label && label.length <= 120 && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase())
      out.push(label)
    }
  }
  return out
}

export const splitCodes = (value: unknown) => String(value ?? '').split('|').filter(Boolean)

/** Form strings → structured value. null when nothing was entered (leave the record untouched). */
export function toStructured(form: Record<string, string | boolean>): MedicalHistory | null {
  const codes = splitCodes(form.medical_codes)
  const others = splitOtherConditions(String(form.medical_others ?? ''))
  const notes = String(form.medical_history_notes ?? '').trim() || null
  if (codes.length || others.length) return { state: 'REPORTED', condition_codes: codes, other_details: others.join('; ') || null, notes }
  if (form.medical_none_reported) return { state: 'NONE_REPORTED', condition_codes: [], other_details: null, notes }
  if (notes) return { state: 'UNKNOWN', condition_codes: [], other_details: null, notes }
  return null
}

/** Saved value → form strings. Older records only have free text; it goes to the notes. */
export function fromStructured(value: unknown, legacyText: unknown): Record<string, string | boolean> {
  const v = value && typeof value === 'object' ? (value as Partial<MedicalHistory>) : null
  if (!v) return { medical_codes: '', medical_others: '', medical_none_reported: false, medical_history_notes: String(legacyText ?? '') }
  return {
    medical_codes: (v.condition_codes ?? []).join('|'),
    medical_others: v.other_details ?? '',
    medical_none_reported: v.state === 'NONE_REPORTED',
    medical_history_notes: v.notes ?? '',
  }
}

/** Readable text, also saved to the legacy medical_history column used by reports. */
export function describeMedicalHistory(value: MedicalHistory | null, conditions: Condition[]): string {
  if (!value) return ''
  const label = (code: string) => conditions.find((c) => c.code === code)?.label ?? code.replace(/_/g, ' ').toLowerCase()
  const parts = [...value.condition_codes.map(label), ...splitOtherConditions(value.other_details ?? '')]
  const head = value.state === 'NONE_REPORTED' ? 'No known illnesses' : parts.join('; ')
  return [head, value.notes].filter(Boolean).join('. ')
}
