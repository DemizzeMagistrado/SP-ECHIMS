'use client'

// NIP-USR003 — Offline queue for vaccination records (modeled after nutrition-offline.ts).
// Uses IndexedDB to persist drafts between sessions. On POST failure (offline, network
// error, 5xx) the draft is queued locally keyed by its own client_request_id. When the
// user reconnects, the queue drains and the server treats same client_request_id as
// idempotent (returns existing row rather than creating a duplicate).

export type VaccinationPayload = {
  child_id: number
  vaccine_id: number
  dose_number: number
  vaccination_date: string            // yyyy-mm-dd
  batch_number: string | null
  vaccination_site: string | null
  remarks: string | null
  schedule_id: number | null
  client_request_id: string           // uuid, acts as idempotency key
}

export type QueuedVaccination = {
  key: string                         // IndexedDB primary key (ownerId::requestId)
  ownerId: string                     // auth user id of the recorder
  requestId: string                   // same as payload.client_request_id
  childName: string                   // for display in Review queue
  vaccineLabel: string                // for display
  queuedAt: string                    // ISO
  status: 'PENDING' | 'BLOCKED'
  lastError: string | null
  payload: VaccinationPayload
}

const DB_NAME = 'echims-vaccination-offline-v1'
const QUEUE_STORE = 'queue'

let database: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (database) return database
  database = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'key' })
        store.createIndex('ownerId', 'ownerId', { unique: false })
        store.createIndex('status', 'status', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
  return database
}

function keyOf(ownerId: string, requestId: string) {
  return `${ownerId}::${requestId}`
}

export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback for older browsers
  return `v4-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

// --- Queue operations ---

export async function queueVaccinationDraft(
  ownerId: string,
  payload: VaccinationPayload,
  display: { childName: string; vaccineLabel: string },
  lastError: string | null = null,
): Promise<QueuedVaccination> {
  const db = await openDb()
  const row: QueuedVaccination = {
    key: keyOf(ownerId, payload.client_request_id),
    ownerId,
    requestId: payload.client_request_id,
    childName: display.childName,
    vaccineLabel: display.vaccineLabel,
    queuedAt: new Date().toISOString(),
    status: lastError ? 'BLOCKED' : 'PENDING',
    lastError,
    payload,
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Queue write failed'))
  })
  return row
}

export async function listQueuedVaccinations(ownerId: string): Promise<QueuedVaccination[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const idx = tx.objectStore(QUEUE_STORE).index('ownerId')
    const req = idx.getAll(ownerId)
    req.onsuccess = () => resolve((req.result as QueuedVaccination[]).sort((a, b) => b.queuedAt.localeCompare(a.queuedAt)))
    req.onerror = () => reject(req.error ?? new Error('Queue read failed'))
  })
}

export async function removeQueuedVaccination(ownerId: string, requestId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).delete(keyOf(ownerId, requestId))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Queue delete failed'))
  })
}

// --- POST helper: tries server, queues on failure ---

export type SendResult =
  | { ok: true; vaccination_record_id: number; status: string; idempotent?: boolean }
  | { ok: false; queued: boolean; error: string }

export async function sendOrQueueVaccination(
  ownerId: string,
  payload: VaccinationPayload,
  display: { childName: string; vaccineLabel: string },
): Promise<SendResult> {
  try {
    const r = await fetch('/api/vaccination/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      // 4xx = client/validation error — don't queue, surface to user to fix
      if (r.status >= 400 && r.status < 500) {
        return { ok: false, queued: false, error: d.error || `Request failed (${r.status})` }
      }
      // 5xx or unknown — queue for retry
      await queueVaccinationDraft(ownerId, payload, display, d.error || `Server error ${r.status}`)
      return { ok: false, queued: true, error: d.error || `Server error — draft queued for retry.` }
    }
    // Success — remove from queue if it was there
    await removeQueuedVaccination(ownerId, payload.client_request_id).catch(() => undefined)
    return {
      ok: true,
      vaccination_record_id: Number(d.vaccination_record_id),
      status: String(d.status ?? 'PENDING'),
      idempotent: Boolean(d.idempotent),
    }
  } catch (err) {
    // Network error / offline — queue it
    const msg = err instanceof Error ? err.message : 'Network error'
    await queueVaccinationDraft(ownerId, payload, display, msg)
    return { ok: false, queued: true, error: 'Offline — draft saved locally and will sync when you reconnect.' }
  }
}

export async function drainQueue(ownerId: string): Promise<{ sent: number; failed: number }> {
  const rows = await listQueuedVaccinations(ownerId)
  let sent = 0
  let failed = 0
  for (const row of rows) {
    const res = await sendOrQueueVaccination(ownerId, row.payload, {
      childName: row.childName,
      vaccineLabel: row.vaccineLabel,
    })
    if (res.ok) sent += 1
    else failed += 1
  }
  return { sent, failed }
}