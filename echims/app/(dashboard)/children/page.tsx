'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// Children list (CHILD-USR004). Search by name, Child ID, Family Serial No., guardian or
// household number; filter by barangay, status, monitoring status and age group. Six columns
// at a glance; everything else is on the profile. Registration uses the shared ChildFormModal.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from '@/lib/offline/navigation'
import { Plus, Search, SearchX, Baby, X } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { ChildDraftPanel } from '@/components/children/child-draft-panel'
import { ChildFormModal } from '@/components/children/child-form-modal'
import { toast } from '@/components/ui/toast'
import { LogoLoader } from '@/components/brand/logo-loader'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { DataTable, type Column } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { monthsOld } from '@/lib/children/profile-fields'

type Child = {
  child_id: number
  id: string
  familySerialNo: string
  householdNo: string
  householdNumber: string
  guardianName: string
  motherName: string
  name: string
  barangay: string
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
  if (!response.ok) throw new Error(data.error || 'The child list could not be loaded. Check your connection and refresh.')
  return data
}

type AgeBand = 'all' | 'newborn' | 'infant' | 'psac'
const daysOld = (dob: string) => Math.floor((Date.now() - new Date(`${dob}T00:00:00Z`).getTime()) / 86400000)
const ageBands: { value: AgeBand; label: string; matches: (dob: string) => boolean }[] = [
  { value: 'all', label: 'All ages', matches: () => true },
  { value: 'newborn', label: 'Newborn (0–28 days)', matches: (dob) => daysOld(dob) >= 0 && daysOld(dob) <= 28 },
  { value: 'infant', label: 'Infant (0–11 months)', matches: (dob) => monthsOld(dob) < 12 },
  { value: 'psac', label: 'PSAC (12–59 months)', matches: (dob) => monthsOld(dob) >= 12 && monthsOld(dob) <= 59 },
]
const statusOptions = ['ACTIVE', 'INACTIVE', 'MOVED', 'LOST', 'DECEASED']
const childStatusTone = (s: string) => (s === 'ACTIVE' ? 'good' : s === 'DECEASED' ? 'danger' : s === 'MOVED' || s === 'LOST' ? 'warn' : 'neutral') as 'good' | 'danger' | 'warn' | 'neutral'

export default function ChildHealthPage() {
  // Wait for the trusted role before deriving permissions, so a view-only role never sees
  // Register Child flash on the first render.
  const { user, isReady } = useAuth()
  const router = useRouter()
  const role = user?.role as UserRole | undefined
  const isApproved = user?.accountStatus === 'APPROVED'
  const canRegister = Boolean(role && isApproved && canPerform(role, 'Child Profiling', 'create'))

  const { data: children, error, isLoading, mutate } = useSWR<Child[]>('/api/children', fetcher, { keepPreviousData: true })
  const { data: barangays } = useSWR<Barangay[]>('/api/barangays', fetcher)

  const [search, setSearch] = useState('')
  const [barangayFilter, setBarangayFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState<AgeBand>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [monitoringFilter, setMonitoringFilter] = useState('all')
  const [registerOpen, setRegisterOpen] = useState(false)

  const records = useMemo(() => children ?? [], [children])
  const monitoringOptions = useMemo(() => [...new Set(records.map((c) => c.monitoringStatus).filter(Boolean))].sort(), [records])
  const barangayName = (id: string) => barangays?.find((b) => String(b.barangay_id) === id)?.barangay_name ?? '—'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const age = ageBands.find((b) => b.value === ageFilter)?.matches ?? (() => true)
    return records.filter((c) =>
      (!q || [c.name, c.id, c.familySerialNo, c.guardianName, c.motherName, c.householdNo, c.householdNumber].some((v) => v?.toLowerCase().includes(q))) &&
      (barangayFilter === 'all' || c.barangay === barangayFilter) &&
      (statusFilter === 'all' || c.status === statusFilter) &&
      (monitoringFilter === 'all' || c.monitoringStatus === monitoringFilter) &&
      (ageFilter === 'all' || age(c.dob)))
  }, [records, search, barangayFilter, ageFilter, statusFilter, monitoringFilter])

  const anyFilter = search.trim() !== '' || barangayFilter !== 'all' || ageFilter !== 'all' || statusFilter !== 'all' || monitoringFilter !== 'all'
  function clearFilters() {
    setSearch(''); setBarangayFilter('all'); setAgeFilter('all'); setStatusFilter('all'); setMonitoringFilter('all')
  }

  const columns: Column<Child>[] = [
    { key: 'id', header: 'Child ID', cell: (c) => <span className="font-mono text-xs font-semibold text-brand-navy">{c.id}</span>, sortValue: (c) => c.id },
    {
      key: 'name', header: 'Name', sortValue: (c) => c.name,
      cell: (c) => (
        <Link href={`/child-profiling/children/${c.child_id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-navy underline-offset-4 hover:underline">
          {c.name}
        </Link>
      ),
    },
    { key: 'age', header: 'Age', cell: (c) => `${Math.max(0, monthsOld(c.dob))} mos`, sortValue: (c) => monthsOld(c.dob), align: 'right' },
    { key: 'barangay', header: 'Barangay', cell: (c) => barangayName(c.barangay), sortValue: (c) => barangayName(c.barangay) },
    {
      key: 'fsn', header: 'FSN / Household', sortValue: (c) => c.familySerialNo,
      cell: (c) => (
        <div>
          {c.familySerialNo ? (
            <button type="button" title="Show this household's children" onClick={(e) => { e.stopPropagation(); setSearch(c.familySerialNo) }}
              className="font-mono text-xs text-brand-navy underline-offset-4 hover:underline">{c.familySerialNo}</button>
          ) : <span className="text-muted-foreground">—</span>}
          {c.householdNo && <span className="block text-xs text-muted-foreground">HH {c.householdNo}</span>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status ?? 'ACTIVE'} tone={childStatusTone(c.status)} />, sortValue: (c) => c.status },
  ]

  if (!isReady) return <LogoLoader label="Loading child profiling…" />

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Child Profiling" role={role} />
      <PageHeader
        title="Child Profiling"
        subtitle="Register and monitor children aged 0–59 months."
        actions={canRegister && <Button onClick={() => setRegisterOpen(true)}><Plus size={18} />Register Child</Button>}
      />
      {canRegister && <ChildDraftPanel onUploaded={() => mutate()} />}

      {error && !children ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
          {error.message}
          <Button variant="secondary" size="sm" onClick={() => mutate()}>Try again</Button>
        </div>
      ) : isLoading && !children ? (
        <LogoLoader size="section" label="Loading child records…" />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(c) => c.child_id}
          caption="Registered children"
          refreshing={isLoading}
          mobile="cards"
          onRowClick={(c) => router.push(`/child-profiling/children/${c.child_id}`)}
          empty={anyFilter
            ? { icon: SearchX, title: 'No children match these filters', description: 'Try a broader search or clear the filters.', action: <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> }
            : { icon: Baby, title: 'No children registered yet', description: canRegister ? 'Use Register Child to add the first child in your area.' : 'Registered children in your area will be listed here.' }}
          toolbar={
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden="true" />
                <Input
                  aria-label="Search children"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, Child ID, Family Serial No., guardian or household no."
                  className="pl-10 pr-9"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X size={16} /></button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select aria-label="Barangay" value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)}>
                  <option value="all">All barangays</option>
                  {(barangays ?? []).map((b) => <option key={b.barangay_id} value={String(b.barangay_id)}>{b.barangay_name}</option>)}
                </Select>
                <Select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                </Select>
                <Select aria-label="Monitoring status" value={monitoringFilter} onChange={(e) => setMonitoringFilter(e.target.value)}>
                  <option value="all">All monitoring statuses</option>
                  {monitoringOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select aria-label="Age group" value={ageFilter} onChange={(e) => setAgeFilter(e.target.value as AgeBand)}>
                  {ageBands.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </Select>
              </div>
              {anyFilter && (
                <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Showing <strong className="text-foreground">{filtered.length}</strong> of {records.length}</span>
                  <button type="button" onClick={clearFilters} className="font-medium text-primary underline-offset-4 hover:underline">Clear filters</button>
                </p>
              )}
            </div>
          }
        />
      )}

      {registerOpen && canRegister && (
        <ChildFormModal
          mode="create"
          onDraftSaved={() => { setRegisterOpen(false); toast.success('Saved on this device. Review and upload the draft when you are back online.') }}
          onClose={() => setRegisterOpen(false)}
          onSaved={() => { setRegisterOpen(false); mutate(); toast.success('Child registered') }}
          onError={(message) => toast.error(message)}
        />
      )}
    </div>
  )
}
