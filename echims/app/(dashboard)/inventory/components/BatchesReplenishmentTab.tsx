'use client'
// Tab 2 — Batches & replenishment: Replenishment · Batch trace · Batch requests, with the sticky section bar.
import { canPerform, type UserRole } from '@/lib/echims-data'
import { StickySubnav } from '@/components/ui/sticky-subnav'
import { ReplenishmentSection } from './ReplenishmentSection'
import { BatchTraceSection } from './BatchTraceSection'
import { BatchRequestsSection } from './BatchRequestsSection'

export function BatchesReplenishmentTab({ role, userId, onTrace }: { role: UserRole; userId: string; onTrace: (batch: string) => void }) {
  const canTrace = canPerform(role, 'Batch Trace', 'view')
  const sections = [
    canPerform(role, 'Inventory', 'view') && { id: 'replenishment', label: 'Replenishment' },
    canTrace && { id: 'batch-trace', label: 'Batch trace' },
    canPerform(role, 'Vaccine Batch Requests', 'view') && { id: 'batch-requests', label: 'Batch requests' },
  ].filter((s): s is { id: string; label: string } => Boolean(s))
  const firstId = sections[0]?.id

  return (
    <div>
      {sections.length > 1 && <StickySubnav label="Batches & replenishment sections" items={sections} />}
      <div className="mt-4">
        {sections.map((s) => s.id === 'replenishment'
          ? <ReplenishmentSection key={s.id} first={s.id === firstId} userId={userId} canRequest={canPerform(role, 'Inventory', 'request')} canReview={canPerform(role, 'Inventory', 'approve')} />
          : s.id === 'batch-trace'
            ? <BatchTraceSection key={s.id} first={s.id === firstId} />
            : <BatchRequestsSection key={s.id} first={s.id === firstId} userId={userId} canTrace={canTrace} onTrace={onTrace} />)}
      </div>
    </div>
  )
}

export function batchesTabVisible(role: UserRole) {
  return ['Inventory', 'Batch Trace', 'Vaccine Batch Requests'].some((m) => canPerform(role, m, 'view'))
}
