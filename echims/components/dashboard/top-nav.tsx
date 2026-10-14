'use client'

// RPT-USR001 polish — Top navigation.
// Changes vs original:
//   • "Synced" chip replaced with a live Online/Offline indicator reading
//     navigator.onLine + online/offline events
//   • New Settings dropdown with a Log out action (moved from sidebar)
//   • Notifications bell untouched (same component, same behavior)

import {
  Bell, CheckCheck, Loader2, RefreshCw, X,
  Settings as SettingsIcon, LogOut, User as UserIcon, Wifi, WifiOff,
} from 'lucide-react'
import {
  useCallback, useEffect, useId, useRef, useState,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'

type Notification = {
  alert_id: number
  alert_type: string
  alert_message: string
  severity: string
  status: 'UNREAD' | 'READ' | 'RESOLVED'
  created_at: string
  read_at: string | null
  source_module: string | null
  schedule_id: number | null
  child_id: number | null
}

function notificationTarget(item: Notification): { href: string; label: string } | null {
  if (item.source_module === 'SUPPLEMENTATION' && typeof item.child_id === 'number' && item.child_id > 0) {
    return { href: `/child-profiling/children/${item.child_id}`, label: 'View child record' }
  }
  if (item.source_module === 'HEALTH_ACTIVITY' && typeof item.schedule_id === 'number' && item.schedule_id > 0) {
    return { href: '/health-activities', label: 'View activities' }
  }
  return null
}

async function readResponse(response: Response) {
  const ct = response.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) throw new Error(`Notification API returned HTTP ${response.status} instead of JSON.`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Unable to process notifications.')
  return data
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function TopNav() {
  const router = useRouter()
  const { logout, user } = useAuth()
  const dropdownId = useId()
  const settingsMenuId = useId()
  const [today, setToday] = useState('')
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const loadController = useRef<AbortController | null>(null)
  const mutationBusy = useRef(false)

  // ─── Online / offline detection ─────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setOnline(navigator.onLine)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ─── Notifications polling ─────────────────────────────────────────
  const loadNotifications = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store', signal: controller.signal })
      const data = await readResponse(response)
      if (controller.signal.aborted) return
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Unable to load notifications.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    function refresh() {
      if (document.hidden) return
      setToday(new Date().toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }))
      void loadNotifications()
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      loadController.current?.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [loadNotifications])

  // ─── Outside-click + Escape handlers for both dropdowns ─────────────
  useEffect(() => {
    if (!open && !settingsOpen) return
    function handleOutside(e: PointerEvent) {
      if (e.target instanceof Node) {
        if (open && !containerRef.current?.contains(e.target)) setOpen(false)
        if (settingsOpen && !settingsRef.current?.contains(e.target)) setSettingsOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setSettingsOpen(false); bellRef.current?.focus() }
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, settingsOpen])

  async function updateNotifications(
    payload: { alertId: number; status: 'READ' | 'UNREAD' } | { action: 'MARK_ALL_READ' },
  ): Promise<boolean> {
    if (mutationBusy.current) return false
    mutationBusy.current = true; setSaving(true); setError('')
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      await readResponse(response)
      await loadNotifications()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update notification.')
      return false
    } finally {
      mutationBusy.current = false; setSaving(false)
    }
  }

  async function viewNotification(item: Notification) {
    const target = notificationTarget(item)
    if (!target) return
    if (item.status === 'UNREAD') {
      const ok = await updateNotifications({ alertId: item.alert_id, status: 'READ' })
      if (!ok) return
    }
    setOpen(false)
    router.push(target.href)
  }

  async function handleLogout() {
    await logout()
    window.location.replace('/')
  }

  return (
    <div className="flex h-20 items-center justify-between border-b border-[#E5E7EB] bg-white px-4 shadow-sm sm:px-8">
      {/* Date */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[#6B7280]">Today</p>
        <p className="text-sm font-medium text-[#03045E]">{today || '—'}</p>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Online/offline indicator */}
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
          online ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
        }`} title={online ? 'Online — changes sync in real time' : 'Offline — changes are queued locally'}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{online ? 'Online' : 'Offline'}</span>
        </div>

        {/* Notifications */}
        <div ref={containerRef} className="relative">
          <button ref={bellRef} type="button"
            aria-label={`Notifications, ${unreadCount} unread`}
            aria-expanded={open} aria-controls={dropdownId}
            onClick={() => { const next = !open; setOpen(next); if (next) void loadNotifications() }}
            className="relative rounded-full p-2.5 text-[#03045E] transition hover:bg-[#F3F4F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
            <Bell size={22} />
            {unreadCount > 0 && (
              <span aria-hidden="true"
                className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <section id={dropdownId} aria-label="Notifications"
              className="absolute right-0 top-full z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="font-bold text-[#03045E]">Notifications</h2>
                  <p aria-live="polite" className="text-xs text-slate-500">{unreadCount} unread</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Refresh" disabled={loading || saving}
                    onClick={() => void loadNotifications()}
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                  <button type="button" aria-label="Close"
                    onClick={() => { setOpen(false); bellRef.current?.focus() }}
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                    <X size={17} />
                  </button>
                </div>
              </div>
              <div className="flex justify-end border-b border-slate-100 px-4 py-2">
                <button type="button"
                  disabled={saving || loading || unreadCount === 0}
                  onClick={() => void updateNotifications({ action: 'MARK_ALL_READ' })}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087DB9] disabled:opacity-40">
                  <CheckCheck size={15} /> Mark all read
                </button>
              </div>
              {error && (
                <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>
              )}
              <div className="max-h-[60vh] overflow-y-auto">
                {loading && notifications.length === 0 ? (
                  <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                    <Loader2 size={18} className="animate-spin" /> Loading…
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    <Bell size={28} className="mx-auto mb-3 text-slate-300" />
                    {error ? 'Notifications could not be loaded.' : 'No notifications yet.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {notifications.map((item) => (
                      <li key={item.alert_id} className={`p-4 ${item.status === 'UNREAD' ? 'bg-[#F0FAFD]' : 'bg-white'}`}>
                        <div className="flex items-start gap-2">
                          {item.status === 'UNREAD' && (
                            <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-[#087DB9]" />
                          )}
                          <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">
                            {item.alert_message}
                          </p>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{formatTimestamp(item.created_at)}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                          {notificationTarget(item) && (
                            <button type="button" disabled={saving} onClick={() => void viewNotification(item)}
                              className="text-xs font-semibold text-[#087DB9] hover:underline disabled:opacity-50">
                              {notificationTarget(item)?.label}
                            </button>
                          )}
                          {item.status !== 'RESOLVED' && (
                            <button type="button" disabled={saving}
                              onClick={() => void updateNotifications({ alertId: item.alert_id, status: item.status === 'UNREAD' ? 'READ' : 'UNREAD' })}
                              className="text-xs font-medium text-slate-500 hover:text-[#087DB9] disabled:opacity-50">
                              {item.status === 'UNREAD' ? 'Mark read' : 'Mark unread'}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                Latest 50 notifications · Refreshes every 30 seconds while this tab is visible
              </p>
            </section>
          )}
        </div>

        {/* Settings menu (contains Logout) */}
        <div ref={settingsRef} className="relative">
          <button type="button" aria-label="Settings menu" aria-expanded={settingsOpen} aria-controls={settingsMenuId}
            onClick={() => setSettingsOpen((s) => !s)}
            className="rounded-full p-2.5 text-[#03045E] transition hover:bg-[#F3F4F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
            <SettingsIcon size={22} />
          </button>
          {settingsOpen && (
            <section id={settingsMenuId} aria-label="Settings"
              className="absolute right-0 top-full z-50 mt-3 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="truncate text-sm font-semibold text-[#03045E]">{user?.fullName ?? 'Account'}</p>
                <p className="truncate text-xs text-slate-500">{user?.role ?? ''}</p>
              </div>
              <ul className="py-1 text-sm">
                <li>
                  <Link href="/settings" onClick={() => setSettingsOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50">
                    <UserIcon size={14} /> Profile & settings
                  </Link>
                </li>
                <li>
                  <button type="button" onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-rose-700 hover:bg-rose-50">
                    <LogOut size={14} /> Log out
                  </button>
                </li>
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
