import {NextResponse} from 'next/server'
import {householdSession,householdHeaders as headers,householdFailure as fail} from '@/lib/household-access'
export const dynamic='force-dynamic'
export async function GET(request:Request){
 try{
  const auth=await householdSession('view');if(auth instanceof NextResponse)return auth
  const params=new URL(request.url).searchParams,search=params.get('q')?.trim()??'',raw=params.get('barangayId')??'',barangayId=Number(raw)
  if(!search || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(barangayId))return NextResponse.json([],{headers})
  if(search.length>200)return fail('Search must be at most 200 characters.',400)
  const addressOnly=params.get('searchBy')==='address'
  const pattern=`%${search.replace(/[\\%_]/g,'\\$&')}%`
  let query=auth.db.from('household').select('household_id,household_no,family_serial_no,household_address,purok,barangay_id,water_source_type,toilet_facility_type,information_revision,information_updated_by,information_updated_at,latitude,longitude').eq('barangay_id',barangayId)
  if(addressOnly)query=query.ilike('household_address',pattern)
  else{
   // Quote pattern as a PostgREST literal rather than interpolating filter syntax.
   const literal=`"${pattern.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`
   query=query.or(`household_no.ilike.${literal},household_address.ilike.${literal},family_serial_no.ilike.${literal}`)
  }
  const result=await query.order(addressOnly?'household_address':'household_no').order('household_id').limit(20)
  if(result.error)return fail('Unable to search saved addresses.',500)
  return NextResponse.json(result.data??[],{headers})
 }catch{return fail('Unable to search saved addresses.',500)}
}
