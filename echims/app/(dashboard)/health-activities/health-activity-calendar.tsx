'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { REPORT_CARD } from '@/components/ui/report-parts'
import { cn } from '@/lib/utils'
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, statusMeta, typeMeta } from './activity-meta'

type CalendarView = 'MONTH' | 'WEEK' | 'DAY'

type CalendarActivity = {
  schedule_id: number
  activity_type: string
  schedule_date: string
  start_time: string | null
  end_time: string | null
  status: string
  conflict_status?: string
  barangay:
    | { barangay_name: string }
    | { barangay_name: string }[]
    | null
}

type Props<T extends CalendarActivity> = {
  activities: T[]
  onSelectActivity: (activity: T) => void
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'MONTH', label: 'Month' },
  { value: 'WEEK', label: 'Week' },
  { value: 'DAY', label: 'Day' },
]

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay())
}

function formatTime(value: string | null) {
  if (!value) return ''

  const [hour, minute] = value.split(':').map(Number)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value
  }

  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export default function HealthActivityCalendar<T extends CalendarActivity>({
  activities,
  onSelectActivity,
}: Props<T>) {
  const [view, setView] = useState<CalendarView>('MONTH')
  const [currentDate, setCurrentDate] = useState(() => new Date())

  const today = dateKey(new Date())
  const weekStart = startOfWeek(currentDate)

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

  const gridStart = startOfWeek(monthStart)
  const monthCellCount = Math.ceil((monthStart.getDay() + monthEnd.getDate()) / 7) * 7

  const visibleDates =
    view === 'MONTH'
      ? Array.from({ length: monthCellCount }, (_, index) => addDays(gridStart, index))
      : view === 'WEEK'
        ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
        : [currentDate]

  const heading =
    view === 'MONTH'
      ? currentDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
      : view === 'WEEK'
        ? `${weekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : currentDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  function navigate(direction: number) {
    setCurrentDate((previous) => {
      if (view === 'MONTH') {
        // Use day 1 so navigating from the 31st cannot skip a month.
        return new Date(previous.getFullYear(), previous.getMonth() + direction, 1)
      }

      return addDays(previous, direction * (view === 'WEEK' ? 7 : 1))
    })
  }

  function renderActivity(activity: T) {
    const barangay = Array.isArray(activity.barangay) ? activity.barangay[0] : activity.barangay
    const start = formatTime(activity.start_time)
    const end = formatTime(activity.end_time)
    const time = start && end ? `${start} – ${end}` : start || end
    const type = typeMeta(activity.activity_type)
    const status = statusMeta(activity.status)

    return (
      <button
        key={activity.schedule_id}
        type="button"
        onClick={() => onSelectActivity(activity)}
        className="w-full rounded-[10px] border border-brand-line bg-white p-2 text-left shadow-[0_1px_2px_rgba(12,18,96,0.06)] transition-colors duration-150 hover:border-brand-navy/40 hover:bg-brand-ice focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-link"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
          <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', type.dot)} />
          <span className="min-w-0 break-words">{type.short}</span>
          {activity.conflict_status === 'DETECTED' && (
            <AlertTriangle size={12} className="ml-auto shrink-0 text-review" aria-label="Scheduling conflict" />
          )}
        </span>
        <span className="mt-1 block text-xs text-brand-muted">{time || 'Time not specified'}</span>
        <span className="mt-0.5 block break-words text-xs text-brand-muted">{barangay?.barangay_name ?? 'Barangay not specified'}</span>
        <StatusBadge status={activity.status} tone={status.tone} label={status.label} className="mt-1.5 px-2 py-0.5 text-[11px]" />
      </button>
    )
  }

  return (
    <section aria-label="Health activity calendar" className={REPORT_CARD}>
      {/* Toolbar: navigation left, period centre, view switch right; wraps on a phone. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-brand-line/70 p-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label={`Previous ${view.toLowerCase()}`} onClick={() => navigate(-1)}>
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" aria-label={`Next ${view.toLowerCase()}`} onClick={() => navigate(1)}>
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>

        <h3 aria-live="polite" className="min-w-0 flex-1 text-base font-semibold text-brand-navy sm:text-center">
          {heading}
        </h3>

        <div role="group" aria-label="Calendar view" className="inline-flex rounded-[10px] border border-control-line bg-white p-0.5">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => setView(option.value)}
              className={cn(
                'h-9 rounded-lg px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-link',
                view === option.value ? 'bg-primary text-white' : 'text-brand-navy hover:bg-brand-ice',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend: the same type colours as the table pills. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-brand-line/70 px-4 py-2.5">
        {ACTIVITY_TYPES.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-xs text-brand-muted">
            <span aria-hidden="true" className={cn('size-2.5 rounded-full', ACTIVITY_TYPE_META[type].dot)} />
            {ACTIVITY_TYPE_META[type].label}
          </span>
        ))}
      </div>

      <div className="scroll-subtle overflow-x-auto">
        {/* Re-keyed per period and view so each change fades in instead of snapping. */}
        <div key={`${view}|${dateKey(view === 'MONTH' ? monthStart : view === 'WEEK' ? weekStart : currentDate)}`} className={cn('animate-in fade-in duration-200 motion-reduce:animate-none', view !== 'DAY' && 'min-w-[840px]')}>
          {view !== 'DAY' && (
            <div className="grid grid-cols-7 border-b border-brand-line/70 bg-[var(--group-a)]">
              {weekdays.map((day) => (
                <div key={day} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  {day}
                </div>
              ))}
            </div>
          )}

          <div className={view === 'DAY' ? '' : 'grid grid-cols-7'}>
            {visibleDates.map((date, index) => {
              const key = dateKey(date)
              const isToday = key === today
              const isOutsideMonth = view === 'MONTH' && date.getMonth() !== currentDate.getMonth()

              const dayActivities = activities
                .filter((activity) => activity.schedule_date === key)
                .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') || a.schedule_id - b.schedule_id)

              return (
                <div
                  key={key}
                  className={cn(
                    'border-brand-line/70 p-2',
                    view !== 'DAY' && 'border-b',
                    view !== 'DAY' && index % 7 !== 6 && 'border-r',
                    view === 'MONTH' ? 'min-h-[140px]' : 'min-h-[300px]',
                    isOutsideMonth ? 'bg-[var(--row-zebra)]' : 'bg-white',
                  )}
                >
                  <div className="mb-2">
                    <button
                      type="button"
                      aria-label={`View activities for ${date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => {
                        setCurrentDate(new Date(date))
                        setView('DAY')
                      }}
                      className={cn(
                        'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-link',
                        isToday ? 'bg-primary text-white' : isOutsideMonth ? 'text-brand-muted hover:bg-brand-ice' : 'text-brand-navy hover:bg-brand-ice',
                      )}
                    >
                      {view === 'MONTH' ? date.getDate() : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {dayActivities.map(renderActivity)}

                    {dayActivities.length === 0 && view !== 'MONTH' && (
                      <p className="p-2 text-xs text-brand-muted">No activities.</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
