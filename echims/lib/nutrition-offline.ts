'use client'

import { createBrowserClient } from '@supabase/ssr'

export type NutritionPayload = {
  child_id: number
  assessment_date: string
  weight: number
  height: number
  muac: number | null
  measurement_type: 'LENGTH' | 'HEIGHT'
  edema_grade: number
  remarks: string
  client_request_id: string
}

export type QueuedAssessment = {
  key: string
  ownerId: string
  requestId: string
  childName: string
  queuedAt: string
  status: 'PENDING' | 'BLOCKED'
  lastError: string | null
  payload: NutritionPayload
}

const DB_NAME = 'echims-nutrition-offline-v1'

let database: Promise<IDBDatabase> | null = null

let browserClient:
  | ReturnType<typeof createBrowserClient>
  | null = null

export function getNutritionBrowserClient() {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL

    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

    if (!url || !key) {
      throw new Error(
        'Supabase browser configuration is missing.',
      )
    }

    browserClient = createBrowserClient(url, key)
  }

  return browserClient
}

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(
          new Error(
            'This browser does not support offline assessment storage.',
          ),
        )
        return
      }

      const request = indexedDB.open(DB_NAME, 1)

      request.onupgradeneeded = () => {
        const db = request.result

        db.createObjectStore('snapshots', {
          keyPath: 'ownerId',
        })

        const queue = db.createObjectStore('queue', {
          keyPath: 'key',
        })

        queue.createIndex('ownerId', 'ownerId', {
          unique: false,
        })
      }

      request.onerror = () => {
        reject(
          request.error ??
            new Error('Unable to open offline storage.'),
        )
      }

      request.onblocked = () => {
        reject(
          new Error(
            'Close other eCHIMS tabs and retry offline storage.',
          ),
        )
      }

      request.onsuccess = () => {
        const db = request.result

        db.onversionchange = () => {
          db.close()
          database = null
        }

        resolve(db)
      }
    }).catch((error) => {
      database = null
      throw error
    })
  }

  return database
}

async function transact<T>(
  store: 'snapshots' | 'queue',
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = operation(tx.objectStore(store))

    let value!: T

    request.onsuccess = () => {
      value = request.result
    }

    // Resolve only after the transaction has committed.
    tx.oncomplete = () => {
      resolve(value)
    }

    tx.onerror = () => {
      reject(
        tx.error ??
          request.error ??
          new Error('Offline storage failed.'),
      )
    }

    tx.onabort = () => {
      reject(
        tx.error ??
          new Error('Offline storage was not saved.'),
      )
    }
  })
}

export async function saveSnapshot<
  T extends { currentUserId: string },
>(ownerId: string, data: T) {
  if (data.currentUserId !== ownerId) {
    throw new Error(
      'The snapshot belongs to a different account.',
    )
  }

  await transact('snapshots', 'readwrite', (store) =>
    store.put({
      ownerId,
      savedAt: new Date().toISOString(),
      data,
    }),
  )
}

export async function loadSnapshot<T>(
  ownerId: string,
): Promise<T | null> {
  const row = await transact<
    { ownerId: string; data: T } | undefined
  >('snapshots', 'readonly', (store) =>
    store.get(ownerId),
  )

  return row?.ownerId === ownerId ? row.data : null
}

export async function removeSnapshot(ownerId: string) {
  await transact('snapshots', 'readwrite', (store) =>
    store.delete(ownerId),
  )
}

export async function listQueue(
  ownerId: string,
): Promise<QueuedAssessment[]> {
  const rows = await transact<QueuedAssessment[]>(
    'queue',
    'readonly',
    (store) => store.index('ownerId').getAll(ownerId),
  )

  return rows
    .filter((row) => row.ownerId === ownerId)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
}

export async function putQueuedAssessment(
  ownerId: string,
  item: QueuedAssessment,
) {
  if (
    item.ownerId !== ownerId ||
    item.key !== `${ownerId}:${item.requestId}` ||
    item.payload.client_request_id !== item.requestId
  ) {
    throw new Error(
      'The queued assessment belongs to a different account or request.',
    )
  }

  await transact('queue', 'readwrite', (store) =>
    store.put(item),
  )
}

export async function removeQueuedAssessment(
  ownerId: string,
  requestId: string,
) {
  await transact('queue', 'readwrite', (store) =>
    store.delete(`${ownerId}:${requestId}`),
  )
}

export function validateOfflinePayload(
  payload: NutritionPayload,
  birthDate: string,
  today: string,
): string | null {
  const parsed = new Date(
    `${payload.assessment_date}T00:00:00.000Z`,
  )

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.assessment_date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !==
      payload.assessment_date
  ) {
    return 'Provide a valid assessment date.'
  }

  const birth = new Date(`${birthDate}T00:00:00.000Z`)

  const targetYear = birth.getUTCFullYear() + 5

  const lastDay = new Date(
    Date.UTC(targetYear, birth.getUTCMonth() + 1, 0),
  ).getUTCDate()

  const fifthBirthday = new Date(
    Date.UTC(
      targetYear,
      birth.getUTCMonth(),
      Math.min(birth.getUTCDate(), lastDay),
    ),
  )

  if (
    !Number.isFinite(birth.getTime()) ||
    payload.assessment_date < birthDate ||
    payload.assessment_date > today ||
    parsed >= fifthBirthday
  ) {
    return 'The assessment must be on or after birth, not in the future, and before the fifth birthday.'
  }

  if (
    ![payload.weight, payload.height].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    (payload.muac !== null &&
      (!Number.isFinite(payload.muac) ||
        payload.muac <= 0))
  ) {
    return 'Weight, length/height and any recorded MUAC must be finite positive numbers.'
  }

  if (
    !['LENGTH', 'HEIGHT'].includes(
      payload.measurement_type,
    )
  ) {
    return 'Choose the actual measurement position.'
  }

  if (
    !Number.isInteger(payload.edema_grade) ||
    payload.edema_grade < 0 ||
    payload.edema_grade > 3
  ) {
    return 'Edema grade must be an integer between 0 and 3.'
  }

  return null
}