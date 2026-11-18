import {NextResponse} from 'next/server'
import {householdSession,householdHeaders as headers,householdFailure as fail} from '@/lib/household-access'
export const dynamic='force-dynamic'
export async function GET(request:Request){try{
 const auth=await householdSession('view');if(auth instanceof NextResponse)return auth
 const params=new URL(request.url).searchParams
 const read=(key:string)=>{const raw=params.get(key);return raw===null?null:/^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw))?Number(raw):false}
 const area=read('barangayId'),before=read('beforeId');if(area===false || before===false)return fail('Invalid barangay or cursor.',400)
 const result=await auth.db.rpc('echims_transferred_children_archive',{p_barangay_id:area,p_before_id:before})
 if(result.error)return fail('Archived transfers require an assigned PHN, RHM or BHW.',result.error.code==='42501'?403:500)
 return NextResponse.json(result.data,{headers})
}catch{return fail('Unable to load archived children.',500)}}
