'use client'
import {offlineFetch as fetch} from '@/lib/offline/fetch'
import useSWR from 'swr'
import {useAuth} from '@/components/auth/auth-provider'
import {ReceivedHouseholdForm} from '@/components/children/received-household-form'
type Transfer={transfer_id:number;to_barangay_id:number|null;destination_address:string|null;can_complete_household:boolean}
export function TransferredHouseholdRegistration({childId,onSaved}:{childId:number;onSaved:()=>void}){
 const {user,isReady}=useAuth();const allowed=isReady && !!user && user.accountStatus==='APPROVED' && ['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(user.role)
 const {data,error,mutate}=useSWR(allowed?[user!.id,childId,'receiving-household-form']:null,async([owner,id])=>{const response=await fetch(`/api/child-transfers?childId=${id}`,{cache:'no-store'});const body=await response.json();if(!response.ok)throw Error(body.error??'Unable to check receiving transfer.');if(body.currentUserId!==owner || !Array.isArray(body.records))throw Error('Session changed. Refresh.');return {owner,records:body.records as Transfer[]}})
 if(!allowed)return null
 if(error)return <p role="alert" className="text-sm text-red-700">{error.message}</p>
 if(!data || data.owner!==user!.id)return <p className="text-sm">Checking receiving household registration…</p>
 const transfer=data.records.find(t=>t.can_complete_household)
 if(!transfer)return null
 return <div className="sm:col-span-3 rounded-xl border border-border bg-slate-50 p-4"><p className="text-sm font-medium">Receiving household registration</p><p className="text-xs text-muted-foreground">The child was transferred here without a linked household. Register or link the household using the guardian's information.</p><ReceivedHouseholdForm embedded transferId={transfer.transfer_id} barangayId={transfer.to_barangay_id} address={transfer.destination_address??''} onSaved={()=>{void mutate();onSaved()}}/></div>
}
