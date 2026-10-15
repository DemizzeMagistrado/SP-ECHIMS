'use client'
import {useEffect,useRef,useState} from 'react'
import {refreshOfflineViews as mutate} from '@/lib/offline/refresh'
import {useAuth} from '@/components/auth/auth-provider'
import {canPerform} from '@/lib/echims-data'
import {drainQueue,listQueuedVaccinations,retryVaccinationDraft,discardBlockedVaccinationDraft,type QueuedVaccination} from '@/lib/vaccination-offline'
import {readVaccinationView,vaccinationScope,vaccinationKeyMatches} from '@/lib/vaccination-cache'
export function VaccinationSnapshotNotice({savedAt,readOnly}:{savedAt?:string;readOnly:boolean}){return readOnly?<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Downloaded snapshot · {savedAt?new Date(savedAt).toLocaleString('en-PH'):'not prepared'}. Review, stock allocation and SMS sending require a live connection.</p>:null}
export function VaccinationOfflineTools(){
 const {user}=useAuth(),owner=user?.id??null,ref=useRef(owner);ref.current=owner
 const [rows,setRows]=useState<QueuedVaccination[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const [online,setOnline]=useState(true),[showReview,setShowReview]=useState(false)
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 const [acting,setActing]=useState<string|null>(null)
 const actionRunning=useRef(false)
 const running=useRef(false)
 async function refresh(id:string){const q=await listQueuedVaccinations(id);if(ref.current===id)setRows(q)}
 async function sync(id:string){if(!navigator.onLine||running.current||ref.current!==id)return;running.current=true
 try{const result=await drainQueue(id);if(ref.current===id){await refresh(id);if(result.sent){setMessage(`${result.sent} draft(s) synchronized. Existing record approval is separate.`);await mutate(key=>vaccinationKeyMatches(key,'/api/vaccination/records'))}}}catch(e){if(ref.current===id)setMessage(e instanceof Error?e.message:'Sync paused; drafts retained.')}finally{running.current=false}}
 useEffect(()=>{setRows([]);setMessage('');setBusy(false);if(!owner)return;const id=owner;let active=true;const refreshOnly=()=>{void refresh(id).catch(e=>{if(active&&ref.current===id)setMessage(String(e))})},wake=()=>{void sync(id)};refreshOnly();wake();const timer=window.setInterval(wake,45000);window.addEventListener('online',wake);window.addEventListener('focus',wake);window.addEventListener('echims-vaccination-queue',refreshOnly);return()=>{active=false;window.clearInterval(timer);window.removeEventListener('online',wake);window.removeEventListener('focus',wake);window.removeEventListener('echims-vaccination-queue',refreshOnly)}},[owner])
 async function actOnDraft(row:QueuedVaccination,action:'retry'|'delete'){
  if(!owner||actionRunning.current)return
  if(action==='delete'&&!window.confirm(`Delete the local draft for ${row.childName}, ${row.vaccineLabel}, dose ${row.payload.dose_number}? Saved vaccination records and inventory will remain unchanged.`))return
  const id=owner;actionRunning.current=true;setActing(row.key)
  try{
   if(action==='delete'){await discardBlockedVaccinationDraft(id,row.requestId);if(ref.current===id)setMessage('Local draft deleted. Saved vaccination records are unchanged.')}
   else{const result=await retryVaccinationDraft(id,row.requestId);if(ref.current===id){setMessage(result.ok?'Draft saved.':result.error);if(result.ok)await mutate(key=>vaccinationKeyMatches(key,'/api/vaccination/records'))}}
  }catch(e){if(ref.current===id)setMessage(e instanceof Error?e.message:'Unable to update this draft.')}
  finally{actionRunning.current=false;if(ref.current===id){setActing(null);await refresh(id)}}
 }
 async function prepare(){if(!user||busy)return;const u=user,id=u.id;setBusy(true);const failures:string[]=[];let count=0
 const urls=['/api/children?view=vaccination-options','/api/vaccines','/api/vaccination/records']
 if(canPerform(u.role,'Vaccination Schedule','view'))urls.push('/api/vaccination/schedule','/api/vaccination/schedule?status=PENDING')
 if(canPerform(u.role,'Vaccination','view'))urls.push('/api/vaccination/defaulters?status=OVERDUE')
 if(canPerform(u.role,'NIP Catalog','view'))urls.push('/api/vaccines/catalog')
 if(canPerform(u.role,'Vaccine Batch Requests','view'))urls.push('/api/vaccination/batch-requests')
 try{for(const url of urls){if(ref.current!==id)return;try{const result=await readVaccinationView(id,vaccinationScope(u),url);if(result.fromCache)failures.push(url+' (connection unavailable)');else count++}catch{failures.push(url)}}if(ref.current===id){setMessage(`${count} view(s) downloaded.${failures.length?` ${failures.length} views could not be saved. Reconnect and retry.`:' Ready for offline use.'}`);await mutate(key=>vaccinationKeyMatches(key,'/api/'))}}finally{if(ref.current===id)setBusy(false)}}
 return <section aria-label="Offline vaccination queue" className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{online?'Pending offline drafts':'Offline'} · {rows.length} local draft{rows.length===1?'':'s'}</h2><p className="text-xs text-muted-foreground">Pending drafts retry when online. Conflicts remain for recorder review. Record approval is handled separately.</p></div><button type="button" disabled={rows.length===0} onClick={()=>setShowReview(v=>!v)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50">{showReview?'Hide pending drafts':'Review pending drafts'}</button></div>
  {message&&<p role="status" className="text-sm">{message}</p>}
  {showReview&&<div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy||!online} onClick={()=>void prepare()} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50">{busy?'Preparing…':'Refresh saved views'}</button><button type="button" disabled={!online} onClick={()=>owner&&void sync(owner)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50">Sync now</button><span className="text-xs text-muted-foreground">{rows.filter(r=>r.status==='PENDING').length} pending · {rows.filter(r=>r.status==='BLOCKED').length} need review</span></div>
  {rows.map(r=><article key={r.key} className="rounded-lg border border-border bg-white p-3 text-sm"><p className="font-semibold">{r.childName} · {r.vaccineLabel} · Dose {r.payload.dose_number}</p><p>{r.payload.vaccination_date} · {r.status==='BLOCKED'?'Needs review':'Pending sync'}</p>{r.lastError&&<p className="mt-1 text-rose-700">{r.lastError}</p>}{r.status==='BLOCKED'&&<div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!online||acting!==null} className="rounded border px-3 py-1 disabled:opacity-50" onClick={()=>void actOnDraft(r,'retry')}>Recheck unchanged draft</button><button type="button" disabled={acting!==null} className="rounded border border-rose-300 px-3 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50" onClick={()=>void actOnDraft(r,'delete')}>{acting===r.key?'Working…':'Delete draft'}</button></div>}</article>)}
  </div>}
 </section>
}
