
'use client'
import {InfoTip} from '@/components/ui/info-tip'
import {useSWRConfig} from 'swr'
import {useAuth} from '@/components/auth/auth-provider'
import {ModuleTabs} from '@/components/dashboard/module-tabs'
import {ChildChangeDraftPanel} from '@/components/children/child-change-draft-panel'
import {RhuTransferSection} from '@/components/children/rhu-transfer-section'
export function ChildTransfersPage(){
 const {user,isReady}=useAuth(),{mutate}=useSWRConfig()
 if(!isReady)return <p>Loading…</p>
 if(!user||user.accountStatus!=='APPROVED'||!['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(user.role))return <p role="alert">Transfer Inbox is available to assigned PHN, RHM and BHW workers.</p>
 return <div className="space-y-5"><ModuleTabs parent="Child Profiling" role={user.role}/><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-primary">Transfer Inbox</h1><p className="mt-1 text-sm text-muted-foreground">Incoming and outgoing requests, including completed transfers.</p></div><InfoTip label="About this view" text="About this view" align="end">Review transfers within your assigned barangays or RHU. Pending requests do not change the child’s assignment. Receiving acceptance transfers responsibility while keeping the same child record and service history. Accepted transfers remain here as history; they are not age-based archives. Available actions depend on your assignment and request status. Cancelled requests do not move the child. Offline actions remain drafts until reviewed and confirmed by the server. Search filters the current page; use Older transfers for earlier requests.</InfoTip></div><ChildChangeDraftPanel onUploaded={()=>{void mutate(key=>JSON.stringify(key)?.includes('child-transfers')??false)}}/><RhuTransferSection/></div>
}
