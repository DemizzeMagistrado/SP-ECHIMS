'use client'
// ECHIMS_ONE_CANCEL_TRANSFER_V1
import {saveChildChangeDraft} from '@/lib/offline/child-change-drafts'
import {offlineScope} from '@/lib/offline/fetch'
import {offlineFetch as fetch} from '@/lib/offline/fetch'
import {Search} from 'lucide-react'
import {Input} from '@/components/ui/form'
import {Button,buttonVariants} from '@/components/ui/button'
import {Pagination,usePagination} from '@/components/ui/pagination'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import useSWR from 'swr'
import {useAuth} from '@/components/auth/auth-provider'
import {ReceivedHouseholdForm} from '@/components/children/received-household-form'
import {canPerform} from '@/lib/echims-data'

type Child={childId:number;householdId:number|null;barangayId:number;dateOfBirth:string;registryStatus:string}
type Props={child?:Child;canEdit?:boolean;onSaved?:()=>void}
type Transfer={transfer_id:number;child_id:number;status:string;revision:number;from_rhu_name:string;to_rhu_name:string;movement_date:string;reason:string;review_notes:string|null;child_summary:{name:string;dateOfBirth:string};can_review:boolean;can_cancel:boolean;to_barangay_id:number|null;from_barangay_name:string;to_barangay_name:string|null;movement_id:number|null;can_complete_household:boolean;destination_address:string|null}
type Page={currentUserId:string;records:Transfer[];nextBeforeId:number|null}
type Rhu={rhu_id:number;rhu_name:string;municipality:string}
type Barangay={barangay_id:number;barangay_name:string}
type Household={household_id:number;household_address:string|null}
type Payload={requestId:string;action:'REQUEST'|'ACCEPT'|'REJECT'|'CANCEL';notes:string;childId?:number;expectedHouseholdId?:number|null;expectedBarangayId?:number;toRhuId?:number;toBarangayId?:number;movementDate?:string;transferId?:number;expectedRevision?:number;toHouseholdId?:number;destinationAddress?:string;receivedOn?:string}
const field='w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function api(url:string,init?:RequestInit):Promise<unknown>{
 const response=await fetch(url,{...init,cache:'no-store',credentials:'same-origin'})
 let data:unknown;try{data=await response.json()}catch{throw new Error(`Transfer API returned non-JSON (HTTP ${response.status}). Check ${url} and the Next.js terminal.`)}
 if(!response.ok)throw Object.assign(new Error(data && typeof data==='object' && 'error' in data?String(data.error):'Transfer request failed.'),{status:response.status})
 return data
}
async function ownedPage(url:string,owner:string):Promise<Page>{const data=await api(url);if(!data || typeof data!=='object' || !('currentUserId' in data) || data.currentUserId!==owner || !('records' in data) || !Array.isArray(data.records))throw new Error('Session changed or transfer response is invalid. Refresh.');return data as Page}
export function RhuTransferSection(props:Props){
 const {user,isReady}=useAuth()
 if(!isReady || !user || user.accountStatus!=='APPROVED' || !['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(user.role) || !canPerform(user.role,'Child Profiling','view'))return null
 return <TransferPanel key={`${user.id}:${props.child?.childId??'inbox'}`} {...props} owner={user.id} canEdit={props.canEdit!==false && user.role!=='Administrator' && canPerform(user.role,'Child Profiling','edit')}/>
}
function TransferPanel({child,canEdit:permissionToEdit,onSaved,owner}:Props & {owner:string}){
 const [recordSearch,setRecordSearch]=useState('')
 const [online,setOnline]=useState(true);useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[]);
 const canEdit=permissionToEdit;
 const {user}=useAuth();const activeOwner=useRef(user?.id);activeOwner.current=user?.id;useEffect(()=>()=>{activeOwner.current=undefined},[])
 const [cursor,setCursor]=useState<number|null>(null),[newRequest,setNewRequest]=useState(false),[target,setTarget]=useState<Transfer|null>(null),[action,setAction]=useState<'ACCEPT'|'REJECT'|'CANCEL'>('ACCEPT')
 const [rhu,setRhu]=useState(''),[toBarangay,setToBarangay]=useState(''),[date,setDate]=useState(today),[notes,setNotes]=useState(''),[barangay,setBarangay]=useState(''),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[household,setHousehold]=useState<number|null>(null),[confirmed,setConfirmed]=useState(false),[address,setAddress]=useState(''),[receivedOn,setReceivedOn]=useState(today)
 const [pending,setPending]=useState<Payload|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');const sending=useRef(false)
 const url=`/api/child-transfers?${child?`childId=${child.childId}&`:''}${cursor?`beforeId=${cursor}`:''}`
 const {data,error,mutate,isLoading}=useSWR([url,owner],([u,o])=>ownedPage(u,o),{shouldRetryOnError:false,revalidateOnFocus:true})
 const page=data?.currentUserId===owner?data:null
 const recordQuery=recordSearch.trim().toLocaleLowerCase()
 const visibleRecords=(page?.records??[]).filter(row=>[row.child_summary.name,String(row.child_id),String(row.transfer_id),row.from_barangay_name,row.to_barangay_name,row.from_rhu_name,row.to_rhu_name,row.status==='REJECTED'?'CANCELLED':row.status,row.movement_date,row.destination_address].filter(Boolean).join(' ').toLocaleLowerCase().includes(recordQuery))
 const {data:destinations,error:destError}=useSWR(newRequest?['/api/transfer-destinations',owner]:null,async([u,o])=>{const d=await api(u);if(!d || typeof d!=='object' || !('currentUserId'in d) || d.currentUserId!==o || !('records'in d) || !Array.isArray(d.records))throw new Error('Unable to load destination RHUs.');return d.records as Rhu[]})
 const {data:receivingBarangays,error:receivingError}=useSWR(newRequest && rhu?[owner,'receiving-barangays',rhu]:null,async()=>{const d=await api(`/api/transfer-destinations?rhuId=${rhu}`);if(!d || typeof d!=='object' || !('records'in d) || !Array.isArray(d.records))throw new Error('Unable to load destination barangays.');return d.records as Barangay[]})
 const {data:movements,error:movementError,mutate:refreshMovements}=useSWR(child?[owner,child.childId,'completed-movements']:null,async()=>{const d=await api(`/api/children/${child!.childId}/movement`);if(!Array.isArray(d))throw new Error('Invalid movement response.');return d as {movement_id:number;movement_date:string;movement_type:string;reason:string|null;previous_address:string|null;new_address:string|null}[]})
 if(user?.id!==owner)return null
 const close=()=>{setNewRequest(false);setTarget(null);setNotes('');setConfirmed(false);setHousehold(null);setSearch('');setQuery('')}
 async function send(payload:Payload){
  if(sending.current || activeOwner.current!==owner)return
  if(!navigator.onLine){setFailure('Reconnect before submitting a transfer.');return}
  sending.current=true;setBusy(true);setFailure('');setMessage('')
  try{
   await api('/api/child-transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)})
   if(activeOwner.current!==owner)return
   setPending(null);close();setCursor(null);setMessage('Transfer action saved.');void mutate();void refreshMovements();onSaved?.()
  }catch(e){
   if(activeOwner.current!==owner)return
   const status=e && typeof e==='object' && 'status'in e?Number(e.status):0
   if(status>=400 && status<500){setPending(null);if(status===409){close();void mutate();onSaved?.()}}
   setFailure(e instanceof Error?e.message:'Unable to save transfer.')
  }finally{sending.current=false;if(activeOwner.current===owner)setBusy(false)}
 }
 async function submit(e:FormEvent){e.preventDefault();if(!canEdit || !confirmed || !notes.trim())return
  let payload:Payload
  if(newRequest && child){if(!rhu || !toBarangay)return;payload={requestId:crypto.randomUUID(),action:'REQUEST',childId:child.childId,expectedHouseholdId:child.householdId,expectedBarangayId:child.barangayId,toRhuId:Number(rhu),toBarangayId:Number(toBarangay),movementDate:date,notes:notes.trim()}}
  else if(target){if(action==='ACCEPT' && !address.trim())return;payload={requestId:crypto.randomUUID(),action,transferId:target.transfer_id,expectedRevision:target.revision,notes:notes.trim(),...(action==='ACCEPT'?{destinationAddress:address.trim(),receivedOn}:{})}}
  else return
  if(!navigator.onLine){
   try{if(!user)throw Error('Sign in online once before preparing movement drafts.');await saveChildChangeDraft({requestId:payload.requestId,ownerId:owner,scope:offlineScope(user),childId:child?.childId??target!.child_id,kind:'TRANSFER',title:newRequest?`Child ${child!.childId} movement to ${receivingBarangays?.find(b=>b.barangay_id===Number(toBarangay))?.barangay_name??toBarangay}`:`${action==='ACCEPT'?'Accept':'Cancel'} transfer #${target!.transfer_id} · ${target!.child_summary.name}`,savedAt:new Date().toISOString(),status:'DRAFT',payload:{...payload}});close();setMessage('Movement/transfer action saved on this device. Review and sync it from Child changes & movement drafts when online. The child assignment has not changed.');}catch(e){setFailure(e instanceof Error?e.message:'Unable to save movement draft.')}return;
  }
  setPending(payload);void send(payload)
 }
 const review=(row:Transfer,a:typeof action)=>{close();setTarget(row);setAction(a);setAddress('');setReceivedOn(today());setBarangay(row.to_barangay_id?String(row.to_barangay_id):'');setFailure('');setMessage('')}
 return <section className="rounded-2xl border border-border bg-white p-5 space-y-4">
  <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold text-primary">{child?'Movement & Transfers':'Transfer requests and history'}</h2><p className="text-sm text-muted-foreground">Request a barangay or RHU transfer. Records remain linked to the same child.</p></div><div className="flex gap-2">{child && <a className={buttonVariants({variant:'secondary'})} href="/child-profiling/transfers">Transfer inbox</a>}<Button variant="secondary" onClick={()=>void mutate()}>Refresh</Button>{child && canEdit && child.registryStatus==='ACTIVE' && !pending && !target && !newRequest && <Button onClick={()=>{close();setNewRequest(true);setFailure('');setMessage('')}}>Request transfer</Button>}</div></div>
  {!online && <p role="status" className="text-sm text-amber-900">Prepare movement requests or receiving decisions offline using saved details. Review and sync after reconnecting; assignments do not change until the server confirms them. Receiving household registration still requires a connection.</p>}
  {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}{failure && <p role="alert" className="text-sm text-red-700">{failure}</p>}
  {pending?<div className="rounded-xl border bg-amber-50 p-4 space-y-3 text-sm"><p>The result may be uncertain. Retry sends the same request and details. Keep this page open until confirmed.</p><Button disabled={busy} onClick={()=>void send(pending)}>{busy?'Saving…':'Retry same request'}</Button></div>:(newRequest || target) && <form onSubmit={submit} className="rounded-xl border bg-slate-50 p-4 space-y-4">
   <h3 className="font-medium">{newRequest?'Request barangay / RHU transfer':`${action==='ACCEPT'?'Accept':'Cancel'} transfer #${target?.transfer_id}`}</h3>
   {newRequest && <><label className="block text-sm">Receiving RHU<select className={field} required value={rhu} onChange={e=>{setRhu(e.target.value);setToBarangay('')}}><option value="">Select receiving RHU</option>{destinations?.map(r=><option key={r.rhu_id} value={r.rhu_id}>{r.rhu_name} · {r.municipality}</option>)}</select></label><label className="block text-sm">Receiving barangay<select className={field} required value={toBarangay} disabled={!rhu} onChange={e=>setToBarangay(e.target.value)}><option value="">Select receiving barangay</option>{receivingBarangays?.filter(b=>b.barangay_id!==child?.barangayId).map(b=><option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}</select></label>{receivingError && <p role="alert" className="text-sm text-red-700">Unable to load receiving barangays.</p>}{destError && <p role="alert" className="text-sm text-red-700">{destError.message}</p>}<label className="block text-sm">Actual movement date<input className={field} type="date" min={child?.dateOfBirth} max={today()} required value={date} onChange={e=>setDate(e.target.value)}/></label><p className="text-sm">The source assignment stays unchanged until the receiving team accepts.</p></>}
   {target && action==='ACCEPT' && <div className="space-y-3"><p className="text-sm">Verify the guardian's receiving visit and enter the destination address. No existing household is required.</p><label className="block text-sm">Complete destination address<textarea className={field} required maxLength={2000} placeholder="House/building number, street, purok/sitio or landmark" value={address} onChange={e=>setAddress(e.target.value)}/></label><label className="block text-sm">Actual receiving visit date<input className={field} type="date" required min={target.movement_date} max={today()} value={receivedOn} onChange={e=>setReceivedOn(e.target.value)}/></label><p className="text-xs text-muted-foreground">The destination barangay is fixed by the request. Household information can be completed after acceptance.</p></div>}
   <label className="block text-sm">{newRequest?'Reason for transfer':'Review / decision notes'}<textarea className={field} required maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I verified the details supporting this action.</label>
   <div className="flex gap-2"><Button disabled={!confirmed || !notes.trim() || busy || (newRequest?(!rhu || !toBarangay):action==='ACCEPT' && !address.trim())} type="submit">{online?(newRequest?'Submit request':'Save decision'):'Save movement draft on device'}</Button><Button variant="secondary" onClick={close}>Close</Button></div>
  </form>}
  <div className="space-y-2"><label className="relative block"><span className="sr-only">Search transfers on this page</span><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground"/><Input type="search" value={recordSearch} onChange={e=>setRecordSearch(e.target.value)} placeholder="Search this page by child name, ID, barangay or status…" className="pl-10"/></label><p role="status" className="text-xs text-muted-foreground">{page?`${visibleRecords.length} of ${page.records.length} transfers on this page`:'Search the current page'}</p></div>
  {error?<p role="alert" className="text-sm text-red-700">{error.message}</p>:isLoading || !page?<p role="status">Loading transfers…</p>:<>{recordQuery && !visibleRecords.length?<p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">No transfers match this search on this page.</p>:<TransferRecords records={visibleRecords} canEdit={!!canEdit && !busy && !pending && !newRequest && !target} onAction={review} onSaved={()=>{void mutate();onSaved?.()}}/>}<div className="flex gap-2">{cursor && <Button variant="secondary" onClick={()=>setCursor(null)}>Latest</Button>}{page.nextBeforeId && <Button variant="secondary" onClick={()=>setCursor(page.nextBeforeId)}>Older transfers</Button>}</div></>}
  {child && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Recorded movement history</summary>{movementError?<p role="alert" className="mt-3 text-sm text-red-700">{movementError.message} <Button variant="ghost" size="sm" onClick={()=>void refreshMovements()}>Retry history</Button></p>:!movements?<p className="mt-3 text-sm">Loading movement history…</p>:movements.length===0?<p className="mt-3 text-sm text-muted-foreground">No completed movement recorded.</p>:<div className="mt-3 space-y-3">{movements.map(m=><div key={m.movement_id} className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{m.movement_date} · {m.movement_type}</strong><p>{m.previous_address??'Previous address not recorded'} → {m.new_address??'Destination address not recorded'}</p><p>{m.reason}</p></div>)}</div>}</details>}
 </section>
}
export function TransferRecords({records,canEdit,onAction,onSaved}:{records:Transfer[];canEdit:boolean;onAction:(row:Transfer,action:'ACCEPT'|'REJECT'|'CANCEL')=>void;onSaved?:()=>void}){
 const {visible,bindList,listStyle,props:pager}=usePagination(records,5)
 if(!records.length)return <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">No movement or transfer requests recorded.</p>
 return <div className="space-y-3"><div ref={bindList} style={listStyle} className="space-y-3">{visible.map(t=><article key={t.transfer_id} className="rounded-xl border border-border p-4 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{t.child_summary.name} · Transfer #{t.transfer_id}</strong><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{t.status==='REJECTED'||t.status==='CANCELLED'?'CANCELLED':t.status}</span></div><p>{t.from_barangay_name} ({t.from_rhu_name}) → {t.to_barangay_name??'Barangay to be verified'} ({t.to_rhu_name}) · Actual move: {t.movement_date}</p><p className="whitespace-pre-wrap">{t.reason}</p>{t.review_notes && <p className="whitespace-pre-wrap text-muted-foreground">Review: {t.review_notes}</p>}{canEdit && t.status==='PENDING' && <div className="flex gap-2">{t.can_review && <Button onClick={()=>onAction(t,'ACCEPT')}>Accept transfer</Button>}{(t.can_cancel || t.can_review) && <Button variant="secondary" onClick={()=>onAction(t,t.can_cancel?'CANCEL':'REJECT')}>Cancel transfer</Button>}</div>}{canEdit && t.can_complete_household && <ReceivedHouseholdForm transferId={t.transfer_id} barangayId={t.to_barangay_id} address={t.destination_address??''} onSaved={onSaved}/>}</article>)}</div><Pagination {...pager} label="Transfer pages"/></div>
}
