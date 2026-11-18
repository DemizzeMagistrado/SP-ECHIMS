'use client'
import Link from 'next/link'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Baby, ChevronRight, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { createClient } from '@/lib/supabase/client'
import { childName, guardianPrograms, type GuardianChild, type GuardianContext, type GuardianProgram, type HistoryRecord } from '@/lib/guardian/types'

const date = (value?: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00+08:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : 'Not recorded'
const label = (value?: string | null) => value ? value.replace(/_/g, ' ').toLowerCase().replace(/^./, x => x.toUpperCase()) : 'Not recorded'
const card = 'rounded-2xl border border-brand-line bg-white p-5 shadow-sm sm:p-6'

export function GuardianPortal() {
  const router = useRouter()
  const [context, setContext] = useState<GuardianContext | null>(null)
  const [child, setChild] = useState<GuardianChild | null>(null)
  const [program, setProgram] = useState<GuardianProgram>('vaccination')
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [busy, setBusy] = useState(true)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [online, setOnline] = useState(true)
  const generation = useRef(0)
  const historyGeneration = useRef(0)
  const owner = useRef<string | null>(null)
  const clear = useCallback(() => {
    generation.current++; historyGeneration.current++; owner.current = null
    setContext(null); setChild(null); setRecords([]); setCursor(null); setHistoryBusy(false)
  }, [])
  const load = useCallback(async () => {
    clear(); const turn = generation.current; setError(''); setHistoryError(''); setBusy(true)
    if (!navigator.onLine) { setBusy(false); return }
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (turn !== generation.current) return
      if (!user) { router.replace('/guardian/login'); return }
      const response = await fetch('/api/guardian/context', { cache: 'no-store', signal: AbortSignal.timeout(12000) })
      const result = await response.json()
      if (turn !== generation.current) return
      if (response.status === 401) { router.replace('/guardian/login'); return }
      if (!response.ok || result.currentUserId !== user.id) throw new Error(result.error || 'Unable to verify access.')
      owner.current = user.id; setContext(result)
    } catch (problem) { if (turn === generation.current) setError(problem instanceof Error ? problem.message : 'Unable to load records.') }
    finally { if (turn === generation.current) setBusy(false) }
  }, [clear, router])
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); if (!navigator.onLine) { clear(); setBusy(false) } else void load() }
    setOnline(navigator.onLine); void load()
    window.addEventListener('online', update); window.addEventListener('offline', update)
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        clear(); window.setTimeout(() => void load(), 0)
      }
    })
    // Recheck the link when returning to this tab; don't keep another session's data.
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', visible)
    return () => { generation.current++; historyGeneration.current++; subscription.unsubscribe(); window.removeEventListener('online', update); window.removeEventListener('offline', update); document.removeEventListener('visibilitychange', visible) }
  }, [clear, load])
  async function selectChild(id: number) {
    const turn = ++generation.current; historyGeneration.current++
    setChild(null); setRecords([]); setCursor(null); setError(''); setBusy(true)
    try {
      const response = await fetch(`/api/guardian/children/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) })
      const result = await response.json()
      if (turn !== generation.current) return
      if (!response.ok || result.currentUserId !== owner.current) throw new Error(result.error || 'Access changed. Refresh your children.')
      setProgram('vaccination'); setChild(result.child)
    } catch (problem) { if (turn === generation.current) { setContext(null); setError(problem instanceof Error ? problem.message : 'Unable to load the child.') } }
    finally { if (turn === generation.current) setBusy(false) }
  }
  const loadHistory = useCallback(async (id: number, service: GuardianProgram, before: number | null = null) => {
    const turn = ++historyGeneration.current
    setHistoryBusy(true); setHistoryError('')
    if (!before) { setRecords([]); setCursor(null) }
    try {
      const response = await fetch(`/api/guardian/children/${id}?program=${service}${before ? `&beforeId=${before}` : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) })
      const result = await response.json()
      if (turn !== historyGeneration.current) return
      if (!response.ok || result.currentUserId !== owner.current) {
        if ([401, 403, 404].includes(response.status)) { clear(); setError('Access changed. Refresh to verify your children again.') }
        throw new Error(result.error || 'Unable to load history.')
      }
      setRecords(old => before ? [...old, ...result.records] : result.records); setCursor(result.nextBeforeId)
    } catch (problem) { if (turn === historyGeneration.current) { setRecords([]); setHistoryError(problem instanceof Error ? problem.message : 'Unable to load history.') } }
    finally { if (turn === historyGeneration.current) setHistoryBusy(false) }
  }, [clear])
  useEffect(() => { if (child) void loadHistory(child.childId, program) }, [child, program, loadHistory])
  async function logout() {
    clear(); setBusy(true)
    try {
      const { error: problem } = await createClient().auth.signOut({ scope: 'local' })
      if (problem) throw problem
      router.replace('/guardian/login'); router.refresh()
    } catch { setError('Records were cleared from this view, but sign-out could not be confirmed. Reconnect and try again.') }
    finally { setBusy(false) }
  }
  const filtered = context?.children.filter(c => childName(c).toLowerCase().includes(search.toLowerCase().trim())) ?? []
  return <main className="brand min-h-screen bg-[linear-gradient(180deg,#CAF0F8_0%,#E6F7FB_60%,#FFFFFF_100%)] text-brand-navy">
    <header className="border-b border-brand-line bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8"><Logo size={42} /><div className="flex items-center gap-3"><span className="hidden text-sm text-brand-muted sm:inline">Guardian portal · View only</span><Button variant="secondary" onClick={() => void logout()} disabled={busy}><LogOut size={16} />Sign out</Button></div></div></header>
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-brand-muted">{context?.name ? `Welcome, ${context.name}` : 'Guardian access'}</p><h1 className="mt-1 font-display text-3xl font-bold">My children</h1><p className="mt-2 text-sm text-brand-muted">Profiles and recorded health services for your linked children.</p></div><Button variant="secondary" loading={busy} disabled={!online} onClick={() => void load()}><RefreshCw size={16} />Refresh</Button></div>
      <p className="flex gap-2 rounded-xl border border-brand-line bg-white/80 p-3 text-sm text-brand-muted"><ShieldCheck size={18} className="shrink-0 text-brand-blue" />Only your linked children are shown. Contact your BHS/RHU for corrections or questions.</p>
      {!online && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">You are offline. Reconnect to verify access and view current child records.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {busy && <p role="status" className="text-sm text-brand-muted">Verifying access and loading records…</p>}
      {context && !context.linked && <section className={card}><h2 className="text-lg font-semibold">Guardian record needs verification</h2><p className="mt-2 text-sm text-brand-muted">Contact your BHS/RHU to verify your guardian record and current mobile number. No child records can be shown yet.</p><p className="mt-2 text-xs text-brand-muted">If your registration was interrupted, sign out and sign in again to finish.</p></section>}
      {context?.linked && !child && <section className={card}>
        <Field label="Search your children"><Input type="search" placeholder="Search by child name" value={search} onChange={e => setSearch(e.target.value)} /></Field>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{filtered.map(c => <button key={c.childId} type="button" onClick={() => void selectChild(c.childId)} disabled={busy} className="flex items-center gap-4 rounded-xl border border-brand-line p-4 text-left transition hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-brand-blue"><span className="rounded-full bg-brand-ice p-3"><Baby size={24} /></span><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{childName(c)}</span><span className="mt-1 block text-sm text-brand-muted">Born {date(c.dateOfBirth)}</span></span><ChevronRight size={18} /></button>)}</div>
        {!filtered.length && <p className="py-6 text-center text-sm text-brand-muted">{context.children.length ? 'No children match your search.' : 'No children are currently linked to this guardian record. Contact your BHS/RHU if a child is missing.'}</p>}
      </section>}
      {child && <>
        <Button variant="secondary" onClick={() => { historyGeneration.current++; setChild(null); setRecords([]); setCursor(null); setHistoryError('') }}>Back to my children</Button>
        <section className={card}><div className="flex items-start gap-4"><span className="rounded-full bg-brand-ice p-3"><Baby size={28} /></span><div><p className="text-xs text-brand-muted">{child.childCode || `Child #${child.childId}`}</p><h2 className="mt-1 text-2xl font-bold">{childName(child)}</h2><p className="mt-1 text-sm text-brand-muted">Child information · View only</p></div></div>
          <dl className="mt-6 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">{[
            ['Date of birth', date(child.dateOfBirth)], ['Sex', label(child.sex)], ['Address', child.address || 'Not recorded'],
            ['Birth weight', child.birthWeightKg != null ? `${child.birthWeightKg} kg` : 'Not recorded'],
            ['Birth length / height', child.birthLengthCm != null ? `${child.birthLengthCm} cm` : 'Not recorded'],
          ].map(([key, value]) => <div key={key} className="border-b border-brand-line pb-3"><dt className="text-brand-muted">{key}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
        </section>
        <section className={card}><h2 className="text-lg font-semibold">Health history</h2><p className="mt-1 text-sm text-brand-muted">Recorded services and follow-up appointments. Ask your health worker about the next service due.</p>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Health service history">{guardianPrograms.map(p => <Button key={p.key} variant={program === p.key ? 'primary' : 'secondary'} aria-pressed={program === p.key} onClick={() => setProgram(p.key)}>{p.label}</Button>)}</div>
          {historyError && <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{historyError}<Button className="ml-2" size="sm" variant="secondary" onClick={() => void loadHistory(child.childId, program)}>Try again</Button></div>}
          {!historyBusy && !historyError && !records.length && <p className="py-10 text-center text-sm text-brand-muted">No recorded {guardianPrograms.find(p => p.key === program)?.label.toLowerCase()} yet.</p>}
          <div className="mt-4 space-y-3">{records.map(row => <article key={row.id} className="rounded-xl border border-brand-line p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{row.name}</h3><p className="mt-1 text-sm text-brand-muted">{date(row.date)}</p></div><span className="rounded-full bg-brand-ice px-3 py-1 text-xs font-medium">{label(row.status)}</span></div>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">{[
              ['Dose', row.dose], ['Batch', row.batch], ['Weight', row.weightKg != null ? `${row.weightKg} kg` : null], ['Length / height', row.heightCm != null ? `${row.heightCm} cm` : null], ['MUAC', row.muacCm != null ? `${row.muacCm} cm` : null], ['Weight for age', row.weightForAge], ['Height for age', row.heightForAge], ['Weight for height', row.weightForHeight], ['Dose given', row.doseValue != null ? `${row.doseValue} ${row.doseUnit || ''}` : null], ['Quantity', row.quantity], ['Completed on', row.completedOn ? date(row.completedOn) : null],
            ].filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => <div key={String(key)}><dt className="text-xs text-brand-muted">{key}</dt><dd className="mt-0.5">{value}</dd></div>)}</dl>
          </article>)}</div>
          {historyBusy && <p role="status" className="mt-5 text-sm text-brand-muted">Loading history…</p>}
          {cursor && !historyError && <Button className="mt-5" variant="secondary" loading={historyBusy} onClick={() => void loadHistory(child.childId, program, cursor)}>Load more records</Button>}
          {program === 'vaccination' && <p className="mt-4 text-xs text-brand-muted">Only approved vaccination records are displayed. Records awaiting staff review are excluded.</p>}
        </section>
      </>}
      <footer className="flex flex-wrap gap-4 py-4 text-xs text-brand-muted"><Link href="/privacy" target="_blank" className="underline">Privacy notice</Link><span>Records remain managed by your BHS/RHU.</span></footer>
    </div>
  </main>
}
