import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { NIP_CATALOG, GRACE_PERIOD_DAYS, getNipDoseDate, normalizeVaccineCode, manilaTodayYMD, nipDaysBetween } from '@/lib/nip-schedule'
import { childProgramEligibility } from '@/lib/child-program-eligibility'
const headers = {'Cache-Control':'private, no-store'}
const roleAliases: Record<string,UserRole> = {
  administrator:'Administrator',admin:'Administrator',
  'public health nurse':'Public Health Nurse',phn:'Public Health Nurse',
  'barangay health worker':'Barangay Health Worker',bhw:'Barangay Health Worker',
  'rural health midwife':'Rural Health Midwife',rhm:'Rural Health Midwife',
  'barangay nutrition scholar':'Barangay Nutrition Scholar',bns:'Barangay Nutrition Scholar',
}
function invalid(error:string,status=400) {return NextResponse.json({error},{status,headers})}
type Status='DUE'|'OVERDUE'
type DefaulterRow={child_id:number;child_name:string;date_of_birth:string;barangay_id:number|null;barangay_name:string|null;vaccine_code:string;vaccine_type:string;dose_number:number;due_date:string;days_overdue:number;status:Status}
export async function GET(request:Request) {
  try {
    const db=await createClient()
    const {data:{user},error:authError}=await db.auth.getUser()
    if(authError || !user) return invalid('Please sign in to view the defaulters list.',401)
    const profile=await db.rpc('get_my_profile').maybeSingle()
    const profileData: unknown = profile.data
    const profileRole = profileData !== null && typeof profileData === 'object' && !Array.isArray(profileData) && 'role' in profileData && typeof profileData.role === 'string' ? profileData.role : ''
    const role=roleAliases[profileRole.trim().toLowerCase()]
    if(profile.error || !role || !canPerform(role,'Vaccination','view')) return invalid('You are not authorized to view the defaulters list.',403)
    const account=await db.from('users').select('account_status').eq('user_id',user.id).maybeSingle()
    if(account.error) return invalid('Unable to verify your account.',500)
    if(account.data?.account_status!=='ACTIVE') return invalid('An active account is required.',403)
    const params=new URL(request.url).searchParams
    const statusFilter=(params.get('status')??'').toUpperCase()
    const vaccineFilter=(params.get('vaccine')??'').toUpperCase()
    const limit=Math.min(Math.max(Math.trunc(Number(params.get('limit')??200))||200,10),500)
    if(statusFilter && !['DUE','OVERDUE'].includes(statusFilter)) return invalid('status must be DUE or OVERDUE.')
    if(vaccineFilter && !NIP_CATALOG.some(v=>v.code===vaccineFilter)) return invalid('Choose a valid vaccine code.')
    const today=manilaTodayYMD()
    const childResult=await db.from('child').select('child_id,first_name,middle_name,last_name,date_of_birth,barangay_id,status,barangay:barangay(barangay_id,barangay_name)').eq('status','ACTIVE').order('child_id').limit(1001)
    if(childResult.error) return invalid('Unable to load children.',500)
    const loaded=childResult.data??[]
    const scopePossiblyTruncated=loaded.length>1000
    const children=loaded.slice(0,1000).filter(c=>c.status==='ACTIVE' && childProgramEligibility(c.date_of_birth,c.status,today).underFive===true)
    const childIds=children.map(c=>c.child_id)
    const birthByChild=new Map(children.map(c=>[c.child_id,String(c.date_of_birth)]))
    // No children => no record query (avoid empty IN). RLS still scopes all reads.
    const recordQuery=()=>db.from('vaccination_record')
      .select('vaccination_record_id,child_id,vaccine_id,dose_number,vaccination_date,status,vaccine:vaccine(vaccine_type)')
      .in('child_id',childIds).eq('status','APPROVED').order('vaccination_record_id')
    // Derive the accumulator from the query result, rather than allowing the
    // empty fallback branch to infer never[] or an incompatible union array.
    type ApprovedRecords = NonNullable<Awaited<ReturnType<typeof recordQuery>>['data']>
    const approvedRecords: ApprovedRecords = []
    if(childIds.length) {
      for(let offset=0; ;offset+=1000) {
        const result=await recordQuery().range(offset,offset+999)
        if(result.error) return invalid('Unable to load vaccination records.',500)
        const page=result.data??[]
        approvedRecords.push(...page)
        if(page.length<1000) break
      }
    }
    const doneMap=new Map<number,Map<string,Set<number>>>()
    for(const rec of approvedRecords) {
      const birth=birthByChild.get(rec.child_id)
      if(rec.status!=='APPROVED' || !birth || !Number.isFinite(nipDaysBetween(birth,rec.vaccination_date)) || rec.vaccination_date<birth || rec.vaccination_date>today || !Number.isInteger(rec.dose_number)) continue
      const vaccine=Array.isArray(rec.vaccine)?rec.vaccine[0]:rec.vaccine
      if(!vaccine?.vaccine_type) continue
      const code=normalizeVaccineCode(vaccine.vaccine_type)
      let perChild=doneMap.get(rec.child_id)
      if(!perChild) {perChild=new Map();doneMap.set(rec.child_id,perChild)}
      let doses=perChild.get(code)
      if(!doses) {doses=new Set();perChild.set(code,doses)}
      doses.add(rec.dose_number)
    }
    const defaulters:DefaulterRow[]=[]
    const emitted=new Set<string>()
    // Exactly ONE child -> vaccine -> dose traversal. Match approved records by
    // normalized code; never repeat the full catalog inside another dose loop.
    for(const child of children) {
      const dob=String(child.date_of_birth)
      const barangay=Array.isArray(child.barangay)?child.barangay[0]:child.barangay
      for(const vaccine of NIP_CATALOG) {
        if(vaccine.routine_enabled===false || (vaccineFilter && vaccine.code!==vaccineFilter)) continue
        const done=doneMap.get(child.child_id)?.get(vaccine.code)
        for(let dose=1;dose<=vaccine.total_doses;dose++) {
          if(done?.has(dose)) continue
          const due=getNipDoseDate(dob,vaccine,dose)
          if(!due || due>today) continue
          const days=nipDaysBetween(due,today)
          if(!Number.isFinite(days)) continue
          const status:Status=days>GRACE_PERIOD_DAYS?'OVERDUE':'DUE'
          if(statusFilter && statusFilter!==status) continue
          const key=`${child.child_id}:${vaccine.code}:${dose}`
          if(emitted.has(key)) continue
          emitted.add(key)
          defaulters.push({child_id:child.child_id,child_name:[child.first_name,child.middle_name,child.last_name].filter(Boolean).join(' '),date_of_birth:dob,barangay_id:child.barangay_id,barangay_name:barangay?.barangay_name??null,vaccine_code:vaccine.code,vaccine_type:vaccine.vaccine_type,dose_number:dose,due_date:due,days_overdue:days,status})
        }
      }
    }
    defaulters.sort((a,b)=>a.status!==b.status?(a.status==='OVERDUE'?-1:1):b.days_overdue-a.days_overdue || a.child_name.localeCompare(b.child_name) || a.child_id-b.child_id || a.vaccine_code.localeCompare(b.vaccine_code) || a.dose_number-b.dose_number)
    const shown=defaulters.slice(0,limit)
    return NextResponse.json({defaulters:shown,counts:{overdue:defaulters.filter(d=>d.status==='OVERDUE').length,due:defaulters.filter(d=>d.status==='DUE').length,unique_children_affected:new Set(defaulters.map(d=>d.child_id)).size,total_children_in_scope:children.length,total_children_evaluated:children.length,total_shown:shown.length,total_matched:defaulters.length,scope_possibly_truncated:scopePossiblyTruncated},filters:{status:statusFilter||null,vaccine:vaccineFilter||null,limit},role,grace_period_days:GRACE_PERIOD_DAYS,evaluatedOn:today},{headers})
  } catch {return invalid('Unable to load vaccination defaulters.',500)}
}
