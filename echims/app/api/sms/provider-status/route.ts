import {NextResponse} from 'next/server'
import {smsSession,json} from '@/lib/sms/server'
import {smsConfiguration,iprogCredits} from '@/lib/sms/iprogsms'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request){
 try{
  const auth=await smsSession();if(auth instanceof NextResponse)return auth
  const config=smsConfiguration()
  const balanceRequested=new URL(request.url).searchParams.get('balance')==='true'
  let credits:number|null=null,balanceError:string|null=null
  if(balanceRequested && config.configured){try{credits=await iprogCredits()}catch{balanceError='Unable to read balance. Check the iProg account and server configuration.'}}
  return json({currentUserId:auth.userId,provider:'iprogsms',configured:config.configured,mode:config.mode,liveEnabled:config.ready,credits,balanceError,otpConfigured:(process.env.SMS_OTP_SECRET?.trim().length??0)>=32,sendsSms:false})
 }catch{return json({error:'Unable to check SMS configuration.'},500)}
}
