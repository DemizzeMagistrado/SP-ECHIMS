import {NextResponse} from 'next/server'
import {householdSession,householdFailure as fail,householdHeaders as headers} from '@/lib/household-access'
export const dynamic='force-dynamic'
export async function GET(request:Request){
 try{
  const auth=await householdSession('view');if(auth instanceof NextResponse)return auth
  const params=new URL(request.url).searchParams,before=params.get('beforeId'),area=params.get('barangayId')
  for(const v of [before,area])if(v!==null && (!/^[1-9]\d*$/.test(v)||!Number.isSafeInteger(Number(v))))return fail('Invalid archive filter.',400)
  const result=await auth.db.rpc('echims_list_age_archived_children',{p_before_id:before?Number(before):null,p_barangay_id:area?Number(area):null})
  if(result.error)return fail(result.error.code==='42501'?'Assigned PHN, RHM or BHW access is required.':'Unable to load age archive.',result.error.code==='42501'?403:500)
  return NextResponse.json(result.data,{headers})
 }catch{return fail('Unable to load age archive.',500)}
}
