'use client'

// Guardian SMS reminders inside Vaccination › Schedule (replaces the separate SMS Reminders tab).
// Rows come from /api/sms/reminders (one per child and date, with the ready-made message);
// sending uses the same POST as before. Only RHM and BHW send; it is a simulation until live
// SMS is integrated, which the confirm text says. History stays in Alerts › SMS Overview.

import { MessageSquare, Send } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'

export type ReminderRow = {
  service_key: string
  child_id: number
  child_name: string
  due_date: string
  phase: string
  upcoming_message: string
  overdue_message: string
  rule_active: boolean
  contact_status: string
  masked_number: string | null
  eligible: boolean
  simulation_status: string | null
}
export type ReminderData = {
  currentUserId: string
  canSend: boolean
  simulationEnabled: boolean
  previewEnabled?: boolean
  rows: ReminderRow[]
}

const CONTACT: Record<string, string> = {
  NO_GUARDIAN: 'No guardian linked',
  NO_VALID_NUMBER: 'No guardian mobile number',
  CONSENT_REQUIRED: 'Guardian has not confirmed SMS consent',
}

/** One reminder per child: the missed-dose one first, else the earliest. */
export function remindersByChild(data: ReminderData | undefined) {
  const map = new Map<number, ReminderRow>()
  for (const r of data?.rows ?? []) {
    const old = map.get(r.child_id)
    if (!old || (r.phase === 'OVERDUE' && old.phase !== 'OVERDUE') || (r.phase === old.phase && r.due_date < old.due_date)) map.set(r.child_id, r)
  }
  return map
}

const messageOf = (r: ReminderRow) => (r.phase === 'OVERDUE' ? r.overdue_message : r.upcoming_message)

/** Why this row cannot be sent now, or null when it can. */
export function reminderBlock(r: ReminderRow | undefined, data: ReminderData | undefined): string | null {
  if (!r || !data) return 'No reminder for this child today'
  if (!r.masked_number || CONTACT[r.contact_status]) return CONTACT[r.contact_status] ?? 'No guardian mobile number'
  if (!data.canSend) return 'Only RHM and BHW can send reminders'
  if (!data.simulationEnabled) return 'SMS sending is turned off'
  if (r.phase !== 'UPCOMING' && r.phase !== 'OVERDUE') return 'Not a reminder day yet'
  const ready = r.eligible || (data.previewEnabled && r.contact_status === 'CONFIRMED' && r.rule_active)
  return ready ? null : 'Not a reminder day yet'
}

async function sendOne(r: ReminderRow, data: ReminderData) {
  const res = await fetch('/api/sms/reminders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      program: 'VACCINATION', serviceKey: r.service_key, messageType: r.phase === 'OVERDUE' ? 'OVERDUE' : 'UPCOMING',
      outcome: 'SIMULATED_SENT', errorCode: null, requestId: crypto.randomUUID(), preview: data.previewEnabled === true,
    }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Reminder not sent (${res.status}).`)
  if (d.currentUserId !== data.currentUserId) throw new Error('Session changed. Refresh the page.')
}

function Preview({ r }: { r: ReminderRow }) {
  return (
    <span className="mt-2 block rounded-lg border border-brand-line bg-brand-ice p-3 text-sm text-brand-navy">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">To {r.masked_number} · message preview</span>
      {messageOf(r)}
    </span>
  )
}

export function SendReminderButton({ row, data, onSent }: { row: ReminderRow | undefined; data: ReminderData | undefined; onSent: () => void }) {
  const confirm = useConfirm()
  const block = reminderBlock(row, data)
  if (!data?.canSend) return null
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={Boolean(block)}
      title={block ?? undefined}
      onClick={async () => {
        if (!row || !data) return
        if (!navigator.onLine) { toast.warning('Connect to the internet to send a reminder.'); return }
        try {
          const ok = await confirm({
            title: `Send a reminder to ${row.child_name}'s guardian?`,
            description: <>SMS sending is simulated for now: it is recorded, but no text leaves the system.<Preview r={row} /></>,
            confirmLabel: 'Send reminder',
            action: () => sendOne(row, data),
          })
          if (ok) { toast.success(`Reminder recorded for ${row.child_name}. (Simulation; no actual SMS was sent.)`); onSent() }
        } catch (e) {
          toast.error(`${e instanceof Error ? e.message : 'Reminder not sent.'} Try again.`)
        }
      }}
    >
      <MessageSquare size={14} aria-hidden="true" /> {block && block !== 'Not a reminder day yet' ? block : 'Send reminder'}
    </Button>
  )
}

export function BulkReminderButton({ rows, data, onSent }: { rows: ReminderRow[]; data: ReminderData | undefined; onSent: () => void }) {
  const confirm = useConfirm()
  if (!data?.canSend) return null
  const ready = rows.filter((r) => !reminderBlock(r, data))
  return (
    <Button
      variant="secondary"
      disabled={ready.length === 0}
      title={ready.length === 0 ? 'No guardian in this list can be reminded today' : undefined}
      onClick={async () => {
        if (!navigator.onLine) { toast.warning('Connect to the internet to send reminders.'); return }
        let sent = 0
        const failed: string[] = []
        const ok = await confirm({
          title: `Send ${ready.length} reminder${ready.length === 1 ? '' : 's'}?`,
          description: <>To the guardians of the children shown that have a confirmed mobile number ({rows.length - ready.length} skipped). SMS sending is simulated for now. First message:<Preview r={ready[0]} /></>,
          confirmLabel: `Send ${ready.length}`,
          action: async () => {
            for (const r of ready) {
              try { await sendOne(r, data); sent++ } catch { failed.push(r.child_name) }
            }
          },
        }).catch(() => false)
        if (!ok) return
        if (sent) toast.success(`${sent} reminder${sent === 1 ? '' : 's'} recorded. (Simulation; no actual SMS was sent.)`)
        if (failed.length) toast.error(`Not sent for ${failed.join(', ')}. Open the child and try again.`)
        onSent()
      }}
    >
      <Send size={15} aria-hidden="true" /> Send reminders{ready.length ? ` (${ready.length})` : ''}
    </Button>
  )
}
