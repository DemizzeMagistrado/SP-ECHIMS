'use client'
// Tab 1 — Stock & distribution: Stock overview · Allocation · Usage log, with the sticky section bar.
import { canPerform, type UserRole } from '@/lib/echims-data'
import { StickySubnav } from '@/components/ui/sticky-subnav'
import { StockOverviewSection } from './StockOverviewSection'
import { AllocationSection } from './AllocationSection'
import { UsageLogSection } from './UsageLogSection'

export function StockDistributionTab({ role, onTrace }: { role: UserRole; onTrace: (batch: string) => void }) {
  const phn = role === 'Public Health Nurse' || role === 'Administrator'
  const sections = [
    canPerform(role, 'Inventory', 'view') && { id: 'stock-overview', label: 'Stock overview' },
    canPerform(role, 'Stock Allocation', 'view') && { id: 'allocation', label: 'Allocation' },
    canPerform(role, 'Inventory Transactions', 'view') && { id: 'usage-log', label: 'Usage log' },
  ].filter((s): s is { id: string; label: string } => Boolean(s))
  const firstId = sections[0]?.id
  const canTrace = canPerform(role, 'Batch Trace', 'view')

  return (
    <div>
      {sections.length > 1 && <StickySubnav label="Stock & distribution sections" items={sections} />}
      <div className="mt-4">
        {sections.map((s) => s.id === 'stock-overview'
          ? <StockOverviewSection key={s.id} first={s.id === firstId} canStockIn={phn} />
          : s.id === 'allocation'
            ? <AllocationSection key={s.id} first={s.id === firstId} canAllocate={phn} canTrace={canTrace} onTrace={onTrace} />
            : <UsageLogSection key={s.id} first={s.id === firstId} canLog={role === 'Rural Health Midwife'} canTrace={canTrace} onTrace={onTrace} />)}
      </div>
    </div>
  )
}

export function stockTabVisible(role: UserRole) {
  return ['Inventory', 'Stock Allocation', 'Inventory Transactions'].some((m) => canPerform(role, m, 'view'))
}
