'use client'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { LogoLoader } from './logo-loader'
import {
  FADE, MIN_SHOWN, SHOW_DELAY, afterPaint, getGateMounts, getOverlayUp, getWaiting, loaderOnScreen,
  noteGateMount, setOverlayUp, setWaiting, subscribe,
} from './loader-state'

type Phase = 'loading' | 'fading' | 'done'

/**
 * The one loader → content handoff. Content stays mounted but invisible (its CSS animations
 * paused) until `ready`, fonts are in and two frames have painted; then the loader fades out
 * while the content fades and rises in. Fast loads skip the loader and only fade content in.
 * keepMounted=false renders children only while ready (used where rendering early would show
 * the wrong thing, e.g. role guards with no user).
 */
export function LoadingGate({ ready, children, label = 'Loading…', doneLabel = 'Page loaded', keepMounted = true, className = '', onDone }: {
  ready: boolean; children: ReactNode; label?: string; doneLabel?: string; keepMounted?: boolean; className?: string
  /** Runs once the content is fully shown; replaces the default focus move. */
  onDone?: () => void
}) {
  const overlay = useSyncExternalStore(subscribe, getOverlayUp, () => false)
  // Taking over from a loader already on screen: appear at once, no intro, no minimum.
  const [instant] = useState(() => typeof window !== 'undefined' && loaderOnScreen())
  const [phase, setPhase] = useState<Phase>('loading')
  const [id] = useState(() => Symbol('gate'))
  const mountedAt = useRef(0)
  const shown = useRef(instant) // whether the loader (or an overlay) was actually visible
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => { mountedAt.current = performance.now(); noteGateMount() }, [])
  // Overlays wait for every gate that is still missing data.
  useEffect(() => { setWaiting(id, !ready); return () => setWaiting(id, false) }, [id, ready])
  // Content that loses its data again (e.g. the session ended) goes back behind the loader.
  useEffect(() => { if (!ready && !keepMounted && phase !== 'loading') setPhase('loading') }, [ready, keepMounted, phase])

  useEffect(() => {
    if (phase !== 'loading' || !ready || overlay) return
    let live = true
    const elapsed = performance.now() - mountedAt.current
    if (elapsed >= SHOW_DELAY) shown.current = true
    const hold = shown.current && !instant ? Math.max(0, SHOW_DELAY + MIN_SHOWN - elapsed) : 0
    const t = window.setTimeout(() => { void afterPaint().then(() => { if (live) setPhase('fading') }) }, hold)
    return () => { live = false; window.clearTimeout(t) }
  }, [phase, ready, overlay, instant])
  useEffect(() => { if (overlay) shown.current = true }, [overlay])

  useEffect(() => {
    if (phase !== 'fading') return
    const t = window.setTimeout(() => {
      setPhase('done')
      if (onDone) onDone()
      else if (shown.current) content.current?.focus({ preventScroll: true })
    }, FADE)
    return () => window.clearTimeout(t)
  }, [phase, onDone])

  return (
    <div className={`loading-gate ${className}`} data-state={phase}>
      {phase !== 'done' && (
        <div className="gate-loader" aria-hidden={phase === 'fading' || undefined}>
          <LogoLoader label={label} instant={instant} />
        </div>
      )}
      {(keepMounted || ready) && (
        <div ref={content} tabIndex={-1} className="gate-content outline-none" aria-hidden={phase === 'loading' || undefined}>
          {children}
        </div>
      )}
      {doneLabel && <p role="status" aria-live="polite" className="sr-only">{phase === 'done' && shown.current ? doneLabel : ''}</p>}
    </div>
  )
}

/**
 * Full-screen cover for sign-in → dashboard and sign-out → landing. It stays until the
 * destination is `settled` and every LoadingGate under it has its data, then crossfades away
 * while those gates reveal their content. awaitGate: the destination counts as rendered only
 * once a LoadingGate has mounted there (the route's loading.tsx alone is not the dashboard).
 */
export function TransitionOverlay({ show, settled, awaitGate = false, label, onGone }: {
  show: boolean; settled: boolean; awaitGate?: boolean; label: string; onGone: () => void
}) {
  const [fading, setFading] = useState(false)
  const waiting = useSyncExternalStore(subscribe, getWaiting, () => 0)
  const mounts = useSyncExternalStore(subscribe, getGateMounts, () => 0)
  const [mountsAtShow, setMountsAtShow] = useState(0)
  useEffect(() => { if (show) setMountsAtShow(getGateMounts()) }, [show])
  const arrived = settled && (!awaitGate || mounts > mountsAtShow)

  useEffect(() => { setOverlayUp(show && !fading) }, [show, fading])
  useEffect(() => () => setOverlayUp(false), [])
  useEffect(() => {
    if (!show || fading || !arrived || waiting > 0) return
    let live = true
    void afterPaint().then(() => { if (live) setFading(true) })
    return () => { live = false }
  }, [show, fading, arrived, waiting])
  // shortcut: if the destination never settles (e.g. a redirect back to /login), uncover after 10s.
  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(() => setFading(true), 10_000)
    return () => window.clearTimeout(t)
  }, [show])
  useEffect(() => {
    if (!fading) return
    const t = window.setTimeout(() => { setFading(false); onGone() }, FADE)
    return () => window.clearTimeout(t)
  }, [fading, onGone])

  if (!show) return null
  return (
    <div className="transition-overlay" data-state={fading ? 'fading' : 'loading'}>
      <LogoLoader size="page" label={label} />
    </div>
  )
}
