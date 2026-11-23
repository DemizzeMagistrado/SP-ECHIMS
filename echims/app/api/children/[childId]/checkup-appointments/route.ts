import { NextResponse } from 'next/server'
import { householdSession, householdFailure as fail, householdHeaders as headers } from '@/lib/household-access'
import { childProgramEligibility, manilaDate } from '@/lib/child-program-eligibility'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = {params: Promise<{childId: string}>}
const missingSchema = (code: string) => ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)
const checkupSetupError = 'Checkup database setup is incomplete. Ask your administrator to check the checkup migration.'
async function idOf(context: Context) {
  const raw = (await context.params).childId
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null
}
export async function GET(request: Request, context: Context) {
  try {
    const id = await idOf(context)
    if (!id) return fail('Invalid child ID.',400)
    const params = new URL(request.url).searchParams
    const suggestions = params.get('suggestions')==='true'
    const auth = await householdSession(suggestions?'edit':'view')
    if (auth instanceof NextResponse) return auth
    const child = await auth.db.from('child').select('child_id,date_of_birth,status').eq('child_id',id).maybeSingle()
    if (child.error) return fail('Unable to load child.',500)
    if (!child.data) return fail('Child not found or access denied.',404)
    const childRecord = child.data
    if (suggestions) {
      const result = await auth.db.rpc('echims_checkup_date_suggestions',{p_child_id:id})
      if (result.error) return fail(missingSchema(result.error.code) ? checkupSetupError : 'Unable to suggest dates for this child.',result.error.code==='42501'?403:500)
      return NextResponse.json({currentUserId:auth.user.id,childId:id,suggestions:result.data},{headers})
    }
    const cursor = params.get('beforeId')
    if (cursor!==null && (!/^[1-9]\d*$/.test(cursor) || !Number.isSafeInteger(Number(cursor)))) return fail('Invalid appointment cursor.',400)
    let query = auth.db.from('child_checkup_appointment').select('*').eq('child_id',id).order('appointment_id',{ascending:false}).limit(51)
    if (cursor) query=query.lt('appointment_id',Number(cursor))
    const result=await query
    if (result.error) return fail(missingSchema(result.error.code) ? checkupSetupError : 'Unable to load checkup appointments.',500)
    const today=manilaDate()
    const underFive=childProgramEligibility(childRecord.date_of_birth,childRecord.status,today).underFive===true
    const rows=result.data ?? []
    const records=rows.slice(0,50).map(row=>({...row,isDefaulter:underFive && childRecord.status==='ACTIVE' && row.status==='SCHEDULED' && row.scheduled_on<today}))
    return NextResponse.json({currentUserId:auth.user.id,childId:id,evaluatedOn:today,records,nextBeforeId:rows.length>50?rows[49].appointment_id:null},{headers})
  } catch { return fail('Unable to load checkup appointments.',500) }
}
export async function POST(request: Request, context: Context) {
  try {
    const id=await idOf(context)
    if (!id) return fail('Invalid child ID.',400)
    const auth=await householdSession('edit')
    if (auth instanceof NextResponse) return auth
    const input:unknown=await request.json().catch(()=>null)
    if (!input || typeof input!=='object' || Array.isArray(input)) return fail('Invalid appointment request.',400)
    const b=input as Record<string,unknown>
    const integer=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v) && v>0
    if (Object.keys(b).some(k=>!['requestId','action','appointmentId','expectedRevision','date','notes'].includes(k)) || typeof b.requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.requestId) || !['CREATE','RESCHEDULE','COMPLETE','CANCEL'].includes(String(b.action)) || typeof b.notes!=='string' || !b.notes.trim() || b.notes.length>2000) return fail('Provide an action, request ID and notes (up to 2000 characters).',400)
    if (b.action==='CREATE' ? (b.appointmentId!=null || b.expectedRevision!=null) : (!integer(b.appointmentId) || !integer(b.expectedRevision))) return fail('Use the current appointment ID and revision for changes.',400)
    if (b.action==='CANCEL' ? b.date!=null : (typeof b.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date))) return fail('Provide a valid date; cancellation takes no date.',400)
    // Existing child SELECT policy is preserved before privileged RPC scope checks.
    const child=await auth.db.from('child').select('child_id').eq('child_id',id).maybeSingle()
    if (child.error) return fail('Unable to load child.',500)
    if (!child.data) return fail('Child not found or access denied.',404)
    const result=await auth.db.rpc('echims_manage_checkup_appointment',{p_child_id:id,p_request_id:b.requestId,p_action:b.action,p_appointment_id:b.appointmentId??null,p_expected_revision:b.expectedRevision??null,p_date:b.date??null,p_notes:b.notes})
    if (result.error) {
      const code=result.error.code
      if (missingSchema(code)) return fail(checkupSetupError,500)
      return fail(code==='42501'?'An assigned worker is required.':['40001','23505'].includes(code)?'The appointment or request changed. Refresh and review before retrying.':['22023','22007','22008','23514'].includes(code)?'Invalid appointment date, state or details.':'Unable to save appointment.',code==='42501'?403:['40001','23505'].includes(code)?409:['22023','22007','22008','23514'].includes(code)?400:500)
    }
    return NextResponse.json({currentUserId:auth.user.id,result:result.data,message:'Appointment saved. Relevant follow-up notifications were reconciled.'},{headers})
  } catch { return fail('Unable to save appointment. Retry using the same request ID and unchanged details.',500) }
}
