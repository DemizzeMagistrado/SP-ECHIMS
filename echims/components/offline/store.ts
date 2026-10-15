'use client'
import type { AuthUser } from '@/components/auth/auth-provider'
export type OfflineIdentity = { user: AuthUser; verifiedAt: string }
let database: Promise<IDBDatabase> | null = null
let localLock = false
export function isOfflineLocked() {
  if (localLock) return true
  try { return typeof window !== 'undefined' && localStorage.getItem('echims-device-locked') === '1' } catch { return false }
}
export function lockOfflineDevice() {
  localLock = true
  try { localStorage.setItem('echims-device-locked', '1') } catch {}
}
export function unlockOfflineDevice() {
  localLock = false
  try { localStorage.removeItem('echims-device-locked') } catch {}
}
function open(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Offline storage is unavailable.')); return }
    const request = indexedDB.open('echims-offline-foundation-v1', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('identities')) db.createObjectStore('identities', { keyPath: 'ownerId' })
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('device')) db.createObjectStore('device', { keyPath: 'key' })
    }
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline storage.'))
    request.onblocked = () => reject(new Error('Close other eCHIMS tabs and retry.'))
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = null }
      resolve(request.result)
    }
  }).catch(error => { database = null; throw error })
  return database
}
async function run<T>(name: 'identities' | 'snapshots' | 'device', mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode), request = operation(tx.objectStore(name)); let result: T
    request.onsuccess = () => { result = request.result }
    tx.oncomplete = () => resolve(result)
    tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error('Offline storage failed.'))
  })
}
export async function saveIdentity(identity: OfflineIdentity) {
  if (isOfflineLocked() || identity.user.accountStatus !== 'APPROVED') throw new Error('Only a signed-in verified active account can prepare offline access.')
  const db=await open()
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['identities','device'],'readwrite')
    tx.objectStore('identities').put({ownerId:identity.user.id,...identity})
    tx.objectStore('device').put({key:'activeOwner',ownerId:identity.user.id})
    tx.oncomplete=()=>resolve()
    tx.onabort=tx.onerror=()=>reject(tx.error??new Error('The offline account was not saved.'))
  })
}
export async function loadIdentity(ownerId: string): Promise<OfflineIdentity | null> {
  if (isOfflineLocked()) return null
  const row = await run<(OfflineIdentity & { ownerId: string }) | undefined>('identities', 'readonly', store => store.get(ownerId))
  if (!row || row.ownerId !== ownerId || row.user.id !== ownerId || row.user.accountStatus !== 'APPROVED') return null
  const age = Date.now() - Date.parse(row.verifiedAt)
  // A local viewing lease survives token expiry; uploads always authenticate again.
  return Number.isFinite(age) && age >= 0 && age <= 7 * 86400000 ? row : null
}
export async function loadActiveIdentity() {
  if (isOfflineLocked()) return null
  const selected = await run<{ key: string; ownerId: string } | undefined>('device', 'readonly', store => store.get('activeOwner'))
  return selected?.ownerId ? loadIdentity(selected.ownerId) : null
}
export async function clearActiveIdentity() {
  await run('device', 'readwrite', store => store.delete('activeOwner'))
}
export async function forgetIdentity(ownerId: string) {
  await run('identities', 'readwrite', store => store.delete(ownerId))
  const selected = await run<{ ownerId: string } | undefined>('device', 'readonly', store => store.get('activeOwner'))
  if (selected?.ownerId === ownerId) await clearActiveIdentity()
}
export async function saveData<T>(ownerId: string, module: string, data: T) {
  await run('snapshots', 'readwrite', store => store.put({ key: ownerId + ':' + module, ownerId, module, savedAt: new Date().toISOString(), data }))
}
export async function loadData<T>(ownerId: string, module: string) {
  const row = await run<{ ownerId: string; module: string; savedAt: string; data: T } | undefined>('snapshots', 'readonly', store => store.get(ownerId + ':' + module))
  return row?.ownerId === ownerId && row.module === module ? row : null
}
