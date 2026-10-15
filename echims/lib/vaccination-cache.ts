'use client'
import { createClient } from '@/lib/supabase/client'
import { loadData,saveData } from '@/lib/offline/store'
import type { AuthUser } from '@/components/auth/auth-provider'
export type CachedView<T>={ownerId:string;scope:string;savedAt:string;data:T;fromCache:boolean}
export class VaccinationReadError extends Error{constructor(message:string,public status:number){super(message)}}
export function vaccinationScope(user:Pick<AuthUser,'role'|'rhu_id'|'barangay_ids'>){return JSON.stringify([user.role,user.rhu_id??'',[...(user.barangay_ids??[])].sort()])}
async function request(url:string){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});const d:unknown=await r.json().catch(()=>null);if(!r.ok)throw new VaccinationReadError(d&&typeof d==='object'&&'error' in d?String(d.error):`Unable to load (${r.status}).`,r.status);return d}
async function context(ownerId:string,scope:string){const d=await request('/api/offline/context') as {user?:AuthUser};if(d.user?.id!==ownerId||vaccinationScope(d.user)!==scope)throw new VaccinationReadError('The account or workplace changed. Refresh your session online.',403)}
export async function readVaccinationView<T>(ownerId:string,scope:string,url:string):Promise<CachedView<T>>{
 if(!url.startsWith('/api/vaccination/')&&!['/api/children','/api/vaccines','/api/vaccines/catalog'].includes(url))throw new Error('Unsupported offline vaccination endpoint.')
 const key='VACCINATION_API:'+scope+':'+url
 if(navigator.onLine){try{
  await context(ownerId,scope)
  const data=await request(url) as T
  await context(ownerId,scope)
  const session=await createClient().auth.getSession();if(session.data.session?.user.id!==ownerId)throw new VaccinationReadError('Account changed while downloading.',403)
  if(data&&typeof data==='object'&&'currentUserId' in data&&data.currentUserId!==ownerId)throw new VaccinationReadError('Response belongs to another account.',403)
  const view:CachedView<T>={ownerId,scope,savedAt:new Date().toISOString(),data,fromCache:false}
  await saveData(ownerId,key,view);return view
 }catch(e){if(e instanceof VaccinationReadError&&e.status<500)throw e;}}
 const cached=await loadData<CachedView<T>>(ownerId,key)
 if(cached?.data.ownerId===ownerId&&cached.data.scope===scope)return {...cached.data,fromCache:true}
 throw new VaccinationReadError('This view has not been downloaded for this account. Open it online or use Prepare offline.',0)
}
export function vaccinationKeyMatches(key:unknown,urlPrefix:string){return typeof key==='string'?key.startsWith(urlPrefix):Array.isArray(key)&&key[0]==='vaccination-view'&&typeof key[3]==='string'&&key[3].startsWith(urlPrefix)}
