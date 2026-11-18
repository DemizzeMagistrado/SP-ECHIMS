import { NextResponse } from 'next/server'
import { householdSession, householdHeaders as headers, householdFailure as fail } from '@/lib/household-access'
type Context = { params: Promise<{ householdId: string }> }
async function idOf(context: Context) {
  const raw = (await context.params).householdId
  const id = Number(raw)
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(id) ? id : null
}
export async function GET(_request: Request, context: Context) {
  try {
    const id = await idOf(context)
    if (!id) return fail('Invalid household ID.',400)
    const auth = await householdSession('view')
    if (auth instanceof NextResponse) return auth
    const household = await auth.db.from('household').select('household_id, household_no, household_address, purok, barangay_id, is_4ps_member, water_source_type, toilet_facility_type, information_revision, information_updated_by, information_updated_at').eq('household_id',id).maybeSingle()
    if (household.error) return fail('Unable to load household.',500)
    if (!household.data) return fail('Household not found in your scope.',404)
    const shared = household.data
    const legacy = await auth.db.from('child_profile_record')
      .select('profile_record_id, child_id, profiling_date, water_source_type, toilet_facility_type, child:child!inner(household_id)')
      .eq('child.household_id',id).order('profile_record_id',{ascending:false}).limit(1000)
    if (legacy.error) return fail('Unable to load historical household details for review.',500)
    const rows = legacy.data ?? []
    const water = [...new Set(rows.map(row=>row.water_source_type?.trim()).filter(Boolean))]
    const toilet = [...new Set(rows.map(row=>row.toilet_facility_type?.trim()).filter(Boolean))]
    return NextResponse.json({currentUserId:auth.user.id, household:shared,
      legacy_review:{records:rows.map(({child: _child,...row})=>row), water_source_values:water, toilet_facility_values:toilet,
        has_conflicts:water.length>1 || toilet.length>1,
        shared_values_differ:water.some(value=>value!==shared.water_source_type) || toilet.some(value=>value!==shared.toilet_facility_type),
        possibly_truncated:rows.length===1000, coverage:'Records visible to your account; no values were migrated automatically.'}}, {headers})
  } catch { return fail('Unable to load household information.',500) }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const id = await idOf(context)
    if (!id) return fail('Invalid household ID.',400)
    const auth = await householdSession('edit')
    if (auth instanceof NextResponse) return auth
    const payload: unknown = await request.json().catch(()=>null)
    if (!payload || typeof payload!=='object' || Array.isArray(payload)) return fail('Invalid request.',400)
    const body = payload as Record<string,unknown>
    if (typeof body.expectedRevision!=='number' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision<0) return fail('A current household revision is required.',400)
    if (!body.changes || typeof body.changes!=='object' || Array.isArray(body.changes)) return fail('Provide household changes.',400)
    const changes=body.changes as Record<string,unknown>
    if (!Object.keys(changes).length || Object.entries(changes).some(([key,value])=>!['water_source_type','toilet_facility_type'].includes(key) || (value!==null && typeof value!=='string') || (typeof value==='string' && value.length>200))) return fail('Only water/toilet details of up to 200 characters are accepted.',400)
    const result=await auth.db.rpc('echims_update_household_information',{p_household_id:id,p_expected_revision:body.expectedRevision,p_changes:changes})
    if(result.error) return fail(result.error.code==='40001'?'Household changed. Refresh and review before saving.':result.error.code==='42501'?'You cannot update this household.':result.error.code==='22023'?'Invalid household information.':'Unable to save household information.',result.error.code==='40001'?409:result.error.code==='42501'?403:result.error.code==='22023'?400:500)
    return NextResponse.json({currentUserId:auth.user.id,household:result.data},{headers})
  } catch { return fail('Unable to update household information.',500) }
}
