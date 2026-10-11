'use client'

// NIP-USR006 — NIP Vaccine Catalog page at /vaccination/catalog.
// NIP-USR011 — Guidelines & Eligibility are now part of this page (expandable
// row per vaccine), not a separate tab, keeping the tab strip at 6.
// Visible to Admin / PHN / RHM / BHW (view perm). Edit controls are admin-only.

import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, Pencil, Power, Syringe, Eye, History, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, BookOpen, Shield, Info, ExternalLink,
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
  // NIP-USR011 — tracks which rows have the inline Guidelines panel expanded.
  // Using a Set so multiple rows can stay open simultaneously if the user wants
  // to compare two vaccines side-by-side.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

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

      {/* Read-only banner for non-admin viewers (e.g. PHN, RHM, BHW) */}
      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Eye size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Read-only view.</strong> Click any row to see DOH eligibility, contraindications, and guidelines before administering a dose. Only administrators can add, edit, or deactivate vaccines.
          </span>
        </div>
      )}
      {/* NIP-USR011 — expand hint (admin view too, so they discover guidelines live here) */}
      {isAdmin && rows.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-2.5 text-xs text-sky-900">
          <BookOpen size={14} className="mt-0.5 shrink-0" />
          <span>
            Click any row to view DOH Guidelines & Eligibility inline. Edit via the vaccine form.
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
            {/* NIP-USR011 — table-layout: fixed + explicit column widths on <thead>
                so that expanding a Guidelines row doesn't force the browser to
                recalculate column widths and shift sibling collapsed rows.
                Column widths sum to 100% of the min-w-[1100px] canvas. */}
            <table className="w-full min-w-[1100px] text-left text-sm" style={{ tableLayout: 'fixed' }}>
              {/* Column widths (left to right): caret · Vaccine · Code · Schedule
                  · Administration · Status · Last change · Actions (admin only).
                  Comments live out here — JSX comments INSIDE <colgroup> become
                  whitespace text nodes that break React hydration. */}
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '14%' }} />
                {isAdmin && <col style={{ width: '17%' }} />}
              </colgroup>
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {/* Caret column — click anywhere on the row to expand Guidelines. */}
                  <th className="px-3 py-4 font-semibold"></th>
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
                  const isOpen = expanded.has(v.vaccine_id)
                  const colSpan = isAdmin ? 8 : 7
                  return (
                    <React.Fragment key={v.vaccine_id}>
                      <tr
                        className={`${active ? 'hover:bg-muted/40' : 'bg-slate-50/60'} cursor-pointer`}
                        onClick={() => toggleExpanded(v.vaccine_id)}
                        aria-expanded={isOpen}
                      >
                        <td className="px-3 py-4 align-top">
                          <span className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top">
                          {/* break-words lets long vaccine names wrap instead of
                              widening the column. */}
                          <div className="font-semibold text-foreground break-words">{item?.item_name ?? '—'}</div>
                          {item?.description && <div className="mt-0.5 text-xs text-muted-foreground break-words">{item.description}</div>}
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
                            {/* Admin actions — stopPropagation so clicking a button doesn't
                                also toggle the row expansion. */}
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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

                      {/* NIP-USR011 — Inline Guidelines row. Rendered only when expanded
                          so the catalog stays scannable at a glance. */}
                      {isOpen && (
                        <tr className="bg-sky-50/40">
                          <td className="px-3 py-0 align-top"></td>
                          <td colSpan={colSpan - 1} className="px-5 py-4">
                            <GuidelinesPanel vaccine={v} isAdmin={isAdmin} onEdit={() => openEdit(v)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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

// NIP-USR011 — Inline Guidelines panel. Shows DOH text with consistent tone
// per field (emerald = eligibility, rose = contraindications, sky = DOH guide).
// Mirrors the Supplementation Guidelines tab's styling so the app reads as one
// system. Admin sees an "Edit guidelines" shortcut that opens the vaccine form
// so they don't have to scroll back to the Actions column.
function GuidelinesPanel({
  vaccine, isAdmin, onEdit,
}: {
  vaccine: VaccineCatalogRow & { latest_change: LatestChange }
  isAdmin: boolean
  onEdit: () => void
}) {
  const hasAnyText = Boolean(
    (vaccine.eligibility && vaccine.eligibility.trim()) ||
    (vaccine.contraindications && vaccine.contraindications.trim()) ||
    (vaccine.doh_guidelines && vaccine.doh_guidelines.trim()),
  )
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-sky-900">
          <BookOpen size={13} /> DOH Guidelines & Eligibility
        </h4>
        {isAdmin && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
          >
            <Pencil size={10} /> Edit guidelines
          </button>
        )}
      </div>

      {!hasAnyText && !vaccine.source_reference && (
        <div className="rounded-lg border border-dashed border-sky-200 bg-white px-3 py-2 text-xs italic text-muted-foreground">
          No DOH guidelines configured for this vaccine yet.
          {isAdmin && <> Click <strong>Edit guidelines</strong> to add them.</>}
        </div>
      )}

      {hasAnyText && (
        <div className="grid gap-2 md:grid-cols-3">
          <GuidelineBox
            icon={<CheckCircle2 size={12} className="text-emerald-700" />}
            tone="emerald"
            label="Eligibility"
            value={vaccine.eligibility}
          />
          <GuidelineBox
            icon={<Shield size={12} className="text-rose-700" />}
            tone="rose"
            label="Contraindications"
            value={vaccine.contraindications}
          />
          <GuidelineBox
            icon={<Info size={12} className="text-sky-700" />}
            tone="sky"
            label="DOH guidelines"
            value={vaccine.doh_guidelines}
          />
        </div>
      )}

      {vaccine.source_reference && (
        <a
          href={vaccine.source_reference}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          DOH source document <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

function GuidelineBox({
  icon, tone, label, value,
}: {
  icon: React.ReactNode
  tone: 'emerald' | 'rose' | 'sky'
  label: string
  value: string | null
}) {
  const bg = {
    emerald: 'bg-emerald-50 border-emerald-100',
    rose: 'bg-rose-50 border-rose-100',
    sky: 'bg-sky-50 border-sky-100',
  }[tone]
  return (
    <div className={`rounded-lg border px-3 py-2 ${bg}`}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground">
        {value?.trim() || <span className="italic text-muted-foreground">Not configured yet.</span>}
      </p>
    </div>
  )
}