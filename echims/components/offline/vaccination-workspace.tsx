'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { loadData, saveData } from '@/lib/offline/store'
import { drainQueue, listQueuedVaccinations, newClientRequestId, sendOrQueueVaccination, retryVaccinationDraft, type QueuedVaccination, type VaccinationPayload } from '@/lib/vaccination-offline'
type Child={child_id:number;first_name:string;middle_name:string|null;last_name:string;date_of_birth:string}
type Vaccine={vaccine_id:number;vaccine_type:string}
type Snapshot={currentUserId:string;children:Child[];vaccines:Vaccine[];rows:{vaccination_record_id:number;vaccination_date:string;status:string}[];canCreate:boolean}
const field='w-full rounded-lg border border-gray-300 bg-white p-2'
function today(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(t=>p.find(x=>x.type===t)?.value).join('-')}
async function get(url:string){const r=await fetch(url,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error??'Unable to load data.');return d}
export function VaccinationWorkspace(){
 const {user}=useAuth(),owner=user?.id??null,ownerRef=useRef(owner);ownerRef.current=owner
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[savedAt,setSavedAt]=useState(''),[queue,setQueue]=useState<QueuedVaccination[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const [form,setForm]=useState({child:'',vaccine:'',dose:'1',date:'',batch:'',site:'',remarks:''})
 const busyRef=useRef(false)
 const formOwner=useRef(owner)
 async function refresh(id:string){const rows=await listQueuedVaccinations(id);if(ownerRef.current===id)setQueue(rows)}
 async function sync(id:string){if(!navigator.onLine||busyRef.current||ownerRef.current!==id)return;busyRef.current=true
 try{const result=await drainQueue(id);if(ownerRef.current===id){if(result.sent)setMessage(`${result.sent} draft(s) saved on the server. PHN record approval remains separate.`);await refresh(id)}}catch(e){if(ownerRef.current===id)setError(e instanceof Error?e.message:'Sync failed; drafts retained.')}finally{busyRef.current=false}}
 async function prepare(){if(!owner||!navigator.onLine||busy)return;const id=owner;setBusy(true);setError('')
 try{
 const context=await get('/api/offline/context');if(context.user.id!==id||ownerRef.current!==id)throw new Error('Account changed. Retry with the correct account.')
 const [children,vaccines,records]=await Promise.all([get('/api/children'),get('/api/vaccines'),get('/api/vaccination/records')])
 const after=await get('/api/offline/context');if(after.user.id!==id||records.currentUserId!==id||ownerRef.current!==id)throw new Error('Account changed while downloading. Nothing was cached.')
 const data:Snapshot={currentUserId:id,children:children.children??[],vaccines:vaccines.vaccines??[],rows:records.rows??[],canCreate:records.can_create===true}
 await saveData(id,'VACCINATION',data);if(ownerRef.current===id){setSnapshot(data);setSavedAt(new Date().toISOString());setMessage('Vaccination options and latest records downloaded for this account.');await sync(id)}
 }catch(e){if(ownerRef.current===id)setError(e instanceof Error?e.message:'Unable to download data.')}finally{if(ownerRef.current===id)setBusy(false)}}
 useEffect(()=>{if(!owner)return;const id=owner;let alive=true;setSnapshot(null);setQueue([]);setError('');setMessage('');setBusy(false);setForm({child:'',vaccine:'',dose:'1',date:today(),batch:'',site:'',remarks:''});formOwner.current=id
 void loadData<Snapshot>(id,'VACCINATION').then(row=>{if(alive&&ownerRef.current===id&&row?.data.currentUserId===id){setSnapshot(row.data);setSavedAt(row.savedAt)}}).catch(e=>{if(alive)setError(String(e))})
 void refresh(id).catch(e=>{if(alive)setError(String(e))})
 const update=()=>{void refresh(id).catch(e=>{if(alive)setError(String(e))})};const reconnect=()=>{void sync(id)}
 window.addEventListener('echims-vaccination-queue',update);window.addEventListener('online',reconnect);window.addEventListener('focus',reconnect)
 const timer=window.setInterval(reconnect,45000);reconnect()
 return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('echims-vaccination-queue',update);window.removeEventListener('online',reconnect);window.removeEventListener('focus',reconnect)}
 // Owner change recreates the subscription; functions always recheck captured owner.
 },[owner])
 async function save(e:FormEvent){e.preventDefault();if(!owner||!snapshot?.canCreate||snapshot.currentUserId!==owner||formOwner.current!==owner||busy)return;const id=owner;setError('');setBusy(true)
 try{const child=snapshot.children.find(c=>c.child_id===Number(form.child)),vaccine=snapshot.vaccines.find(v=>v.vaccine_id===Number(form.vaccine));if(!child||!vaccine)throw new Error('Select downloaded child and vaccine options.')
 if(!Number.isSafeInteger(Number(form.dose))||Number(form.dose)<=0||!form.date||form.date>today()||form.date<child.date_of_birth)throw new Error('Check the dose and vaccination date.')
 const payload:VaccinationPayload={child_id:child.child_id,vaccine_id:vaccine.vaccine_id,dose_number:Number(form.dose),vaccination_date:form.date,batch_number:form.batch.trim()||null,vaccination_site:form.site.trim()||null,remarks:form.remarks.trim()||null,schedule_id:null,client_request_id:newClientRequestId()}
 const result=await sendOrQueueVaccination(id,payload,{childName:[child.first_name,child.middle_name,child.last_name].filter(Boolean).join(' '),vaccineLabel:vaccine.vaccine_type});if(ownerRef.current!==id)return
 setMessage(result.ok?'Saved on the server—pending PHN record approval.':result.error);await refresh(id);setForm(f=>({...f,remarks:''}))
 }catch(e){if(ownerRef.current===id)setError(e instanceof Error?e.message:'Save failed. Keep your form open.')}finally{if(ownerRef.current===id)setBusy(false)}}
 return <section className="space-y-4"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">Vaccination offline records</h2><button className="rounded-lg bg-sky-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={()=>void prepare()}>Download / refresh data</button><button className="rounded-lg border px-4 py-2" onClick={()=>owner&&void sync(owner)}>Sync now</button></div><p className="text-sm text-gray-600">Latest 200 records. Last download: {savedAt||'Not prepared'}. Download while online before fieldwork.</p>{error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800">{error}</p>}{message&&<p role="status" className="rounded-lg bg-sky-50 p-3">{message}</p>}
 {!snapshot?<p>Prepare this account online to enable offline entry.</p>:snapshot.canCreate&&<form onSubmit={save} className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2"><label>Child<select required className={field} value={form.child} onChange={e=>setForm({...form,child:e.target.value})}><option value="">Select child</option>{snapshot.children.map(c=><option key={c.child_id} value={c.child_id}>{c.last_name}, {c.first_name}</option>)}</select></label><label>Vaccine<select required className={field} value={form.vaccine} onChange={e=>setForm({...form,vaccine:e.target.value})}><option value="">Select vaccine</option>{snapshot.vaccines.map(v=><option key={v.vaccine_id} value={v.vaccine_id}>{v.vaccine_type}</option>)}</select></label><label>Dose<input className={field} required type="number" min="1" step="1" value={form.dose} onChange={e=>setForm({...form,dose:e.target.value})}/></label><label>Date administered<input className={field} required type="date" value={form.date} max={today()} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>Batch number<input className={field} maxLength={200} value={form.batch} onChange={e=>setForm({...form,batch:e.target.value})}/></label><label>Vaccination site<input className={field} maxLength={500} value={form.site} onChange={e=>setForm({...form,site:e.target.value})}/></label><label className="md:col-span-2">Remarks<textarea className={field} maxLength={2000} value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})}/></label><button className="rounded-lg bg-sky-700 p-2 text-white disabled:opacity-50" disabled={busy}>{busy?'Saving…':'Save record'}</button></form>}
 <h3 className="font-semibold">Pending sync / recorder review ({queue.length})</h3>{queue.map(row=><article key={row.key} className="rounded-xl border bg-white p-4"><p className="font-semibold">{row.childName} — {row.vaccineLabel}, dose {row.payload.dose_number}</p><p>{row.payload.vaccination_date} · {row.status==='BLOCKED'?'Needs recorder review':'Pending sync'}</p>{row.lastError&&<p className="text-sm text-rose-700">{row.lastError}</p>}{row.status==='BLOCKED'&&<button className="mt-2 rounded-lg border px-3 py-2" disabled={busy} onClick={()=>{if(!owner)return;const id=owner;setBusy(true);void retryVaccinationDraft(id,row.requestId).then(result=>{if(ownerRef.current===id)setMessage(result.ok?'Saved.':result.error)}).catch(e=>{if(ownerRef.current===id)setError(String(e))}).finally(()=>{if(ownerRef.current===id){setBusy(false);void refresh(id)}})}}>Recheck unchanged draft</button>}</article>)}
 {snapshot&&<details className="rounded-xl border bg-white p-4"><summary>Downloaded record status ({snapshot.rows.length})</summary>{snapshot.rows.map(r=><p key={r.vaccination_record_id}>#{r.vaccination_record_id} · {r.vaccination_date} · {r.status}</p>)}</details>}
 </section>
}
