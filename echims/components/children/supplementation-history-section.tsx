'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session, User } from '@supabase/supabase-js'
import { buildSupplementationDue, manilaToday } from '@/lib/supplementation-due'
import type { NutritionBasis } from '@/lib/supplementation-nutrition'
type Entry={purpose?:string|null;protocol_snapshot?:unknown;clinical_indication?:string|null;course_reference?:string|null;clinical_dose_number?:number|null;course_start_date?:string|null;tier?:string|null;order_reference?:string|null;recorded_by?:string|null;supplementation_record_id:number;supplementation_date:string;supplement_id:number;quantity_given:number;dose_value:number|null;dose_unit:string|null;record_type:string|null;batch_number:string|null;source_assessment_id:number|null;plan_id:number|null;remarks:string|null}
type SupplyPlan={plan_id:number;supplement_id:number;start_date:string;end_date:string;authorized_quantity:number|string;product_label:string;source_assessment_id:number|null;remarks:string|null}
type History={children:{child_id:number;date_of_birth:string;status:string}[];permissions?:{record:boolean;clinical:boolean;stock:boolean};records:Entry[];products:{supplement_id:number;item:{item_name:string;unit:string}|null}[];plans:SupplyPlan[];assessments:NutritionBasis[]}
function supplyPlanQuantities(plan:SupplyPlan,records:Entry[]){
  const planned=Number(plan.authorized_quantity)
  const issues=records.filter(r=>r.plan_id===plan.plan_id&&r.record_type==='DISPENSED').map(r=>Number(r.quantity_given))
  if(!Number.isFinite(planned)||planned<=0||issues.some(q=>!Number.isFinite(q)||q<=0))return null
  const issued=issues.reduce((total,q)=>total+q,0)
  return {planned,issued,remaining:Math.max(0,planned-issued),overIssued:issued>planned}
}
function commodityDisplayName(value:string){
  return value.replace(/\bfor\s+children\b/gi,'').replace(/[ \t]{2,}/g,' ').trim()
}
async function fetchHistory(url:string):Promise<History>{
  const response=await fetch(url,{cache:'no-store'});const text=await response.text();let result;
  try{result=JSON.parse(text)}catch{throw new Error(`Supplementation history returned invalid JSON (HTTP ${response.status}).`)}
  if(!response.ok)throw new Error(result.error??'Unable to load supplementation history.')
  if(!Array.isArray(result.children)||!Array.isArray(result.products)||!Array.isArray(result.records)||!Array.isArray(result.plans)||!Array.isArray(result.assessments))throw new Error('Update the supplementation API to the matching version.')
  const history=result as History
  return {...history,products:history.products.map(p=>({...p,item:p.item?{...p.item,item_name:commodityDisplayName(p.item.item_name)}:null})),plans:history.plans.map(p=>({...p,product_label:commodityDisplayName(p.product_label)}))}
}
export function SupplementationHistorySection({childId}:{childId:number}){
  // Include the authenticated account in the cache key to isolate account switches.
  const [client]=useState(()=>createClient());const [owner,setOwner]=useState<string|null>(null);const [authError,setAuthError]=useState('');const [authReady,setAuthReady]=useState(false);
  const [tab,setTab]=useState<'DUE'|'ADMINISTRATION'|'DISPENSING'|'PLANS'>('DUE');
  const [today,setToday]=useState(()=>manilaToday());
  useEffect(()=>{const refresh=()=>setToday(manilaToday());const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)}},[]);
  useEffect(()=>{
    let active=true, generation=0;
    const apply=(userId:string|null)=>{if(active){setOwner(userId);setAuthError('');setAuthReady(true)}};
    const initial=generation;
void client.auth
  .getUser()
  .then(
    (result: {
      data: { user: User | null }
      error: unknown
    }) => {
      if (!active || generation !== initial) return

      apply(result.error ? null : result.data.user?.id ?? null)

      if (result.error) {
        setAuthError('Unable to verify session.')
      }
    },
  )
  .catch(() => {
    if (!active || generation !== initial) return

    setOwner(null)
    setAuthReady(true)
    setAuthError('Unable to verify session.')
  })
      const {data:listener}=client.auth.onAuthStateChange((_event:string,session:Session|null)=>{generation++;apply(session?.user.id??null)});
    return()=>{active=false;listener.subscription.unsubscribe()}
  },[client]);
  const {data,error,isLoading,mutate}=useSWR<History>(owner?[`/api/supplementation?childId=${childId}`,owner]:null,([url]:[string,string])=>fetchHistory(url));
  const loadState=!authReady?<p className="p-5 text-sm">Verifying session…</p>:authError?<p role="alert" className="p-5 text-red-700">{authError}</p>:error?<div role="alert" className="p-5 text-sm text-red-700">{error.message}<button type="button" className="ml-3 underline" onClick={()=>void mutate()}>Retry</button></div>:isLoading?<p className="p-5 text-sm">Loading supplementation…</p>:!data?<p className="p-5 text-sm">Sign in to view supplementation.</p>:null
  const historyTable=(entries:Entry[])=>(!authReady?<p className="p-5 text-sm">Verifying session…</p>:authError?<p role="alert" className="p-5 text-red-700">{authError}</p>:error?<div role="alert" className="p-5 text-sm text-red-700">{error.message}<button type="button" className="ml-3 underline" onClick={()=>void mutate()}>Retry</button></div>:isLoading?<p className="p-5 text-sm">Loading history…</p>:!data?<p className="p-5 text-sm">Sign in to view supplementation history.</p>:<div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted/60"><tr>{['Date','Entry','Product','Actual Dose','Quantity Issued / Used','Batch','Nutrition Basis','Order Reference','Recorded By','Remarks'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{entries.length===0?<tr><td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">No supplementation entries recorded.</td></tr>:entries.map(r=>{
      const product=data.products.find(p=>p.supplement_id===r.supplement_id);
      const source=r.source_assessment_id??data.plans.find(p=>p.plan_id===r.plan_id)?.source_assessment_id;
      const assessment=data.assessments.find(a=>a.assessment_id===source);
      return <tr key={r.supplementation_record_id}><td className="px-4 py-3 text-sm">{r.supplementation_date}</td><td className="px-4 py-3 text-sm">{r.record_type==='DISPENSED'?'Dispensed':r.record_type==='ADMINISTERED'?'Administered':'Legacy entry'}</td><td className="px-4 py-3 text-sm">{product?.item?.item_name??`Product ${r.supplement_id}`}</td><td className="px-4 py-3 text-sm">{r.record_type==='DISPENSED'?'Not an administration':r.dose_value==null?'Not recorded':`${r.dose_value} ${r.dose_unit??''}`}</td><td className="px-4 py-3 text-sm">{r.quantity_given} {product?.item?.unit}</td><td className="px-4 py-3 text-sm">{r.batch_number??'—'}</td><td className="px-4 py-3 text-sm">{source?<>Assessment #{source}{assessment&&<p className="text-xs text-muted-foreground">{assessment.assessment_date} · {assessment.nutritional_status??'Not evaluated'}</p>}</>:'No linked assessment'}</td><td className="px-4 py-3 text-sm">{r.order_reference??'—'}{r.tier==='CLINICAL'&&<p className="mt-1 text-xs text-muted-foreground">{r.clinical_indication?.replaceAll('_',' ')??'Indication not recorded'}<br/>Course: {r.course_reference??'Not recorded'} · Dose: {r.clinical_dose_number??'Not recorded'}<br/>Started: {r.course_start_date??'Not recorded'}</p>}</td><td className="px-4 py-3 text-xs break-all">{r.recorded_by??'Not recorded'}</td><td className="px-4 py-3 text-sm">{r.remarks??'—'}</td></tr>
    })}</tbody></table></div>)
  const child=data?.children.find(c=>c.child_id===childId);
  const due=child?buildSupplementationDue(data?.records??[],child.date_of_birth,child.status,today):[];
  const labels={DUE:'Due Dates',ADMINISTRATION:'Administration History',DISPENSING:'Dispensing History',PLANS:'Supply Plans'};
  const statusLabel=(status:string)=>status==='UNAVAILABLE'?'Unable to determine':status.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
  const reviewHref=`/supplementation?childId=${childId}`;
  return <section className="overflow-hidden rounded-2xl border border-border bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
      <div><h2 className="text-lg font-semibold text-primary">Supplementation</h2><p className="mt-1 text-sm text-muted-foreground">Saved doses, supplies, plans and scheduled follow-up</p></div>
      <div className="flex gap-3"><button type="button" onClick={()=>void mutate()} className="text-sm text-primary underline">Refresh</button><Link className="text-sm font-medium text-primary underline" href={reviewHref}>{data?.permissions?.record||data?.permissions?.clinical?'Review / Record':'Review supplementation'}</Link></div>
    </div>
    <div role="tablist" aria-label="Supplementation sections" className="flex flex-wrap gap-2 border-b p-3">{(Object.keys(labels) as Array<keyof typeof labels>).map(key=><button type="button" role="tab" aria-selected={tab===key} key={key} onClick={()=>setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab===key?'bg-primary text-white':'bg-muted/40 text-foreground hover:bg-muted'}`}>{labels[key]}</button>)}</div>
    <div role="tabpanel" aria-label={labels[tab]}>
      {tab==='PLANS'&&(loadState??(data&&<><div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted/60"><tr>{['Plan','Commodity','Period','Planned Quantity','Quantity Issued','Remaining to Issue','Nutrition Basis','Remarks'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.plans.length===0?<tr><td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">No supply plans registered for this child.</td></tr>:data.plans.map(plan=>{
      const product=data.products.find(p=>p.supplement_id===plan.supplement_id)
      const q=supplyPlanQuantities(plan,data.records)
      const unit=product?.item?.unit??'stock units'
      const assessment=data.assessments.find(a=>a.assessment_id===plan.source_assessment_id)
      return <tr key={plan.plan_id}><td className="px-4 py-3 text-sm">#{plan.plan_id}</td><td className="px-4 py-3 text-sm">{product?.item?.item_name??plan.product_label}</td><td className="px-4 py-3 text-sm whitespace-nowrap">{plan.start_date}<br/>to {plan.end_date}</td><td className="px-4 py-3 text-sm">{q?`${q.planned} ${unit}`:'Unavailable'}</td><td className="px-4 py-3 text-sm">{q?`${q.issued} ${unit}`:'Unavailable'}</td><td className="px-4 py-3 text-sm">{q?`${q.remaining} ${unit}`:'Unavailable'}{q?.overIssued&&<p className="text-xs text-amber-800">Issued quantity exceeds plan. Review records.</p>}</td><td className="px-4 py-3 text-sm">{plan.source_assessment_id?<>Assessment #{plan.source_assessment_id}{assessment&&<p className="text-xs text-muted-foreground">{assessment.assessment_date}</p>}</>:'No linked assessment'}</td><td className="px-4 py-3 text-sm">{plan.remarks??'—'}</td></tr>
    })}</tbody></table></div><p className="border-t px-5 py-3 text-xs text-muted-foreground">Only dispensing entries linked to this plan count as issued. Remaining quantity is a plan balance, not available inventory. Issuing all planned supplies does not confirm consumption or course completion.</p></>))}
      {tab==='ADMINISTRATION'&&<><div className="border-b p-4"><h3 className="font-semibold">Routine and Targeted Administrations</h3></div>{historyTable(data?.records.filter(r=>r.record_type==='ADMINISTERED'&&r.tier!=='CLINICAL')??[])}<div className="border-y p-4"><h3 className="font-semibold">Clinical Administrations</h3><p className="text-xs text-muted-foreground">Actual course doses recorded by the RHM</p></div>{historyTable(data?.records.filter(r=>r.record_type==='ADMINISTERED'&&r.tier==='CLINICAL')??[])}{data?.records.some(r=>r.record_type!=='ADMINISTERED'&&r.record_type!=='DISPENSED')&&<><div className="border-y p-4 font-semibold">Legacy Entries — Review Required</div>{historyTable(data.records.filter(r=>r.record_type!=='ADMINISTERED'&&r.record_type!=='DISPENSED'))}</>}</>}
      {tab==='DISPENSING'&&<><p className="border-b p-4 text-sm text-muted-foreground">Supplies handed to the guardian. These entries do not confirm administration, consumption or course completion.</p>{historyTable(data?.records.filter(r=>r.record_type==='DISPENSED')??[])}</>}
      {tab==='DUE'&&(loadState??<><p className="border-b p-4 text-sm text-muted-foreground">As of {today} (Philippine time). Dates use saved protocol metadata. Eligibility, current orders and all dose history must be reviewed before recording.</p><div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted/60"><tr>{['Product / Course','Last Administration','Next Date','Next Dose','Status','Basis / Review'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{due.length===0?<tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No saved administrations available to determine a next dose. Supply plans and dispensing alone do not establish an administration date.</td></tr>:due.map(row=><tr key={row.key}><td className="px-4 py-3 text-sm">{data?.products.find(p=>p.supplement_id===row.supplementId)?.item?.item_name??`Product ${row.supplementId}`}<p className="text-xs text-muted-foreground">{row.tier} · {row.reference}</p></td><td className="px-4 py-3 text-sm">{row.lastDate}</td><td className="px-4 py-3 text-sm">{row.dueDate??'—'}</td><td className="px-4 py-3 text-sm">{row.nextDose??'—'}</td><td className="px-4 py-3 text-sm"><span className={`rounded-full px-3 py-1 text-xs font-medium ${row.status==='OVERDUE'?'bg-red-50 text-red-700':row.status==='COURSE_COMPLETED'?'bg-emerald-50 text-emerald-700':'bg-muted text-foreground'}`}>{statusLabel(row.status)}</span></td><td className="max-w-sm px-4 py-3 text-sm">{row.detail}</td></tr>)}</tbody></table></div></>)}
    </div>
  </section>
}
