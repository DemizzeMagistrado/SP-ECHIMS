'use client'
import type { AuthUser } from '@/components/auth/auth-provider'
import { canPerform } from '@/lib/echims-data'
import { offlineFetch } from '@/lib/offline/fetch'
import { saveSnapshot } from '@/lib/nutrition-offline'
import { cacheSupplementData } from '@/lib/supplementation-offline'

export function preparedChildIds(data: unknown): number[] {
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' && 'children' in data && Array.isArray(data.children) ? data.children : []
  return [...new Set(rows.flatMap(row => {
    if (!row || typeof row !== 'object') return []
    const value = String(row.child_id ?? row.id ?? '')
    const match = /^(?:CH-)?(?:\d{4}-)?(\d+)$/i.exec(value)
    const id = match ? Number(match[1]) : NaN
    return Number.isSafeInteger(id) && id > 0 ? [id] : []
  }))]
}
export async function prepareSystemViews(user: AuthUser, progress: (text: string) => void, current: () => boolean) {
  const failures: string[] = [], children = new Set<number>()
  let completed = 0, profiles = 0
  const view = (name: string) => canPerform(user.role, name, 'view')
  const urls = new Set(['/api/notifications'])
  if (view('Child Profiling')) ['/api/children','/api/barangays','/api/psgc?level=offline-reference'].forEach(url => urls.add(url))
  if (view('Health Activities')) ['/api/health-activities','/api/health-activities/options'].forEach(url => urls.add(url))
  if (view('Nutritional Assessment')) urls.add('/api/nutrition')
  if (view('Supplementation')) ['/api/supplementation','/api/supplementation/stock-requests','/api/sms/reminders?program=SUPPLEMENTATION'].forEach(url => urls.add(url))
  if (view('Alerts')) urls.add('/api/alerts?page=1')
  if (view('Reports')) urls.add('/api/reports?page=1')
  if (view('Vaccination')) ['/api/children?view=vaccination-options','/api/vaccines','/api/vaccination/records','/api/vaccination/defaulters?status=OVERDUE','/api/vaccination/defaulters?status=OVERDUE&limit=1','/api/sms/reminders?program=VACCINATION'].forEach(url => urls.add(url))
  if (view('Vaccination Schedule')) urls.add('/api/vaccination/schedule?status=PENDING')
  if (view('NIP Catalog')) urls.add('/api/vaccines/catalog')
  if (view('Vaccine Batch Requests')) urls.add('/api/vaccination/batch-requests')
  async function download(url: string) {
    if (!current()) throw new Error('Account changed.')
    const response = await offlineFetch(url, {signal: AbortSignal.timeout(url.includes('offline-reference') ? 120000 : 25000)})
    if (!response.ok || !response.headers.has('X-eCHIMS-Prepared')) throw new Error(`Not prepared: ${url}`)
    const data = await response.json()
    if (!current()) throw new Error('Account changed.')
    if (url === '/api/nutrition') await saveSnapshot(user.id, data)
    if (url === '/api/supplementation') await cacheSupplementData(user.id, data)
    completed++
    return data
  }
  for (const url of urls) {
    if (!current()) return {completed, profiles, failures, cancelled: true}
    progress(`Preparing shared views (${completed}/${urls.size})…`)
    try {
      const data = await download(url)
      if (url.startsWith('/api/children')) for (const id of preparedChildIds(data)) children.add(id)
      if (url.startsWith('/api/alerts') && Array.isArray(data.alerts)) for (const row of data.alerts) for (const id of preparedChildIds([{child_id:row.child_id}])) children.add(id)
    } catch { failures.push(url) }
  }
  // Bounded workers keep profile downloads responsive without overloading the RHU.
  const ids = [...children]; let next = 0
  await Promise.all(Array.from({length: Math.min(3, ids.length)}, async () => {
    while (current() && next < ids.length) {
      const id = ids[next++]
      progress(`Preparing child profiles (${profiles}/${ids.length})…`)
      let profile
      try { profile = await download(`/api/children?childId=${id}`); profiles++ } catch { failures.push(`/api/children?childId=${id}`); continue }
      const details = [`/api/children/${id}/movement`]
      if (view('Vaccination')) details.push(`/api/children/${id}/vaccination-schedule`, `/api/vaccination/history?child_id=${id}`)
      if (view('Supplementation')) details.push(`/api/supplementation?childId=${id}`)
      const guardianId = profile?.child?.guardian_id
      if (Number.isSafeInteger(guardianId) && guardianId > 0) details.push(`/api/children/${id}/guardian-sms?guardian_id=${guardianId}`)
      for (const url of details) {
        if (!current()) return
        try { await download(url) } catch { failures.push(url) }
      }
    }
  }))
  return {completed, profiles, failures, cancelled: !current()}
}
