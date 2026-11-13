'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// (moved out of the Vaccination page)
// Sections: Records · Schedule · Defaulters · SMS Reminders · NIP Catalog · Batch Requests.
// Each section keeps its own permission check, data fetching and modals.
// Only the active section is mounted, so only its API calls fire.

import React, { Fragment, useState } from 'react'
import { refreshOfflineViews as globalMutate } from '@/lib/offline/refresh'
import { useVaccinationView } from '@/hooks/use-vaccination-view'
import { vaccinationKeyMatches } from '@/lib/vaccination-cache'
import { VaccinationSnapshotNotice } from '@/components/vaccination/vaccination-offline-tools'
import { Plus, AlertCircle, CheckCircle2, Pencil, Power, Syringe, Settings2, History, BookOpen, Shield, Info, ExternalLink, Search } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { toast } from '@/components/ui/toast'
import { VaccineFormModal, type VaccineCatalogRow } from '@/components/vaccination/vaccine-form-modal'
import { LogoLoader } from '@/components/brand/logo-loader'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { LoadError } from '@/components/ui/load-error'
import { Button } from '@/components/ui/button'
import { BatchFormatPanel, CompanionMedicinesPanel } from '@/components/vaccination/vaccine-settings-panels'
import { Input, Select } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { AccordionCard, useSingleOpen } from '@/components/ui/accordion-card'

/* ═════════════════════════ Shared helpers ═════════════════════════ */

function revalidateVaccination(url: string) {
 return globalMutate(key => vaccinationKeyMatches(key,url))
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}


// Full timestamps
function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}



/* ═════════════════════════ NIP Catalog (NIP-USR006 / USR011) ═════════════════════════ */

type LatestChange = {
  audit_id: number
  vaccine_id: number
  action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE'
  changed_at: string
  changed_by: string
} | null

type CatalogPayload = {
  vaccines: (VaccineCatalogRow & { latest_change: LatestChange })[]
  can_edit: boolean
  role: UserRole
}

/** Vaccination › Vaccines. Everyone who can open Vaccination sees the list; Admin adds/edits/
 *  deactivates vaccines; Admin and PHN also get Catalog settings (companion medicines, batch
 *  number format). The APIs enforce the same rules (vaccine edits: Admin; settings: Admin/PHN). */
export function CatalogSection() {
  const confirm = useConfirm()
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  // Admin edits; PHN reads. Everyone else is 403.
  const administrator = role === 'Administrator'
  const canView = role ? canPerform(role, 'NIP Catalog', 'view') : false

  const { data, error, isLoading, readOnly, savedAt, mutate } = useVaccinationView<CatalogPayload>(isReady && canView ? '/api/vaccines/catalog' : null)
  const isAdmin = administrator && !readOnly
  const canManage = (role === 'Administrator' || role === 'Public Health Nurse') && !readOnly
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VaccineCatalogRow | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  // NIP-USR011 — the inline Guidelines panel; one vaccine open at a time.
  const { isOpen, toggle: toggleExpanded } = useSingleOpen<number>()
  const [search, setSearch] = useState('')
  // Active vaccines by default (Rotavirus is kept as inactive for old records).
  const [activeFilter, setActiveFilter] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('ACTIVE')

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(v: VaccineCatalogRow) { setEditing(v); setModalOpen(true) }

  async function toggleActive(v: VaccineCatalogRow, nextActive: boolean) {
    if (readOnly || !navigator.onLine || togglingId) return
    const ok = await confirm(nextActive
      ? { title: `Reactivate ${v.vaccine_type}?`, description: 'It will reappear in schedule computation and the Record modal.', confirmLabel: 'Reactivate' }
      : { title: `Deactivate ${v.vaccine_type}?`, description: 'It will stop appearing in the Record modal and will be excluded from new schedule computation.', confirmLabel: 'Deactivate', tone: 'danger' })
    if (!ok) return
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
      toast.success(`${v.vaccine_type} ${nextActive ? 'reactivated' : 'deactivated'}.`)
      revalidateVaccination('/api/vaccines/catalog')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toggle failed.')
    } finally {
      setTogglingId(null)
    }
  }

  if (!isReady) return <LogoLoader />
  if (!canView) {
    return (
      <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
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

  const allRows = data?.vaccines ?? []
  const q = search.trim().toLowerCase()
  const rows = allRows.filter((v) => {
    const item = one(v.item)
    const isActive = item?.status === 'ACTIVE'
    return (!q || [item?.item_name, v.vaccine_type, item?.description].some((x) => x?.toLowerCase().includes(q)))
      && (activeFilter === 'all' || (activeFilter === 'ACTIVE') === isActive)
  })

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccination: Vaccines"
        subtitle="The DOH immunization catalog and schedule rules. Open a vaccine for eligibility and guidelines; every change is logged."
        actions={(isAdmin || canManage) && <>
          {canManage && (
            <Button variant="tonal" aria-expanded={settingsOpen} aria-controls="catalog-settings" onClick={() => setSettingsOpen((o) => !o)}>
              <Settings2 size={16} aria-hidden="true" /> Catalog settings
            </Button>
          )}
          {isAdmin && <Button onClick={openCreate}><Plus size={17} aria-hidden="true" /> Add vaccine</Button>}
        </>}
      />

      {canManage && settingsOpen && (
        <section id="catalog-settings" aria-label="Catalog settings" className="space-y-6 rounded-2xl border border-brand-blue/20 bg-brand-ice/40 p-4 sm:p-5">
          <CompanionMedicinesPanel />
          <BatchFormatPanel canManage />
        </section>
      )}

      {/* PHN only: says why there is no Add/Edit. View-only roles see no management UI at all. */}
      {canManage && !isAdmin && (
        <div className="flex items-start gap-2 rounded-xl border border-brand-blue/20 bg-brand-ice px-4 py-3 text-sm text-brand-navy">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>Only administrators add, edit or deactivate vaccines. You can manage companion medicines and the batch number format in <strong>Catalog settings</strong>.</span>
        </div>
      )}

      {isLoading ? (
        <LogoLoader size="section" label="Loading catalog…" />
      ) : error && !data ? (
        <LoadError what="the vaccine catalog" error={error} onRetry={() => void mutate()} />
      ) : allRows.length === 0 ? (
        <EmptyState size="page" icon={Syringe} title="No vaccines in the catalog yet" description={isAdmin ? 'Use “Add new vaccine” to add your first DOH entry.' : 'An administrator has not added vaccines yet.'} className="min-h-64 rounded-2xl border border-dashed border-border bg-white" />
      ) : (<>
        <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
              <Input aria-label="Search vaccines" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code…" className="pl-9" />
            </div>
            <Select aria-label="Status" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as 'all' | 'ACTIVE' | 'INACTIVE')}>
              <option value="all">All vaccines</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{rows.length} of {allRows.length} vaccines</span>
          </div>
        </div>

        <div key={`${q}|${activeFilter}`} className="animate-in fade-in duration-150 motion-reduce:animate-none">
          {rows.length === 0 ? (
            <EmptyState icon={Syringe} title="No vaccines match these filters" description="Try another name, code or status." className="rounded-2xl border border-dashed border-border" />
          ) : (
            <ul className="space-y-2.5">
              {rows.map((v) => {
                const item = one(v.item)
                const active = item?.status === 'ACTIVE'
                const open = isOpen(v.vaccine_id)
                return (
                  <AccordionCard
                    key={v.vaccine_id}
                    id={`catalog-${v.vaccine_id}`}
                    open={open}
                    onToggle={() => toggleExpanded(v.vaccine_id)}
                    className={active ? undefined : 'opacity-80'}
                    header={<>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-brand-navy">{item?.item_name ?? v.vaccine_type}</span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">{v.vaccine_type}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {v.total_doses} dose{v.total_doses === 1 ? '' : 's'}{v.max_age_days ? ` · up to day ${v.max_age_days}` : ''} · from day {v.min_age_days}{v.interval_days ? `, +${v.interval_days} days each` : ''}{v.target_age ? ` · ${v.target_age}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="text-xs text-muted-foreground">{[v.dose_volume, v.route].filter(Boolean).join(' · ') || '—'}</span>
                        <StatusBadge status={active ? 'active' : 'inactive'} label={active ? 'Active' : 'Inactive'} />
                      </span>
                    </>}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <History size={12} aria-hidden="true" />
                          {v.latest_change ? `Last change: ${v.latest_change.action.toLowerCase()} · ${formatTimestamp(v.latest_change.changed_at)}` : `Last updated ${formatTimestamp(v.updated_at)}`}
                        </span>
                        {isAdmin && (
                          <span className="flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => openEdit(v)}><Pencil size={12} aria-hidden="true" /> Edit</Button>
                            <Button variant="secondary" size="sm" className={active ? 'text-danger' : 'text-good'} loading={togglingId === v.vaccine_id} onClick={() => toggleActive(v, !active)}>
                              <Power size={12} aria-hidden="true" /> {active ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </span>
                        )}
                      </div>
                      <GuidelinesPanel vaccine={v} isAdmin={isAdmin} onEdit={() => openEdit(v)} />
                    </div>
                  </AccordionCard>
                )
              })}
            </ul>
          )}
        </div>
      </>)}

      <VaccineFormModal
        open={modalOpen && !readOnly}
        onClose={() => setModalOpen(false)}
        onSaved={() => revalidateVaccination('/api/vaccines/catalog')}
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
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil size={13} aria-hidden="true" /> Edit guidelines
          </Button>
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
