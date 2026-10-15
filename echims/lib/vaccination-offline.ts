'use client'
import { createClient } from '@/lib/supabase/client'
import { loadActiveIdentity, isOfflineLocked } from '@/lib/offline/store'
export type VaccinationPayload={child_id:number;vaccine_id:number;dose_number:number;vaccination_date:string;batch_number:string|null;vaccination_site:string|null;remarks:string|null;schedule_id:number|null;client_request_id:string}
export type QueuedVaccination={key:string;ownerId:string;requestId:string;childName:string;vaccineLabel:string;queuedAt:string;status:'PENDING'|'BLOCKED';lastError:string|null;payload:VaccinationPayload}
const DB_NAME='echims-vaccination-offline-v1', STORE='queue'
let database:Promise<IDBDatabase>|null=null
function openDb():Promise<IDBDatabase>{
 if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('Offline storage is unavailable.'));return}
  const req=indexedDB.open(DB_NAME,1)
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE)){const s=req.result.createObjectStore(STORE,{keyPath:'key'});s.createIndex('ownerId','ownerId');s.createIndex('status','status')}}
  req.onerror=()=>reject(req.error??new Error('Offline storage failed.'));req.onblocked=()=>reject(new Error('Close other eCHIMS tabs and retry.'))
  req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();database=null};resolve(req.result)}
 }).catch(e=>{database=null;throw e})
 return database
}
async function tx<T>(mode:IDBTransactionMode,operation:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode);const r=operation(t.objectStore(STORE));let result:T;r.onsuccess=()=>{result=r.result};t.oncomplete=()=>resolve(result);t.onerror=t.onabort=()=>reject(t.error??r.error??new Error('Draft was not saved.'))})}
const keyOf=(ownerId:string,requestId:string)=>`${ownerId}::${requestId}`
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function newClientRequestId():string{
 if(typeof crypto==='undefined')throw new Error('Use HTTPS or localhost to create an offline request ID.')
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID()
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128
 const h=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
export async function queueVaccinationDraft(ownerId:string,payload:VaccinationPayload,display:{childName:string;vaccineLabel:string},lastError:string|null=null,status:'PENDING'|'BLOCKED'='PENDING'):Promise<QueuedVaccination>{
 if(!UUID.test(ownerId)||!UUID.test(payload.client_request_id))throw new Error('A valid account and request UUID are required. Keep invalid legacy drafts for review.')
 const key=keyOf(ownerId,payload.client_request_id)
 // Read and write in a single transaction; never overwrite a changed in-flight payload.
 const db=await openDb()
 return new Promise((resolve,reject)=>{
  const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE),r=s.get(key);let row:QueuedVaccination
  r.onsuccess=()=>{const old=r.result as QueuedVaccination|undefined;if(old&&JSON.stringify(old.payload)!==JSON.stringify(payload)){t.abort();return}row={key,ownerId,requestId:payload.client_request_id,...display,queuedAt:old?.queuedAt??new Date().toISOString(),status,lastError,payload};s.put(row)}
  t.oncomplete=()=>{window.dispatchEvent(new CustomEvent('echims-vaccination-queue'));resolve(row)}
  t.onerror=t.onabort=()=>reject(t.error??new Error('This draft changed. Retain it and use a new request ID after review.'))
 })
}
export async function listQueuedVaccinations(ownerId:string):Promise<QueuedVaccination[]>{const rows=await tx<QueuedVaccination[]>('readonly',s=>s.index('ownerId').getAll(ownerId));return rows.filter(x=>x.ownerId===ownerId&&x.key===keyOf(ownerId,x.requestId)).sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt))}
export async function removeQueuedVaccination(ownerId:string,requestId:string){await tx('readwrite',s=>s.delete(keyOf(ownerId,requestId)));window.dispatchEvent(new CustomEvent('echims-vaccination-queue'))}
// User deletion is limited to rejected/conflicting local entries. An uncertain
// pending upload must retain its request ID until the server acknowledges it.
export async function discardBlockedVaccinationDraft(ownerId:string,requestId:string){
 const identity=await loadActiveIdentity()
 if(!identity||identity.user.id!==ownerId||isOfflineLocked())throw new Error('Sign in with the account that recorded this draft.')
 const db=await openDb()
 await new Promise<void>((resolve,reject)=>{
  const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE),r=s.get(keyOf(ownerId,requestId));let failure='Unable to delete this local draft.'
  r.onsuccess=()=>{
   const row=r.result as QueuedVaccination|undefined
   if(isOfflineLocked()){failure='Sign in again before deleting a draft.';t.abort();return}
   if(!row)return
   if(row.ownerId!==ownerId||row.requestId!==requestId||row.key!==keyOf(ownerId,requestId)||row.status!=='BLOCKED'){failure='This draft changed or is awaiting sync. Refresh and review it again.';t.abort();return}
   s.delete(row.key)
  }
  t.oncomplete=()=>resolve()
  t.onerror=t.onabort=()=>reject(new Error(failure))
 })
 window.dispatchEvent(new CustomEvent('echims-vaccination-queue'))
}
export type SendResult={ok:true;vaccination_record_id:number;status:string;idempotent?:boolean}|{ok:false;queued:boolean;error:string}
async function sessionOwner(){const {data}=await createClient().auth.getSession();return data.session?.user.id??null}
export async function sendOrQueueVaccination(ownerId:string,payload:VaccinationPayload,display:{childName:string;vaccineLabel:string}):Promise<SendResult>{
 // Persist before the network request so closing the page cannot lose an uncertain save.
 await queueVaccinationDraft(ownerId,payload,display)
 if(!navigator.onLine)return {ok:false,queued:true,error:'Saved on this device—pending sync.'}
 if(await sessionOwner()!==ownerId)return {ok:false,queued:true,error:'Sign in with the account that recorded this draft.'}
 const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),25000)
 try{
  const r=await fetch('/api/vaccination/records',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...payload,request_owner_id:ownerId})})
  const d=await r.json().catch(()=>({}))
  if(!r.ok){const retry=[401,408,429].includes(r.status)||r.status>=500;const error=String(d.error??`Save failed (${r.status}).`);await queueVaccinationDraft(ownerId,payload,display,error,retry?'PENDING':'BLOCKED');return {ok:false,queued:true,error}}
  if(!Number.isSafeInteger(Number(d.vaccination_record_id))||Number(d.vaccination_record_id)<=0||!['PENDING','APPROVED','REJECTED'].includes(d.status)||d.currentUserId!==ownerId||d.client_request_id!==payload.client_request_id)throw new Error('The server did not confirm this account and request. Draft retained.')
  await removeQueuedVaccination(ownerId,payload.client_request_id)
  return {ok:true,vaccination_record_id:Number(d.vaccination_record_id),status:d.status,idempotent:Boolean(d.idempotent)}
 }catch(e){const error=e instanceof Error?e.message:'Network failure';await queueVaccinationDraft(ownerId,payload,display,error,'PENDING');return {ok:false,queued:true,error:'Save could not be confirmed. The same request will be retried safely.'}}
 finally{window.clearTimeout(timer)}
}
let draining:Promise<{sent:number;failed:number}>|null=null
export async function drainQueue(ownerId:string):Promise<{sent:number;failed:number}>{
 if(draining)return {sent:0,failed:0}
 async function drain(){let sent=0,failed=0;if(!navigator.onLine||await sessionOwner()!==ownerId)return {sent,failed}
  const rows=await listQueuedVaccinations(ownerId)
  for(const row of rows){if(!navigator.onLine||await sessionOwner()!==ownerId)break;if(row.status==='BLOCKED')continue
   if(!UUID.test(row.requestId)){failed++;continue}
   const result=await sendOrQueueVaccination(ownerId,row.payload,{childName:row.childName,vaccineLabel:row.vaccineLabel})
   if(result.ok)sent++;else{failed++;break}
  }return {sent,failed}
 }
 draining=(async()=>{
  // Cross-tab lock where available. Server request IDs still protect other browsers.
  if(navigator.locks)return navigator.locks.request('echims-vaccination-sync',{ifAvailable:true},lock=>lock?drain():Promise.resolve({sent:0,failed:0}))
  return drain()
 })()
 try{return await draining}finally{draining=null}
}
export async function retryVaccinationDraft(ownerId:string,requestId:string){const row=(await listQueuedVaccinations(ownerId)).find(x=>x.requestId===requestId);if(!row)throw new Error('Draft not found for this account.');return sendOrQueueVaccination(ownerId,row.payload,{childName:row.childName,vaccineLabel:row.vaccineLabel})}
