'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LogOut, RefreshCw, Settings as SettingsIcon, User as UserIcon } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/form'
import { StickySubnav } from '@/components/ui/sticky-subnav'
import { GuardianHistorySection } from './guardian-history-section'
import { GuardianSettings } from './guardian-settings'
import { GuardianLogin } from './guardian-login'
import { ChildProfileDetailsView, type Assessment, type ChildProfileDetails } from '@/components/children/child-profile-details-view'
import type { Condition } from '@/lib/children/medical-history'
import { guardianSessionEvent, notifyGuardianSessionChanged } from '@/lib/guardian/session-event'
import { childName, guardianPrograms, type GuardianChild, type GuardianContext, type GuardianProgram } from '@/lib/guardian/types'

type GuardianProfile = {
  child: GuardianChild
  profileDetails: ChildProfileDetails
  latestNutrition: Assessment | null
  medicalConditions: Condition[]
  householdChildren: GuardianChild[]
}

async function loadChildProfile(id: number, userId: string) {
  const response = await fetch(`/api/guardian/children/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) })
  const result = await response.json()
  if (!response.ok || result.currentUserId !== userId || result.child?.childId !== id || result.profileDetails?.child?.child_id !== id) {
    throw new Error(result.error || 'Unable to verify the child profile.')
  }
  return result as GuardianProfile
}

function greeting() {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export function GuardianPortal() {
  const [context, setContext] = useState<GuardianContext | null>(null)
  const [profile, setProfile] = useState<GuardianProfile | null>(null)
  const child = profile?.child ?? null
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [settingsView, setSettingsView] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [today, setToday] = useState('')
  const generation = useRef(0)
  const owner = useRef<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const clear = useCallback(() => {
    generation.current++
    owner.current = null
    setContext(null)
    setProfile(null)
    setMenuOpen(false)
  }, [])

  const showSignIn = useCallback(() => {
    clear()
    setBusy(false)
    setNeedsSignIn(true)
    if (window.location.pathname !== '/guardian/login') window.location.replace('/guardian/login')
  }, [clear])

  const accessChanged = useCallback(() => {
    clear()
    setBusy(false)
    setError('Access changed. Refresh to verify your children again.')
  }, [clear])

  const load = useCallback(async () => {
    if (window.location.pathname === '/guardian/login') {
      showSignIn()
      return
    }

    clear()
    const turn = generation.current
    setError('')
    setBusy(true)
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
      const childProfile = first ? await loadChildProfile(first.childId, result.currentUserId) : null
      if (turn !== generation.current) return
      owner.current = result.currentUserId
      setContext(result)
      setProfile(childProfile)
    } catch (problem) {
      if (turn === generation.current) setError(problem instanceof Error ? problem.message : 'Unable to load records.')
    } finally {
      if (turn === generation.current) setBusy(false)
    }
  }, [clear, showSignIn])

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }))
    void load()
    const sessionChanged = (event: StorageEvent) => { if (event.key === guardianSessionEvent) void load() }
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void load() }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('storage', sessionChanged)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visible)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      generation.current++
      window.removeEventListener('storage', sessionChanged)
      window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', visible)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [load])

  async function selectChild(id: number) {
    const userId = owner.current
    if (!userId || child?.childId === id) return
    const turn = ++generation.current
    setProfile(null)
    setError('')
    setBusy(true)
    try {
      const childProfile = await loadChildProfile(id, userId)
      if (turn !== generation.current) return
      setProfile(childProfile)
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

  async function logout() {
    clear()
    setBusy(true)
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

  return (
    <main className="brand min-h-screen bg-[linear-gradient(180deg,#CAF0F8_0%,#E6F7FB_60%,#FFFFFF_100%)] text-brand-navy">
      <header className="app-topbar sticky top-0 z-30">
        <div className="flex h-16 items-center justify-between gap-3 border-b border-[#03045E]/[0.07] bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 p-2">
              <Logo variant="mark" size={22} />
            </span>
            <p className="truncate text-sm font-semibold text-[#2D3A55]">{today || '\u00a0'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <span className="hidden rounded-full bg-[#F3F4F6] px-3 py-2 text-xs font-medium text-[#6B7280] sm:inline-flex">View only</span>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="Settings menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen(open => !open)}
                className="rounded-lg p-2.5 text-[#03045E] transition hover:bg-[#EAF6FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]"
              >
                <SettingsIcon size={22} />
              </button>
              {menuOpen && (
                <section id={menuId} aria-label="Settings" className="absolute right-0 top-full z-50 mt-3 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-[#03045E]">{context?.name || 'Guardian account'}</p>
                    <p className="truncate text-xs text-slate-500">Guardian</p>
                  </div>
                  <ul className="py-1 text-sm">
                    <li>
                      <button type="button" onClick={() => { setSettingsView(true); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-slate-700 hover:bg-slate-50">
                        <UserIcon size={14} />Profile &amp; settings
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => void logout()} className="flex w-full items-center gap-2 px-4 py-2 text-left text-rose-700 hover:bg-rose-50">
                        <LogOut size={14} />Log out
                      </button>
                    </li>
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {settingsView ? (
          context ? (
            <GuardianSettings context={context} onBack={() => setSettingsView(false)} onLogout={() => void logout()} />
          ) : (
            <div className="space-y-4">
              <h1 className="font-display text-3xl font-bold tracking-tight text-brand-navy">Profile &amp; settings</h1>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setSettingsView(false)}>Back to children</Button>
                <Button variant="secondary" loading={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</Button>
              </div>
              {busy && <p role="status" className="text-sm text-brand-muted">Verifying your guardian session…</p>}
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
            </div>
          )
        ) : (
          <>
            <header className="relative isolate overflow-hidden rounded-2xl bg-brand-navy px-5 py-5 text-white sm:px-6">
              <div aria-hidden className="absolute -right-24 -top-32 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(8,125,185,0.6),transparent)]" />
              <p className="font-serif text-base italic text-brand-aqua">{greeting()}</p>
              <h1 className="mt-1 truncate text-2xl font-bold sm:text-[1.75rem]">
                {context?.name ? `Welcome back, ${context.name.trim().split(/\s+/)[0]}` : 'Welcome to your guardian portal'}
              </h1>
              <p className="mt-2 text-sm text-brand-mist">View your linked children’s health records and appointment history.</p>
            </header>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {context?.linked && context.children.length > 1 && (
                  <Field label="Select child" className="min-w-56">
                    <Select value={child?.childId ?? ''} disabled={busy} onChange={event => void selectChild(Number(event.target.value))}>
                      <option value="" disabled>Select child</option>
                      {context.children.map(item => <option key={item.childId} value={item.childId}>{childName(item)}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
              <Button variant="secondary" loading={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</Button>
            </div>
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
            {busy && <p role="status" className="text-sm text-brand-muted">Verifying access and loading records…</p>}
            {context && !context.linked && (
              <section className="rounded-2xl border border-brand-line bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-semibold">Guardian record needs verification</h2>
                <p className="mt-2 text-sm text-brand-muted">Contact your BHS/RHU to verify your guardian record and current mobile number.</p>
              </section>
            )}
            {context?.linked && !context.children.length && (
              <p className="rounded-2xl border border-brand-line bg-white p-5 shadow-sm sm:p-6">No children are currently linked to this guardian record. Contact your BHS/RHU if a child is missing.</p>
            )}
            {child && profile && context && (
              <>
                <ChildProfileDetailsView
                  data={profile.profileDetails}
                  latestNutrition={profile.latestNutrition}
                  medicalConditions={profile.medicalConditions}
                  householdMembers={profile.householdChildren.length > 0 && (
                    <div className="mt-4 border-t border-border pt-4">
                      <h3 className="text-sm font-semibold">Other children in this household</h3>
                      <ul className="mt-2 space-y-2">
                        {profile.householdChildren.map(item => (
                          <li key={item.childId}>
                            <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => void selectChild(item.childId)}>{childName(item)}</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                />
                <StickySubnav
                  label="Health service history"
                  items={guardianPrograms.map(item => ({ id: `${item.key}-history`, label: item.label }))}
                />
                <div className="space-y-6">
                  {guardianPrograms.map((item: { key: GuardianProgram; label: string }) => (
                    <GuardianHistorySection key={`${child.childId}-${item.key}`} childId={child.childId} ownerId={context?.currentUserId ?? ''} program={item.key} onAccessChanged={accessChanged} />
                  ))}
                </div>
              </>
            )}
            <footer className="flex flex-wrap gap-4 py-4 text-xs text-brand-muted">
              <Link href="/privacy" target="_blank" className="underline">Privacy notice</Link>
              <span>Records remain managed by your BHS/RHU.</span>
            </footer>
          </>
        )}
      </div>
    </main>
  )
}
