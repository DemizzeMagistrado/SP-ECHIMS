
'use client'
import {useSWRConfig} from 'swr'
import {useAuth} from '@/components/auth/auth-provider'
import {ModuleTabs} from '@/components/dashboard/module-tabs'
import {ChildChangeDraftPanel} from '@/components/children/child-change-draft-panel'
import {RhuTransferSection} from '@/components/children/rhu-transfer-section'
export function ChildTransfersPage(){
 const {user,isReady}=useAuth(),{mutate}=useSWRConfig()
 if(!isReady)return <p>Loading…</p>
 if(!user||user.accountStatus!=='APPROVED'||!['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(user.role))return <p role="alert">Transfer Inbox is available to assigned PHN, RHM and BHW workers.</p>
 return <div className="space-y-5"><ModuleTabs parent="Child Profiling" role={user.role}/><h1 className="text-2xl font-semibold text-primary">Transfer Inbox</h1><p className="text-sm text-muted-foreground">Review incoming and outgoing child transfers. Accept a transfer or cancel it with a reason.</p><ChildChangeDraftPanel onUploaded={()=>{void mutate(key=>JSON.stringify(key)?.includes('child-transfers')??false)}}/><RhuTransferSection/></div>
}
