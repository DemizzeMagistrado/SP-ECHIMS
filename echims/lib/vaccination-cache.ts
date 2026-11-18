'use client'
import { loadActiveIdentity } from '@/lib/offline/store'
import { offlineFetch } from '@/lib/offline/fetch'
import type { AuthUser } from '@/components/auth/auth-provider'
export type CachedView<T>={ownerId:string;scope:string;savedAt:string;data:T;fromCache:boolean}
export class VaccinationReadError extends Error{constructor(message:string,public status:number){super(message)}}
export function vaccinationScope(user:Pick<AuthUser,'role'|'rhu_id'|'barangay_ids'>){return JSON.stringify([user.role,user.rhu_id??'',[...(user.barangay_ids??[])].sort()])}
export async function readVaccinationView<T>(ownerId:string,scope:string,url:string):Promise<CachedView<T>>{
 // Offline, a saved view opens only for the account and area this device was prepared for. Online, the
 // server decides access (offlineFetch reads fresh data for the signed-in session), so a device whose
 // offline copy belongs to another account or area (e.g. after switching accounts) still loads.
 if(!navigator.onLine){
  const active = await loadActiveIdentity()
  if(!active || active.user.id!==ownerId || vaccinationScope(active.user)!==scope) throw new VaccinationReadError('This device was prepared for another account or area. Reconnect and sign in.',401)
 }
 const response = await offlineFetch(url)
 const data = await response.json()
 if(!response.ok) throw new VaccinationReadError(String(data.error??'Unable to load the saved view.'),response.status)
 const savedAt=response.headers.get('X-eCHIMS-Snapshot')??response.headers.get('X-eCHIMS-Prepared')??new Date().toISOString()
 return {ownerId,scope,savedAt,data:data as T,fromCache:response.headers.has('X-eCHIMS-Snapshot')}
}

export function vaccinationKeyMatches(key:unknown,urlPrefix:string){return typeof key==='string'?key.startsWith(urlPrefix):Array.isArray(key)&&key[0]==='vaccination-view'&&typeof key[3]==='string'&&key[3].startsWith(urlPrefix)}
