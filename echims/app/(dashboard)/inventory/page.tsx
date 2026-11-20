'use client'
// INV-REV01 — Inventory / Supply Management: two tabs, each with three sections and a sticky section
// bar. The old per-section URLs (/inventory/stock-overview, …/batch-trace, …) redirect here with
// ?tab= and #section (next.config.mjs). Sections show only for roles that may view them.
import { useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import type { UserRole } from '@/lib/echims-data'
import { LogoLoader } from '@/components/brand/logo-loader'
import { TabPanel } from '@/components/brand/page-gate'
import { PageHeader } from '@/components/ui/page-header'
import { TabBar } from '@/components/ui/module-tabs'
import { NoAccess } from '@/components/ui/no-access'
import { ScrollToTopButton } from '@/components/ui/scroll-to-top'
import { StockDistributionTab, stockTabVisible } from './components/StockDistributionTab'
import { BatchesReplenishmentTab, batchesTabVisible } from './components/BatchesReplenishmentTab'
import { batchTraceHref, inventoryHref, type InventoryTab } from './components/inventory-utils'

const urlTab = (): InventoryTab =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'batches' ? 'batches' : 'stock'

export default function InventoryPage() {
  const { user, isReady } = useAuth()
  const [chosen, setChosen] = useState<InventoryTab>(urlTab)
  // Bumped by "Trace batch" so the Batches tab remounts on the new batch and jumps to Batch trace.
  const [traceKey, setTraceKey] = useState(0)

  if (!isReady) return <LogoLoader />
  const role = user?.role as UserRole | undefined
  const tabs = role ? [
    stockTabVisible(role) && { value: 'stock' as const, label: 'Stock & distribution' },
    batchesTabVisible(role) && { value: 'batches' as const, label: 'Batches & replenishment' },
  ].filter((t): t is { value: InventoryTab; label: string } => Boolean(t)) : []
  if (!role || !user || tabs.length === 0) return <NoAccess>You do not have access to Inventory.</NoAccess>
  const tab = tabs.some((t) => t.value === chosen) ? chosen : tabs[0].value

  function choose(next: InventoryTab) {
    setChosen(next)
    // The tab's own URL (section hash and batch cleared), so Back and sharing land on it.
    window.history.replaceState(null, '', inventoryHref(next))
  }

  function trace(batch: string) {
    window.history.replaceState(null, '', batchTraceHref(batch))
    setChosen('batches')
    setTraceKey((k) => k + 1)
  }

  return (
    <div className="space-y-5">
      {/* Header block: title and subtitle, then the tabs; one divider below. */}
      <div className="space-y-4">
        <PageHeader title="Inventory" subtitle="Stock levels, distribution to barangays, batches and restock requests" />
        <TabBar className="pb-5" label="Inventory views" group="inventory" value={tab} onChange={choose} items={tabs} />
      </div>

      {/* Keyed by tab only: TabPanel keeps opened tabs mounted; a new trace remounts via key={traceKey}. */}
      <TabPanel tabKey={tab}>
        {tab === 'stock'
          ? <StockDistributionTab role={role} onTrace={trace} />
          : <BatchesReplenishmentTab key={traceKey} role={role} userId={user.id} onTrace={trace} />}
      </TabPanel>

      <ScrollToTopButton />
    </div>
  )
}
