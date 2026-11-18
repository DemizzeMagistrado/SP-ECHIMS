'use client'
import {offlineFetch as fetch} from '@/lib/offline/fetch'
import {useState} from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {useAuth} from '@/components/auth/auth-provider'
import {ModuleTabs} from '@/components/dashboard/module-tabs'
import {TransferredChildrenArchive} from '@/components/children/transferred-children-archive'
type Row={child_id:number;name:string;date_of_birth:string;registry_status:string;barangay_name:string;archived_effective_on:string}
type Page={currentUserId:string;records:Row[];nextBeforeId:number|null;evaluatedOn:string}
export function ChildArchives(){
 const {user,isReady}=useAuth();const allowed=isReady&&!!user&&user.accountStatus==='APPROVED'&&['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(user.role)
 const [tab,setTab]=useState<'AGE'|'TRANSFER'>('AGE'),[cursor,setCursor]=useState<number|null>(null)
 const {data,error,isLoading,mutate}=useSWR(allowed&&tab==='AGE'?[user!.id,'age-archive',cursor]:null,async([owner,,before])=>{const r=await fetch('/api/children/age-archive'+(before?'?beforeId='+before:''),{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error??'Unable to load age archive.');if(b.currentUserId!==owner||!Array.isArray(b.records))throw Error('Session changed. Refresh.');return b as Page},{refreshInterval:60000,shouldRetryOnError:false})
 if(!isReady)return <p>Loading…</p>
 if(!allowed)return <p role="alert">Assigned PHN, RHM or BHW access is required.</p>
 const page=data?.currentUserId===user!.id?data:null
 return <div className="space-y-5">{tab==='AGE'&&<ModuleTabs parent="Child Profiling" role={user!.role}/>}<div className="flex flex-wrap gap-2" aria-label="Archive categories"><button type="button" aria-pressed={tab==='AGE'} className="rounded-full border bg-white px-4 py-2 text-sm" onClick={()=>setTab('AGE')}>Age five and above</button><button type="button" aria-pressed={tab==='TRANSFER'} className="rounded-full border bg-white px-4 py-2 text-sm" onClick={()=>setTab('TRANSFER')}>Transferred out</button></div>{tab==='TRANSFER'?<TransferredChildrenArchive/>:<><h1 className="text-2xl font-semibold text-primary">Archived Children — Age Five and Above</h1><p className="text-sm text-muted-foreground">Children leave the under-five list on their fifth birthday. Their searchable profile, service history and continuing care remain available. This does not mark them inactive or lost to follow-up.</p><button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={()=>void mutate()}>Refresh</button>{error?<p role="alert" className="text-red-700">{error.message}</p>:isLoading||!page?<p>Loading archive…</p>:page.records.length===0?<p className="rounded-xl bg-white p-5">No age-five archived children in your assigned scope.</p>:<div className="space-y-3">{page.records.map(row=><article key={row.child_id} className="space-y-2 rounded-xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{row.name}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">Archived · Age five+</span></div><p className="text-sm">{row.barangay_name} · Born {row.date_of_birth} · Archived effective {row.archived_effective_on}</p><Link className="text-sm text-primary underline" href={'/child-profiling/children/'+row.child_id}>View retained profile and continuing care</Link></article>)}</div>}<div className="flex gap-3">{cursor&&<button className="underline" onClick={()=>setCursor(null)}>Latest</button>}{page?.nextBeforeId&&<button className="underline" onClick={()=>setCursor(page.nextBeforeId)}>Older records</button>}</div></>}</div>
}
