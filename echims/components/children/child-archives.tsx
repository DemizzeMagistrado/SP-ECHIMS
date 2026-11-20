'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { RefreshCw, Search } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { InfoTip } from '@/components/ui/info-tip'
import { Input } from '@/components/ui/form'
import { Button } from '@/components/ui/button'

type Row = { child_id: number; name: string; date_of_birth: string; registry_status: string; barangay_name: string; archived_effective_on: string }
type Page = { currentUserId: string; records: Row[]; nextBeforeId: number | null; evaluatedOn: string }
export function ChildArchives() {
  const { user, isReady } = useAuth()
  const allowed = isReady && !!user && user.accountStatus === 'APPROVED' && ['Public Health Nurse', 'Rural Health Midwife', 'Barangay Health Worker'].includes(user.role)
  const [cursor, setCursor] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const { data, error, isLoading, mutate } = useSWR(allowed ? [user!.id, 'age-archive', cursor] : null, async ([owner, , before]) => {
    const response = await fetch('/api/children/age-archive' + (before ? '?beforeId=' + before : ''), { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw Error(body.error ?? 'Unable to load age archive.')
    if (body.currentUserId !== owner || !Array.isArray(body.records)) throw Error('Session changed. Refresh.')
    return body as Page
  }, { refreshInterval: 60000, shouldRetryOnError: false })
  if (!isReady) return <p>Loading…</p>
  if (!allowed) return <p role="alert">Assigned PHN, RHM or BHW access is required.</p>
  const page = data?.currentUserId === user!.id ? data : null
  const query = search.trim().toLocaleLowerCase()
  const shown = (page?.records ?? []).filter(row => [row.name, String(row.child_id), row.barangay_name, row.date_of_birth, row.archived_effective_on].join(' ').toLocaleLowerCase().includes(query))
  return <div className="space-y-5">
    <ModuleTabs parent="Child Profiling" role={user!.role}/>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-primary">Archived Children</h1><p className="mt-1 text-sm text-muted-foreground">Children who have reached their fifth birthday.</p></div>
      <InfoTip label="About this view" text="About this view" align="end">Children leave the under-five program on their fifth birthday. Profiles, service histories and continuing care remain available in your authorized area. This does not mark a child inactive or lost to follow-up. Transfer requests and completed transfers are in Transfer Inbox. Search filters the current page; use Older records to review earlier pages. Offline results use the last saved view.</InfoTip>
    </div>
    <div className="space-y-2 rounded-2xl border border-border bg-white p-4">
      <label className="relative block"><span className="sr-only">Search archived children on this page</span><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground"/><Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search this page by child name, ID or barangay…" className="pl-10"/></label>
      <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs text-muted-foreground">{page ? `${shown.length} of ${page.records.length} records on this page` : 'Search the current page'}</p><Button variant="secondary" size="icon" className="size-10" aria-label="Refresh" title="Refresh" disabled={isLoading} onClick={() => void mutate()}><RefreshCw size={16} aria-hidden="true" className={isLoading ? 'animate-spin motion-reduce:animate-none' : undefined} /></Button></div>
    </div>
    {error ? <p role="alert" className="text-red-700">{error.message}</p> : isLoading || !page ? <p>Loading archive…</p> : !shown.length ? <p className="rounded-xl bg-white p-5">{query ? 'No archived children match this search on this page.' : 'No age-five archived children in your assigned scope.'}</p> : <div className="space-y-3">{shown.map(row => <article key={row.child_id} className="space-y-2 rounded-xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{row.name}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">Archived · Age five+</span></div><p className="text-sm">{row.barangay_name} · Born {row.date_of_birth} · Archived effective {row.archived_effective_on}</p><Link className="text-sm text-primary underline" href={'/child-profiling/children/' + row.child_id}>View retained profile and continuing care</Link></article>)}</div>}
    <div className="flex gap-3">{cursor && <button type="button" className="underline" onClick={() => setCursor(null)}>Latest</button>}{page?.nextBeforeId && <button type="button" className="underline" onClick={() => setCursor(page.nextBeforeId)}>Older records</button>}</div>
  </div>
}
