'use client'

// App-wide toasts. <Toaster /> is mounted once in the root layout; call the helpers from anywhere
// (components, event handlers, plain modules):
//   toast.success('Changes saved')
//   toast.error('Save failed: …')      // stays until closed
//   toast.info('…'), toast.warning('…')
// Bottom-right on desktop, top-center on mobile. At most 3 on screen; the oldest drops first.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

type Variant = 'success' | 'error' | 'info' | 'warning'
type Toast = { id: number; variant: Variant; message: string }
type Options = { durationMs?: number }

const MAX = 3
let toasts: Toast[] = []
let nextId = 0
const listeners = new Set<() => void>()
const timers = new Map<number, number>()

function emit() { listeners.forEach((l) => l()) }

function dismiss(id: number) {
  window.clearTimeout(timers.get(id))
  timers.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function show(variant: Variant, message: string, { durationMs }: Options = {}) {
  const id = ++nextId
  toasts = [...toasts, { id, variant, message }]
  while (toasts.length > MAX) dismiss(toasts[0].id)
  // Errors stay until closed unless a duration is given.
  const duration = durationMs ?? (variant === 'error' ? 0 : 4000)
  if (duration > 0) timers.set(id, window.setTimeout(() => dismiss(id), duration))
  emit()
  return id
}

export const toast = {
  success: (message: string, options?: Options) => show('success', message, options),
  error: (message: string, options?: Options) => show('error', message, options),
  info: (message: string, options?: Options) => show('info', message, options),
  warning: (message: string, options?: Options) => show('warning', message, options),
  dismiss,
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getToasts = () => toasts
const noToasts: Toast[] = []

const STYLES: Record<Variant, { icon: typeof Info; box: string; icon_: string }> = {
  success: { icon: CheckCircle2, box: 'border-good/20 bg-good-soft', icon_: 'text-good' },
  error: { icon: XCircle, box: 'border-danger/20 bg-danger-soft', icon_: 'text-danger' },
  warning: { icon: AlertTriangle, box: 'border-warn/20 bg-warn-soft', icon_: 'text-warn' },
  info: { icon: Info, box: 'border-brand-sky/20 bg-brand-ice', icon_: 'text-brand-sky' },
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, getToasts, () => noToasts)
  return (
    <div
      aria-live="polite"
      className="print-hide pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:right-6 sm:flex-col-reverse sm:items-end sm:gap-3"
    >
      {list.map((t) => <ToastCard key={t.id} toast={t} />)}
    </div>
  )
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setVisible(true) }, [])
  const { icon: Icon, box, icon_ } = STYLES[t.variant]
  return (
    <div
      role={t.variant === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-brand-navy shadow-[0_8px_24px_-8px_rgba(3,4,94,0.18)] transition-all duration-200 motion-reduce:transition-none sm:min-w-[300px] ${box} ${visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
    >
      <Icon size={20} aria-hidden="true" className={`mt-px shrink-0 ${icon_}`} />
      <p className="flex-1 text-sm font-medium">{t.message}</p>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-md p-1 text-brand-muted hover:bg-black/5 hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
