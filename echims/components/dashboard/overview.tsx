'use client'
import { Activity, AlertCircle, Apple, Baby, Clock, Package, Syringe } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'
import { useAuth } from '@/components/auth/auth-provider'
import { HealthMetrics } from './health-metrics'
import { RecentAlerts } from './recent-alerts'
import { StatCard } from './stat-card'
import type { UserRole } from '@/lib/echims-data'
// Lightweight fetcher for the overdue count tile — returns null on failure so the
// tile just shows 0 instead of erroring out the whole dashboard.
const defaultersFetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) return null
  return r.json()
}
const dashboardContent: Record<UserRole, { title: string; description: string; cards: [string, string][]; priorities: string[]; activities: string[] }> = {
  Administrator: { title: 'Administrator Dashboard', description: 'Monitor eCHIMS operations, users, inventory, and program performance.', cards: [['Children Registered', '1,245'], ['Active Health Workers', '32'], ['Vaccination Coverage', '87%'], ['Nutritional Cases', '143'], ['Low Stock Items', '8'], ['Pending Requests', '12']], priorities: ['Review pending user and schedule requests', 'Monitor vaccine stock below reorder level', 'Review missed vaccination alerts', 'Review children flagged for nutritional risk'], activities: ['New child profiles', 'Inventory transactions', 'Schedule requests', 'User activities'] },
  'Public Health Nurse': { title: 'Public Health Nurse Dashboard', description: 'Supervise field submissions, approve schedules, and monitor children under your program.', cards: [['Children Under Monitoring', '428'], ['Upcoming Activities', '36'], ['Vaccinations Due', '18'], ['Missed Vaccinations', '12'], ['Nutritional Assessments Due', '18'], ['Pending Schedule Requests', '5']], priorities: ['Approve pending vaccination schedules', 'Validate child profiling submissions', 'Review missed vaccinations', 'Follow up nutritional assessments due'], activities: ['09:00 AM · Vaccination', '10:30 AM · Child Profiling', '01:00 PM · Nutritional Assessment'] },
  'Barangay Health Worker': { title: 'Barangay Health Worker Dashboard', description: 'Complete assigned community health activities and submit records for PHN review.', cards: [['Assigned Children', '186'], ['Profiles to Visit', '18'], ['Vaccinations Due', '11'], ['Missed Vaccinations', '4'], ['Upcoming Activities', '7']], priorities: ["Complete today's vaccination activity", 'Visit children due for profiling', 'Submit schedule requests for approval', 'Follow up missed vaccinations'], activities: ['09:00 AM · Vaccination', '10:30 AM · Child Profiling', '03:00 PM · Health Activity'] },
  'Rural Health Midwife': { title: 'Rural Health Midwife Dashboard', description: 'Coordinate vaccination schedules, child profiling, and health activities for assigned barangays.', cards: [['Assigned Children', '214'], ['Upcoming Activities', '14'], ['Vaccinations Due', '9'], ['Pending Requests', '6'], ['Reports Ready', '3']], priorities: ['Coordinate upcoming vaccination activities', 'Review pending schedule requests', 'Complete child profiling visits', 'Submit activity performance reports'], activities: ['08:30 AM · Vaccination Schedule', '11:00 AM · Child Profiling', '02:00 PM · Barangay Activity'] },
  'Barangay Nutrition Scholar': { title: 'BNS Dashboard', description: 'Monitor nutrition status, complete assessments, and coordinate supplementation for at-risk children.', cards: [['Children Monitored', '312'], ['Assessments Due', '12'], ['At-Risk Children', '8'], ['Supplementation Due', '16'], ['Nutrition Alerts', '5']], priorities: ['Complete nutrition assessments due', 'Review at-risk children', 'Record supplementation activities', 'Follow up nutrition alerts'], activities: ['09:00 AM · Nutritional Assessment', '11:30 AM · Supplementation', '02:30 PM · Nutrition Follow-up'] },
}
const icons = [Baby, Syringe, Apple, Package, AlertCircle, Clock]
const colors = ['bg-[#E6F2FF] text-[#03045E]', 'bg-[#E0F2FE] text-[#0077B6]', 'bg-[#CCFBF1] text-[#00B4D8]', 'bg-[#DCFCE7] text-[#10B981]', 'bg-[#FEE2E2] text-[#EF4444]', 'bg-[#FFF7ED] text-[#C2410C]']
export function DashboardOverview() {
  const { user, isReady } = useAuth()
  const role = user?.role
  // NIP-USR005 — Overdue vaccinations tile. BNS has no Vaccination permission, skip.
  const showOverdueTile = role === 'Administrator' || role === 'Public Health Nurse'
    || role === 'Barangay Health Worker' || role === 'Rural Health Midwife'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: defaultersData } = useSWR<any>(
    isReady && showOverdueTile ? '/api/vaccination/defaulters?status=OVERDUE&limit=1' : null,
    defaultersFetcher,
  )
  // Always call hooks before returning during authentication loading.
  if (!isReady || !role) {
    return <div className="rounded-2xl border border-sky-200 bg-white p-10 text-center text-[#6B7280]">Loading your dashboard...</div>
  }
  const content = dashboardContent[role]
  if (!content) {
    return <div className="rounded-2xl border border-sky-200 bg-white p-10 text-center text-[#6B7280]">Dashboard is unavailable for this account role.</div>
  }
  const overdueCount = defaultersData?.counts?.overdue ?? 0
  const childrenAffected = defaultersData?.counts?.unique_children_affected ?? 0
  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-6">
        <p className="text-sm font-semibold text-[#0077B6]">{role}{user?.accountStatus === 'PENDING_APPROVAL' ? ' · Pending approval' : ''}</p>
        <h1 className="mt-1 text-3xl font-bold text-[#03045E]">{content.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#6B7280]">{content.description}</p>
      </header>
      <section aria-labelledby="dashboard-priorities" className="border-b border-[#E5E7EB] pb-6">
        <h2 id="dashboard-priorities" className="text-4xl font-bold text-[#03045E]">Today&apos;s Activities</h2>
        <p className="mt-2 text-[#6B7280]">Your role-specific information and tasks.</p>
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {content.cards.map(([label, value], index) => {
          const Icon = icons[index % icons.length]
          const [background, foreground] = colors[index % colors.length].split(' ')
          return <StatCard key={label} icon={Icon} label={label} value={value} trend="Current" color={background} iconColor={foreground} isAlert={label.toLowerCase().includes('alert') || label.toLowerCase().includes('stock')} />
        })}
      </div>
      {role === 'Public Health Nurse' && <section aria-labelledby="phn-schedule-approvals" className="rounded-2xl border border-[#E5E7EB] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[#0077B6]">Vaccination Schedule</p><h3 id="phn-schedule-approvals" className="mt-1 text-xl font-bold text-[#03045E]">Approval queue</h3></div><a href="/vaccination/schedule" className="text-sm font-semibold text-[#0077B6]">View all</a></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[#FFF7ED] p-4"><p className="text-sm text-[#9A3412]">Pending</p><p className="mt-1 text-2xl font-bold text-[#9A3412]">5</p></div><div className="rounded-xl bg-[#E8F7EE] p-4"><p className="text-sm text-[#16803C]">Approved</p><p className="mt-1 text-2xl font-bold text-[#16803C]">18</p></div><div className="rounded-xl bg-[#FEECEC] p-4"><p className="text-sm text-[#B42318]">Rejected</p><p className="mt-1 text-2xl font-bold text-[#B42318]">2</p></div></div></section>}
      {/* NIP-USR005 — Overdue vaccinations tile for Admin/PHN/BHW/RHM */}
      {showOverdueTile && (
        <section aria-labelledby="overdue-vaccinations" className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#B42318]">Follow-up alert</p>
              <h3 id="overdue-vaccinations" className="mt-1 text-xl font-bold text-[#03045E]">Overdue vaccinations</h3>
            </div>
            <Link href="/vaccination/defaulters" className="text-sm font-semibold text-[#0077B6]">View list</Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[#FEECEC] p-4">
              <p className="flex items-center gap-1.5 text-sm text-[#B42318]"><AlertCircle size={14} /> Overdue doses</p>
              <p className="mt-1 text-2xl font-bold text-[#B42318]">{overdueCount}</p>
            </div>
            <div className="rounded-xl bg-[#FFF7ED] p-4">
              <p className="text-sm text-[#9A3412]">Children affected</p>
              <p className="mt-1 text-2xl font-bold text-[#9A3412]">{childrenAffected}</p>
            </div>
          </div>
        </section>
      )}
      <section aria-labelledby="today-activities" className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[#0077B6]">Today&apos;s Activities</p><h3 id="today-activities" className="mt-1 text-xl font-bold text-[#03045E]">Scheduled work for your role</h3></div><Clock className="text-[#00B4D8]" aria-hidden="true" /></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">{content.activities.map((activity) => <div key={activity} className="rounded-xl bg-[#F8FAFC] p-4 text-sm font-medium text-[#1F2937]">{activity}</div>)}</div>
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 lg:col-span-2"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[#0077B6]">Priority work</p><h3 className="mt-1 text-xl font-bold text-[#03045E]">Role-specific tasks</h3></div><Activity className="text-[#00B4D8]" aria-hidden="true" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{content.priorities.map((task, index) => <div key={task} className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] p-4"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-sm font-bold text-[#0077B6]">{index + 1}</span><span className="text-sm font-medium text-[#1F2937]">{task}</span></div>)}</div></section>
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6"><Clock className="text-[#0077B6]" aria-hidden="true" /><p className="mt-4 text-sm text-[#6B7280]">Next action</p><p className="mt-1 font-semibold text-[#03045E]">{content.priorities[0]}</p></section>
      </div>
      <div className="grid gap-6 lg:grid-cols-2"><RecentAlerts /><HealthMetrics /></div>
    </div>
  )
}