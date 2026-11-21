'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/form'
import { subnavPill } from '@/components/ui/sticky-subnav'
import { SectionCard } from '@/components/children/child-profile-cards'
import { GuardianLogin } from './guardian-login'
import { GuardianChildBanner, GuardianChildInformation, guardianDate as date, guardianLabel as label } from './guardian-child-profile'
import { guardianSessionEvent, notifyGuardianSessionChanged } from '@/lib/guardian/session-event'
import { childName, guardianPrograms, type GuardianChild, type GuardianContext, type GuardianProgram, type GuardianNutritionSummary, type HistoryRecord } from '@/lib/guardian/types'

const card = 'rounded-2xl border border-brand-line bg-white p-5 shadow-sm sm:p-6'

async function loadChildProfile(id: number, userId: string) {
  const response = await fetch(`/api/guardian/children/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) })
  const result = await response.json()
  if (!response.ok || result.currentUserId !== userId || !result.child) {
    throw new Error(result.error || 'Unable to verify the child profile.')
  }
  return result as { child: GuardianChild; latestNutrition: GuardianNutritionSummary | null }
}

export function GuardianPortal() {
  const [context, setContext] = useState<GuardianContext | null>(null)
  const [child, setChild] = useState<GuardianChild | null>(null)
  const [program, setProgram] = useState<GuardianProgram>('vaccination')
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [latestNutrition, setLatestNutrition] = useState<GuardianNutritionSummary | null>(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [busy, setBusy] = useState(true)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [online, setOnline] = useState(true)
  const generation = useRef(0)
  const historyGeneration = useRef(0)
  const owner = useRef<string | null>(null)
  const clear = useCallback(() => {
    generation.current++; historyGeneration.current++; owner.current = null
    setContext(null); setChild(null); setLatestNutrition(null); setRecords([]); setCursor(null); setHistoryBusy(false)
  }, [])
  const showSignIn = useCallback(() => {
    clear()
    setBusy(false)
    setNeedsSignIn(true)
    if (window.location.pathname !== '/guardian/login') {
      window.location.replace('/guardian/login')
    }
  }, [clear])

  const load = useCallback(async () => {
    if (window.location.pathname === '/guardian/login') {
      showSignIn()
      return
    }

    clear(); const turn = generation.current; setError(''); setHistoryError(''); setBusy(true)
    if (!navigator.onLine) { setBusy(false); return }
    try {
      const response = await fetch('/api/guardian/context', { cache: 'no-store', signal: AbortSignal.timeout(12000) })
      if (turn !== generation.current) return
      if (response.status === 401) {
        showSignIn()
        return
      }
      const result = await response.json() as GuardianContext & { error?: string }
      if (turn !== generation.current) return
      if (!response.ok || !result.currentUserId || !Array.isArray(result.children)) {
        throw new Error(result.error || 'Unable to verify access.')
      }
      const first = result.linked ? result.children[0] : undefined
      const profile = first ? await loadChildProfile(first.childId, result.currentUserId) : null
      if (turn !== generation.current) return
      owner.current = result.currentUserId
      setContext(result)
      if (profile) {
        setLatestNutrition(profile.latestNutrition)
        setChild(profile.child)
      }
    } catch (problem) { if (turn === generation.current) setError(problem instanceof Error ? problem.message : 'Unable to load records.') }
    finally { if (turn === generation.current) setBusy(false) }
  }, [clear, showSignIn])
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); if (!navigator.onLine) { clear(); setBusy(false) } else void load() }
    setOnline(navigator.onLine); void load()
    window.addEventListener('online', update); window.addEventListener('offline', update)
    const sessionChanged = (event: StorageEvent) => { if (event.key === guardianSessionEvent) void load() }
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void load() }
    window.addEventListener('storage', sessionChanged)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visible)
    return () => {
      generation.current++; historyGeneration.current++
      window.removeEventListener('storage', sessionChanged)
      window.removeEventListener('pageshow', restored)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [clear, load])
  async function selectChild(id: number) {
    const userId = owner.current
    if (!userId || child?.childId === id) return
    const turn = ++generation.current
    historyGeneration.current++
    setChild(null); setLatestNutrition(null); setRecords([]); setCursor(null)
    setHistoryError(''); setError(''); setHistoryBusy(false); setBusy(true)
    try {
      const profile = await loadChildProfile(id, userId)
      if (turn !== generation.current) return
      setLatestNutrition(profile.latestNutrition)
      setProgram('vaccination')
      setChild(profile.child)
    } catch (problem) {
      if (turn === generation.current) {
        clear()
        setBusy(false)
        setError(problem instanceof Error ? problem.message : 'Unable to load the child.')
      }
    } finally {
      if (turn === generation.current) setBusy(false)
    }
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
        if ([401, 403, 404].includes(response.status)) { clear(); setBusy(false); setError('Access changed. Refresh to verify your children again.'); return }
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
      const response = await fetch('/api/guardian/login', { method: 'DELETE', cache: 'no-store' })
      if (!response.ok) throw new Error('Sign-out failed.')
      notifyGuardianSessionChanged()
      showSignIn()
    } catch {
      setError('Unable to confirm sign-out. Reconnect and try again.')
    } finally {
      setBusy(false)
    }
  }
  if (needsSignIn) return <GuardianLogin />

  return <main className="brand min-h-screen bg-[linear-gradient(180deg,#CAF0F8_0%,#E6F7FB_60%,#FFFFFF_100%)] text-brand-navy">
    <header className="border-b border-brand-line bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8"><Logo size={42} /><div className="flex items-center gap-3"><span className="hidden text-sm text-brand-muted sm:inline">Guardian portal · View only</span><Button variant="secondary" onClick={() => void logout()} disabled={busy}><LogOut size={16} />Sign out</Button></div></div></header>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {context?.name && <p className="text-sm text-brand-muted">Welcome, {context.name}</p>}
          {!child && <h1 className="mt-1 font-display text-3xl font-bold">My children</h1>}
          {context?.linked && context.children.length > 1 && (
            <Field label="Select child" className="mt-2 min-w-56">
              <Select value={child?.childId ?? ''} disabled={busy} onChange={event => void selectChild(Number(event.target.value))}>
                <option value="" disabled>Select child</option>
                {context.children.map(item => <option key={item.childId} value={item.childId}>{childName(item)}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Button variant="secondary" loading={busy} disabled={!online} onClick={() => void load()}><RefreshCw size={16} />Refresh</Button>
      </div>
      {!online && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">You are offline. Reconnect to verify access and view current records.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {busy && <p role="status" className="text-sm text-brand-muted">Verifying access and loading records…</p>}
      {context && !context.linked && <section className={card}>
        <h2 className="text-lg font-semibold">Guardian record needs verification</h2>
        <p className="mt-2 text-sm text-brand-muted">Contact your BHS/RHU to verify your guardian record and current mobile number.</p>
      </section>}
      {context?.linked && !context.children.length && <p className={card}>No children are currently linked to this guardian record. Contact your BHS/RHU if a child is missing.</p>}
      {child && <>
        <GuardianChildBanner child={child} />
        <nav className="flex flex-wrap gap-2" aria-label="Health service history">
          {guardianPrograms.map(item => (
            <button type="button" key={item.key} aria-pressed={program === item.key} onClick={() => setProgram(item.key)} className={subnavPill(program === item.key)}>{item.label}</button>
          ))}
        </nav>
        <GuardianChildInformation child={child} guardianName={context?.name} nutrition={latestNutrition ?? undefined} />
        <SectionCard title={guardianPrograms.find(item => item.key === program)?.label ?? 'Health history'} subtitle="Recorded services and appointments">
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
        </SectionCard>
      </>}
      <footer className="flex flex-wrap gap-4 py-4 text-xs text-brand-muted"><Link href="/privacy" target="_blank" className="underline">Privacy notice</Link><span>Records remain managed by your BHS/RHU.</span></footer>
    </div>
  </main>
}
