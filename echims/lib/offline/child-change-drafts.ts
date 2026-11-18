'use client'
import {loadActiveIdentity} from '@/lib/offline/store'
import {offlineScope} from '@/lib/offline/fetch'
import type {EditSnapshot} from '@/lib/offline/child-edit-model'
export type ChildChangeDraft={requestId:string;ownerId:string;scope:string;childId:number;kind:'EDIT'|'TRANSFER';title:string;savedAt:string;status:'DRAFT'|'UNCERTAIN'|'CONFLICT'|'ERROR';payload:Record<string,unknown>;form?:Record<string,string|boolean>;baseline?:EditSnapshot;error?:string}
const event='echims-child-change-drafts'
async function access(ownerId:string,scope:string){const i=await loadActiveIdentity();if(!i||i.user.id!==ownerId||offlineScope(i.user)!==scope)throw Error('Sign in with this draft’s original account and assigned area. Draft retained.')}
async function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('echims-child-changes-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'requestId'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close other eCHIMS tabs and retry.'))})}
async function change<T>(id:string,fn:(old:ChildChangeDraft|undefined,s:IDBObjectStore)=>T){const db=await open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.get(id);let value:T,error:unknown;r.onsuccess=()=>{try{value=fn(r.result,s)}catch(e){error=e;tx.abort()}};tx.oncomplete=()=>{db.close();window.dispatchEvent(new Event(event));resolve(value)};tx.onabort=tx.onerror=()=>{db.close();reject(error??tx.error??Error('Draft storage failed.'))}})}
export async function saveChildChangeDraft(row:ChildChangeDraft){await access(row.ownerId,row.scope);await change(row.requestId,(old,s)=>{if(old&&(old.ownerId!==row.ownerId||old.scope!==row.scope||old.status==='UNCERTAIN'||old.status==='CONFLICT'))throw Error('This draft is frozen or conflicted. Retain it and review the current server record.');s.put({...row,status:'DRAFT',error:undefined})})}
export async function listChildChangeDrafts(ownerId:string,scope:string){await access(ownerId,scope);const db=await open();const rows=await new Promise<ChildChangeDraft[]>((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').getAll();let rows:ChildChangeDraft[]=[];r.onsuccess=()=>rows=r.result;tx.oncomplete=()=>{db.close();resolve(rows)};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error)}});await access(ownerId,scope);return rows.filter(r=>r.ownerId===ownerId&&r.scope===scope).sort((a,b)=>a.savedAt.localeCompare(b.savedAt))}
export async function deleteChildChangeDraft(row:ChildChangeDraft,options:{discardUncertain?:boolean}={}){
 await access(row.ownerId,row.scope)
 await change(row.requestId,(old,s)=>{
  if(!old)return
  if(old.ownerId!==row.ownerId||old.scope!==row.scope)throw Error('Draft account changed.')
  if(old.status!==row.status||JSON.stringify(old.payload)!==JSON.stringify(row.payload))throw Error('Draft changed. Refresh and review it before deleting.')
  if(old.status==='UNCERTAIN'&&options.discardUncertain!==true)throw Error('Review the uncertain result before deleting this local draft.')
  s.delete(row.requestId)
 })
}
export async function submitChildChangeDraft(draft:ChildChangeDraft){
 if(!navigator.onLine)throw Error('Reconnect to sync. Your changes remain on this device.')
 await access(draft.ownerId,draft.scope)
 const context=await fetch('/api/offline/context',{cache:'no-store',signal:AbortSignal.timeout(10000)}),identity=await context.json()
 if(!context.ok||identity.user?.id!==draft.ownerId||offlineScope(identity.user)!==draft.scope)throw Error('Current server account or area differs from this draft. Sign in again before syncing.')
 const frozen=await change(draft.requestId,(old,s)=>{if(!old||old.ownerId!==draft.ownerId||old.scope!==draft.scope)throw Error('Draft account changed.');if(old.status==='CONFLICT')throw Error('Review the latest profile; do not overwrite a conflict.');s.put({...old,status:'UNCERTAIN',error:undefined});return old})
 await access(frozen.ownerId,frozen.scope)
 let r:Response
 try{r=await fetch(frozen.kind==='EDIT'?'/api/offline/child-edits':'/api/child-transfers',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-eCHIMS-Draft-Owner':frozen.ownerId},body:JSON.stringify(frozen.kind==='EDIT'?{requestId:frozen.requestId,...frozen.payload}:frozen.payload),signal:AbortSignal.timeout(30000)})}catch{throw Error('Connection interrupted. Draft retained; retry the unchanged request to confirm its result.')}
 const body=await r.json().catch(()=>null);await access(frozen.ownerId,frozen.scope)
 if(!r.ok){const definitive=r.status>=400&&r.status<500;await change(frozen.requestId,(old,s)=>{if(old&&old.ownerId===frozen.ownerId&&JSON.stringify(old.payload)===JSON.stringify(frozen.payload))s.put({...old,status:r.status===409?'CONFLICT':definitive?'ERROR':'UNCERTAIN',error:body?.error??'Server result uncertain; retry unchanged.'})});throw Error(body?.error??'Unable to confirm changes. Draft retained.')}
 const valid=body?.currentUserId===frozen.ownerId&&(frozen.kind==='EDIT'?body.result?.applied===true&&Number(body.result.child_id)===frozen.childId:body.result?.transfer?.status===({REQUEST:'PENDING',ACCEPT:'ACCEPTED',REJECT:'REJECTED',CANCEL:'CANCELLED'} as Record<string,string>)[String(frozen.payload.action)]&&Number(body.result.transfer.child_id)===frozen.childId)
 if(!valid)throw Error('Server acknowledgement is incomplete. Draft retained; retry unchanged.')
 await change(frozen.requestId,(old,s)=>{if(!old)return;if(old.ownerId!==frozen.ownerId||JSON.stringify(old.payload)!==JSON.stringify(frozen.payload))throw Error('Draft changed before acknowledgement.');s.delete(frozen.requestId)})
 window.dispatchEvent(new CustomEvent('echims-revalidate',{detail:(key:unknown)=>{const text=JSON.stringify(key)??'';return /children|child-transfers|completed-movements|age-archive|receiving-household-form/.test(text)}}))
 return body
}
