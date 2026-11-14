import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/nutritional-assessment/edit
// Body: { assessmentId, weight, height, measurementType, muac, edemaGrade, reason, note }
// Calls edit_nutritional_assessment (migration nut_rev01_01), which checks permission (assigned
// midwife / BNS who recorded it, the RHU's PHN, an administrator), re-evaluates the assessment and
// records a revision. 200: { assessment, revisionNo }. Errors: { error, code?, field? } where field
// names the form field the message belongs under (weight | height | measurementType | muac |
// edemaGrade | reason | note | form).

const REASONS = ['ENTRY_ERROR', 'REMEASURED_SAME_DAY', 'WRONG_POSITION', 'OTHER'] as const
type Field = 'weight' | 'height' | 'measurementType' | 'muac' | 'edemaGrade' | 'reason' | 'note' | 'form'

function fail(error: string, status: number, field: Field = 'form', code?: string) {
  return NextResponse.json({ error, field, ...(code ? { code } : {}) }, { status })
}

/** A positive finite number from a number or a plain decimal string; null when missing. */
function measurement(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return 'invalid'
  if (typeof value !== 'number' && typeof value !== 'string') return 'invalid'
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 'invalid'
}

/** Which field a database message belongs under, so the dialog can show it inline. */
function fieldFor(message: string): Field {
  if (/NUT-R012|MUAC/i.test(message)) return 'muac'
  if (/NUT-R009/.test(message)) return 'reason'
  if (/NUT-R010/.test(message)) return 'note'
  if (/edema/i.test(message)) return 'edemaGrade'
  if (/LENGTH for lying|position/i.test(message) && !/NUT-R004/.test(message)) return 'measurementType'
  if (/NUT-R004|weight|length\/height|Corrected length/i.test(message)) return 'weight'
  return 'form'
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return fail('Sign in again to edit this assessment.', 401)

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return fail('Send the edit as JSON.', 400) }

  const assessmentId = Number(body.assessmentId)
  if (!Number.isSafeInteger(assessmentId) || assessmentId <= 0) return fail('Choose an assessment to edit.', 400)
  const weight = measurement(body.weight)
  if (weight === null || weight === 'invalid') return fail('Enter the weight in kg as a positive number.', 400, 'weight')
  const height = measurement(body.height)
  if (height === null || height === 'invalid') return fail('Enter the length or height in cm as a positive number.', 400, 'height')
  const muac = measurement(body.muac)
  if (muac === 'invalid') return fail('Enter MUAC in cm as a positive number, or leave it empty.', 400, 'muac')
  const measurementType = body.measurementType
  if (measurementType !== 'LENGTH' && measurementType !== 'HEIGHT') return fail('Choose how it was measured: length (lying down) or height (standing).', 400, 'measurementType')
  const edemaGrade = Number(body.edemaGrade)
  if (!Number.isInteger(edemaGrade) || edemaGrade < 0 || edemaGrade > 3) return fail('Choose the bilateral pitting edema grade.', 400, 'edemaGrade')
  const reason = body.reason
  if (typeof reason !== 'string' || !(REASONS as readonly string[]).includes(reason)) return fail('Choose a reason for the change.', 400, 'reason')
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  if (note && note.length > 500) return fail('Keep the note to 500 characters or fewer.', 400, 'note')
  if (reason === 'OTHER' && !note) return fail('Add a note explaining the change.', 400, 'note')

  const { data, error } = await supabase.rpc('edit_nutritional_assessment', {
    p_assessment_id: assessmentId,
    p_weight: weight,
    p_height: height,
    p_measurement_type: measurementType,
    p_muac: muac,
    p_edema_grade: edemaGrade,
    p_reason: reason,
    p_note: note,
  })
  if (error) {
    // The RPC does not exist until migration nut_rev01_01 is applied.
    if (error.code === 'PGRST202' || error.code === '42883') {
      return fail('Editing measurements is not available yet: the database update for edit history has not been applied.', 503)
    }
    const message = error.message || 'Unable to save the changes.'
    const code = /NUT-R\d+/.exec(message)?.[0]
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400
    return fail(message, status, fieldFor(message), code)
  }
  const result = data as { assessment: unknown; revision_no: number }
  return NextResponse.json({ assessment: result.assessment, revisionNo: result.revision_no })
}
