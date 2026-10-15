'use client'
import { useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopNav } from '@/components/dashboard/top-nav'
import { ToastProvider } from '@/components/ui/toast'
import type { Role } from '@/lib/auth/permissions'
import type { UserRole } from '@/lib/echims-data'
import NutritionPage from '@/app/(dashboard)/nutrition/page'
import VaccinationPage from '@/app/(dashboard)/vaccination/page'
const roles:Record<UserRole,Role>={Administrator:'Administrator','Public Health Nurse':'PHN','Rural Health Midwife':'RHM','Barangay Health Worker':'BHW','Barangay Nutrition Scholar':'BNS'}
export default function OfflinePage(){
 const {user,isReady}=useAuth(),[tab,setTab]=useState<'VACCINATION'|'NUTRITION'>('VACCINATION')
 if(!isReady)return <main className="p-8">Loading this device’s account…</main>
 if(!user||user.accountStatus!=='APPROVED')return <main className="space-y-3 p-8"><h1 className="text-2xl font-bold">Prepare offline access</h1><p>Sign in online with an active staff account and prepare this device first.</p><a className="underline" href="/login">Sign in online</a></main>
 const vaccine=['Barangay Health Worker','Rural Health Midwife','Public Health Nurse','Administrator'].includes(user.role)
 const nutrition=['Barangay Nutrition Scholar','Rural Health Midwife','Public Health Nurse','Administrator'].includes(user.role)
 const selected=tab==='VACCINATION'&&vaccine?'VACCINATION':'NUTRITION'
 return <ToastProvider><div className="offline-dashboard-shell flex min-h-screen items-stretch bg-[#CAF0F8]" data-offline-module={selected}>
 <style>{`
 .offline-dashboard-shell[data-offline-module="VACCINATION"] aside a[href="/vaccination/records"],
 .offline-dashboard-shell[data-offline-module="VACCINATION"] aside a[href="/vaccination"],
 .offline-dashboard-shell[data-offline-module="NUTRITION"] aside a[href="/nutritional-assessment/records"],
 .offline-dashboard-shell[data-offline-module="NUTRITION"] aside a[href="/nutritional-assessment"],
 .offline-dashboard-shell[data-offline-module="NUTRITION"] aside a[href="/nutrition"] {
   background: white; color: #075985; box-shadow: 0 4px 6px -1px rgb(0 0 0 / .1);
 }
 `}</style>
 <Sidebar role={roles[user.role]} fullName={user.fullName}/>
 <div className="flex min-h-screen min-w-0 flex-1 flex-col"><TopNav/>
 <main className="min-h-0 flex-1 overflow-y-auto bg-[#CAF0F8] p-8"><div className="mx-auto w-full max-w-7xl">
 {selected==='VACCINATION'?<VaccinationPage key={user.id}/>:nutrition?<NutritionPage key={user.id}/>:<p>No prepared module is available for this role.</p>}
 {vaccine&&nutrition&&<button type="button" className="mt-8 text-xs font-medium text-[#0077B6] hover:underline" onClick={()=>setTab(selected==='VACCINATION'?'NUTRITION':'VACCINATION')}>{selected==='VACCINATION'?'Open prepared nutrition workspace':'Return to vaccination'}</button>}
 </div></main></div></div></ToastProvider>
}
