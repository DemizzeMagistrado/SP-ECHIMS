'use client'

// NIP-USR006 — NIP Vaccine Catalog admin page at /vaccination/catalog.
// Admin-only. Non-admins get a 403-style notice. Tab is hidden from their sidebar strip.

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, Pencil, Power, Syringe, Eye, History, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { useToast } from '@/components/ui/toast'
import { VaccineFormModal, type VaccineCatalogRow } from '@/components/vaccination/vaccine-form-modal'

type LatestChange = {
  audit_id: number
  vaccine_id: number
  action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE'
  changed_at: string
  changed_by: string
} | null

type Payload = {
  vaccines: (VaccineCatalogRow & { latest_change: LatestChange })[]
  can_edit: boolean
  role: UserRole
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load catalog.')
  return d
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function VaccinationCatalogPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  // Admin edits; PHN reads. Everyone else is 403.
  const isAdmin = role === 'Administrator'
  const canView = role ? canPerform(role, 'NIP Catalog', 'view') : false
  const { showToast } = useToast()

  const { data, error, isLoading } = useSWR<Payload>(isReady ? '/api/vaccines/catalog' : null, fetcher)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VaccineCatalogRow | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(v: VaccineCatalogRow) { setEditing(v); setModalOpen(true) }

  async function toggleActive(v: VaccineCatalogRow, nextActive: boolean) {
    if (togglingId) return
    const confirmMsg = nextActive
      ? `Reactivate ${v.vaccine_type}? It will reappear in schedule computation and the Record modal.`
      : `Deactivate ${v.vaccine_type}? It will stop appearing in the Record modal and will be excluded from new schedule computation.`
    if (!window.confirm(confirmMsg)) return
    setTogglingId(v.vaccine_id)
    try {
      // Toggle is folded into the main PATCH — no separate /toggle folder needed
      const r = await fetch('/api/vaccines/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_id: v.vaccine_id, is_active: nextActive }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Toggle failed.')
      showToast({ type: 'success', message: `${v.vaccine_type} ${nextActive ? 'reactivated' : 'deactivated'}.` })
      globalMutate('/api/vaccines/catalog')
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Toggle failed.' })
    } finally {
      setTogglingId(null)
    }
  }

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
  if (!canView) {
    return (
      <div className="space-y-6">
        <ModuleTabs parent="Vaccination" role={role} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div>
            <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
            <p className="mt-1 text-sm text-rose-700">You do not have access to the NIP vaccine catalog.</p>
          </div>
        </div>
      </div>
    )
  }

  const rows = data?.vaccines ?? []

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">NIP Vaccine Catalog</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Maintain the DOH immunization catalog and schedule rules. Every change is logged.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <Plus size={17} /> Add new vaccine
          </button>
        )}
      </div>

      {/* Read-only banner for non-admin viewers (e.g. PHN) */}
      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Eye size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Read-only view.</strong> You can review the current DOH catalog here. Only administrators can add, edit, or deactivate vaccines.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading catalog…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-primary">
            <Syringe size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-foreground">No vaccines in the catalog yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Click Add new vaccine to seed your first DOH entry.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-semibold">Vaccine</th>
                  <th className="px-5 py-4 font-semibold">Code</th>
                  <th className="px-5 py-4 font-semibold">Schedule</th>
                  <th className="px-5 py-4 font-semibold">Administration</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Last change</th>
                  {isAdmin && <th className="px-5 py-4 font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((v) => {
                  const item = one(v.item)
                  const active = item?.status === 'ACTIVE'
                  return (
                    <tr key={v.vaccine_id} className={active ? 'hover:bg-muted/40' : 'bg-slate-50/60'}>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-foreground">{item?.item_name ?? '—'}</div>
                        {item?.description && <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>}
                      </td>
                      <td className="px-5 py-4"><span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{v.vaccine_type}</span></td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        <div><strong className="text-foreground">{v.total_doses}</strong> dose{v.total_doses === 1 ? '' : 's'}</div>
                        <div>from day <strong className="text-foreground">{v.min_age_days}</strong>{v.interval_days ? ` · +${v.interval_days}d each` : ''}</div>
                        {v.target_age && <div className="mt-0.5 italic">{v.target_age}</div>}
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        {v.dose_volume && <div>{v.dose_volume}</div>}
                        {v.route && <div>{v.route}</div>}
                      </td>
                      <td className="px-5 py-4">
                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            <CheckCircle2 size={11} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            <AlertCircle size={11} /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        {v.latest_change ? (
                          <>
                            <div className="flex items-center gap-1"><History size={11} /> {v.latest_change.action.toLowerCase()}</div>
                            <div>{formatDate(v.latest_change.changed_at)}</div>
                          </>
                        ) : (
                          <>
                            <div>Last updated</div>
                            <div>{formatDate(v.updated_at)}</div>
                          </>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(v)}
                              className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              onClick={() => toggleActive(v, !active)}
                              disabled={togglingId === v.vaccine_id}
                              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                                active ? 'border-rose-600 text-rose-700 hover:bg-rose-50' : 'border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              <Power size={12} /> {active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <VaccineFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => globalMutate('/api/vaccines/catalog')}
        editing={editing}
      />
    </div>
  )
}