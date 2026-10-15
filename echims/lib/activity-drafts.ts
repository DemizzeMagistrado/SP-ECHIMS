'use client'
import { loadActiveIdentity } from '@/lib/offline/store'
import { offlineScope } from '@/lib/offline/fetch'
export type ActivityDraft = {
  requestId:string; ownerId:string; scope:string; savedAt:string;
  form:Record<string,string|boolean>;
  status:'DRAFT'|'UNCERTAIN'; safeRetry?:boolean; submission?:Record<string,unknown>;
}
async function database(){
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const r=indexedDB.open('echims-activity-drafts-v1',1)
    r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'requestId'})
    r.onsuccess=()=>resolve(r.result)
    r.onerror=()=>reject(r.error??new Error('Local draft storage unavailable.'))
    r.onblocked=()=>reject(new Error('Close other eCHIMS tabs and retry.'))
  })
}
async function access(ownerId:string,scope:string){
  const active=await loadActiveIdentity()
  if(!active||active.user.id!==ownerId||offlineScope(active.user)!==scope)throw new Error('Account or assigned area changed. Reopen your drafts.')
}
async function transact<T>(mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest<T>){
  const db=await database()
  return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('drafts',mode),r=run(tx.objectStore('drafts'));let value:T
    r.onsuccess=()=>{value=r.result}
    tx.oncomplete=()=>{db.close();resolve(value)}
    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??r.error??new Error('Draft was not saved.'))}
  })
}
export async function listActivityDrafts(ownerId:string,scope:string){
  await access(ownerId,scope)
  const rows=await transact<ActivityDraft[]>('readonly',s=>s.getAll())
  await access(ownerId,scope)
  return rows.filter(r=>r.ownerId===ownerId&&r.scope===scope).sort((a,b)=>a.savedAt.localeCompare(b.savedAt))
}
export async function saveActivityDraft(draft:ActivityDraft){
  await access(draft.ownerId,draft.scope)
  const db=await database()
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.get(draft.requestId)
    r.onsuccess=()=>{if(r.result?.status==='UNCERTAIN'){tx.abort();return}s.put(draft)}
    tx.oncomplete=()=>{db.close();resolve()}
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Draft needs reconciliation before it can be changed.'))}
  })
  window.dispatchEvent(new Event('echims-activity-drafts'))
}
export async function deleteActivityDraft(draft:ActivityDraft){
  await access(draft.ownerId,draft.scope)
  await transact('readwrite',s=>s.delete(draft.requestId))
  window.dispatchEvent(new Event('echims-activity-drafts'))
}
// Atomically claim an upload across tabs. Never replay a potentially completed activity request.
export async function claimActivityDraft(draft:ActivityDraft){
  await access(draft.ownerId,draft.scope)
  const db=await database()
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.get(draft.requestId)
    let error:Error|null=null
    r.onsuccess=()=>{
      const row=r.result as ActivityDraft|undefined
      if(!row||row.ownerId!==draft.ownerId||row.scope!==draft.scope||row.status!=='DRAFT'){
        error=new Error('This draft has already been uploaded or needs reconciliation.');tx.abort();return
      }
      s.put({...draft,status:'UNCERTAIN'})
    }
    tx.oncomplete=()=>{db.close();resolve()}
    tx.onabort=tx.onerror=()=>{db.close();reject(error??tx.error??new Error('Unable to claim draft.'))}
  })
  window.dispatchEvent(new Event('echims-activity-drafts'))
}
