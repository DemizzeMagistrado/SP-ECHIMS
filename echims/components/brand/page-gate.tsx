'use client'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { SWRConfig, type Middleware } from 'swr'
import { LoadingGate } from './loading-gate'
import { LogoLoader } from './logo-loader'
import { afterPaint } from './loader-state'

type Report = (id: symbol, loading: boolean) => void
const PendingContext = createContext<Report | null>(null)

/** Holds the page (and the tab panel it is in) while `loading` is true. For data not loaded through SWR. */
export function usePageLoading(loading: boolean) {
  const report = useContext(PendingContext)
  const [id] = useState(() => Symbol('pending'))
  useEffect(() => { report?.(id, loading) }, [report, id, loading])
  useEffect(() => () => report?.(id, false), [report, id])
}

/** Fallback for next/dynamic and Suspense: the page waits for the lazy chunk instead of revealing without it. */
export function PagePending() {
  usePageLoading(true)
  return null
}

// Every useSWR under a page reports its first load (no data yet). Later key changes, background
// revalidation and cached revisits never hold the page.
const trackFirstLoad: Middleware = (useSWRNext) => (key, fetcher, config) => {
  const swr = useSWRNext(key, fetcher, config)
  usePageLoading(swr.isLoading && swr.data === undefined)
  return swr
}

/** A set of pending ids that also forwards to the enclosing gate, so a page waits for its first tab. */
function usePending() {
  const parent = useContext(PendingContext)
  const [pending, setPending] = useState<ReadonlySet<symbol>>(() => new Set())
  const report = useCallback<Report>((id, loading) => {
    setPending((p) => {
      if (p.has(id) === loading) return p
      const next = new Set(p)
      if (loading) next.add(id); else next.delete(id)
      return next
    })
    parent?.(id, loading)
  }, [parent])
  return [pending.size, report] as const
}

/**
 * One loading state per page (used by the dashboard template, so every module gets it). The page
 * renders hidden while all of its first data loads in parallel, then appears in one entrance.
 * Focus then moves to the page's h1 and its title is announced.
 */
export function PageGate({ children }: { children: ReactNode }) {
  const [pending, report] = usePending()
  // Children report in their effects, which run before this one: one render later all have reported.
  const [armed, setArmed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    setArmed(true)
    // shortcut: a request that never settles stops holding the page after 10s; that section shows its own state.
    const t = window.setTimeout(() => setTimedOut(true), 10_000)
    return () => window.clearTimeout(t)
  }, [])
  const box = useRef<HTMLDivElement>(null)
  const onDone = useCallback(() => {
    const heading = box.current?.querySelector('h1')
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }
    setAnnounce(`${heading?.textContent?.trim() || document.title} loaded`)
  }, [])

  return (
    <PendingContext.Provider value={report}>
      {/* Revisits within 10s reuse cached data without refetching; older data shows at once and refreshes quietly. */}
      <SWRConfig value={{ use: [trackFirstLoad], dedupingInterval: 10_000 }}>
        <div ref={box}>
          <LoadingGate ready={(armed && pending === 0) || timedOut} className="page-gate" doneLabel="" onDone={onDone}>
            {children}
          </LoadingGate>
        </div>
        <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      </SWRConfig>
    </PendingContext.Provider>
  )
}

/**
 * Content of an in-page tab. On a tab change it keeps the previous panel's height, hides the new
 * content until its data is in, then fades it in (no layout jump). A slow tab shows the small
 * logo loader in the reserved space.
 */
export function TabPanel({ tabKey, children }: { tabKey: string; children: ReactNode }) {
  const [pending, report] = usePending()
  const panel = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const [minHeight, setMinHeight] = useState<number | undefined>()
  const [armedFor, setArmedFor] = useState<string | null>(null)

  // Before the new tab paints: hold the old height and hide the new content.
  useLayoutEffect(() => {
    setMinHeight((h) => (panel.current ? panel.current.offsetHeight : h))
    setShown(false)
  }, [tabKey])
  useEffect(() => { setArmedFor(tabKey) }, [tabKey])

  const ready = armedFor === tabKey && pending === 0
  useEffect(() => {
    if (!ready || shown) return
    let live = true
    void afterPaint().then(() => { if (live) setShown(true) })
    return () => { live = false }
  }, [ready, shown])
  // Release the reserved height once the new content has faded in.
  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => setMinHeight(undefined), 200)
    return () => window.clearTimeout(t)
  }, [shown])

  return (
    <PendingContext.Provider value={report}>
      <div ref={panel} className="tab-panel" data-shown={shown} style={{ minHeight }}>
        {!shown && <div className="tab-loader"><LogoLoader size="section" /></div>}
        <div className="tab-content" aria-hidden={!shown || undefined}>{children}</div>
      </div>
    </PendingContext.Provider>
  )
}
