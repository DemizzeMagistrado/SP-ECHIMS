'use client'

// "BHW to assist" flag on a child's vaccination schedule (e.g. guardian has no mobile phone), so
// BHWs see which children to help bring to the RHU. Badge for lists; toggle for staff.

import { useState } from 'react'
import { HandHelping } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Button } from '@/components/ui/button'
import { Combobox, Field } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/components/ui/toast'

export type BhwAssist = { reason: string | null } | null

export function BhwAssistBadge({ assist }: { assist: BhwAssist }) {
  if (!assist) return null
  return <StatusBadge status="bhw-assist" tone="info" icon={<HandHelping size={12} aria-hidden="true" />} label={assist.reason ? `BHW to assist · ${assist.reason}` : 'BHW to assist'} />
}

const REASONS = ['No mobile phone', 'Far from the RHU', 'Guardian needs a reminder visit']

export function BhwAssistToggle({ childId, childName, assist, onChanged, disabled, variant = 'tonal' }: {
  childId: number; childName: string; assist: BhwAssist; onChanged: () => void; disabled?: boolean; variant?: 'tonal' | 'ghost'
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(on: boolean) {
    if (!navigator.onLine) { toast.warning('Connect to the internet to change the BHW-assist flag.'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/vaccination/bhw-assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_id: childId, assist: on, reason: on ? reason.trim() || null : null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to save the flag.')
      toast.success(on ? `${childName} is flagged for BHW assistance.` : `BHW-assist flag removed for ${childName}.`)
      setOpen(false)
      onChanged()
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : 'Unable to save the flag.'} Try again.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {assist ? (
        <Button size="sm" variant={variant} disabled={disabled} loading={saving} onClick={() => void save(false)}>
          <HandHelping size={14} aria-hidden="true" /> Remove BHW assist
        </Button>
      ) : (
        <Button size="sm" variant={variant} disabled={disabled} onClick={() => { setReason(''); setOpen(true) }}>
          <HandHelping size={14} aria-hidden="true" /> BHW to assist
        </Button>
      )}
      <Modal
        open={open}
        size="sm"
        onClose={() => setOpen(false)}
        busy={saving}
        icon={<HandHelping />}
        title="Flag for BHW assistance"
        subtitle={`BHWs will see that ${childName} needs help getting to the RHU.`}
        onSubmit={(e) => { e.preventDefault(); void save(true) }}
        footer={<Button type="submit" loading={saving}>Flag child</Button>}
      >
        <Field label="Reason (optional)" hint="Shown next to the flag in the Schedule and Defaulters lists.">
          <Combobox value={reason} maxLength={120} onChange={setReason} options={REASONS} placeholder="Pick a reason or type your own" />
        </Field>
      </Modal>
    </>
  )
}
