'use client'
import Link from 'next/link'
import { ReminderMessage } from '@/components/sms/reminder-message'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
type Row={source_key:string;program:string;kind:string;due_date:string;start_time:string|null;title:string;phase:string;message:string;preview_signature:string;last_status:string|null;can_send:boolean}
type Panel={currentUserId:string;childId:number;childName:string;contactStatus:string;maskedNumber:string|null;records:Row[];liveEnabled:boolean}
type Intent={requestId:string;requestOwnerId:string;childId:number;sourceKey:string;previewSignature:string;language:string;venue:string;confirmedDetails:true}
const storageKey='echims.child-schedule-sms.pending.v1'
const field='rounded-lg border border-slate-300 bg-white p-2 text-sm'
/** `embedded`: shown in the child profile's popup, which gives the title; no card, heading or profile link. */
export function ChildScheduleSmsPanel({childId,embedded=false}:{childId?:number;embedded?:boolean}){
 const [id,setId]=useState(childId?String(childId):''),[language,setLanguage]=useState('TL'),[venue,setVenue]=useState(''),[data,setData]=useState<Panel|null>(null),[selected,setSelected]=useState('')
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[online,setOnline]=useState(true),[pending,setPending]=useState<Intent|null>(null)
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 async function load(){
  if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))){setMessage('Use the numeric child ID from the profile.');return}
  setBusy(true);setMessage('')
  try{
   const q=new URLSearchParams({childId:id,language,venue})
   const r=await fetch('/api/sms/child-reminders?'+q,{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error??'Unable to load reminders.')
   setData(b);setSelected('');setConfirmed(false)
   const saved=sessionStorage.getItem(storageKey);if(saved){const p=JSON.parse(saved) as Intent;setPending(p);if(p.requestOwnerId!==b.currentUserId)setMessage('Saved send belongs to another account. Sign back in to inspect its result.')}
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to load reminders.')}finally{setBusy(false)}
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{if(childId)void load()},[childId])
 function invalidate(){setData(null);setSelected('');setConfirmed(false)}
 const row=data?.records.find(r=>r.source_key===selected)
 async function send(){
  if(!data||!online)return
  let intent=pending
  if(!intent){
   if(!row?.can_send||!confirmed)return
   intent={requestId:crypto.randomUUID(),requestOwnerId:data.currentUserId,childId:data.childId,sourceKey:row.source_key,previewSignature:row.preview_signature,language,venue:venue.trim(),confirmedDetails:true}
   try{sessionStorage.setItem(storageKey,JSON.stringify(intent))}catch{setMessage('Enable browser storage before sending.');return}setPending(intent)
  }
  setBusy(true);setMessage('')
  try{
   const r=await fetch('/api/sms/child-reminders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)});const b=await r.json()
   if(!r.ok)throw Error(b.error??'Result uncertain. Inspect this same saved request.')
   if(b.currentUserId!==intent.requestOwnerId)throw Error('Session changed. Sign back in to inspect the saved request.')
   sessionStorage.removeItem(storageKey);setPending(null);setMessage(b.message??'Request saved.');setConfirmed(false)
   setData(d=>d?{...d,records:d.records.map(r=>r.source_key===intent.sourceKey?{...r,can_send:false,last_status:b.result?.status??'UNCERTAIN'}:r)}:d)
  }catch(e){setMessage(e instanceof Error?e.message:'Connection interrupted. Inspect the same saved request.')}finally{setBusy(false)}
 }
 return <section className={embedded?'text-blue-950':'rounded-2xl border border-slate-200 bg-white p-5 text-blue-950'}>
  {!embedded&&<h1 className="text-xl font-semibold">Child schedule SMS reminders</h1>}
  <p className={embedded?'text-sm text-slate-600':'mt-2 text-sm text-slate-600'}>Vaccination, follow-up checkups and supplementation for one child. Guardian SMS consent and OTP verification of the current phone are required.</p>
  {!online&&<p className="mt-3 text-sm text-amber-800">Reconnect to preview or send SMS.</p>}
  {message&&<p role="status" className="my-3 rounded-lg bg-amber-50 p-3 text-sm">{message}</p>}
  {pending&&<div className="my-3 rounded-lg bg-amber-50 p-3 text-sm"><p>Saved send for child #{pending.childId}. Inspect its result before starting another send.</p><button className={field+' mt-2'} disabled={busy||!online||pending.requestOwnerId!==data?.currentUserId} onClick={()=>void send()}>Inspect same saved request</button></div>}
  <div className="my-4 flex flex-wrap gap-3">
   <label className="flex flex-col gap-1 text-sm">Child ID<input className={field} inputMode="numeric" value={id} disabled={busy||!!pending} onChange={e=>{setId(e.target.value);invalidate()}}/></label>
   <label className="flex flex-col gap-1 text-sm">Language<select className={field} value={language} disabled={busy||!!pending} onChange={e=>{setLanguage(e.target.value);invalidate()}}><option value="TL">Tagalog</option><option value="EN">English</option></select></label>
   <label className="flex flex-col gap-1 text-sm">Confirmed venue / contact facility<input className={field} value={venue} maxLength={60} disabled={busy||!!pending} placeholder="e.g. Bibirao BHS" onChange={e=>{setVenue(e.target.value);invalidate()}}/></label>
   <Button variant="secondary" className="self-end" disabled={busy||!online} onClick={()=>void load()}>Refresh reminders</Button>
  </div>
  {data&&<>
   <Link className="mb-2 inline-block text-sm text-link hover:underline" href={`/alerts?tab=SMS_LOGS&child=${data.childId}`}>View SMS logs</Link>
   <p className="text-sm font-medium">{data.childName} · {data.maskedNumber??'No valid number'} · {data.contactStatus.replaceAll('_',' ')}</p>
   {!embedded&&<Link className="mt-2 inline-block text-sm underline" href={'/child-profiling/children/'+data.childId}>Open child profile / guardian SMS verification</Link>}
   {!data.liveEnabled&&<p className="mt-2 text-sm text-amber-800">Live iProg sending is disabled in server configuration.</p>}
   <label className="mt-4 flex flex-col gap-1 text-sm">Saved service<select className={field} disabled={busy||!!pending} value={selected} onChange={e=>{setSelected(e.target.value);setConfirmed(false)}}><option value="">Choose service</option>{data.records.map(r=><option key={r.source_key} value={r.source_key}>{r.title} · {r.due_date} · {r.kind} · {r.phase}{r.last_status?' · '+r.last_status:''}</option>)}</select></label>
   {!data.records.length&&<p className="mt-3 text-sm">No current reminders. Completed, cancelled and rescheduled entries are excluded; routine under-five reminders end at the fifth birthday.</p>}
   {row&&<>
    <div className="my-4 rounded-lg bg-slate-50 p-3 text-sm"><p className="mb-2 font-semibold">Full preview with your provider header and footer</p><ReminderMessage body={row.message} live /></div>
    <p className="text-xs text-slate-500">{row.start_time?'':'No time is stored for this service; confirm the time with the facility.'}</p>
    {!row.can_send&&<p className="mt-2 text-sm text-amber-800">Sending unavailable. Check consent, current phone verification, sender permission, venue and existing attempts.</p>}
    <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||!!pending} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the child, current service, date and venue. This reminder is appropriate.</label>
    <Button className="mt-3" disabled={busy||!online||!!pending||!data.liveEnabled||!row.can_send||!confirmed||!venue.trim()} onClick={()=>void send()}>{busy?'Processing…':'Send reminder'}</Button>
   </>}
  </>}
 </section>
}
