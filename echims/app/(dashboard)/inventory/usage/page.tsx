'use client'

// INV-USR004 — Usage Log page.
// RHM-primary. Entry point for logging usage/waste. Also auto-replays any
// queued-offline entries on mount so a reconnected device syncs transparently.
//
// A full "transactions history" table lives in the planned Transactions tab;
// this page keeps focus on the logging action itself.

import { useEffect, useState } from 'react'
import { mutate as globalMutate } from 'swr'
import { Plus, AlertCircle, CloudOff, PackageMinus, Trash2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { LogUsageModal } from '@/components/inventory/log-usage-modal'
import { getQueuedUsageCount, replayQueuedUsage } from '@/lib/inventory-offline'

export default function UsageLogPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Inventory', 'view') : false
  const isRhm = role === 'Rural Health Midwife'

  const [modalOpen, setModalOpen] = useState(false)
  const [queued, setQueued] = useState(0)
  const [replayed, setReplayed] = useState(0)

  // On mount: replay queued entries, then refresh counters. Idempotency on the
  // RPC side means re-sending a successful entry is a safe 409 we drop.
  useEffect(() => {
    if (!canView) return
    void replayQueuedUsage().then(({ sent }) => {
      if (sent > 0) {
        setReplayed(sent)
        globalMutate('/api/inventory/stock-overview')
      }
      setQueued(getQueuedUsageCount())
    })
  }, [canView])

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
  if (!canView) {
    return (
      <div className="space-y-6">
        <ModuleTabs parent="Inventory" role={role} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div><h2 className="text-lg font-bold text-rose-900">Not authorized</h2></div>
        </div>
      </div>
    )
  }

  function refresh() {
    globalMutate('/api/inventory/stock-overview')
    setQueued(getQueuedUsageCount())
  }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Inventory" role={role} />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Usage &amp; Waste Log</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            RHM-only. Record stock used or wasted at your barangay. Entries deduct the batch and the aggregate on-hand immediately.
          </p>
        </div>
        {isRhm && (
          <button type="button" onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700">
            <Plus size={17} /> Log usage/waste
          </button>
        )}
      </div>

      {replayed > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>Synced <strong>{replayed}</strong> offline-queued entries just now.</span>
        </div>
      )}

      {queued > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <CloudOff size={16} className="mt-0.5 shrink-0" />
          <span><strong>{queued}</strong> entries still queued offline — they&rsquo;ll auto-sync on your next page load when you&rsquo;re back online.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TypeCard icon={<PackageMinus size={18} />} tone="amber" title="Usage"
          desc="Doses or units consumed as part of normal operations (vaccinations, supplementation sessions, walk-ins)." />
        <TypeCard icon={<Trash2 size={18} />} tone="rose" title="Waste"
          desc="Stock that was lost (expired, broken vial, cold-chain break). A reason is required and included in the audit log." />
      </div>

      <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 p-6 text-sm text-sky-900/90">
        <p><strong>How it works:</strong></p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Pick the batch at your barangay (only batches with stock show).</li>
          <li>Pick <em>Usage</em> or <em>Waste</em> and enter the quantity (never exceeds available).</li>
          <li>For Waste, write a short reason (expired, damaged, etc.).</li>
          <li>Submit — the backend deducts the batch and aggregate atomically and re-evaluates low-stock + near-expiry alerts.</li>
          <li>No internet? The entry queues locally and syncs on your next visit.</li>
        </ol>
      </div>

      <LogUsageModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={refresh} />
    </div>
  )
}

function TypeCard({ icon, tone, title, desc }: { icon: React.ReactNode; tone: 'amber' | 'rose'; title: string; desc: string }) {
  const bg = tone === 'amber' ? 'border-amber-200 bg-amber-50/50' : 'border-rose-200 bg-rose-50/50'
  const chip = tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
  return (
    <div className={`rounded-2xl border p-5 ${bg}`}>
      <div className="flex items-start gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${chip}`}>{icon}</div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
    </div>
  )
}
