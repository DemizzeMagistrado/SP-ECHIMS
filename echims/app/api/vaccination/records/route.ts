import { loadBatchRule } from '@/lib/batch-rule-server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { batchNumberError, isVaccinationSite, normalizeBatchNumber } from '@/lib/vaccination-config'
const headers={'Cache-Control':'private, no-store'}
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers})
const invalid=(error:string,status=400)=>json({error},status)
const aliases:Record<string,UserRole>={administrator:'Administrator',admin:'Administrator',phn:'Public Health Nurse','public health nurse':'Public Health Nurse',rhm:'Rural Health Midwife','rural health midwife':'Rural Health Midwife',bhw:'Barangay Health Worker','barangay health worker':'Barangay Health Worker',bns:'Barangay Nutrition Scholar','barangay nutrition scholar':'Barangay Nutrition Scholar'}
async function authorize(action:'view'|'create'){
 const db=await createClient();const {data:{user},error}=await db.auth.getUser()
 if(error||!user)return invalid('Please sign in.',401)
 const [p,a]=await Promise.all([db.rpc('get_my_profile').maybeSingle(),db.from('users').select('account_status').eq('user_id',user.id).maybeSingle()])
 if(p.error||a.error)return invalid('Unable to verify account permissions.',500)
 const profile = p.data as unknown as {
  role?: string | null
} | null

const role =
  aliases[String(profile?.role ?? '').trim().toLowerCase()]
 if(a.data?.account_status!=='ACTIVE'||!role||!canPerform(role,'Vaccination',action))return invalid('Your account cannot perform this action.',403)
 return {db,user,role}
}
export async function GET(request:Request){try{
 const auth=await authorize('view');if(auth instanceof NextResponse)return auth
 const {db,user,role}=auth,url=new URL(request.url),q=(url.searchParams.get('q')??'').trim().toLowerCase(),status=(url.searchParams.get('status')??'').toUpperCase()
 if(status&&!['PENDING','APPROVED','NEEDS_CORRECTION','REJECTED'].includes(status))return invalid('Choose PENDING, APPROVED or NEEDS_CORRECTION.')
 // Needs correction: also old REJECTED rows (before migration 07 there was no NEEDS_CORRECTION).
 const statuses=status==='NEEDS_CORRECTION'||status==='REJECTED'?['NEEDS_CORRECTION','REJECTED']:status?[status]:null
 // Companion medicines are optional extras: if their tables/embeds are unavailable, load without them.
 const FULL=`vaccination_record_id,vaccination_date,dose_number,batch_number,vaccination_site,remarks,created_at,schedule_id,status,approved_by,approved_at,review_remarks,client_request_id,child:child(child_id,child_code,first_name,middle_name,last_name,date_of_birth,barangay_id,barangay:barangay(barangay_id,barangay_name),household:household(family_serial_no)),companions:vaccination_record_companion(item_id,quantity,deducted,note,item:item(item_name)),vaccine:vaccine(vaccine_id,vaccine_type,dose_volume,route,target_age,item:item!fk_vaccine_item(item_id,item_name),companions:vaccine_companion_item(item:item(item_id,item_name))),recorder:health_worker!fk_vaccination_recorded_by(user_id,user:users!fk_health_worker_user(user_id,full_name)),approver:users!fk_vaccination_approved_by(user_id,full_name)`
 const BASE=`vaccination_record_id,vaccination_date,dose_number,batch_number,vaccination_site,remarks,created_at,schedule_id,status,approved_by,approved_at,review_remarks,client_request_id,child:child(child_id,child_code,first_name,middle_name,last_name,date_of_birth,barangay_id,barangay:barangay(barangay_id,barangay_name),household:household(family_serial_no)),vaccine:vaccine(vaccine_id,vaccine_type,dose_volume,route,target_age,item:item!fk_vaccine_item(item_id,item_name)),recorder:health_worker!fk_vaccination_recorded_by(user_id,user:users!fk_health_worker_user(user_id,full_name)),approver:users!fk_vaccination_approved_by(user_id,full_name)`
 const run=(sel:string)=>{let query=db.from('vaccination_record').select(sel).order('created_at',{ascending:false}).limit(200);if(statuses)query=query.in('status',statuses);return query}
 // revision (migration 08) is optional: without the column, load as before.
 let result=await run(FULL.replace('review_remarks,','review_remarks,revision,'))
 if(result.error?.code==='42703')result=await run(FULL)
 if(result.error&&['PGRST200','PGRST201','42P01','42703'].includes(result.error.code)){console.warn('Vaccination records: optional companion data unavailable, loading without it.',result.error);result=await run(BASE)}
 if(result.error){console.error('Vaccination records GET:',result.error);return invalid('Unable to load vaccination records.',500)}
 const one=<T,>(v:T|T[]|null|undefined)=>(Array.isArray(v)?v[0]:v)??null
 // Search: child name, Child ID, FSN, vaccine, batch.
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const rows=((result.data??[]) as any[]).filter(row=>{if(!q)return true;const c=one(row.child),v=one(row.vaccine),i=one(v?.item),h=one(c?.household)
  return [c?.first_name,c?.middle_name,c?.last_name,c?.child_code,h?.family_serial_no,v?.vaccine_type,i?.item_name,row.batch_number].filter(Boolean).join(' ').toLowerCase().includes(q)})
 return json({rows,currentUserId:user.id,can_create:canPerform(role,'Vaccination','create'),can_review:canPerform(role,'Vaccination','approve'),can_export:canPerform(role,'Vaccination','export'),role})
 }catch(e){console.error('Vaccination GET:',e);return invalid('Unable to load records.',500)}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fields='vaccination_record_id,status,recorded_by,client_request_id,child_id,vaccine_id,dose_number,vaccination_date,batch_number,vaccination_site,remarks,schedule_id'
function id(v:unknown){return typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:null}
function text(v:unknown,max:number):string|null|undefined{if(v==null)return null;if(typeof v!=='string'||v.length>max)return undefined;return v.trim()||null}
function date(v:unknown):v is string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v}
function today(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(t=>parts.find(x=>x.type===t)?.value).join('-')}
export async function POST(request:Request){try{
 const auth=await authorize('create');if(auth instanceof NextResponse)return auth
 const {db,user}=auth,input:unknown=await request.json().catch(()=>null)
 if(!input||typeof input!=='object'||Array.isArray(input))return invalid('Invalid request body.')
 const b=input as Record<string,unknown>
 if(b.request_owner_id!==user.id)return invalid('This draft belongs to another account.',403)
 if(typeof b.client_request_id!=='string'||!UUID.test(b.client_request_id))return invalid('A valid client_request_id UUID is required.')
 const childId=id(b.child_id),vaccineId=id(b.vaccine_id),dose=id(b.dose_number),scheduleId=b.schedule_id==null?null:id(b.schedule_id)
 if(!childId||!vaccineId||!dose||!date(b.vaccination_date)||(b.schedule_id!=null&&!scheduleId))return invalid('Choose valid IDs, dose and vaccination date.')
 if(b.vaccination_date>today())return invalid('Vaccination date cannot be in the future.')
 const rawBatch=text(b.batch_number,200),site=text(b.vaccination_site,500),remarks=text(b.remarks,2000)
 if(rawBatch===undefined||site===undefined||remarks===undefined)return invalid('Batch, site and remarks must be valid text within their limits.')
 const batchError=batchNumberError(rawBatch,await loadBatchRule(db));if(batchError)return invalid(`Batch number: ${batchError}`)
 if(!isVaccinationSite(site))return invalid('Choose a vaccination site from the list.')
 const batch=normalizeBatchNumber(rawBatch)
 const values={child_id:childId,vaccine_id:vaccineId,dose_number:dose,vaccination_date:b.vaccination_date,batch_number:batch,vaccination_site:site,remarks,schedule_id:scheduleId}
 type Saved=typeof values&{vaccination_record_id:number;status:string;recorded_by:string;client_request_id:string}
 const respond=(saved:Saved,replayed:boolean)=>{
  if(saved.recorded_by!==user.id||Object.entries(values).some(([k,v])=>saved[k as keyof typeof values]!==v))return invalid('This request ID already belongs to different saved contents. Review the draft.',409)
  return json({vaccination_record_id:saved.vaccination_record_id,status:saved.status,currentUserId:user.id,client_request_id:b.client_request_id,idempotent:replayed},replayed?200:201)
 }
 const previous=await db.from('vaccination_record').select(fields).eq('recorded_by',user.id).eq('client_request_id',b.client_request_id).maybeSingle()
 if(previous.error)return invalid('Unable to verify this request. Draft retained.',500)
 if(previous.data)return respond(previous.data as Saved,true)
 const child=await db.from('child').select('child_id,date_of_birth,barangay_id,status').eq('child_id',childId).maybeSingle()
 if(child.error)return invalid('Unable to verify the child.',500)
 if(!child.data)return invalid('Child not found in your permitted scope.',403)
 const birth=String(child.data.date_of_birth)
 if(!date(birth)||b.vaccination_date<birth)return invalid('Vaccination date must be on or after birth.')
 const born=new Date(birth+'T00:00:00Z'),year=born.getUTCFullYear()+5,last=new Date(Date.UTC(year,born.getUTCMonth()+1,0)).getUTCDate(),fifth=new Date(Date.UTC(year,born.getUTCMonth(),Math.min(born.getUTCDate(),last))).toISOString().slice(0,10)
 if(b.vaccination_date>=fifth)return invalid('This module records vaccinations given before the fifth birthday.')
 if(child.data.status!=='ACTIVE')return invalid('Child is no longer active. Review the activity before uploading.',409)
 const vaccine=await db.from('vaccine').select('vaccine_id').eq('vaccine_id',vaccineId).maybeSingle()
 if(vaccine.error)return invalid('Unable to verify vaccine.',500);if(!vaccine.data)return invalid('Vaccine not found.')
 if(scheduleId){const s=await db.from('health_activity_schedule').select('barangay_id,activity_type,status').eq('schedule_id',scheduleId).maybeSingle();if(s.error)return invalid('Unable to verify activity.',500);if(!s.data||s.data.barangay_id!==child.data.barangay_id||s.data.activity_type!=='VACCINATION'||!['APPROVED','ONGOING','COMPLETED'].includes(s.data.status))return invalid('Linked activity is unavailable or incompatible. Review the draft.',409)}
 const duplicate=await db.from('vaccination_record').select('vaccination_record_id,status,vaccination_date,batch_number,vaccination_site,remarks,recorded_by').eq('child_id',childId).eq('vaccine_id',vaccineId).eq('dose_number',dose).in('status',['PENDING','APPROVED']).maybeSingle()
 if(duplicate.error)return invalid('Unable to check existing doses.',500)
 // Conflict: send the saved version so the client can show both side by side.
 if(duplicate.data){const d=duplicate.data;return json({error:`This dose is already ${d.status==='APPROVED'?'recorded and approved':'recorded and waiting for approval'}. Compare the two versions and choose which to keep.`,conflict:{vaccination_record_id:d.vaccination_record_id,status:d.status,vaccination_date:d.vaccination_date,batch_number:d.batch_number,vaccination_site:d.vaccination_site,remarks:d.remarks,recorded_by_me:d.recorded_by===user.id}},409)}
 const inserted=await db.from('vaccination_record').insert({...values,recorded_by:user.id,status:'PENDING',client_request_id:b.client_request_id}).select(fields).single()
 if(inserted.error){
  if(inserted.error.code==='23505'){const saved=await db.from('vaccination_record').select(fields).eq('recorded_by',user.id).eq('client_request_id',b.client_request_id).maybeSingle();if(saved.error)return invalid('Unable to confirm concurrent save. Retry unchanged.',500);if(saved.data)return respond(saved.data as Saved,true);return invalid('A conflicting dose already exists. Review the draft.',409)}
  if(inserted.error.code==='42501')return invalid('Your current assignment does not permit this record.',403)
  if(['22023','23514','23503','22P02'].includes(inserted.error.code))return invalid('The server rejected the values or linked records. Review the draft.')
  console.error('Vaccination save:',inserted.error);return invalid('Unable to confirm this save. Retry with the same request ID.',500)
 }
 return respond(inserted.data as Saved,false)
 }catch(e){console.error('Vaccination POST:',e);return invalid('Unable to confirm this save. Draft retained.',500)}}
