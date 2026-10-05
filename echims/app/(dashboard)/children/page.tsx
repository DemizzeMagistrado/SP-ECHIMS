'use client'

// Children list page. Register uses the shared ChildFormModal.
// Editing happens from the profile page (/children/[childId]), not from this list.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { ChildFormModal } from '@/components/children/child-form-modal'
import { useToast } from '@/components/ui/toast'

type Child = { id: string; householdNumber: string; name: string; barangay: string; age: string; monitoringStatus: string }
type Barangay = { barangay_id: number; barangay_name: string }

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Unable to load records.')
  return data
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

  const [search, setSearch] = useState('')
  const [registerOpen, setRegisterOpen] = useState(false)
  const { showToast } = useToast()

  const records = children ?? []
  const filtered = useMemo(() => records.filter((c) => `${c.name} ${c.id} ${c.barangay}`.toLowerCase().includes(search.toLowerCase())), [records, search])

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID, or barangay..." className="w-full rounded-lg border border-border bg-white py-2 pl-10 pr-4" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                {['ID', 'Name', 'Household', 'Barangay', 'Age', 'Monitoring Status', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-4 text-left text-sm font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center">Loading child records...</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-red-600">{error.message}</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-4 text-sm font-medium">{c.id}</td>
                  <td className="px-5 py-4 text-sm">{c.name}</td>
                  <td className="px-5 py-4 text-sm">{c.householdNumber}</td>
                  <td className="px-5 py-4 text-sm">{barangays?.find((b) => String(b.barangay_id) === c.barangay)?.barangay_name ?? c.barangay}</td>
                  <td className="px-5 py-4 text-sm">{c.age}</td>
                  <td className="px-5 py-4 text-sm">{c.monitoringStatus}</td>
                  <td className="px-5 py-4 text-sm">
                    <Link href={`/children/${c.id.replace('CH-', '')}`} className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-white">View</Link>
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