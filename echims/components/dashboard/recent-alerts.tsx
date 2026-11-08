'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// Latest open alerts for the signed-in user, from the same feed as the top-bar bell
// (/api/notifications is already scoped to the recipient).

import Link from 'next/link'
import useSWR from 'swr'
import { AlertCircle, AlertTriangle, ArrowRight, BellOff, Info } from 'lucide-react'

type Notification = {
  alert_id: number
  alert_type: string
  alert_message: string
  severity: string
  status: 'UNREAD' | 'READ' | 'RESOLVED'
  created_at: string
}

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load alerts.')
  return d as { notifications: Notification[] }
}

const SHOWN = 5

function timeAgo(value: string) {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

function tone(severity: string) {
  if (severity === 'CRITICAL' || severity === 'HIGH') return { icon: <AlertTriangle size={16} />, cls: 'bg-rose-50 text-rose-700' }
  if (severity === 'MEDIUM') return { icon: <AlertCircle size={16} />, cls: 'bg-amber-50 text-amber-700' }
  return { icon: <Info size={16} />, cls: 'bg-[#EAF6FA] text-[#0077B6]' }
}

function prettyType(type: string) {
  const t = type.replace(/_/g, ' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function RecentAlerts() {
  const { data, error, isLoading } = useSWR('/api/notifications', fetcher, { refreshInterval: 60_000 })
  const open = (data?.notifications ?? []).filter((n) => n.status !== 'RESOLVED')

  return (
    <section aria-labelledby="recent-alerts-heading" className="flex h-full flex-col rounded-2xl border border-[#DCEAF0] bg-white">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
        <div>
          <h2 id="recent-alerts-heading" className="text-lg font-bold">Recent alerts</h2>
          <p className="text-sm text-[#5B6478]">{data ? `${open.length} open` : 'Rule engine and system alerts'}</p>
        </div>
        <Link href="/alerts" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[#087DB9] transition-colors hover:bg-[#F4FBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">
          View all <ArrowRight size={14} />
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mx-5 mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 sm:mx-6">{error.message}</p>
      ) : isLoading ? (
        <ul className="space-y-2 px-5 pb-5 sm:px-6">
          {Array.from({ length: 3 }).map((_, i) => <li key={i} className="h-14 animate-pulse rounded-xl bg-[#F4FBFD]" />)}
        </ul>
      ) : open.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-4 text-center">
          <BellOff size={26} className="text-[#90E0EF]" />
          <p className="mt-3 font-semibold">No open alerts</p>
          <p className="mt-1 text-sm text-[#5B6478]">New alerts from the rule engine appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#EEF4F7] border-t border-[#EEF4F7]">
          {open.slice(0, SHOWN).map((n) => {
            const t = tone(n.severity)
            return (
              <li key={n.alert_id} className="flex gap-3 px-5 py-3.5 sm:px-6">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.cls}`}>{t.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold">
                      {n.status === 'UNREAD' && <span aria-label="Unread" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#087DB9] align-middle" />}
                      {prettyType(n.alert_type)}
                    </p>
                    <span className="shrink-0 text-xs text-[#8A93A6]">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-[#4B5563]">{n.alert_message}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
