'use client'
import { loadActiveIdentity } from '@/lib/offline/store'
import { offlineScope } from '@/lib/offline/fetch'
type Draft={requestId:string;ownerId:string;scope:string;status:'DRAFT'|'UNCERTAIN';form:Record<string,string|boolean>;safeRetry?:boolean;submission?:Record<string,unknown>}
type Module='CHILD'|'ACTIVITY'
const names={CHILD:'echims-child-registration-drafts-v1',ACTIVITY:'echims-activity-drafts-v1'}
const events={CHILD:'echims-child-drafts',ACTIVITY:'echims-activity-drafts'}
async function access(row:Draft){const active=await loadActiveIdentity();if(!active||active.user.id!==row.ownerId||offlineScope(active.user)!==row.scope)throw new Error('Account or area changed. Reopen your drafts.')}
async function update<T>(module:Module,requestId:string,operation:(row:Draft,store:IDBObjectStore)=>T){
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(names[module],1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
 return new Promise<T>((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.get(requestId);let result:T,error:unknown
  r.onsuccess=()=>{try{if(!r.result)throw new Error('Draft no longer exists.');result=operation(r.result,s)}catch(e){error=e;tx.abort()}}
  tx.oncomplete=()=>{db.close();window.dispatchEvent(new Event(events[module]));resolve(result)}
  tx.onabort=tx.onerror=()=>{db.close();reject(error??tx.error??new Error('Unable to save submission state.'))}
 })
}
export async function submitSafeDraft<T extends Draft>(module:Module,draft:T,payload?:Record<string,unknown>){
 if(!navigator.onLine)throw new Error('Reconnect before uploading. Your draft stays on this device.')
 await access(draft)
 const context=await fetch('/api/offline/context',{cache:'no-store',signal:AbortSignal.timeout(10000)}),verified=await context.json()
 if(!context.ok||verified.user?.id!==draft.ownerId||offlineScope(verified.user)!==draft.scope)throw new Error('Sign in online again with this draft’s account before uploading.')
 const frozen=await update(module,draft.requestId,(row,s)=>{
  if(row.ownerId!==draft.ownerId||row.scope!==draft.scope)throw new Error('Draft belongs to another account or area.')
  if(row.status==='UNCERTAIN'){
   if(!row.safeRetry||!row.submission)throw new Error('This older uncertain draft has no server request ID. Reconcile it before submitting again.')
   return row.submission
  }
  if(!payload)throw new Error('Review the draft before its first submission.')
  s.put({...row,...draft,status:'UNCERTAIN',safeRetry:true,submission:payload})
  return payload
 })
 let response:Response
 try{response=await fetch('/api/offline/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module,requestId:draft.requestId,payload:frozen}),signal:AbortSignal.timeout(30000)})}
 catch{throw new Error('Connection interrupted. Draft retained. Use Retry unchanged submission to confirm the same request safely.')}
 const result=await response.json().catch(()=>null)
 await access(draft)
 if(!response.ok){
  if(result?.canEdit===true)await update(module,draft.requestId,(row,s)=>{if(row.ownerId===draft.ownerId&&JSON.stringify(row.submission)===JSON.stringify(frozen))s.put({...row,status:'DRAFT',safeRetry:false,submission:undefined})})
  throw new Error(result?.error??'Submission could not be confirmed. Retry unchanged.')
 }
 const id=module==='CHILD'?result?.child_id:result?.schedule?.schedule_id
 if(!Number.isSafeInteger(Number(id))||Number(id)<=0)throw new Error('Server acknowledgement is incomplete. Draft retained; retry unchanged.')
 await update(module,draft.requestId,(row,s)=>{if(row.ownerId===draft.ownerId&&JSON.stringify(row.submission)===JSON.stringify(frozen))s.delete(draft.requestId)})
 return result
}
