'use client'
import {InfoContent, InfoTip} from '@/components/ui/info-tip'
import {useSWRConfig} from 'swr'
import {useAuth} from '@/components/auth/auth-provider'
import {ModuleTabs} from '@/components/dashboard/module-tabs'
import {ChildChangeDraftPanel} from '@/components/children/child-change-draft-panel'
import {RhuTransferSection} from '@/components/children/rhu-transfer-section'

export function ChildTransfersPage() {
  const {user, isReady} = useAuth()
  const {mutate} = useSWRConfig()
  if (!isReady) return <p>Loading…</p>
  if (
    !user ||
    user.accountStatus !== 'APPROVED' ||
    !['Public Health Nurse', 'Rural Health Midwife', 'Barangay Health Worker'].includes(user.role)
  ) {
    return <p role="alert">Transfer Inbox is available to assigned PHN, RHM and BHW workers.</p>
  }
  return (
    <div className="space-y-5">
      <ModuleTabs parent="Child Profiling" role={user.role} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Transfer Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Incoming and outgoing requests, including completed transfers.
          </p>
        </div>
        {/* FINAL-POLISH: structured About this view, matching Supplementation and Inventory. */}
        <InfoTip label="About this view" text="About this view" align="end">
          <InfoContent
            title="Transfer Inbox"
            description="Barangay and RHU transfers for children in your assigned scope. Requests and completed transfers live together here."
            sections={[
              {
                label: 'Scope',
                value: 'Transfers you can see and act on are limited to your assigned barangays or RHU.',
              },
              {
                label: 'Values',
                value: [
                  'Pending = awaiting receiving acceptance; the child stays on the source assignment',
                  'Accepted = responsibility transferred; same child record and service history preserved',
                  'Cancelled = request withdrawn or declined; no movement recorded',
                ],
              },
              {
                label: 'Tip',
                value:
                  'Accepted transfers remain here as history, not under Archived (age-out). Age-out is a separate, calendar-driven state inside the Children tab.',
              },
            ]}
            note="Offline actions remain drafts until the server confirms them. Search filters the current page; use Older transfers to review earlier requests."
          />
        </InfoTip>
      </div>
      <ChildChangeDraftPanel
        onUploaded={() => {
          void mutate((key) => JSON.stringify(key)?.includes('child-transfers') ?? false)
        }}
      />
      <RhuTransferSection />
    </div>
  )
}
