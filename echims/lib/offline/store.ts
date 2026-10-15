'use client'
import type { AuthUser } from '@/components/auth/auth-provider'
export type OfflineIdentity = { user: AuthUser; verifiedAt: string }
let database: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
 if (!database) database = new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('Offline storage is unavailable.'));return}
  const r=indexedDB.open('echims-offline-foundation-v1',1)
  r.onupgradeneeded=()=>{r.result.createObjectStore('identities',{keyPath:'ownerId'});r.result.createObjectStore('snapshots',{keyPath:'key'})}
  r.onerror=()=>reject(r.error ?? new Error('Unable to open offline storage.'))
  r.onblocked=()=>reject(new Error('Close other eCHIMS tabs and retry.'))
  r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();database=null};resolve(r.result)}
 }).catch(e=>{database=null;throw e})
 return database
}
async function run<T>(name:'identities'|'snapshots',mode:IDBTransactionMode,op:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await open()
 return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode);const r=op(tx.objectStore(name));let result:T;r.onsuccess=()=>{result=r.result};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error ?? r.error ?? new Error('Offline storage failed.'))})
}
export async function saveIdentity(identity:OfflineIdentity){
 if(identity.user.accountStatus!=='APPROVED') throw new Error('Only verified active accounts can prepare offline access.')
 await run('identities','readwrite',s=>s.put({ownerId:identity.user.id,...identity}))
}
export async function loadIdentity(ownerId:string):Promise<OfflineIdentity|null>{
 const row=await run<(OfflineIdentity&{ownerId:string})|undefined>('identities','readonly',s=>s.get(ownerId))
 if(!row || row.ownerId!==ownerId || row.user.id!==ownerId || row.user.accountStatus!=='APPROVED')return null
 const age=Date.now()-Date.parse(row.verifiedAt)
 // Local viewing lease; server authorization is always checked again on upload.
 return Number.isFinite(age)&&age>=0&&age<=7*86400000?row:null
}
export async function forgetIdentity(ownerId:string){await run('identities','readwrite',s=>s.delete(ownerId))}
export async function saveData<T>(ownerId:string,module:string,data:T){await run('snapshots','readwrite',s=>s.put({key:ownerId+':'+module,ownerId,module,savedAt:new Date().toISOString(),data}))}
export async function loadData<T>(ownerId:string,module:string){
 const row=await run<{ownerId:string;module:string;savedAt:string;data:T}|undefined>('snapshots','readonly',s=>s.get(ownerId+':'+module))
 return row?.ownerId===ownerId&&row.module===module?row:null
}
