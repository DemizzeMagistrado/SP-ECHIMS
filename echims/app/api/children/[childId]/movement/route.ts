import {NextResponse} from 'next/server'
import {householdSession,householdFailure as fail,householdHeaders as headers} from '@/lib/household-access'
export const dynamic='force-dynamic'
export const runtime='nodejs'
type Context={params:Promise<{childId:string}>}
export async function GET(_request:Request,context:Context){
 try{
  const raw=(await context.params).childId,id=Number(raw)
  if(!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id))return fail('Invalid numeric child ID.',400)
  const auth=await householdSession('view');if(auth instanceof NextResponse)return auth
  const child=await auth.db.from('child').select('child_id').eq('child_id',id).maybeSingle()
  if(child.error)return fail('Unable to check child access.',500);if(!child.data)return fail('Child not found or access denied.',404)
  const query=()=>auth.db.from('child_movement').select('movement_id,movement_type,movement_date,status,reason,previous_address,new_address,remarks,recorded_at,from_household_id,to_household_id').eq('child_id',id).order('movement_date',{ascending:false}).order('movement_id',{ascending:false})
  const records:NonNullable<Awaited<ReturnType<typeof query>>['data']>=[]
  for(let offset=0;;offset+=1000){const result=await query().range(offset,offset+999);if(result.error)return fail('Unable to load movement records. Check the server database configuration.',500);const rows=result.data??[];records.push(...rows);if(rows.length<1000)break}
  return NextResponse.json(records,{headers})
 }catch{return fail('Unable to load movement history.',500)}
}
export async function POST(){return fail('Use /api/child-transfers to request movement. Registry status cannot be selected manually.',410)}
