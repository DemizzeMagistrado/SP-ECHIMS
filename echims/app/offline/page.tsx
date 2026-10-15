'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopNav } from '@/components/dashboard/top-nav'
import { ToastProvider } from '@/components/ui/toast'
import { OfflinePathContext } from '@/lib/offline/navigation'
import type { Role } from '@/lib/auth/permissions'
import type { UserRole } from '@/lib/echims-data'
import LandingPage from '@/app/page'
import LoginPage from '@/app/login/page'
import RegisterPage from '@/app/register/page'
import ForgotPasswordPage from '@/app/forgot-password/page'
import ResetPasswordPage from '@/app/reset-password/page'
import PrivacyPage from '@/app/privacy/page'
import TermsPage from '@/app/terms/page'
import DashboardPage from '@/app/(dashboard)/dashboard/page'
import ChildrenPage from '@/app/(dashboard)/children/page'
import { ChildProfileView } from '@/app/(dashboard)/children/[childId]/page'
import NutritionPage from '@/app/(dashboard)/nutrition/page'
import VaccinationPage from '@/app/(dashboard)/vaccination/page'
import SupplementationPage from '@/app/(dashboard)/supplementation/page'
import ReportsPage from '@/app/(dashboard)/reports/page'
import AlertsPage from '@/app/(dashboard)/alerts/page'
import SettingsPage from '@/app/(dashboard)/settings/page'
import HealthActivitiesClient from '@/app/(dashboard)/health-activities/health-activities-client'
import { ProfileErrorBoundary } from '@/components/offline/profile-error-boundary'
import { SavedUserManagement } from '@/components/offline/saved-user-management'
const roles: Record<UserRole, Role> = { Administrator:'Administrator', 'Public Health Nurse':'PHN', 'Rural Health Midwife':'RHM', 'Barangay Health Worker':'BHW', 'Barangay Nutrition Scholar':'BNS' }

export default function OfflinePage() {
  const { user, isReady } = useAuth()
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('path') ?? '/dashboard'
    // A local path only; never accept external redirect destinations.
    const url = new URL(requested, window.location.origin)
    setTarget(url.origin === window.location.origin && requested.startsWith('/') && !requested.startsWith('//') && url.pathname !== '/offline' ? url.pathname + url.search : '/dashboard')
  }, [])
  const path = target?.split('?')[0] ?? '/dashboard'
  const childId = /^(?:\/children|\/child-profiling\/children)\/((?:CH-)?(?:\d{4}-)?\d+)$/i.exec(path)?.[1]
  if (!target) return <main className="p-8">Opening saved page…</main>
  if (path === '/') return <OfflinePathContext.Provider value={path}><LandingPage/></OfflinePathContext.Provider>
  if (path === '/privacy') return <OfflinePathContext.Provider value={path}><PrivacyPage/></OfflinePathContext.Provider>
  if (path === '/terms') return <OfflinePathContext.Provider value={path}><TermsPage/></OfflinePathContext.Provider>
  if (path === '/register') return <OfflinePathContext.Provider value={path}><RegisterPage/></OfflinePathContext.Provider>
  if (path === '/forgot-password') return <OfflinePathContext.Provider value={path}><ForgotPasswordPage/></OfflinePathContext.Provider>
  if (path === '/reset-password') return <OfflinePathContext.Provider value={path}><ResetPasswordPage/></OfflinePathContext.Provider>
  if (path === '/login') return <OfflinePathContext.Provider value={path}>{user && <p className="p-4"><a className="font-semibold underline" href="/dashboard">Continue with this device’s signed-in account</a></p>}<LoginPage/></OfflinePathContext.Provider>
  if (!isReady) return <main className="p-8">Loading this device’s account…</main>
  if (!user || user.accountStatus !== 'APPROVED') return <main className="space-y-3 p-8"><h1 className="text-2xl font-bold">Sign in to eCHIMS</h1><p>Your device account is locked or its saved access has expired. Sign in with a previously prepared account to open its saved records and drafts.</p><a className="inline-block rounded-lg border px-4 py-2 font-semibold" href="/offline?path=%2Flogin">Sign in on this device</a><p><a className="underline" href="/">Return to landing page</a></p></main>
  let page
  if (path === '/dashboard') page = <DashboardPage/>
  else if (childId) page = <ProfileErrorBoundary key={childId}><ChildProfileView childId={childId}/></ProfileErrorBoundary>
  else if (['/children', '/child-profiling/children'].includes(path)) page = <ChildrenPage/>
  else if (/^\/(vaccination|vaccinations)(\/|$)/.test(path)) page = <VaccinationPage/>
  else if (/^\/(nutrition|nutritional-assessment)(\/|$)/.test(path)) page = <NutritionPage/>
  else if (/^\/(supplementation|supplements)(\/|$)/.test(path)) page = <SupplementationPage/>
  else if (path === '/reports') page = <ReportsPage/>
  else if (path === '/alerts') page = <AlertsPage/>
  else if (path === '/health-activities') page = <HealthActivitiesClient/>
  else if (path === '/user-management') page = <SavedUserManagement/>
  else if (/^\/(settings|organization)(\/|$)/.test(path)) page = <SettingsPage/>
  else page = (
  <section className="rounded-xl border border-sky-200 bg-white p-6">
    <h1 className="text-xl font-semibold">Offline view unavailable</h1>
    <p className="mt-2 text-sm text-slate-600">
      Reconnect to open this page. Your saved drafts remain on this device.
    </p>
  </section>
)
  return <OfflinePathContext.Provider value={path}><ToastProvider><div className="flex min-h-screen items-stretch bg-[#CAF0F8]">
    <Sidebar role={roles[user.role]} fullName={user.fullName}/>
    <div className="flex min-h-screen min-w-0 flex-1 flex-col"><TopNav/>
      <main className="min-h-0 flex-1 overflow-y-auto bg-[#CAF0F8] p-8"><div className="mx-auto w-full max-w-7xl">{page}</div></main>
    </div>
  </div></ToastProvider></OfflinePathContext.Provider>
}
