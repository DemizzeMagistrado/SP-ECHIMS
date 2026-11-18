import {NextResponse} from 'next/server'
import {householdSession,householdFailure as fail,householdHeaders as headers} from '@/lib/household-access'
import {object,positive,notes,failureStatus} from '@/lib/child-transfer-validation'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET() {
 try {
  const auth=await householdSession('view');if(auth instanceof NextResponse)return auth
  const result=await auth.db.from('child_follow_up_policy').select('rhu_id,enabled,threshold_months,qualifying_encounters,confirmation_notes,confirmed_by,confirmed_at')
  if(result.error)return fail('Unable to load follow-up policy.',500)
  return NextResponse.json({currentUserId:auth.user.id,records:result.data??[],defaultEnabled:false},{headers})
 }catch{return fail('Unable to load follow-up policy.',500)}
}
export async function POST(request:Request) {
 try {
  const auth=await householdSession('edit');if(auth instanceof NextResponse)return auth
  const b:unknown=await request.json().catch(()=>null)
  if(!object(b) || Object.keys(b).some(k=>!['rhuId','enabled','notes'].includes(k)) || !positive(b.rhuId) || typeof b.enabled!=='boolean' || !notes(b.notes))return fail('Provide RHU, enabled state and facility confirmation notes.',400)
  const result=await auth.db.rpc('echims_confirm_follow_up_policy',{p_rhu_id:b.rhuId,p_enabled:b.enabled,p_notes:b.notes})
  if(result.error)return fail('Only an active PHN of this RHU can record facility confirmation.',failureStatus(result.error.code))
  return NextResponse.json({currentUserId:auth.user.id,policy:result.data,message:'Policy saved. Existing scheduled reconciliation will apply it.'},{headers})
 }catch{return fail('Unable to save follow-up policy.',500)}
}
