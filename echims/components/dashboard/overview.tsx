'use client'

import { Baby, Syringe, Apple, Package, AlertCircle, TrendingUp, Clock, Activity } from 'lucide-react'
import { StatCard } from './stat-card'
import { useAuth } from '@/components/auth/auth-provider'
import { RecentAlerts } from './recent-alerts'
import { HealthMetrics } from './health-metrics'

const dashboardContent = {
  Administrator: { title: 'Administration workspace', description: 'Manage accounts, configuration, backups, and audit activity.', cards: [['Total registered children', '1,248'], ['Active health workers', '24'], ['Vaccination coverage', '94%'], ['Nutritional cases', '347'], ['Low-stock items', '3']] },
  'Public Health Nurse': { title: 'Supervision and validation workspace', description: 'Validate field submissions, approve vaccination requests, and monitor health reports.', cards: [['Children under monitoring', '428'], ['Upcoming vaccinations', '36'], ['Missed vaccinations', '12'], ['Assessments due', '18'], ['Pending schedule requests', '5']] },
  'Barangay Health Worker': { title: 'Field profiling workspace', description: 'Register households, record field vaccinations, and submit reports for review.', cards: [['Assigned barangay children', '186'], ['Profiles to visit', '18'], ['Vaccination activities', '11'], ['Assigned tasks', '7'], ['Alerts', '4']] },
  'Rural Health Midwife': { title: 'Midwife care workspace', description: 'Coordinate vaccination schedules, health activities, and follow-up care for assigned barangays.', cards: [['Assigned children', '214'], ['Vaccination activities', '14'], ['Upcoming health activities', '8'], ['Pending requests', '6'], ['Reports ready', '3']] },
  'Barangay Nutrition Scholar': { title: 'Nutrition assessment workspace', description: 'Capture OPT Plus Form 1A measurements, classify nutrition status, and follow up at-risk children.', cards: [['Children monitored', '312'], ['Assessments due', '12'], ['At-risk children', '8'], ['Supplementation due', '16'], ['Nutrition alerts', '5']] },
} as const

export function DashboardOverview() {
  const { user } = useAuth()
  const role = user?.role ?? 'Administrator'
  const content = dashboardContent[role]
  const icons = [Baby, Syringe, Apple, Package, AlertCircle]
  const colors = ['bg-[#E6F2FF] text-[#03045E]', 'bg-[#E0F2FE] text-[#0077B6]', 'bg-[#CCFBF1] text-[#00B4D8]', 'bg-[#DCFCE7] text-[#10B981]', 'bg-[#FEE2E2] text-[#EF4444]']
  return <div className="space-y-8"><div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-6"><p className="text-sm font-semibold text-[#0077B6]">{role}</p><h1 className="mt-1 text-3xl font-bold text-[#03045E]">{content.title}</h1><p className="mt-2 max-w-3xl text-sm text-[#6B7280]">{content.description}</p></div><div className="border-b border-[#E5E7EB] pb-6"><h2 className="text-4xl font-bold text-[#03045E]">Dashboard</h2><p className="mt-2 text-[#6B7280]">Role-specific overview of assigned eCHIMS work.</p></div><div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">{content.cards.map(([label, value], index) => { const Icon = icons[index]; return <StatCard key={label} icon={Icon} label={label} value={value} trend={index === 4 ? 'Review' : 'Current'} color={colors[index].split(' ')[0]} iconColor={colors[index].split(' ')[1]} isAlert={index === 4 && label.toLowerCase().includes('alert')} /> })}</div><div className="grid grid-cols-1 gap-6 lg:grid-cols-3"><div className="lg:col-span-2"><RecentAlerts /></div><HealthMetrics /></div><div className="grid grid-cols-1 gap-6 md:grid-cols-3"><div className="rounded-2xl border border-[#E5E7EB] bg-white p-6"><TrendingUp className="text-[#10B981]" /><p className="mt-4 text-sm text-[#6B7280]">Recent activities</p><p className="mt-1 text-3xl font-bold text-[#03045E]">24</p></div><div className="rounded-2xl border border-[#E5E7EB] bg-white p-6"><Clock className="text-[#0077B6]" /><p className="mt-4 text-sm text-[#6B7280]">Follow-ups due this week</p><p className="mt-1 text-3xl font-bold text-[#03045E]">18</p></div><div className="rounded-2xl border border-[#E5E7EB] bg-white p-6"><Activity className="text-[#00B4D8]" /><p className="mt-4 text-sm text-[#6B7280]">Sync status</p><p className="mt-1 text-3xl font-bold text-[#03045E]">Online</p></div></div></div>
}
