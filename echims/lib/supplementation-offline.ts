        'use client'

export type OfflineForm = {
  childId:string; supplementId:string; protocolId:string; batchId:string; date:string;
  purpose:string; remarks:string; orderReference:string; assessmentId:string; scheduleId:string;
  barangayId:string; batchNumber:string; receivedDate:string; expiryDate:string; quantity:string;
  allocateExisting:boolean; confirmed:boolean; planId:string; startDate:string; endDate:string;
}
export type SupplementDraft = {
  key:string; ownerId:string; requestId:string; action:'RECORD'|'DISPENSE';
  childName:string; savedAt:string; status:'PENDING'|'BLOCKED'|'UNCERTAIN';
  lastError:string|null; form:OfflineForm;
}
let database:Promise<IDBDatabase>|null=null
function openDatabase(){
  if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('Offline storage is unavailable in this browser.'));return}
    const request=indexedDB.open('echims-supplementation-offline-v1',1)
    request.onupgradeneeded=()=>{
      const db=request.result
      db.createObjectStore('snapshots',{keyPath:'ownerId'})
      const drafts=db.createObjectStore('drafts',{keyPath:'key'})
      drafts.createIndex('ownerId','ownerId',{unique:false})
    }
    request.onerror=()=>reject(request.error??new Error('Unable to open offline storage.'))
    request.onblocked=()=>reject(new Error('Close other eCHIMS tabs and retry.'))
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null};resolve(db)}
  }).catch(error=>{database=null;throw error})
  return database
}
async function transaction<T>(store:'snapshots'|'drafts',mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>){
  const db=await openDatabase()
  return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(store,mode),request=run(tx.objectStore(store));let result:T
    request.onsuccess=()=>{result=request.result}
    tx.oncomplete=()=>resolve(result)
    tx.onerror=()=>reject(tx.error??request.error??new Error('Offline storage failed.'))
    tx.onabort=()=>reject(tx.error??new Error('Offline changes were not saved.'))
  })
}
export async function cacheSupplementData<T extends {currentUserId:string}>(ownerId:string,data:T){
  if(data.currentUserId!==ownerId)throw new Error('Cached data belongs to another account.')
  await transaction('snapshots','readwrite',s=>s.put({ownerId,savedAt:new Date().toISOString(),data}))
}
export async function loadSupplementCache<T extends {currentUserId:string}>(ownerId:string){
  const row=await transaction<{ownerId:string;savedAt:string;data:T}|undefined>('snapshots','readonly',s=>s.get(ownerId))
  return row?.ownerId===ownerId&&row.data.currentUserId===ownerId?row:null
}
export async function listSupplementDrafts(ownerId:string){
  const rows=await transaction<SupplementDraft[]>('drafts','readonly',s=>s.index('ownerId').getAll(ownerId))
  return rows.filter(r=>r.ownerId===ownerId).sort((a,b)=>a.savedAt.localeCompare(b.savedAt))
}
export async function saveSupplementDraft(ownerId:string,draft:SupplementDraft,previousRequestId?:string){
  if(draft.ownerId!==ownerId||draft.key!==ownerId+':'+draft.requestId)throw new Error('Draft belongs to another account.')
  const db=await openDatabase()
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts')
    if(previousRequestId&&previousRequestId!==draft.requestId)s.delete(ownerId+':'+previousRequestId)
    s.put(draft)
    tx.oncomplete=()=>resolve()
    tx.onabort=()=>reject(tx.error??new Error('Draft was not saved.'))
    tx.onerror=()=>reject(tx.error??new Error('Draft was not saved.'))
  })
}
export async function deleteSupplementDraft(ownerId:string,requestId:string){
  await transaction('drafts','readwrite',s=>s.delete(ownerId+':'+requestId))
}
