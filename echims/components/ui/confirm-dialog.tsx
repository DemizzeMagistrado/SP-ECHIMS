'use client'

// Styled replacement for window.confirm. <ConfirmHost /> is mounted once in the root layout.
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Delete this draft?', tone: 'danger', confirmLabel: 'Delete' }))) return
// Pass `action` to keep the dialog open with a loading button while it runs; if it throws, the
// dialog closes and the returned promise rejects with that error.
// Uses the native modal <dialog>: the page behind is inert, Esc cancels, focus returns to the trigger.

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AlertTriangle, HelpCircle, Loader2 } from 'lucide-react'

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  action?: () => unknown | Promise<unknown>
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void; reject: (err: unknown) => void; trigger: HTMLElement | null }

let current: Request | null = null
const listeners = new Set<() => void>()
const set = (r: Request | null) => {
  // The dialog unmounts rather than closing, so hand focus back to the trigger ourselves.
  if (!r) current?.trigger?.focus({ preventScroll: true })
  current = r
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function confirm(options: ConfirmOptions) {
  current?.resolve(false) // a newer request replaces an unanswered one
  current = null
  return new Promise<boolean>((resolve, reject) => set({ ...options, resolve, reject, trigger: document.activeElement as HTMLElement | null }))
}

export function useConfirm() {
  return confirm
}

export function ConfirmHost() {
  const request = useSyncExternalStore(subscribe, () => current, () => null)
  const [busy, setBusy] = useState(false)
  if (!request) return null
  const finish = (ok: boolean) => { set(null); request.resolve(ok) }
  return (
    <ConfirmDialog
      open
      {...request}
      loading={busy}
      onCancel={() => finish(false)}
      onConfirm={async () => {
        if (!request.action) return finish(true)
        setBusy(true)
        try {
          await request.action()
          finish(true)
        } catch (err) {
          set(null)
          request.reject(err)
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}

export function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', loading = false, onConfirm, onCancel,
}: Omit<ConfirmOptions, 'action'> & { open: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const danger = tone === 'danger'
  const Icon = danger ? AlertTriangle : HelpCircle
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby={description ? 'confirm-description' : undefined}
      onCancel={(e) => { e.preventDefault(); if (!loading) onCancel() }}
      // A click on the dialog box itself (not its content) is a click on the backdrop.
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-brand-navy shadow-[0_24px_48px_-12px_rgba(3,4,94,0.25)] backdrop:bg-brand-navy/40 backdrop:backdrop-blur-[2px] open:animate-in open:fade-in open:zoom-in-95 open:duration-200"
    >
      <div className="flex items-start gap-4 p-6">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-danger-soft text-danger' : 'bg-brand-mist text-brand-blue'}`}>
          <Icon size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <h2 id="confirm-title" className="font-display text-lg font-bold leading-snug">{title}</h2>
          {description && <div id="confirm-description" className="mt-1.5 text-sm leading-6 text-brand-muted">{description}</div>}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-brand-line bg-brand-ice/50 px-6 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-ice disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          autoFocus={!danger}
          aria-busy={loading || undefined}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-70 ${danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary/90'}`}
        >
          {loading && <Loader2 size={16} aria-hidden="true" className="animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
