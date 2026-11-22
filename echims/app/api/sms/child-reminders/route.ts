import { NextResponse } from 'next/server'
import { smsSession, smsService, json, uuid, dbFailure } from '@/lib/sms/server'
import { smsConfiguration, sendIprogSms } from '@/lib/sms/iprogsms'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const positive = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const failure = (e: { code?: string; message: string }) => e.code === '40001' ? json({error:e.message},409) : dbFailure(e)
export async function GET(request: Request) {
 try {
  const auth=await smsSession(); if(auth instanceof NextResponse)return auth
  const q=new URL(request.url).searchParams
  const child=Number(q.get('childId'))
  if(!positive(child))return json({error:'Choose a valid numeric child ID.'},400)
  const result=await auth.db.rpc('echims_child_sms_panel',{p_child_id:child,p_language:q.get('language')??'TL',p_venue:q.get('venue')??''})
  if(result.error)return failure(result.error)
  const panel=result.data as unknown as Record<string,unknown>
  if(panel?.currentUserId!==auth.userId)return json({error:'Session changed. Refresh.'},409)
  return json({...panel,liveEnabled:smsConfiguration().ready})
 }catch{return json({error:'Unable to load child SMS. Check the child SMS migration.'},500)}
}
export async function POST(request: Request) {
 try {
  const auth=await smsSession();if(auth instanceof NextResponse)return auth
  if(auth.role === 'Administrator')return json({error:'Administrators can view reminders but cannot send them.'},403)
  const b=await request.json().catch(()=>null)
  if(!b||!uuid(b.requestId)||!positive(b.childId)||typeof b.sourceKey!=='string'||!b.sourceKey||b.sourceKey.length>500||!['TL','EN'].includes(b.language)||typeof b.venue!=='string'||!b.venue.trim()||b.venue.length>60||typeof b.previewSignature!=='string'||!/^[a-f0-9]{32}$/.test(b.previewSignature)||b.confirmedDetails!==true)return json({error:'Review the preview and confirm these saved schedule details.'},400)
  if(b.requestOwnerId!==auth.userId)return json({error:'Session changed. Refresh before sending.'},409)
  if(!smsConfiguration().ready)return json({error:'Live iProg SMS is not enabled.'},503)
  const service=smsService()
  const p=await auth.db.rpc('echims_prepare_child_sms',{p_request_id:b.requestId,p_child_id:b.childId,p_source_key:b.sourceKey,p_language:b.language,p_venue:b.venue,p_preview_signature:b.previewSignature})
  if(p.error)return failure(p.error)
  const attempt=p.data as {attempt_id:number;canClaim:boolean;status:string}
  if(!attempt.canClaim)return json({currentUserId:auth.userId,result:{status:attempt.status},message:'An attempt already exists. No additional SMS submitted.'})
  const c=await service.rpc('echims_claim_child_sms',{p_attempt_id:attempt.attempt_id,p_actor_id:auth.userId})
  if(c.error)return failure(c.error)
  const dispatch=c.data as {send:boolean;status:string;destination?:string;message?:string}
  if(!dispatch.send)return json({currentUserId:auth.userId,result:{status:dispatch.status},message:'Saved attempt: '+dispatch.status+'. No additional SMS submitted.'})
  const outcome=await sendIprogSms(dispatch.destination!,dispatch.message!)
  const f=await service.rpc('echims_finish_child_sms',{p_attempt_id:attempt.attempt_id,p_actor_id:auth.userId,p_status:outcome.status,p_provider_uid:outcome.uid,p_error_code:outcome.code})
  if(f.error)return json({error:'Result uncertain. Retry the same saved request to inspect its status.'},503)
  return json({currentUserId:auth.userId,result:f.data,message:outcome.status==='SUBMITTED'?'Submitted to iProg SMS; delivery is not yet confirmed.':outcome.status==='FAILED'?'iProg SMS rejected the attempt.':'Result uncertain. Check the provider report; do not send again.'})
 }catch{return json({error:'Connection interrupted. Retry the same saved request to inspect its result.'},500)}
}
