'use client'
import type { OfflineIdentity } from '@/lib/offline/store'
type Entry={key:string;ownerId:string;salt:number[];iv:number[];cipher:number[];expiresAt:number;attempts:number;blockedUntil:number}
const LIFETIME=7*86400000,ITERATIONS=600000
function account(value:string){return value.trim().toLowerCase()}
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'||!globalThis.crypto?.subtle){reject(new Error('Offline sign-in needs browser storage and HTTPS or localhost.'));return}
  const r=indexedDB.open('echims-offline-login-v1',1)
  r.onupgradeneeded=()=>r.result.createObjectStore('accounts',{keyPath:'key'})
  r.onerror=()=>reject(r.error??new Error('Unable to open offline sign-in storage.'))
  r.onblocked=()=>reject(new Error('Close other eCHIMS tabs and retry.'))
  r.onsuccess=()=>resolve(r.result)
})}
async function run<T>(mode:IDBTransactionMode,operation:(s:IDBObjectStore)=>IDBRequest<T>){
 const db=await database();return new Promise<T>((resolve,reject)=>{
  const tx=db.transaction('accounts',mode),r=operation(tx.objectStore('accounts'));let value:T
  r.onsuccess=()=>{value=r.result}
  tx.oncomplete=()=>{db.close();resolve(value)}
  tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??r.error??new Error('Offline sign-in storage failed.'))}
 })
}
async function key(password:string,salt:Uint8Array){
 const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey'])
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt),iterations:ITERATIONS},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}
export async function enrollOfflineLogin(email:string,password:string,identity:OfflineIdentity){
 if(!navigator.onLine||identity.user.accountStatus!=='APPROVED'||!identity.user.id||!password)throw new Error('An active online-verified account is required.')
 const verified=Date.parse(identity.verifiedAt)
 if(!Number.isFinite(verified)||Date.now()-verified<0||Date.now()-verified>60000)throw new Error('Online verification is no longer current.')
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),login=account(email)
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(login)},await key(password,salt),new TextEncoder().encode(JSON.stringify(identity)))
 await run('readwrite',s=>s.put({key:login,ownerId:identity.user.id,salt:Array.from(salt),iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher)),expiresAt:verified+LIFETIME,attempts:0,blockedUntil:0} satisfies Entry))
}
export async function unlockOfflineLogin(email:string,password:string):Promise<OfflineIdentity>{
 const login=account(email),db=await database()
 // Reserve a password attempt in one transaction so parallel tabs share a limit.
 const row=await new Promise<Entry>((resolve,reject)=>{
  const tx=db.transaction('accounts','readwrite'),s=tx.objectStore('accounts'),r=s.get(login);let entry:Entry,error:Error|null=null
  r.onsuccess=()=>{
   entry=r.result
   if(!entry||entry.expiresAt<=Date.now()){error=new Error('Sign in online once on this browser to prepare or renew offline sign-in.');tx.abort();return}
   if(entry.blockedUntil>Date.now()){error=new Error('Too many offline attempts. Wait ten minutes or sign in online.');tx.abort();return}
   const attempts=entry.blockedUntil?1:entry.attempts+1
   s.put({...entry,attempts,blockedUntil:attempts>=5?Date.now()+600000:0})
  }
  tx.oncomplete=()=>{db.close();resolve(entry)}
  tx.onabort=tx.onerror=()=>{db.close();reject(error??tx.error??new Error('Unable to unlock local account.'))}
 })
 let identity:OfflineIdentity
 try{
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(row.iv),additionalData:new TextEncoder().encode(login)},await key(password,new Uint8Array(row.salt)),new Uint8Array(row.cipher))
  identity=JSON.parse(new TextDecoder().decode(plain)) as OfflineIdentity
 }catch{throw new Error('Invalid email or password for this device’s saved account.')}
 const verified=Date.parse(identity.verifiedAt)
 if(identity.user.id!==row.ownerId||identity.user.accountStatus!=='APPROVED'||!Number.isFinite(verified)||verified>Date.now()||Date.now()-verified>=LIFETIME)throw new Error('Saved access has expired. Reconnect and sign in online.')
 await run('readwrite',s=>s.put({...row,attempts:0,blockedUntil:0}))
 return identity
}
export async function revokeOfflineLogin(ownerId:string){
 const rows=await run<Entry[]>('readonly',s=>s.getAll())
 for(const row of rows)if(row.ownerId===ownerId)await run('readwrite',s=>s.delete(row.key))
}
