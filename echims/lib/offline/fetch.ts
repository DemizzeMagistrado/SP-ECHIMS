'use client'
import { selectLocationItems, type LocationReference } from '@/lib/offline/locations'
import { createClient } from '@/lib/supabase/client'
import { loadData, loadIdentity, loadActiveIdentity, isOfflineLocked, saveData } from '@/lib/offline/store'
import type { AuthUser } from '@/components/auth/auth-provider'

// Only explicit read endpoints are saved. No authentication, administration,
// report generation/export, or mutation requests enter this cache.
export function canSaveOfflineRead(path: string) {
  return /^\/api\/(dashboard\/summary|children(?:\/\d+\/(?:guardian-sms|vaccination-schedule|movement))?|guardians(?:\/\d+)?|households|barangays|rhus|psgc|notifications|alerts|nutrition(?:\/admissions)?|supplementation(?:\/(?:compliance|sms|stock-requests))?|vaccination\/(?:records|history|defaulters|schedule|batch-requests)|vaccines(?:\/catalog)?|health-activities(?:\/(?:options|personnel-options))?|sms\/reminders|reports)$/.test(path)
}
export function offlineScope(user: Pick<AuthUser, 'role' | 'rhu_id' | 'barangay_ids'>) {
  return JSON.stringify([user.role, user.rhu_id ?? '', [...(user.barangay_ids ?? [])].sort()])
}
type Snapshot = { scope: string; body: string; savedAt: string }
class AccessChanged extends Error {}
async function verify(ownerId: string, scope: string) {
  const response = await fetch('/api/offline/context', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (response.status === 401 || response.status === 403) throw new AccessChanged('Please sign in again. Offline access is unavailable for this account.')
  if (!response.ok) throw new Error('Unable to verify current access.')
  const data = await response.json() as { user?: AuthUser }
  if (data.user?.id !== ownerId || offlineScope(data.user) !== scope) throw new AccessChanged('Your account or assigned area changed. Refresh your session online.')
}
function unavailable(message: string, status = 503) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } })
}
export async function offlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null
  const url = new URL(request?.url ?? String(input), window.location.origin)
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
  if (url.origin !== window.location.origin) return fetch(input, init)
  if (method !== 'GET' && url.pathname.startsWith('/api/') && !navigator.onLine) return unavailable('Reconnect before submitting this action. No server changes were made.')
  if (method !== 'GET' || !canSaveOfflineRead(url.pathname)) return fetch(input, init)
  if (isOfflineLocked()) return unavailable('Please sign in to open records.', 401)
  const active = !navigator.onLine ? await loadActiveIdentity().catch(() => null) : null
  const ownerId = navigator.onLine ? (await createClient().auth.getSession()).data.session?.user.id : active?.user.id
  if (!ownerId) return navigator.onLine ? fetch(input, init) : unavailable('Sign in online before opening saved records.', 401)
  const identity = await loadIdentity(ownerId).catch(() => null)
  if (!identity) return navigator.onLine ? fetch(input, init) : unavailable('Offline access has expired. Reconnect and sign in.', 401)
  const scope = offlineScope(identity.user)
  url.searchParams.sort()
  const key = 'SYSTEM_API:' + scope + ':' + url.pathname + url.search
  const sameOwner = async () => !isOfflineLocked() && (navigator.onLine ? (await createClient().auth.getSession()).data.session?.user.id === ownerId : (await loadActiveIdentity())?.user.id === ownerId)
  if (navigator.onLine) {
    try {
      await verify(ownerId, scope)
      const response = await fetch(input, { ...init, cache: 'no-store' })
      // A server denial or validation failure must never reveal an older snapshot.
      if (response.status < 500 && !response.ok) return response
      if (!response.ok) throw new Error('Server temporarily unavailable.')
      if (!response.headers.get('content-type')?.includes('application/json')) return response
      const body = await response.clone().text()
      const data: unknown = JSON.parse(body)
      if (data && typeof data === 'object' && 'currentUserId' in data && data.currentUserId !== ownerId) throw new AccessChanged('The response belongs to a different account.')
      // Access was verified before this read. Do not discard a completed response
      // when Wi-Fi fails before a second context request. Recheck local ownership.
      if (!await sameOwner()) throw new AccessChanged('Account changed during download.')
      // Storage failure must not turn a successful online read into an error.
      const savedAt = new Date().toISOString()
      let prepared = false
      await saveData<Snapshot>(ownerId, key, { scope, body, savedAt }).then(() => { prepared = true }).catch(() => {
        window.dispatchEvent(new Event('echims-offline-storage-error'))
      })
      if (prepared) {
        const headers = new Headers(response.headers)
        headers.set('X-eCHIMS-Prepared', savedAt)
        return new Response(response.body, {status: response.status, statusText: response.statusText, headers})
      }
      return response
    } catch (error) {
      if (error instanceof AccessChanged) return unavailable(error.message, 403)
      if (init?.signal?.aborted || request?.signal.aborted) throw error
    }
  }
  if (!await sameOwner()) return unavailable('Account changed. Reopen this page.', 401)
  let saved = await loadData<Snapshot>(ownerId, key).catch(() => null)
  if (!saved && url.pathname === '/api/psgc') {
    const referenceKey = 'SYSTEM_API:' + scope + ':/api/psgc?level=offline-reference'
    const reference = await loadData<Snapshot>(ownerId, referenceKey).catch(() => null)
    if (reference?.data.scope === scope) {
      try {
        const payload = JSON.parse(reference.data.body) as {currentUserId: string; rows: LocationReference[]}
        const items = payload.currentUserId === ownerId && Array.isArray(payload.rows)
          ? selectLocationItems(payload.rows, url.searchParams.get('level'), url.searchParams.get('parent')) : null
        if (items) saved = {...reference, data: {...reference.data, body: JSON.stringify({items})}}
      } catch { /* An invalid reference cannot stand in for a prepared view. */ }
    }
  }
  if (!saved || saved.data.scope !== scope) return unavailable('This view is not saved on this device. Open this exact view online first; filters and report periods have separate saved views.')
  window.dispatchEvent(new CustomEvent('echims-offline-snapshot', { detail: saved.data.savedAt }))
  return new Response(saved.data.body, { headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
    'X-eCHIMS-Snapshot': saved.data.savedAt,
  } })
}
