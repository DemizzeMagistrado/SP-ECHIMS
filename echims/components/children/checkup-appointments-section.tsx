'use client'
import Link from 'next/link'
import {offlineFetch as fetch} from '@/lib/offline/fetch'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { CalendarDays, CheckCircle2, RefreshCw } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform } from '@/lib/echims-data'
import { childProgramEligibility, manilaDate } from '@/lib/child-program-eligibility'

type Appointment = {
  appointment_id: number; scheduled_on: string; status: 'SCHEDULED'|'COMPLETED'|'CANCELLED'|'RESCHEDULED'
  completed_on: string|null; previous_appointment_id: number|null; notes: string; revision: number
  recorded_at: string; updated_at: string; isDefaulter: boolean
}
type Page = {currentUserId: string; childId: number; evaluatedOn: string; records: Appointment[]; nextBeforeId: number|null}
type Action = 'CREATE'|'RESCHEDULE'|'COMPLETE'|'CANCEL'
type Draft = {action: Action; appointment: Appointment|null; date: string; notes: string; confirmed: boolean}
type Payload = {requestId: string; action: Action; appointmentId?: number; expectedRevision?: number; date?: string; notes: string}
type Props = {childId: number; dateOfBirth: string|null; registryStatus: string; canEdit: boolean}
const button = 'rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
function displayDate(value: string|null) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date) : value
}
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  let body: unknown
  try { body = JSON.parse(text) } catch {
    const route='/api/children/<numeric child_id>/checkup-appointments'
    const hint=response.redirected?'The request was redirected; check sign-in and middleware.':response.status===404?'The API route was not found; restore app/api/children/[childId]/checkup-appointments/route.ts.':'Check the Next.js terminal for a route compilation or middleware error.'
    throw new Error(`Checkup API returned HTML/non-JSON (HTTP ${response.status}). ${hint} Requested route: ${response.url || route}`)
  }
  if (!body || typeof body!=='object' || Array.isArray(body)) throw new Error('The appointment response could not be read.')
  return body as Record<string,unknown>
}
function pendingKey(owner: string, childId: number) { return `echims:checkup-pending:${owner}:${childId}` }
function readPending(key: string): Payload|null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (!value || typeof value!=='object' || Array.isArray(value)) return null
    const b=value as Record<string,unknown>
    if (typeof b.requestId!=='string' || !/^[0-9a-f-]{36}$/i.test(b.requestId) || !['CREATE','RESCHEDULE','COMPLETE','CANCEL'].includes(String(b.action)) || typeof b.notes!=='string' || !b.notes.trim() || b.notes.length>2000) return null
    if (b.action!=='CREATE' && (!Number.isSafeInteger(b.appointmentId) || !Number.isSafeInteger(b.expectedRevision))) return null
    if (b.action!=='CANCEL' && (typeof b.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date))) return null
    return b as Payload
  } catch { return null }
}

// The owner/child key remounts the state when the profile or account changes.
export function CheckupAppointmentsSection(props: Props) {
  const {user,isReady}=useAuth()
  const previousOwner=useRef<string|null>(null)
  useEffect(()=>{
    const prior=previousOwner.current
    if (prior && prior!==user?.id) {
      try {
        const prefix=`echims:checkup-pending:${prior}:`
        for(let i=sessionStorage.length-1;i>=0;i--) {const key=sessionStorage.key(i);if(key?.startsWith(prefix)) sessionStorage.removeItem(key)}
      } catch { /* Unavailable storage does not grant access. */ }
    }
    previousOwner.current=user?.id??null
  },[user?.id])
  if (!isReady || !user || user.accountStatus!=='APPROVED' || !canPerform(user.role,'Child Profiling','view')) return null
  const edit=props.canEdit && user.role!=='Administrator' && canPerform(user.role,'Child Profiling','edit')
  return <Appointments key={`${user.id}:${props.childId}`} {...props} canEdit={edit} owner={user.id} />
}

function Appointments({childId,dateOfBirth,registryStatus,canEdit,owner}: Props & {owner: string}) {
  const endpoint=`/api/children/${childId}/checkup-appointments`
  const storageKey=pendingKey(owner,childId)
  const [online,setOnline]=useState(true)
  const [cursor,setCursor]=useState<number|null>(null)
  const [draft,setDraft]=useState<Draft|null>(null)
  const [pending,setPending]=useState<Payload|null>(null)
  const [restored,setRestored]=useState(false)
  const [busy,setBusy]=useState(false)
  const sending=useRef(false)
  const [message,setMessage]=useState('')
  const [failure,setFailure]=useState('')
  const [dates,setDates]=useState<string[]>([])
  const [suggesting,setSuggesting]=useState(false)
  const [suggestionNote,setSuggestionNote]=useState('')
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine)
    update(); window.addEventListener('online',update);window.addEventListener('offline',update)
    const saved=readPending(storageKey)
    if(saved) {setPending(saved);setFailure('A previous request needs confirmation. Retry it unchanged to retrieve its saved result.')}
    setRestored(true)
    return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}
  },[storageKey])
  const fetchPage=async([url,identity]: readonly [string,string]): Promise<Page>=>{
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin'})
    const body=await readJson(response)
    if(!response.ok) throw new Error(typeof body.error==='string'?body.error:'Unable to load checkup appointments.')
    if(body.currentUserId!==identity || body.childId!==childId || !Array.isArray(body.records)) throw new Error('Session changed. Refresh the profile.')
    return body as unknown as Page
  }
  const {data,error,isLoading,mutate}=useSWR<Page>([`${endpoint}${cursor?`?beforeId=${cursor}`:''}`,owner] as const,fetchPage,{revalidateOnFocus:true,refreshInterval:60000,shouldRetryOnError:false})
  const page=data?.currentUserId===owner && data.childId===childId?data:null
  const today=manilaDate()
  const canSchedule=canEdit && online && registryStatus==='ACTIVE' && childProgramEligibility(dateOfBirth,registryStatus,today).underFive===true
  function open(action: Action, appointment: Appointment|null=null) {
    if(pending || busy) return
    setFailure('');setMessage('');setDates([]);setSuggestionNote('')
    setDraft({action,appointment,date:action==='COMPLETE'?today:'',notes:'',confirmed:false})
  }
  async function suggest() {
    setSuggesting(true);setFailure('')
    try {
      const response=await fetch(`${endpoint}?suggestions=true`,{cache:'no-store',credentials:'same-origin'})
      const body=await readJson(response)
      if(!response.ok) throw new Error(typeof body.error==='string'?body.error:'Unable to propose dates.')
      if(body.currentUserId!==owner || body.childId!==childId) throw new Error('Session changed. Refresh the profile.')
      const suggestion=body.suggestions as {dates?: unknown}|undefined
      if(!suggestion || !Array.isArray(suggestion.dates)) throw new Error('Date suggestions were unavailable.')
      setDates(suggestion.dates.filter((value): value is string=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)))
      setSuggestionNote(suggestion.dates.length?'Choose a proposal or enter another date. Confirm staffing, holidays and clinical urgency before booking.':'No calendar proposals are available within the under-five scope.')
    } catch(e) {setFailure(e instanceof Error?e.message:'Unable to propose dates.')} finally {setSuggesting(false)}
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if(sending.current || !online || !canEdit) return
    let payload=pending
    if(!payload) {
      if(!draft || !draft.notes.trim() || (draft.action==='COMPLETE' && !draft.confirmed)) return
      payload={requestId:crypto.randomUUID(),action:draft.action,notes:draft.notes.trim(),
        ...(draft.appointment?{appointmentId:draft.appointment.appointment_id,expectedRevision:draft.appointment.revision}:{}),
        ...(draft.action!=='CANCEL'?{date:draft.date}:{})}
      // Save the immutable retry payload before sending. This is a single pending
      // request in this tab, not an offline submission queue or auto replay.
      try {sessionStorage.setItem(storageKey,JSON.stringify(payload))} catch {setFailure('Enable session storage before saving so uncertain requests can be retried safely.');return}
      setPending(payload)
    }
    sending.current=true;setBusy(true);setFailure('');setMessage('')
    try {
      const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)})
      const body=await readJson(response)
      if(!response.ok) {
        // Server/network uncertainty keeps the same UUID and payload for retry.
        if(response.status<500 && response.status!==408 && response.status!==429) {
          sessionStorage.removeItem(storageKey);setPending(null)
          if(response.status===409) {setDraft(null);void mutate()}
        }
        throw new Error(typeof body.error==='string'?body.error:'Unable to save this appointment.')
      }
      if(body.currentUserId!==owner) throw new Error('Session changed. Return to this account before retrying the request.')
      sessionStorage.removeItem(storageKey);setPending(null);setDraft(null);setDates([])
      setMessage(typeof body.message==='string'?body.message:'Appointment saved.')
      setCursor(null);void mutate()
    } catch(e) {setFailure(e instanceof Error?e.message:'The result is uncertain. Retry the same request.')} finally {sending.current=false;setBusy(false)}
  }
  const labels: Record<Action,string>={CREATE:'Schedule a checkup',RESCHEDULE:'Reschedule checkup',COMPLETE:'Record completed checkup',CANCEL:'Cancel appointment'}
  return <section aria-labelledby="checkup-title" className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="checkup-title" className="flex items-center gap-2 text-lg font-semibold text-primary"><CalendarDays size={20}/>Follow-up checkups</h2><p className="mt-1 text-sm text-muted-foreground">Appointments, completed visits and reschedule history.</p></div>
      <div className="flex flex-wrap gap-2"><Link className={button} href={`/child-profiling/sms?childId=${childId}`}>SMS reminders</Link><button type="button" className={button} disabled={!online || busy} onClick={()=>void mutate()} aria-label="Refresh checkup appointments"><RefreshCw size={16}/></button>
        {canEdit && <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!canSchedule || busy || Boolean(pending) || !restored} onClick={()=>open('CREATE')}>Schedule checkup</button>}</div>
    </div>
    {!online && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You are offline. Reconnect to refresh appointments or save changes.</p>}
    {canEdit && !canSchedule && online && <p className="text-sm text-muted-foreground">New appointments require an active child within the under-five age scope.</p>}
    {message && <p role="status" className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={18}/>{message}</p>}
    {failure && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{failure}</p>}
    {pending && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>A {pending.action.toLowerCase()} request is awaiting confirmation. Retry the same request before starting another action.</p><p className="mt-2">{pending.date?displayDate(pending.date):'Cancellation'}{pending.appointmentId?` · Appointment #${pending.appointmentId}`:''}</p><p className="mt-1 whitespace-pre-wrap">{pending.notes}</p><button type="button" className={`${button} mt-3`} disabled={busy || !online || !canEdit} onClick={()=>void submit()}>{busy?'Checking…':'Retry saved request'}</button></div>}
    {draft && !pending && <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-primary">{labels[draft.action]}</h3><button type="button" className={button} onClick={()=>setDraft(null)}>Close</button></div>
      {draft.appointment && <p className="text-sm text-muted-foreground">Appointment #{draft.appointment.appointment_id} · Scheduled {displayDate(draft.appointment.scheduled_on)}</p>}
      {draft.action!=='CANCEL' && <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="checkup-date">{draft.action==='COMPLETE'?'Actual checkup date':'Appointment date'} *</label><input id="checkup-date" type="date" required value={draft.date} min={draft.action==='COMPLETE'?dateOfBirth??undefined:today} max={draft.action==='COMPLETE'?today:undefined} onChange={e=>setDraft({...draft,date:e.target.value})} className="rounded-lg border border-border bg-white px-3 py-2 text-sm"/>
        {['CREATE','RESCHEDULE'].includes(draft.action) && <><button type="button" className={`${button} ml-2`} disabled={suggesting || !online} onClick={()=>void suggest()}>{suggesting?'Loading…':'Suggest dates'}</button><div className="flex flex-wrap gap-2">{dates.map(date=><button type="button" key={date} aria-pressed={draft.date===date} className={`${button} ${draft.date===date?'ring-2 ring-primary':''}`} onClick={()=>setDraft({...draft,date})}>{displayDate(date)}</button>)}</div>{suggestionNote && <p className="text-xs text-muted-foreground">{suggestionNote} No appointment is booked until you save.</p>}</>}
      </div>}
      <div><label htmlFor="checkup-notes" className="mb-1 block text-sm font-medium">{draft.action==='RESCHEDULE' || draft.action==='CANCEL'?'Reason':'Notes'} *</label><textarea id="checkup-notes" required maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} rows={3} className="w-full rounded-lg border border-border bg-white p-3 text-sm" placeholder="Record the appointment details or reason for this action."/><p className="text-xs text-muted-foreground">{draft.notes.length}/2000 characters</p></div>
      {draft.action==='COMPLETE' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={draft.confirmed} onChange={e=>setDraft({...draft,confirmed:e.target.checked})} className="mt-1"/>I confirm that this checkup took place on the actual date entered.</label>}
      {draft.action==='CANCEL' && <p className="text-sm text-muted-foreground">The appointment and cancellation reason will remain in history.</p>}
      <button type="submit" disabled={!online || busy || !draft.notes.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{draft.action==='COMPLETE'?'Save completed checkup':draft.action==='CANCEL'?'Confirm cancellation':'Save appointment'}</button>
    </form>}
    {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error.message} <button type="button" className="underline" onClick={()=>void mutate()}>Try again</button></div>}
    {isLoading && !page && <p role="status" className="py-6 text-center text-sm text-muted-foreground">Loading appointments…</p>}
    {!error && page && <><CheckupAppointmentTable records={page.records} canEdit={canEdit && online && !busy && !pending} canSchedule={canSchedule} onAction={open}/>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Showing {page.records.length} appointment{page.records.length===1?'':'s'} · {online?'Online view':'Saved on this device; reconnect to refresh'}</span><div className="flex gap-2">{cursor && <button type="button" className={button} onClick={()=>setCursor(null)}>Newest</button>}{page.nextBeforeId && <button type="button" className={button} onClick={()=>setCursor(page.nextBeforeId)}>Older appointments</button>}</div></div></>}
  </section>
}

export function CheckupAppointmentTable({records,canEdit,canSchedule,onAction}: {records: Appointment[];canEdit: boolean;canSchedule: boolean;onAction: (action: Action,appointment: Appointment)=>void}) {
  if(!records.length) return <div className="rounded-xl border border-dashed border-border p-8 text-center"><CalendarDays className="mx-auto text-muted-foreground" size={26}/><p className="mt-2 font-medium text-primary">No checkup appointments yet</p><p className="mt-1 text-sm text-muted-foreground">Scheduled appointments and completed visits will appear here.</p></div>
  return <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">Follow-up checkup appointments and history</caption><thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr>{['Appointment','Status','Notes','Actions'].map(title=><th key={title} scope="col" className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-border">{records.map(row=>{
    const status=row.isDefaulter?'Missed checkup':({SCHEDULED:'Scheduled',COMPLETED:'Completed',CANCELLED:'Cancelled',RESCHEDULED:'Rescheduled'}[row.status])
    const tone=row.isDefaulter?'bg-rose-100 text-rose-800':row.status==='COMPLETED'?'bg-emerald-100 text-emerald-800':row.status==='SCHEDULED'?'bg-sky-100 text-sky-800':'bg-slate-100 text-slate-700'
    return <tr key={row.appointment_id}><td className="px-4 py-4 align-top"><div className="font-medium text-primary">{displayDate(row.scheduled_on)}</div><div className="mt-1 text-xs text-muted-foreground">#{row.appointment_id}{row.previous_appointment_id?` · Replaces #${row.previous_appointment_id}`:''}</div>{row.completed_on && <div className="mt-1 text-xs text-muted-foreground">Actual visit: {displayDate(row.completed_on)}</div>}</td><td className="px-4 py-4 align-top"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>{row.isDefaulter && <p className="mt-1 text-xs text-rose-700">For follow-up</p>}</td><td className="max-w-sm whitespace-pre-wrap break-words px-4 py-4 align-top text-muted-foreground">{row.notes}</td><td className="px-4 py-4 align-top">{row.status==='SCHEDULED' && canEdit?<div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>onAction('COMPLETE',row)}>Record checkup</button>{canSchedule && <button type="button" className={button} onClick={()=>onAction('RESCHEDULE',row)}>Reschedule</button>}<button type="button" className={button} onClick={()=>onAction('CANCEL',row)}>Cancel</button></div>:<span className="text-xs text-muted-foreground">{row.status==='SCHEDULED'?'View only':'History retained'}</span>}</td></tr>
  })}</tbody></table></div>
}
