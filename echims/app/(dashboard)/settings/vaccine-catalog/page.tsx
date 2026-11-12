'use client'

// Settings › Vaccine Catalog (Admin / PHN): the NIP catalog (moved from Vaccination), companion
// medicines per vaccine and the batch number format. Vaccination › NIP Catalog is the view-only copy.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { LogoLoader } from '@/components/brand/logo-loader'
import { buttonVariants } from '@/components/ui/button'
import { StatusPage } from '@/components/ui/status-page'
import { CatalogSection } from '@/components/vaccination/vaccine-catalog'
import { BatchFormatPanel, CompanionMedicinesPanel } from '@/components/vaccination/vaccine-settings-panels'

export default function VaccineCatalogSettingsPage() {
  const { user, isReady } = useAuth()
  if (!isReady) return <LogoLoader />
  const allowed = user?.role === 'Administrator' || user?.role === 'Public Health Nurse'
  if (!allowed) {
    return <StatusPage area="content" title="Not available for your role" message="The Vaccine Catalog is managed by Administrators and Public Health Nurses." actions={<Link href="/settings" className={buttonVariants({ variant: 'secondary' })}>Back to Settings</Link>} />
  }
  return (
    <div className="space-y-6">
      <Link href="/settings" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ArrowLeft size={14} aria-hidden="true" /> Settings</Link>
      <CatalogSection />
      <CompanionMedicinesPanel />
      <BatchFormatPanel canManage />
    </div>
  )
}
