import {NextResponse} from 'next/server'
import {householdSession,householdFailure as fail,householdHeaders as headers} from '@/lib/household-access'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
 try {
  const auth=await householdSession('view');if(auth instanceof NextResponse)return auth
  const raw=new URL(request.url).searchParams.get('rhuId')
  if(raw!==null && (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))))return fail('Invalid RHU.',400)
  const result=raw===null?await auth.db.rpc('echims_transfer_destinations'):await auth.db.rpc('echims_transfer_barangays',{p_rhu_id:Number(raw)})
  if(result.error)return fail('Unable to load destination RHUs.',result.error.code==='42501'?403:500)
  return NextResponse.json({currentUserId:auth.user.id,records:result.data},{headers})
 }catch{return fail('Unable to load destination RHUs.',500)}
}
