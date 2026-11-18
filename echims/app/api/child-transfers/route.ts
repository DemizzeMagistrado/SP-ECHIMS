import {NextResponse} from 'next/server'
import {householdSession,householdFailure as fail,householdHeaders as headers} from '@/lib/household-access'
import {object,positive,uuid,notes,failureStatus} from '@/lib/child-transfer-validation'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
 try {
  const auth=await householdSession('view');if(auth instanceof NextResponse)return auth
  const params=new URL(request.url).searchParams
  const read=(key:string)=>{const raw=params.get(key);return raw===null?null:/^[1-9]\d*$/.test(raw) && positive(Number(raw))?Number(raw):false}
  const child=read('childId'),before=read('beforeId');if(child===false || before===false)return fail('Invalid child ID or cursor.',400)
  // Do not require a child SELECT here: receiving PHNs can see only the scoped
  // transfer summary until acceptance grants current-area patient access.
  const result=await auth.db.rpc('echims_list_child_transfers',{p_child_id:child,p_before_id:before})
  if(result.error)return fail('Unable to load transfer requests.',failureStatus(result.error.code))
  return NextResponse.json(result.data,{headers})
 } catch{return fail('Unable to load transfer requests.',500)}
}
export async function POST(request:Request) {
 try {
  const auth=await householdSession('edit');if(auth instanceof NextResponse)return auth
  const draftOwner=request.headers.get('X-eCHIMS-Draft-Owner');if(draftOwner && draftOwner!==auth.user.id)return fail('The signed-in account differs from the movement draft owner. Draft retained.',403)
  const b:unknown=await request.json().catch(()=>null)
  if(!object(b) || !uuid(b.requestId) || !notes(b.notes) || !['REQUEST','ACCEPT','REJECT','CANCEL'].includes(String(b.action)))return fail('Provide an action, request UUID and notes.',400)
  const allowed=b.action==='REQUEST'?['requestId','action','childId','expectedHouseholdId','expectedBarangayId','toRhuId','toBarangayId','movementDate','notes']:b.action==='ACCEPT'?['requestId','action','transferId','expectedRevision','toHouseholdId','destinationAddress','receivedOn','notes']:['requestId','action','transferId','expectedRevision','notes']
  if(Object.keys(b).some(k=>!allowed.includes(k)))return fail('Unsupported action fields.',400)
  if(b.action==='REQUEST' ? !positive(b.childId) || !('expectedHouseholdId' in b) || (b.expectedHouseholdId!==null && !positive(b.expectedHouseholdId)) || !positive(b.expectedBarangayId) || !positive(b.toRhuId) || !positive(b.toBarangayId) || typeof b.movementDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.movementDate) : !positive(b.transferId) || !positive(b.expectedRevision) || (b.action==='ACCEPT' && ((b.toHouseholdId!=null && !positive(b.toHouseholdId)) || !notes(b.destinationAddress) || typeof b.receivedOn!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.receivedOn))))return fail('Invalid transfer details.',400)
  const result=await auth.db.rpc('echims_manage_child_transfer',{p_request_id:b.requestId,p_action:b.action,p_child_id:b.childId??null,p_transfer_id:b.transferId??null,p_expected_revision:b.expectedRevision??null,p_expected_household_id:b.expectedHouseholdId??null,p_expected_barangay_id:b.expectedBarangayId??null,p_to_rhu_id:b.toRhuId??null,p_to_barangay_id:b.toBarangayId??null,p_to_household_id:b.toHouseholdId??null,p_movement_date:b.movementDate??null,p_notes:b.notes,p_destination_address:b.destinationAddress??null,p_received_on:b.receivedOn??null})
  if(result.error)
    {const status=failureStatus(result.error.code);
        console.error('Child transfer RPC failed:', {
        code: result.error.code,
        message: result.error.message,
        });

        if (result.error.code === '22023') {
        return fail(result.error.message, 400);
        }
        return fail(status===403?'This transfer requires an assigned PHN, RHM or BHW at the appropriate source or destination barangay.':status===409?
            'Transfer or assignment changed. Refresh and review before sending a new request.':status===400?
            'Invalid transfer details. Check the actual move date, destination and required fields.':'Transfer result uncertain. Retry the same request ID and unchanged details.',status)}
  return NextResponse.json({currentUserId:auth.user.id,result:result.data},{headers})
 }catch{return fail('Transfer result uncertain. Retry the same request ID and unchanged details.',500)}
}
