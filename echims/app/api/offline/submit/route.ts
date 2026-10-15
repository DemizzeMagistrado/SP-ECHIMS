import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
const headers={'Cache-Control':'private, no-store'}
export async function POST(request:Request){
 try{
  const db=await createClient(),{data:{user},error:authError}=await db.auth.getUser()
  if(authError||!user)return NextResponse.json({error:'Sign in online again before uploading.'},{status:401,headers})
  const input:unknown=await request.json().catch(()=>null)
  if(!input||typeof input!=='object'||Array.isArray(input))return NextResponse.json({error:'Invalid submission.'},{status:400,headers})
  const body=input as Record<string,unknown>
  if(!['CHILD','ACTIVITY'].includes(String(body.module))||typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload)||JSON.stringify(body.payload).length>50000)return NextResponse.json({error:'A valid request ID and payload are required.'},{status:400,headers})
  const {data,error}=await db.rpc(body.module==='CHILD'?'echims_submit_child':'echims_submit_activity',{p_request_id:body.requestId,p_payload:body.payload})
  if(error){
   const canEdit=['22023','23514','22P02','22007','22008','23503','23505','23P01','22001'].includes(error.code??'')
   const status=error.code==='42501'?403:canEdit?400:error.code==='P0001'?409:500
   if(status===500)console.error('Safe offline submission:',error)
   return NextResponse.json({error:status===500?'Unable to confirm submission. Retain this draft and retry unchanged after checking the installed migration.':error.message,canEdit},{status,headers})
  }
  return NextResponse.json(data,{status:data?.idempotent?200:201,headers})
 }catch(error){console.error('Safe offline submission:',error);return NextResponse.json({error:'Unable to confirm submission. Draft retained; retry unchanged.'},{status:500,headers})}
}
