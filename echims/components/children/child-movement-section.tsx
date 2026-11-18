'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform } from '@/lib/echims-data'

type Props = {childId:number; householdId:number|null; barangayId:number; registryStatus:string; dateOfBirth:string; canEdit:boolean; onSaved?:()=>void}
type Movement = {movement_id:number; movement_type:string; movement_date:string; status:string; reason:string|null; previous_address:string|null; new_address:string|null; remarks:string|null; from_household_id:number|null; to_household_id:number|null; recorded_by:string|null}
type Household = {household_id:number; household_no:string; household_address:string|null; barangay_id:number}
type Barangay = {barangay_id:number; barangay_name:string}
type Transfer = {requestId:string; expectedHouseholdId:number|null; expectedBarangayId:number; toHouseholdId:number; movementDate:string; reason:string; remarks:string|null}
const button='rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary disabled:opacity-50'
const input='w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'
async function json(url:string, init?:RequestInit):Promise<unknown> {
  const response=await fetch(url,{...init,cache:'no-store'})
  let value:unknown
  try {value=await response.json()} catch {throw new Error('The server returned a page instead of JSON. Check the API route.')}
  if(!response.ok) {const message=value && typeof value==='object' && 'error' in value ? String(value.error):'Request failed.';throw Object.assign(new Error(message),{status:response.status})}
  return value
}
async function list<T>(url:string):Promise<T[]> {const value=await json(url);if(!Array.isArray(value))throw new Error('Unexpected API response.');return value as T[]}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function ChildMovementSection(props:Props) {
  const {user,isReady}=useAuth()
  if(!isReady || !user || user.accountStatus!=='APPROVED' || !canPerform(user.role,'Child Profiling','view'))return null
  return <MovementPanel key={`${user.id}:${props.childId}`} {...props} owner={user.id} canEdit={props.canEdit && user.role!=='Administrator' && canPerform(user.role,'Child Profiling','edit')}/>
}
function MovementPanel({owner,childId,householdId,barangayId,registryStatus,dateOfBirth,canEdit,onSaved}:Props & {owner:string}) {
  const {user}=useAuth()
  const currentOwner=useRef(user?.id);currentOwner.current=user?.id
  useEffect(()=>()=>{currentOwner.current=undefined},[])
  const {data:records,error,mutate}=useSWR([owner,childId,'movement'],()=>list<Movement>(`/api/children/${childId}/movement`),{revalidateOnFocus:true})
  const [open,setOpen]=useState(false),[destinationBarangay,setDestinationBarangay]=useState(String(barangayId)),[query,setQuery]=useState(''),[search,setSearch]=useState('')
  const [selected,setSelected]=useState<Household|null>(null),[date,setDate]=useState(today),[reason,setReason]=useState(''),[remarks,setRemarks]=useState(''),[confirmed,setConfirmed]=useState(false)
  const [pending,setPending]=useState<Transfer|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('')
  const sending=useRef(false)
  const {data:barangays,error:barangayError}=useSWR(open?[owner,'movement-barangays']:null,()=>list<Barangay>('/api/barangays'))
  const {data:households,error:searchError,isLoading:searchLoading}=useSWR(open && search?[owner,destinationBarangay,search]:null,()=>list<Household>(`/api/households?barangayId=${encodeURIComponent(destinationBarangay)}&q=${encodeURIComponent(search)}`))
  if(user?.id!==owner)return null
  const editable=canEdit && registryStatus==='ACTIVE'
  async function send(payload:Transfer) {
    if(sending.current || currentOwner.current!==owner || !navigator.onLine)return
    sending.current=true;setBusy(true);setFailure('');setMessage('')
    try {
      await json(`/api/children/${childId}/household-transfer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      if(currentOwner.current!==owner)return
      setPending(null);setOpen(false);setSelected(null);setSearch('');setQuery('');setReason('');setRemarks('');setConfirmed(false)
      setMessage('Household transfer saved. Movement history updated.');void mutate();onSaved?.()
    } catch(error) {
      if(currentOwner.current!==owner)return
      const status=error && typeof error==='object' && 'status' in error?Number(error.status):0
      if(status>=400 && status<500){setPending(null);if(status===409)onSaved?.()}
      setFailure(error instanceof Error?error.message:'Unable to transfer household.')
    } finally {sending.current=false;if(currentOwner.current===owner)setBusy(false)}
  }
  function submit(event:FormEvent) {
    event.preventDefault()
    if(!editable || !selected || !confirmed || !reason.trim())return
    if(!navigator.onLine){setFailure('Reconnect before recording a household transfer.');return}
    const payload:Transfer={requestId:crypto.randomUUID(),expectedHouseholdId:householdId,expectedBarangayId:barangayId,toHouseholdId:selected.household_id,movementDate:date,reason:reason.trim(),remarks:remarks.trim()||null}
    setPending(payload);void send(payload)
  }
  return <section className="rounded-2xl border border-border bg-white p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-primary">Movement History</h2><p className="text-sm text-muted-foreground">Recorded household transfers and previous movement records.</p></div><div className="flex gap-2"><button className={button} type="button" onClick={()=>void mutate()}>Refresh</button>{editable && !open && <button type="button" className={button} onClick={()=>{setOpen(true);setMessage('');setFailure('')}}>Transfer within RHU</button>}</div></div>
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}{failure && <p role="alert" className="text-sm text-red-700">{failure}</p>}
    {open && <form onSubmit={submit} className="rounded-xl border border-border bg-slate-50 p-4 space-y-4">
      <p className="text-sm">Record a confirmed household move within the same RHU. The child stays Active. You must be authorized for both locations.</p>
      {pending ? <div className="space-y-3 text-sm"><p>A request may already have reached the server. Retry sends the same details and request ID. Keep this page open until its result is confirmed.</p><p>Destination household #{pending.toHouseholdId} · {pending.movementDate}</p><button type="button" disabled={busy} className={button} onClick={()=>void send(pending)}>{busy?'Saving…':'Retry same transfer'}</button></div> : <>
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm">Destination barangay<select required className={input} value={destinationBarangay} onChange={e=>{setDestinationBarangay(e.target.value);setSelected(null);setSearch('')}}><option value="">Select barangay</option>{barangays?.map(b=><option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}</select></label>
      <label className="space-y-1 text-sm">Actual movement date<input type="date" className={input} required min={dateOfBirth} max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label></div>
      {barangayError && <p role="alert" className="text-sm text-red-700">Unable to load barangays. Close and reopen the form to retry.</p>}
      <label className="block space-y-1 text-sm">Find existing destination household<input className={input} value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Household number or address"/></label>
      <button type="button" className={button} disabled={!query.trim() || !destinationBarangay} onClick={()=>{setSelected(null);setSearch(query.trim())}}>Search households</button>
      {searchLoading && <p role="status" className="text-sm">Searching households…</p>}{searchError && <p role="alert" className="text-sm text-red-700">Unable to search households.</p>}
      {search && households && <div className="space-y-2">{households.filter(h=>h.household_id!==householdId).map(h=><label key={h.household_id} className="flex items-center gap-3 rounded-lg border bg-white p-3 text-sm"><input type="radio" name="destination" checked={selected?.household_id===h.household_id} onChange={()=>setSelected(h)}/><span>{h.household_no} — {h.household_address??'No address recorded'}</span></label>)}{households.filter(h=>h.household_id!==householdId).length===0 && <p className="text-sm">No other matching household found in your accessible records.</p>}<p className="text-xs text-muted-foreground">Up to 20 matches. Narrow the search if needed.</p></div>}
      <label className="block space-y-1 text-sm">Reason<textarea className={input} required maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="block space-y-1 text-sm">Remarks (optional)<textarea className={input} maxLength={2000} value={remarks} onChange={e=>setRemarks(e.target.value)}/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I verified the destination household and actual movement date.</label>
      <div className="flex gap-2"><button className={button} disabled={!selected || !confirmed || !reason.trim() || busy} type="submit">Save household transfer</button><button type="button" className={button} onClick={()=>setOpen(false)}>Cancel</button></div></>}
    </form>}
    {error ? <p role="alert" className="text-sm text-red-700">Unable to load movement history. Use Refresh to retry.</p>:!records?<p role="status" className="text-sm">Loading movement history…</p>:records.length===0?<p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">No movement recorded for this child.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date / Type','Households','Address change','Reason / Remarks','Recorded by'].map(h=><th key={h} className="p-3 text-xs uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{records.map(r=><tr key={r.movement_id}><td className="p-3">{r.movement_date}<div className="font-medium">{r.movement_type}</div><span className="text-xs">Status at recording: {r.status}</span></td><td className="p-3">{r.from_household_id??'Unknown'} → {r.to_household_id??'Unknown'}</td><td className="p-3"><div>From: {r.previous_address??'Not recorded'}</div><div>To: {r.new_address??'Not recorded'}</div></td><td className="p-3 whitespace-pre-wrap">{r.reason??'Not recorded'}{r.remarks && <div className="text-muted-foreground">{r.remarks}</div>}</td><td className="p-3 break-all">{r.recorded_by??'Not recorded (legacy)'}</td></tr>)}</tbody></table></div>}
  </section>
}
