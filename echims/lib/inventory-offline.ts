// INV-USR004 — Minimal offline queue for usage/waste logs.
//
// Design goals:
//   - Save intent locally (localStorage) when fetch fails due to network loss
//   - Replay from the queue on next page load; replays are safe because every
//     entry carries a request_id (UUID) that the SQL RPC uses for idempotency
//   - Zero IndexedDB complexity — localStorage is enough for a few queued
//     entries at a barangay station with intermittent connectivity
//   - Public surface: newClientRequestId(), sendOrQueueUsage(), replayQueuedUsage()
//
// If offline support needs to grow (background sync, large queues, retries
// with backoff), promote to a Service Worker + IndexedDB like
// lib/vaccination-offline.ts does for NIP-USR003.

export type UsagePayload = {
  source_batch_id: number
  quantity: number
  subtype: 'USAGE' | 'WASTE'
  reason?: string
  request_id: string            // UUID — idempotency key for inv_log_usage
  // Display-only, used when showing queued items to the user before replay
  _display?: { item_name: string; batch_number: string; barangay_name: string; queued_at: string }
}

const QUEUE_KEY = 'echims_inventory_usage_queue_v1'

export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function readQueue(): UsagePayload[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(items: UsagePayload[]) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items)) } catch { /* storage full / disabled */ }
}

export function getQueuedUsageCount(): number {
  return readQueue().length
}

/**
 * Send to /api/inventory/usage; on network failure, queue locally.
 * Returns `{ sent: true, result }` on success, `{ sent: false, queued: true }` on queue.
 * Throws for any server-side validation error (4xx/5xx with a body).
 */
export async function sendOrQueueUsage(payload: UsagePayload): Promise<
  | { sent: true; result: unknown }
  | { sent: false; queued: true }
> {
  try {
    const r = await fetch('/api/inventory/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
    return { sent: true, result: d }
  } catch (err) {
    // Only queue if it's a NETWORK error (fetch threw). Server-side errors
    // (4xx/5xx) must surface so the user can fix invalid input.
    const isNetwork = err instanceof TypeError
    if (!isNetwork) throw err
    const items = readQueue()
    items.push({ ...payload, _display: { ...(payload._display ?? { item_name: '', batch_number: '', barangay_name: '', queued_at: new Date().toISOString() }) } })
    writeQueue(items)
    return { sent: false, queued: true }
  }
}

/**
 * Attempt to replay every queued usage entry. Successful entries are removed.
 * Network failures leave the queue intact. Server-side errors (validation)
 * also remove the entry — we can't fix bad input by retrying.
 * Returns a summary: how many were sent, how many failed and were kept.
 */
export async function replayQueuedUsage(): Promise<{ sent: number; kept: number }> {
  const items = readQueue()
  if (items.length === 0) return { sent: 0, kept: 0 }
  const remaining: UsagePayload[] = []
  let sent = 0
  for (const item of items) {
    try {
      const r = await fetch('/api/inventory/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (r.ok || r.status === 409) {
        // 409 = already saved (idempotency). Still remove.
        sent += 1
        continue
      }
      if (r.status >= 400 && r.status < 500) {
        // Permanent client error — drop so queue doesn't accumulate junk.
        continue
      }
      remaining.push(item)
    } catch {
      // Network still down — keep for next attempt.
      remaining.push(item)
    }
  }
  writeQueue(remaining)
  return { sent, kept: remaining.length }
}
