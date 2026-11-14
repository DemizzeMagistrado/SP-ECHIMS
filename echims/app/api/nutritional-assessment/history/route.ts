import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/nutritional-assessment/history?childId=123
// That child's assessments (newest first), each with its recorded edits (newest first).
// RLS limits both to what the signed-in user may see. Before migration nut_rev01_01 is applied the
// revision table does not exist: assessments still come back, with revisions: [] and
// revisionsAvailable: false.
// 200: { assessments: [{ assessment_id, assessment_date, weight, height, measurement_type, muac,
//        edema_grade, nutritional_status, evaluation_status, engine_version, revision_count?,
//        updated_at?, revisions: Revision[] }], revisionsAvailable: boolean }
// Revision: { revision_no, changed_fields, old_values, new_values, reason, note, editor_name,
//             editor_role, edited_at }

const BASE = 'assessment_id, assessment_date, weight, height, measurement_type, muac, edema_grade, nutritional_status, evaluation_status, engine_version, created_at'
const REVISIONS = 'revision_count, updated_at, revisions:nutritional_assessment_revision(revision_no, changed_fields, old_values, new_values, reason, note, editor_name, editor_role, edited_at)'

type Revision = { revision_no: number; [key: string]: unknown }
type Row = { assessment_id: number; revisions?: Revision[]; [key: string]: unknown }

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sign in again to view assessment history.' }, { status: 401 })

  const childId = Number(new URL(request.url).searchParams.get('childId'))
  if (!Number.isSafeInteger(childId) || childId <= 0) return NextResponse.json({ error: 'Choose a child.' }, { status: 400 })

  const query = (fields: string) => supabase.from('nutritional_assessment').select(fields)
    .eq('child_id', childId)
    .order('assessment_date', { ascending: false })
    .order('assessment_id', { ascending: false })
  let revisionsAvailable = true
  let result = await query(`${BASE}, ${REVISIONS}`)
  // Missing relationship / column / table: the migration is not applied yet.
  if (result.error && ['PGRST200', 'PGRST204', '42703', '42P01'].includes(result.error.code ?? '')) {
    revisionsAvailable = false
    result = await query(BASE)
  }
  if (result.error) {
    console.error('Nutrition history GET:', result.error)
    return NextResponse.json({ error: 'Unable to load the assessment history.' }, { status: 500 })
  }
  const assessments = ((result.data ?? []) as unknown as Row[]).map((row) => ({
    ...row,
    revisions: [...(row.revisions ?? [])].sort((a, b) => b.revision_no - a.revision_no),
  }))
  return NextResponse.json({ assessments, revisionsAvailable })
}
