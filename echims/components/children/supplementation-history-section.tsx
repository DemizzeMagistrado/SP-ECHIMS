'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session, User } from '@supabase/supabase-js'
import type { NutritionBasis } from '@/lib/supplementation-nutrition'

type Entry={clinical_indication?:string|null;course_reference?:string|null;clinical_dose_number?:number|null;course_start_date?:string|null;tier?:string|null;order_reference?:string|null;supplementation_record_id:number;supplementation_date:string;supplement_id:number;quantity_given:number;dose_value:number|null;dose_unit:string|null;record_type:string|null;batch_number:string|null;source_assessment_id:number|null;plan_id:number|null;remarks:string|null}
type SupplyPlan={plan_id:number;supplement_id:number;start_date:string;end_date:string;authorized_quantity:number|string;product_label:string;source_assessment_id:number|null;remarks:string|null}
type History={records:Entry[];products:{supplement_id:number;item:{item_name:string;unit:string}|null}[];plans:SupplyPlan[];assessments:NutritionBasis[]}
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
  if(!Array.isArray(result.products)||!Array.isArray(result.records)||!Array.isArray(result.plans)||!Array.isArray(result.assessments))throw new Error('Update the supplementation API to the matching version.')
  const history=result as History
  return {...history,products:history.products.map(p=>({...p,item:p.item?{...p.item,item_name:commodityDisplayName(p.item.item_name)}:null})),plans:history.plans.map(p=>({...p,product_label:commodityDisplayName(p.product_label)}))}
}
export function SupplementationHistorySection({childId}:{childId:number}){
  // Include the authenticated account in the cache key to isolate account switches.
  const [client]=useState(()=>createClient());const [owner,setOwner]=useState<string|null>(null);const [authError,setAuthError]=useState('');
  useEffect(()=>{let active=true;void client.auth.getUser().then((r:{data:{user:User|null};error:unknown})=>{if(active){setOwner(r.error?null:r.data.user?.id??null);if(r.error)setAuthError('Unable to verify session.')}}).catch(()=>{if(active)setAuthError('Unable to verify session.')});const {data:listener}=client.auth.onAuthStateChange((_event:string,session:Session|null)=>{if(active){setOwner(session?.user.id??null);setAuthError('')}});return()=>{active=false;listener.subscription.unsubscribe()}},[client]);
  const {data,error,isLoading,mutate}=useSWR<History>(owner?[`/api/supplementation?childId=${childId}`,owner]:null,([url]:[string,string])=>fetchHistory(url));
  const loadState=authError?<p role="alert" className="p-5 text-red-700">{authError}</p>:error?<div role="alert" className="p-5 text-sm text-red-700">{error.message}<button type="button" className="ml-3 underline" onClick={()=>void mutate()}>Retry</button></div>:isLoading?<p className="p-5 text-sm">Loading supplementation…</p>:!data?<p className="p-5 text-sm">Sign in to view supplementation.</p>:null
  const historyTable=(entries:Entry[])=>(authError?<p role="alert" className="p-5 text-red-700">{authError}</p>:error?<div role="alert" className="p-5 text-sm text-red-700">{error.message}<button type="button" className="ml-3 underline" onClick={()=>void mutate()}>Retry</button></div>:isLoading?<p className="p-5 text-sm">Loading history…</p>:!data?<p className="p-5 text-sm">Sign in to view supplementation history.</p>:<div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted/60"><tr>{['Date','Entry','Product','Actual Dose','Quantity Issued / Used','Batch','Nutrition Basis','Order Reference','Remarks'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{entries.length===0?<tr><td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">No supplementation entries recorded.</td></tr>:entries.map(r=>{
      const product=data.products.find(p=>p.supplement_id===r.supplement_id);
      const source=r.source_assessment_id??data.plans.find(p=>p.plan_id===r.plan_id)?.source_assessment_id;
      const assessment=data.assessments.find(a=>a.assessment_id===source);
      return <tr key={r.supplementation_record_id}><td className="px-4 py-3 text-sm">{r.supplementation_date}</td><td className="px-4 py-3 text-sm">{r.record_type==='DISPENSED'?'Dispensed':r.record_type==='ADMINISTERED'?'Administered':'Legacy entry'}</td><td className="px-4 py-3 text-sm">{product?.item?.item_name??`Product ${r.supplement_id}`}</td><td className="px-4 py-3 text-sm">{r.record_type==='DISPENSED'?'Not an administration':r.dose_value==null?'Not recorded':`${r.dose_value} ${r.dose_unit??''}`}</td><td className="px-4 py-3 text-sm">{r.quantity_given} {product?.item?.unit}</td><td className="px-4 py-3 text-sm">{r.batch_number??'—'}</td><td className="px-4 py-3 text-sm">{source?<>Assessment #{source}{assessment&&<p className="text-xs text-muted-foreground">{assessment.assessment_date} · {assessment.nutritional_status??'Not evaluated'}</p>}</>:'No linked assessment'}</td><td className="px-4 py-3 text-sm">{r.order_reference??'—'}{r.tier==='CLINICAL'&&<p className="mt-1 text-xs text-muted-foreground">{r.clinical_indication?.replaceAll('_',' ')??'Indication not recorded'}<br/>Course: {r.course_reference??'Not recorded'} · Dose: {r.clinical_dose_number??'Not recorded'}<br/>Started: {r.course_start_date??'Not recorded'}</p>}</td><td className="px-4 py-3 text-sm">{r.remarks??'—'}</td></tr>
    })}</tbody></table></div>)
  return <div className="space-y-6"><section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">Supplementation Plans</h2><p className="text-sm text-muted-foreground">Planned supply periods and quantities actually issued</p></div><Link className="text-sm font-medium text-primary underline" href={`/supplementation?childId=${childId}`}>Review plans</Link></div>
    {loadState??(data&&<><div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted/60"><tr>{['Plan','Commodity','Period','Planned Quantity','Quantity Issued','Remaining to Issue','Nutrition Basis','Remarks'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.plans.length===0?<tr><td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">No supply plans registered for this child.</td></tr>:data.plans.map(plan=>{
      const product=data.products.find(p=>p.supplement_id===plan.supplement_id)
      const q=supplyPlanQuantities(plan,data.records)
      const unit=product?.item?.unit??'stock units'
      const assessment=data.assessments.find(a=>a.assessment_id===plan.source_assessment_id)
      return <tr key={plan.plan_id}><td className="px-4 py-3 text-sm">#{plan.plan_id}</td><td className="px-4 py-3 text-sm">{product?.item?.item_name??plan.product_label}</td><td className="px-4 py-3 text-sm whitespace-nowrap">{plan.start_date}<br/>to {plan.end_date}</td><td className="px-4 py-3 text-sm">{q?`${q.planned} ${unit}`:'Unavailable'}</td><td className="px-4 py-3 text-sm">{q?`${q.issued} ${unit}`:'Unavailable'}</td><td className="px-4 py-3 text-sm">{q?`${q.remaining} ${unit}`:'Unavailable'}{q?.overIssued&&<p className="text-xs text-amber-800">Issued quantity exceeds plan. Review records.</p>}</td><td className="px-4 py-3 text-sm">{plan.source_assessment_id?<>Assessment #{plan.source_assessment_id}{assessment&&<p className="text-xs text-muted-foreground">{assessment.assessment_date}</p>}</>:'No linked assessment'}</td><td className="px-4 py-3 text-sm">{plan.remarks??'—'}</td></tr>
    })}</tbody></table></div><p className="border-t px-5 py-3 text-xs text-muted-foreground">Only dispensing entries linked to this plan count as issued. Remaining quantity is a plan balance, not available inventory. Issuing all planned supplies does not confirm consumption or course completion.</p></>)}
  </section><section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">Supplementation History</h2><p className="text-sm text-muted-foreground">Actual administrations and documented supply issues</p></div><Link className="text-sm font-medium text-primary underline" href={`/supplementation?childId=${childId}`}>Review supplementation</Link></div>
    {historyTable(data?.records.filter(r=>r.tier!=='CLINICAL')??[])}
  </section><section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Clinical Supplementation History</h2><p className="text-sm text-muted-foreground">RHM-recorded clinical administrations, shown separately from routine, targeted and supply entries</p></div>{historyTable(data?.records.filter(r=>r.tier==='CLINICAL')??[])}</section></div>
}
