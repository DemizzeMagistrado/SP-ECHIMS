import {NextResponse} from 'next/server'
import {householdSession,householdHeaders as headers,householdFailure as fail} from '@/lib/household-access'
import {object,positive,notes,uuid,failureStatus} from '@/lib/child-transfer-validation'
export async function POST(request:Request,context:{params:Promise<{transferId:string}>}){try{
 const raw=(await context.params).transferId,id=Number(raw);if(!/^[1-9]\d*$/.test(raw) || !positive(id))return fail('Invalid transfer ID.',400)
 const auth=await householdSession('edit');if(auth instanceof NextResponse)return auth
 const b:unknown=await request.json().catch(()=>null)
 if(!object(b) || Object.keys(b).some(k=>!['requestId','householdId','householdNo','address','purok','is4ps','informantName','informantRelationship'].includes(k)) || !uuid(b.requestId) || !notes(b.informantName) || b.informantName.length>200 || !notes(b.informantRelationship) || b.informantRelationship.length>100 || (b.householdId!=null && !positive(b.householdId)) || (b.householdId==null && (!notes(b.householdNo) || b.householdNo.length>100 || !notes(b.address) || typeof b.is4ps!=='boolean')) || (b.purok!=null && (typeof b.purok!=='string' || b.purok.length>100)))return fail('Provide household information and the parent/guardian informant.',400)
 const result=await auth.db.rpc('echims_complete_received_household',{p_transfer_id:id,p_request_id:b.requestId,p_household_id:b.householdId??null,p_household_no:b.householdNo??null,p_address:b.address??null,p_purok:b.purok??null,p_is_4ps:b.is4ps??false,p_informant_name:b.informantName,p_informant_relationship:b.informantRelationship})
 if(result.error)return fail('Unable to save household information. Check receiving assignment, current transfer and household number.',failureStatus(result.error.code))
 return NextResponse.json({currentUserId:auth.user.id,result:result.data},{headers})
}catch{return fail('Result uncertain; retry the same request ID and unchanged details.',500)}}
