'use client'

// Inventory › Batch Requests (moved from Vaccination; same permissions: 'Vaccine Batch Requests').
// /vaccination/batch-requests redirects here.

import { useAuth } from '@/components/auth/auth-provider'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { LogoLoader } from '@/components/brand/logo-loader'
import type { UserRole } from '@/lib/echims-data'
import { BatchRequestsSection } from '@/components/inventory/vaccine-batch-requests'

export default function InventoryBatchRequestsPage() {
  const { user, isReady } = useAuth()
  if (!isReady) return <LogoLoader />
  const role = user?.role as UserRole | undefined
  return (
    <div className="space-y-6">
      <ModuleTabs parent="Inventory" role={role} />
      <BatchRequestsSection key={user?.id} />
    </div>
  )
}
