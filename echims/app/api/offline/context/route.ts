import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/echims-data'
type OfflineProfile = {
  role?: string | null
  full_name?: string | null
  username?: string | null
  email?: string | null
  contact_number?: string | null
  employee_id?: string | null
  license_number?: string | null
}

const headers={'Cache-Control':'private, no-store'}
const roles:Record<string,UserRole>={administrator:'Administrator',admin:'Administrator',phn:'Public Health Nurse','public health nurse':'Public Health Nurse',rhm:'Rural Health Midwife','rural health midwife':'Rural Health Midwife',bhw:'Barangay Health Worker','barangay health worker':'Barangay Health Worker',bns:'Barangay Nutrition Scholar','barangay nutrition scholar':'Barangay Nutrition Scholar'}
export async function GET(){
 try {
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser()
 if(error||!user)
    return NextResponse.json({error:'Please sign in online first.'},{status:401,headers})
 const [p,a]=await Promise.all(
    [db.rpc('get_my_profile').maybeSingle(),db.from('users').select('account_status').eq('user_id',user.id).maybeSingle()])
 if(p.error||a.error)
    return NextResponse.json({error:'Unable to verify account.'},{status:500,headers})
 const profile = p.data as unknown as OfflineProfile | null;
    const role=roles[String(profile?.role??'').trim().toLowerCase()]
 if(a.data?.account_status!=='ACTIVE'||!role)
    return NextResponse.json({error:'An active staff account is required.'},{status:403,headers})
 let barangayIds:string[]=[];
 let rhuId=''
 if(role==='Public Health Nurse'){
  const phn=await db.from('public_health_nurse').select('rhu_id').eq('user_id',user.id).maybeSingle()
  if(phn.error)
    throw phn.error
  if(phn.data?.rhu_id!=null){rhuId=String(phn.data.rhu_id);const b=await db.from('barangay').select('barangay_id').eq('rhu_id',phn.data.rhu_id);if(b.error)throw b.error;barangayIds=(b.data??[]).map(x=>String(x.barangay_id))}
 }else if(role!=='Administrator'){
  const a=await db.from('health_worker_assignment').select('barangay_id').eq('user_id',user.id).eq('status','ACTIVE')
  if(a.error)throw a.error;barangayIds=[...new Set((a.data??[]).map(x=>String(x.barangay_id)))]
 }
 return NextResponse.json({user:{id:user.id,fullName:profile?.full_name??'',username:profile?.username??'',email:profile?.email??user.email??'',role,requestedRole:null,accountStatus:'APPROVED',contactNumber:profile?.contact_number??'',employeeId:profile?.employee_id??'',licenseNumber:profile?.license_number??'',rhu_id:rhuId,barangay_id:barangayIds.length===1?barangayIds[0]:'',barangay_ids:barangayIds},verifiedAt:new Date().toISOString()},{headers})
 }catch(error){console.error('Offline context:',error);return NextResponse.json({error:'Unable to prepare offline access.'},{status:500,headers})}
}
