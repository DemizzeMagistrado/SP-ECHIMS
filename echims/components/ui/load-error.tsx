'use client'

// A list or page that could not load: plain-language message and a "Try again" button instead of
// a dead end. The technical error goes to the browser console (as a warning) only.
//   {error && !data && <LoadError what="vaccination records" error={error} onRetry={() => mutate()} />}

import { useEffect } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from './button'

function plain(error: unknown, what: string): string {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: unknown }).status) : 0
  if (status === 401) return 'Your session has ended. Sign in again, then reopen this page.'
  if (status === 403) return `Your account cannot view ${what}. Ask your administrator if you need access.`
  if (typeof navigator !== 'undefined' && !navigator.onLine) return `You are offline and ${what} were not saved on this device yet. Reconnect and try again.`
  return `Something went wrong while loading ${what}. Try again; if it keeps happening, tell your administrator.`
}

export function LoadError({ what, error, onRetry, retrying = false }: { what: string; error: unknown; onRetry: () => void; retrying?: boolean }) {
  // warn, not error: the failure is already shown on screen, so it must not raise the dev error overlay.
  useEffect(() => { console.warn(`Could not load ${what}:`, error) }, [what, error])
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-brand-navy">
        <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
        <span><span className="font-semibold">We couldn&rsquo;t load {what}.</span> {plain(error, what)}</span>
      </p>
      <Button variant="tonal" size="sm" loading={retrying} onClick={onRetry}><RotateCw size={14} aria-hidden="true" /> Try again</Button>
    </div>
  )
}
