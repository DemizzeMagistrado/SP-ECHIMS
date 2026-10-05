'use client'

// Lightweight toast system. Fixed to the lower-right of the viewport.
// Usage:
//   <ToastProvider>...</ToastProvider>   // mount once near the root
//   const { showToast } = useToast()
//   showToast({ type: 'success', message: 'Changes saved' })
//   showToast({ type: 'error', message: 'Save failed: ...' })
// Toasts auto-dismiss after 4s. User can dismiss manually by clicking X.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error'
type Toast = { id: number; type: ToastType; message: string }

type ToastContextValue = {
  showToast: (toast: { type: ToastType; message: string; durationMs?: number }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within <ToastProvider>')
  return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback<ToastContextValue['showToast']>((input) => {
    const id = ++nextId.current
    setToasts((prev) => [...prev, { id, type: input.type, message: input.message }])
    const duration = input.durationMs ?? 4000
    window.setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast stack — fixed to lower-right, newest on top */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex max-w-sm flex-col-reverse gap-3">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Slight entry animation using Tailwind — scale + fade in
  const [visible, setVisible] = useState(false)
  useEffect(() => { setVisible(true) }, [])

  const styles = toast.type === 'success'
    ? { icon: <CheckCircle2 size={20} className="text-emerald-600" />, border: 'border-emerald-200', bg: 'bg-white', ring: 'ring-emerald-100' }
    : { icon: <XCircle size={20} className="text-red-600" />, border: 'border-red-200', bg: 'bg-white', ring: 'ring-red-100' }

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex min-w-[280px] items-start gap-3 rounded-xl border ${styles.border} ${styles.bg} px-4 py-3 shadow-lg ring-4 ${styles.ring} transition-all duration-200 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
    >
      <div className="shrink-0 pt-0.5">{styles.icon}</div>
      <p className="flex-1 text-sm font-medium text-foreground">{toast.message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">
        <X size={16} />
      </button>
    </div>
  )
}