'use client'

import { MessageSquare, Send } from 'lucide-react'
import { useState } from 'react'
import { DateInput } from '@/components/ui/form'
import { FormStepper } from '@/components/ui/form-stepper'
import { ReminderMessage } from '@/components/sms/reminder-message'
import { Modal } from '@/components/ui/modal'
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
  live_contact_verified?: boolean
  live_status?: string | null
  live_message?: string | null
}
export type ReminderData = {
  currentUserId: string
  canSend: boolean
  liveEnabled?: boolean
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
  if (!data.canSend) return 'You do not have permission to send this reminder'
  if (!data.liveEnabled && !data.simulationEnabled) return 'SMS sending is turned off'
  if (r.phase !== 'UPCOMING' && r.phase !== 'OVERDUE') return 'Not a reminder day yet'
  if (data.liveEnabled) {
    if (!r.live_message) return 'Refresh to load the approved message'
    if (!r.live_contact_verified) return 'Verify the current guardian number first'
    if (['READY', 'SENDING', 'SUBMITTED', 'DELIVERED', 'UNCERTAIN'].includes(r.live_status ?? '')) return 'Check the existing SMS attempt first'
    return r.eligible ? null : 'Not a reminder day yet'
  }
  const ready = r.eligible || (data.previewEnabled && r.contact_status === 'CONFIRMED' && r.rule_active)
  return ready ? null : 'Not a reminder day yet'
}

type SendResult = 'SUBMITTED' | 'FAILED' | 'UNCERTAIN' | 'RECORDED'
type Program = 'VACCINATION' | 'SUPPLEMENTATION'

async function sendOne(r: ReminderRow, data: ReminderData, program: Program, batchId?: string): Promise<SendResult> {
  const messageType = r.phase === 'OVERDUE' ? 'OVERDUE' : 'UPCOMING'
  const key = `echims.program-sms:${data.currentUserId}:${program}:${r.service_key}:${messageType}`
  const saved = data.liveEnabled ? sessionStorage.getItem(key) : null
  // Older clients stored just the request ID for an individual send.
  const intent = saved
    ? (saved.startsWith('{') ? JSON.parse(saved) as { requestId: string; batchId?: string } : { requestId: saved })
    : { requestId: crypto.randomUUID(), batchId }
  if (data.liveEnabled) sessionStorage.setItem(key, JSON.stringify(intent))

  const res = await fetch('/api/sms/reminders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      program, serviceKey: r.service_key, messageType, ...intent, requestOwnerId: data.currentUserId,
      ...(data.liveEnabled ? { action: 'SEND', reviewedMessage: r.live_message, preview: false } : { outcome: 'SIMULATED_SENT', errorCode: null, preview: data.previewEnabled === true }),
    }),
  })
  const result = await res.json().catch(() => ({}))
  if (res.status >= 500) return 'UNCERTAIN'
  if (!res.ok) throw new Error(result.error || `Reminder rejected (HTTP ${res.status}).`)
  if (result.currentUserId !== data.currentUserId) return 'UNCERTAIN'
  if (!data.liveEnabled) return 'RECORDED'
  const status = result.result?.status
  if (status !== 'SUBMITTED' && status !== 'FAILED' && status !== 'DELIVERED') return 'UNCERTAIN'
  sessionStorage.removeItem(key)
  return result.result?.replayed || status === 'DELIVERED' ? 'RECORDED' : status
}

function Preview({ r, live }: { r: ReminderRow; live?: boolean }) {
  return (
    <span className="mt-2 block rounded-lg border border-brand-line bg-brand-ice p-3 text-sm text-brand-navy">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">To {r.masked_number} · message preview</span>
      <ReminderMessage body={live ? r.live_message ?? '' : messageOf(r)} live={live} />
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
      variant="tonal"
      disabled={Boolean(block)}
      title={block ?? undefined}
      onClick={async () => {
        if (!row || !data) return
        if (!navigator.onLine) { toast.warning('Connect to the internet to send a reminder.'); return }
        try {
          let result: SendResult = 'UNCERTAIN'
          const ok = await confirm({
            title: `Send a reminder to ${row.child_name}'s guardian?`,
            description: <>{!data.liveEnabled && 'Simulation. No text message will be sent.'}<Preview r={row} live={data.liveEnabled} /></>,
            confirmLabel: 'Send reminder',
            action: async () => { result = await sendOne(row, data, 'VACCINATION').catch((error: unknown) => {
              if (error instanceof TypeError) return 'UNCERTAIN'
              throw error
            }) },
          })
          if (ok) {
            reportResults([result], data.liveEnabled)
            onSent()
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Unable to read the reminder result.')
        }
      }}
    >
      <MessageSquare size={14} aria-hidden="true" /> {block && block !== 'Not a reminder day yet' ? block : 'Send reminder'}
    </Button>
  )
}

function reportResults(results: SendResult[], live?: boolean) {
  const count = (status: SendResult) => results.filter((result) => result === status).length
  if (count('SUBMITTED')) toast.success(`${count('SUBMITTED')} submitted to iProg SMS. Delivery is pending confirmation.`)
  if (count('RECORDED')) toast.info(live ? `${count('RECORDED')} existing attempts found.` : `${count('RECORDED')} simulations recorded. No SMS sent.`)
  if (count('FAILED')) toast.error(`${count('FAILED')} reminders rejected or failed. Refresh the list to check eligibility before retrying.`)
  if (count('UNCERTAIN')) toast.warning(`${count('UNCERTAIN')} outcomes could not be confirmed. Check the saved attempt before resending.`)
}

const steps = ['Custom due dates', 'Select children', 'Review & send']

export function BulkReminderButton({ rows, data, onSent, program = 'VACCINATION' }: {
  rows: ReminderRow[]
  data: ReminderData | undefined
  onSent: () => void
  program?: Program
}) {
  const [open, setOpen] = useState(false)
  if (!data?.canSend) return null
  return <>
    <Button variant="tonal" disabled={!rows.length} onClick={() => setOpen(true)}>
      <Send size={15} aria-hidden="true" /> Send reminders
    </Button>
    {open && <BulkReminderWizard rows={rows} data={data} program={program} onClose={() => setOpen(false)} onSent={onSent} />}
  </>
}

export function BulkReminderWizard({ rows, data, program, onClose, onSent }: {
  rows: ReminderRow[]
  data: ReminderData
  program: Program
  onClose: () => void
  onSent: () => void
}) {
  const [step, setStep] = useState(0)
  const [from, setFrom] = useState('')
  const [through, setThrough] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [skippedOpen, setSkippedOpen] = useState(false)

  const matching = rows.filter((row) => (!from || row.due_date >= from) && (!through || row.due_date <= through))
  const eligible = [...remindersByChild({ ...data, rows: matching.filter((row) => !reminderBlock(row, data)) }).values()]
  const blocked = [...remindersByChild({ ...data, rows: matching }).values()].filter((row) => !eligible.some((item) => item.child_id === row.child_id))
  const recipients = eligible.filter((row) => selected.includes(row.service_key))
  const invalidRange = Boolean(from && through && from > through)

  async function send() {
    if (busy || !recipients.length) return
    if (!navigator.onLine) { toast.warning('Connect to the internet to send reminders.'); return }
    setBusy(true)
    const results: SendResult[] = []
    try {
      const batchId = data.liveEnabled ? crypto.randomUUID() : undefined
      for (const row of recipients) {
        try { results.push(await sendOne(row, data, program, batchId)) }
        catch (error) { results.push(error instanceof TypeError ? 'UNCERTAIN' : 'FAILED') }
        if (results.at(-1) === 'UNCERTAIN') break
      }
      reportResults(results, data.liveEnabled)
      if (results.length < recipients.length) toast.info(`${recipients.length - results.length} were not attempted. Check the uncertain result before resending.`)
      onSent()
      onClose()
    } catch {
      toast.warning('Check SMS Logs for the result before resending.')
    } finally { setBusy(false) }
  }

  return <Modal open title="Send bulk reminders" subtitle={program === 'VACCINATION' ? 'Vaccination' : 'Supplementation'}
    size="xl" busy={busy} onClose={onClose} buttonSize="lg" confirmDiscard={false}
    belowHeader={<FormStepper steps={steps} label="Bulk reminder steps" current={step} visited={step} onSelect={(next) => { if (!busy) setStep(next) }} />}
    footerStart={step > 0 ? <Button size="lg" variant="outline" disabled={busy} onClick={() => setStep(step - 1)}>Back</Button> : undefined}
    footer={step < 2
      ? <Button size="lg" disabled={step === 0 ? invalidRange : !recipients.length} onClick={() => setStep(step + 1)}>{step === 0 ? 'Next: Select children' : 'Next: Review'}</Button>
      : <Button size="lg" disabled={busy || !recipients.length} loading={busy} onClick={() => void send()}>
          {data.liveEnabled ? `Send ${recipients.length} reminder${recipients.length === 1 ? '' : 's'}` : 'Run simulation'}
        </Button>}>
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-brand-navy">{steps[step]}</h3>
      {step === 0 && <>
        <p className="text-sm text-brand-muted">Filter by the saved service due date. Leave both dates blank to show all loaded reminders.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Due from<DateInput value={from} onChange={(event) => { setFrom(event.target.value); setSelected([]) }} /></label>
          <label className="space-y-1 text-sm">Due through<DateInput value={through} onChange={(event) => { setThrough(event.target.value); setSelected([]) }} /></label>
        </div>
        {invalidRange && <p role="alert" className="text-sm text-danger">The end date must be on or after the start date.</p>}
      </>}
      {step === 1 && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{recipients.length} selected · {eligible.length} eligible · {blocked.length} ineligible</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!eligible.length} onClick={() => setSelected(eligible.map((row) => row.service_key))}>Select all eligible</Button>
            <Button variant="secondary" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</Button>
          </div>
        </div>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {eligible.map((row) => <li key={row.service_key}><label className="flex items-center gap-3 p-3 text-sm">
            <input type="checkbox" checked={selected.includes(row.service_key)}
              onChange={(event) => setSelected((old) => event.target.checked ? [...old, row.service_key] : old.filter((key) => key !== row.service_key))} />
            <span>{row.child_name} · {row.due_date} · {row.masked_number}</span>
          </label></li>)}
          {!eligible.length && <li className="p-3 text-sm text-brand-muted">No eligible children for this due-date range.</li>}
        </ul>
      </>}
      {step === 1 && blocked.length > 0 && <>
        <Button variant="secondary" onClick={() => setSkippedOpen(!skippedOpen)} aria-expanded={skippedOpen}>
          {skippedOpen ? 'Hide skipped' : 'Show skipped'} ({blocked.length})
        </Button>
        {skippedOpen && <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {blocked.map((row) => <li key={row.service_key} className="p-3 text-sm text-brand-muted">{row.child_name} · {row.due_date} · {reminderBlock(row, data)}</li>)}
        </ul>}
      </>}
      {step === 2 && <>
        <p className="text-sm">{recipients.length} reminders · one per selected child. {!data.liveEnabled && 'Simulation only.'}</p>
        <ul className="max-h-72 space-y-2 overflow-y-auto px-1">
          {recipients.map((row) => <li key={row.service_key}><span className="text-sm font-medium">{row.child_name}</span><Preview r={row} live={data.liveEnabled} /></li>)}
        </ul>
      </>}
    </div>
  </Modal>
}
