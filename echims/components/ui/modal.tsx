'use client'

// The one form modal. Desktop: centered panel, backdrop fades, panel scales in (~200ms).
// Phones: bottom sheet that slides up. Same header (title, short subtitle, close button), same
// footer (Cancel left/secondary, your actions right), same padding, max width and scrolling body.
// Esc, the backdrop, Cancel and the close button all close it; when something was typed or picked
// it asks "Discard changes?" first. Focus trap and focus return come from <ModalA11y/> (layout).
//   <Modal open={open} onClose={close} title="Record stock-in" subtitle="Adds a batch to inventory."
//     onSubmit={save} footer={<Button type="submit" loading={saving}>Save</Button>}>
//     …fields…
//   </Modal>

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './button'
import { useConfirm } from './confirm-dialog'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }
const DURATION = 200

export function Modal({
  open, onClose, title, subtitle, icon, size = 'md', children, footer, footerStart, onSubmit,
  cancelLabel = 'Cancel', hideCancel = false, busy = false, dirty, confirmDiscard = true, className, bodyClassName, belowHeader, bodyRef, noValidate, formRef,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  size?: keyof typeof SIZES
  children: ReactNode
  /** Right side of the footer: the primary action (and any secondary ones before it). */
  footer?: ReactNode
  /** Extra content on the left of the footer, after Cancel (e.g. "Recorded by you"). */
  footerStart?: ReactNode
  /** Wraps body and footer in a <form>; a type="submit" button in `footer` submits it. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  cancelLabel?: string
  hideCancel?: boolean
  /** While saving: closing is blocked. */
  busy?: boolean
  /** Override the automatic "something was typed" tracking. */
  dirty?: boolean
  /** Ask before closing with unsaved changes (default true). */
  confirmDiscard?: boolean
  className?: string
  bodyClassName?: string
  /** Between the header and the scrolling body (e.g. a stepper); does not scroll. */
  belowHeader?: ReactNode
  /** Ref to the scrolling body (e.g. to scroll to top on a step change). */
  bodyRef?: Ref<HTMLDivElement>
  /** Skip native form validation (the form validates itself). */
  noValidate?: boolean
  /** Ref to the <form> (with onSubmit), e.g. to read FormData. */
  formRef?: Ref<HTMLFormElement>
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const typed = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const subtitleId = useId()
  const confirm = useConfirm()

  // Mount → next frame show (enter animation); hide → unmount after the exit animation.
  if (open && !mounted) setMounted(true)
  if (!open && shown) setShown(false)
  useEffect(() => {
    if (open) {
      typed.current = false
      const f = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(f)
    }
    const t = setTimeout(() => setMounted(false), DURATION)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const el = panel.current
    const mark = () => { typed.current = true }
    el?.addEventListener('input', mark)
    el?.addEventListener('change', mark)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { el?.removeEventListener('input', mark); el?.removeEventListener('change', mark); document.body.style.overflow = prev }
  }, [mounted])

  const requestClose = async () => {
    if (busy) return
    const unsaved = dirty ?? typed.current
    if (unsaved && confirmDiscard && !(await confirm({
      title: 'Discard changes?', description: 'What you entered in this form will be lost.',
      confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'danger',
    }))) return
    onClose()
  }

  if (!mounted || typeof document === 'undefined') return null

  const body = (
    <>
      <div ref={bodyRef} className={cn('scroll-subtle min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
      {(footer || !hideCancel || footerStart) && (
        <div className="flex flex-col-reverse gap-2 border-t border-brand-line bg-brand-ice/50 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
            {!hideCancel && <Button variant="secondary" onClick={() => void requestClose()} disabled={busy}>{cancelLabel}</Button>}
            {footerStart}
          </div>
          {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">{footer}</div>}
        </div>
      )}
    </>
  )

  return createPortal(
    <div
      className={cn('fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4', 'transition-colors duration-200 motion-reduce:transition-none', shown ? 'bg-brand-navy/40 backdrop-blur-[2px]' : 'bg-brand-navy/0')}
      onMouseDown={(e) => { if (e.target === e.currentTarget) void requestClose() }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault() // ModalA11y skips handled keys
        void requestClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        className={cn(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white text-brand-navy shadow-[0_24px_48px_-12px_rgba(3,4,94,0.3)] sm:max-h-[min(90dvh,860px)] sm:rounded-2xl',
          'transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
          shown ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-8 opacity-0 sm:translate-y-0 sm:scale-95',
          SIZES[size], className,
        )}
      >
        <div className="flex items-start gap-3 border-b border-brand-line px-5 py-4 sm:px-6">
          {icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-mist text-brand-blue [&_svg]:size-5">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug">{title}</h2>
            {subtitle && <p id={subtitleId} className="mt-0.5 text-sm text-brand-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => void requestClose()} disabled={busy} aria-label="Close" className="-mr-1.5 rounded-lg p-1.5 text-brand-muted outline-none hover:bg-brand-ice hover:text-brand-navy focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {belowHeader}
        {onSubmit ? <form ref={formRef} noValidate={noValidate} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">{body}</form> : body}
      </div>
    </div>,
    document.body,
  )
}
