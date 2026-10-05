'use client'

// Children list page. Register uses the shared ChildFormModal.
// Editing happens from the profile page (/children/[childId]), not from this list.
//
// CHILD-USR004 — Search and filter children.
// Health workers often triage dozens of records at once: searching by a child's name is
// not enough. This page combines a free-text search (name / ID) with three structured
// filters (Barangay, Age Group per OPT+ bands, Status) so any health worker can zero in
// on the subset they care about without scrolling the entire list.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Plus, Search, X } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { ChildFormModal } from '@/components/children/child-form-modal'
import { useToast } from '@/components/ui/toast'

type Child = {
  id: string
  householdNumber: string
  name: string
  barangay: string
  address: string
  dob: string
  age: string
  sex: string
  status: string
  monitoringStatus: string
}
type Barangay = { barangay_id: number; barangay_name: string }

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Unable to load records.')
  return data
}

// OPT+ age-band options the UI exposes. Each band carries its own matcher so the filter
// stays declarative at the call site. 'all' is the no-filter sentinel.
type AgeBand = 'all' | 'newborn' | 'infant' | 'psac'
const ageBands: { value: AgeBand; label: string; matches: (dob: string) => boolean }[] = [
  { value: 'all', label: 'All ages', matches: () => true },
  { value: 'newborn', label: 'Newborn (0-28 days)', matches: (dob) => daysOld(dob) >= 0 && daysOld(dob) <= 28 },
  { value: 'infant', label: 'Infant (0-11 months)', matches: (dob) => monthsOld(dob) < 12 },
  { value: 'psac', label: 'PSAC (12-59 months)', matches: (dob) => { const m = monthsOld(dob); return m >= 12 && m <= 59 } },
]

const statusOptions = ['all', 'ACTIVE', 'INACTIVE', 'MOVED', 'LOST', 'DECEASED'] as const
type StatusFilter = typeof statusOptions[number]

function daysOld(dob: string) {
  if (!dob) return -1
  const birth = new Date(`${dob}T00:00:00Z`)
  if (isNaN(birth.getTime())) return -1
  return Math.floor((Date.now() - birth.getTime()) / 86400000)
}
function monthsOld(dob: string) {
  if (!dob) return -1
  const birth = new Date(`${dob}T00:00:00Z`)
  if (isNaN(birth.getTime())) return -1
  const now = new Date()
  return (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth() - (now.getUTCDate() < birth.getUTCDate() ? 1 : 0)
}

export default function ChildHealthPage() {
  // Wait for the trusted role from auth-provider before deriving permissions, otherwise a
  // BNS (view-only) briefly sees the Register Child button during the first render.
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const isApproved = user?.accountStatus === 'APPROVED'
  const canRegister = Boolean(role && isApproved && canPerform(role, 'Child Profiling', 'create'))

  const { data: children, error, isLoading, mutate } = useSWR<Child[]>('/api/children', fetcher)
  const { data: barangays } = useSWR<Barangay[]>('/api/barangays', fetcher)

  // Filters — all independent, combined with AND. 'all' / '' means no filter.
  const [search, setSearch] = useState('')
  const [barangayFilter, setBarangayFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState<AgeBand>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [registerOpen, setRegisterOpen] = useState(false)
  const { showToast } = useToast()

  const records = children ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const ageMatcher = ageBands.find((b) => b.value === ageFilter)?.matches ?? (() => true)
    return records.filter((c) => {
      if (q && !`${c.name} ${c.id}`.toLowerCase().includes(q)) return false
      if (barangayFilter !== 'all' && c.barangay !== barangayFilter) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (ageFilter !== 'all' && !ageMatcher(c.dob)) return false
      return true
    })
  }, [records, search, barangayFilter, ageFilter, statusFilter])

  const anyFilterActive = search.trim() !== '' || barangayFilter !== 'all' || ageFilter !== 'all' || statusFilter !== 'all'
  function clearFilters() {
    setSearch('')
    setBarangayFilter('all')
    setAgeFilter('all')
    setStatusFilter('all')
  }

  const barangayLabelById = (id: string) => barangays?.find((b) => String(b.barangay_id) === id)?.barangay_name ?? id
  const activeChips: { label: string; onClear: () => void }[] = []
  if (barangayFilter !== 'all') activeChips.push({ label: `Barangay: ${barangayLabelById(barangayFilter)}`, onClear: () => setBarangayFilter('all') })
  if (ageFilter !== 'all') activeChips.push({ label: ageBands.find((b) => b.value === ageFilter)?.label ?? ageFilter, onClear: () => setAgeFilter('all') })
  if (statusFilter !== 'all') activeChips.push({ label: `Status: ${statusFilter}`, onClear: () => setStatusFilter('all') })

  if (!isReady) {
    return <div className="space-y-6"><div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading child profiling...</div></div>
  }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Child Profiling" role={role} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Child Profiling</h1>
          <p className="mt-1 text-muted-foreground">Register and monitor children aged 0–59 months.</p>
        </div>
        {canRegister && (
          <button onClick={() => setRegisterOpen(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white">
            <Plus size={20} />Register Child
          </button>
        )}
      </header>

      {/* Search + structured filters live together so health workers can combine them freely. */}
      <div className="rounded-2xl border border-border bg-white p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by child name or ID..."
            className="w-full rounded-lg border border-border bg-white py-2 pl-10 pr-4"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-muted-foreground">Barangay</span>
            <select value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-white px-3">
              <option value="all">All barangays</option>
              {(barangays ?? []).map((b) => <option key={b.barangay_id} value={String(b.barangay_id)}>{b.barangay_name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-muted-foreground">Age group</span>
            <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value as AgeBand)} className="h-10 rounded-lg border border-border bg-white px-3">
              {ageBands.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-muted-foreground">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="h-10 rounded-lg border border-border bg-white px-3">
              <option value="all">All statuses</option>
              {statusOptions.filter((s) => s !== 'all').map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        {/* Active-filter chip row + result count + clear-all affordance. Only renders when
            there's actually something to show, so the resting state stays uncluttered. */}
        {anyFilterActive && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">
              Showing <strong className="text-foreground">{filtered.length}</strong> of {records.length}
            </span>
            {activeChips.map((chip) => (
              <span key={chip.label} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {chip.label}
                <button type="button" onClick={chip.onClear} aria-label={`Remove filter ${chip.label}`} className="hover:text-primary/70"><X size={12} /></button>
              </span>
            ))}
            <button type="button" onClick={clearFilters} className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground">
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                {['ID', 'Name', 'Household', 'Barangay', 'Age', 'Status', 'Monitoring Status', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-4 text-left text-sm font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center">Loading child records...</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-red-600">{error.message}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                  {anyFilterActive ? 'No children match the current filters. Try broadening your search or clearing filters.' : 'No children have been registered yet.'}
                </td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-4 text-sm font-medium">{c.id}</td>
                  <td className="px-5 py-4 text-sm">{c.name}</td>
                  <td className="px-5 py-4 text-sm">{c.householdNumber}</td>
                  <td className="px-5 py-4 text-sm">{barangayLabelById(c.barangay)}</td>
                  <td className="px-5 py-4 text-sm">{c.age}</td>
                  <td className="px-5 py-4 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                      c.status === 'DECEASED' ? 'bg-red-50 text-red-700' :
                      c.status === 'MOVED' || c.status === 'LOST' ? 'bg-amber-50 text-amber-700' :
                      'bg-muted text-muted-foreground'
                    }`}>{c.status ?? '—'}</span>
                  </td>
                  <td className="px-5 py-4 text-sm">{c.monitoringStatus}</td>
                  <td className="px-5 py-4 text-sm">
                    <Link href={`/child-profiling/children/${c.id.replace('CH-', '')}`} className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-white">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {registerOpen && canRegister && (
        <ChildFormModal
          mode="create"
          onClose={() => setRegisterOpen(false)}
          onSaved={() => {
            setRegisterOpen(false)
            mutate()
            showToast({ type: 'success', message: 'Child registered successfully' })
          }}
          onError={(message) => showToast({ type: 'error', message })}
        />
      )}
    </div>
  )
}