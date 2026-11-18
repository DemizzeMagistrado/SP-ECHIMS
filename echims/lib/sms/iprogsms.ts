import 'server-only'
export type SendOutcome={status:'SUBMITTED'|'FAILED'|'UNCERTAIN';uid:string|null;code:string|null}
const origin='https://www.iprogsms.com'
function object(v:unknown):v is Record<string,unknown>{return !!v && typeof v==='object' && !Array.isArray(v)}
export function smsConfiguration(){
 const mode=process.env.SMS_MODE?.trim().toLowerCase()||'simulation'
 const provider=process.env.SMS_PROVIDER?.trim().toLowerCase()||'iprogsms'
 const token=(process.env.IPROG_SMS_API_TOKEN||process.env.IPROGSMS_API_TOKEN||process.env.IPROG_API_TOKEN||'').trim()
 const route=process.env.IPROG_SMS_PROVIDER?.trim()||'0'
 const validToken=!!token && !/\s/.test(token) && !/^(YOUR_|PASTE_|REPLACE_)/i.test(token)
 const validRoute=/^[012]$/.test(route)
 return {mode,provider,token,smsProvider:Number(route),configured:['iprogsms','iprog'].includes(provider) && validToken && validRoute,ready:mode==='live' && ['iprogsms','iprog'].includes(provider) && validToken && validRoute}
}
export async function sendIprogSms(recipient:string,message:string):Promise<SendOutcome>{
 const config=smsConfiguration()
 if(!config.ready)throw new Error('Live iProg SMS configuration is incomplete.')
 if(!/^639\d{9}$/.test(recipient) || !message.trim())return {status:'FAILED',uid:null,code:'INVALID_MESSAGE_OR_DESTINATION'}
 try{
  const response=await fetch(`${origin}/api/v1/sms_messages`,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({api_token:config.token,phone_number:recipient,message,sms_provider:config.smsProvider})})
  const body:unknown=await response.json().catch(()=>null)
  if(response.status>=500 || response.status===408)return {status:'UNCERTAIN',uid:null,code:`HTTP_${response.status}`}
  if(!response.ok)return {status:'FAILED',uid:null,code:`HTTP_${response.status}`}
  if(!object(body))return {status:'UNCERTAIN',uid:null,code:'UNRECOGNIZED_RESPONSE'}
  const uid=typeof body.message_id==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(body.message_id)?body.message_id:null
  if((body.status===200 || body.status==='200') && uid)return {status:'SUBMITTED',uid,code:null}
  const numeric=typeof body.status==='number'?body.status:Number(body.status)
  if(body.status==='error' || Number.isInteger(numeric) && numeric>=400)return {status:'FAILED',uid,code:Number.isInteger(numeric)?`IPROG_${numeric}`:'PROVIDER_REJECTED'}
  return {status:'UNCERTAIN',uid,code:'UNRECOGNIZED_RESPONSE'}
 }catch{return {status:'UNCERTAIN',uid:null,code:'NETWORK_OR_TIMEOUT'}}
}
// Read-only provider balance request. Never expose this URL, token or raw reply
// to the browser. GET with a JSON body is not used because Node fetch rejects it.
export async function iprogCredits():Promise<number|null>{
 const config=smsConfiguration();if(!config.configured)return null
 const url=new URL('/api/v1/account/sms_credits',origin);url.searchParams.set('api_token',config.token)
 const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}})
 const body:unknown=await response.json().catch(()=>null)
 if(!response.ok || !object(body) || body.status!=='success' || !object(body.data))throw new Error('Unable to check iProg SMS balance.')
 const rawBalance=body.data.load_balance
 const balance=typeof rawBalance==='string' && /^\d+(?:\.\d+)?$/.test(rawBalance)?Number(rawBalance):rawBalance
 if(typeof balance!=='number' || !Number.isFinite(balance) || balance<0)throw new Error('Unrecognized balance response.')
 return balance
}
