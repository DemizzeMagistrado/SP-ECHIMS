export type InventoryTab = 'stock' | 'batches'

export const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Load failed.')
  return d
}

export function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export function formatYmd(ymd: string | null | undefined) {
  if (!ymd) return '—'
  return new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function daysUntil(ymd: string) {
  return Math.floor((new Date(`${ymd}T00:00:00`).getTime() - Date.now()) / 86_400_000)
}

/** The create RPC appends '[req:UUID]' to replenishment remarks for idempotency; it is not user text. */
export const stripReqMarker = (s: string | null) => (s ?? '').replace(/\s*\[req:[0-9a-f-]{36}\]\s*/i, '').trim()

/** Inventory › Batches & replenishment › Batch trace, opened on one batch (links from other modules too). */
export function batchTraceHref(batchNumber: string) {
  return `/inventory?tab=batches&batch_number=${encodeURIComponent(batchNumber)}#batch-trace`
}

/** URL for a tab (and optional section), as the old per-section pages now redirect. */
export function inventoryHref(tab: InventoryTab, section?: string) {
  return `/inventory?tab=${tab}${section ? `#${section}` : ''}`
}
