'use client'

import { useState } from 'react'

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

function activityLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// NIP-USR012 — Centralized activity type → color mapping. Used by both the
// per-event tile styles and the legend below the calendar header. Each type
// gets a distinct hue so staff can scan a dense month view and tell apart
// vaccinations, nutritional assessments, and supplementation at a glance.
const ACTIVITY_TYPE_COLORS: Record<string, {
  label: string
  tile: string           // tailwind classes for the event tile
  dot: string            // small dot in the legend
}> = {
  VACCINATION: {
    label: 'Vaccination',
    tile: 'border-sky-300 bg-sky-50 text-sky-900',
    dot: 'bg-sky-500',
  },
  NUTRITIONAL_ASSESSMENT: {
    label: 'Nutritional assessment',
    tile: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-500',
  },
  SUPPLEMENTATION: {
    label: 'Supplementation',
    tile: 'border-violet-300 bg-violet-50 text-violet-900',
    dot: 'bg-violet-500',
  },
}

const DEFAULT_ACTIVITY_STYLE = {
  tile: 'border-slate-200 bg-slate-50 text-slate-900',
  dot: 'bg-slate-500',
}

function activityStyle(value: string) {
  return ACTIVITY_TYPE_COLORS[value]?.tile ?? DEFAULT_ACTIVITY_STYLE.tile
}

function statusStyle(value: string) {
  switch (value) {
    case 'APPROVED':
      return 'bg-green-100 text-green-800'
    case 'PENDING':
      return 'bg-amber-100 text-amber-800'
    case 'ONGOING':
      return 'bg-blue-100 text-blue-800'
    case 'COMPLETED':
      return 'bg-slate-200 text-slate-800'
    case 'REJECTED':
    case 'CANCELLED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export default function HealthActivityCalendar<T extends CalendarActivity>({
  activities,
  onSelectActivity,
}: Props<T>) {
  const [view, setView] = useState<CalendarView>('MONTH')
  const [currentDate, setCurrentDate] = useState(() => new Date())

  const today = dateKey(new Date())
  const weekStart = startOfWeek(currentDate)

  const monthStart = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  )

  const monthEnd = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  )

  const gridStart = startOfWeek(monthStart)
  const monthCellCount =
    Math.ceil((monthStart.getDay() + monthEnd.getDate()) / 7) * 7

  const visibleDates =
    view === 'MONTH'
      ? Array.from({ length: monthCellCount }, (_, index) =>
          addDays(gridStart, index),
        )
      : view === 'WEEK'
        ? Array.from({ length: 7 }, (_, index) =>
            addDays(weekStart, index),
          )
        : [currentDate]

  const heading =
    view === 'MONTH'
      ? currentDate.toLocaleDateString('en-PH', {
          month: 'long',
          year: 'numeric',
        })
      : view === 'WEEK'
        ? `${weekStart.toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })} – ${addDays(weekStart, 6).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}`
        : currentDate.toLocaleDateString('en-PH', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })

  function navigate(direction: number) {
    setCurrentDate((previous) => {
      if (view === 'MONTH') {
        // Use day 1 so navigating from the 31st cannot skip a month.
        return new Date(
          previous.getFullYear(),
          previous.getMonth() + direction,
          1,
        )
      }

      return addDays(previous, direction * (view === 'WEEK' ? 7 : 1))
    })
  }

  function renderActivity(activity: T) {
    const barangay = Array.isArray(activity.barangay)
      ? activity.barangay[0]
      : activity.barangay

    const start = formatTime(activity.start_time)
    const end = formatTime(activity.end_time)
    const time = start && end ? `${start} – ${end}` : start || end

    return (
      <button
        key={activity.schedule_id}
        type="button"
        onClick={() => onSelectActivity(activity)}
        className={`w-full rounded-lg border p-2 text-left transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${activityStyle(
          activity.activity_type,
        )}`}
      >
        <p className="break-words text-xs font-semibold">
          {activity.conflict_status === 'DETECTED' && (
            <span aria-label="Scheduling conflict" title="Scheduling conflict">
              ⚠{' '}
            </span>
          )}
          {activityLabel(activity.activity_type)}
        </p>

        <p className="mt-1 text-xs">{time || 'Time not specified'}</p>

        <p className="mt-1 break-words text-xs">
          {barangay?.barangay_name ?? 'Barangay not specified'}
        </p>

        <span
          className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusStyle(
            activity.status,
          )}`}
        >
          {activityLabel(activity.status)}
        </span>
      </button>
    )
  }

  return (
    <section
      aria-label="Health activity calendar"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Previous ${view.toLowerCase()}`}
            onClick={() => navigate(-1)}
            className="rounded-lg border px-3 py-2 hover:bg-slate-50"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            Today
          </button>

          <button
            type="button"
            aria-label={`Next ${view.toLowerCase()}`}
            onClick={() => navigate(1)}
            className="rounded-lg border px-3 py-2 hover:bg-slate-50"
          >
            ›
          </button>
        </div>

        <h2 aria-live="polite" className="text-lg font-semibold text-slate-900">
          {heading}
        </h2>

        <div
          role="group"
          aria-label="Calendar view"
          className="flex gap-1 rounded-lg bg-slate-100 p-1"
        >
          {(['MONTH', 'WEEK', 'DAY'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                view === option
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {activityLabel(option)}
            </button>
          ))}
        </div>
      </div>

      {/* NIP-USR012 — Color legend so staff can tell apart activity types at a
          glance when a dense month view is on screen. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-slate-50/40 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Legend:
        </span>
        {Object.entries(ACTIVITY_TYPE_COLORS).map(([type, meta]) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
            <span className={`inline-block size-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
            {meta.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className={view === 'DAY' ? '' : 'min-w-[840px]'}>
          {view !== 'DAY' && (
            <div className="grid grid-cols-7 border-b bg-slate-50">
              {weekdays.map((day) => (
                <div
                  key={day}
                  className="p-3 text-center text-xs font-semibold text-slate-600"
                >
                  {day}
                </div>
              ))}
            </div>
          )}

          <div className={view === 'DAY' ? '' : 'grid grid-cols-7'}>
            {visibleDates.map((date) => {
              const key = dateKey(date)
              const isToday = key === today
              const isOutsideMonth =
                view === 'MONTH' &&
                date.getMonth() !== currentDate.getMonth()

              const dayActivities = activities
                .filter((activity) => activity.schedule_date === key)
                .sort(
                  (a, b) =>
                    (a.start_time ?? '99:99').localeCompare(
                      b.start_time ?? '99:99',
                    ) || a.schedule_id - b.schedule_id,
                )

              return (
                <div
                  key={key}
                  className={`border-b border-r p-2 ${
                    view === 'MONTH' ? 'min-h-[160px]' : 'min-h-[300px]'
                  } ${isOutsideMonth ? 'bg-slate-50' : 'bg-white'}`}
                >
                  <div className="mb-2">
                    <button
                      type="button"
                      aria-label={`View activities for ${date.toLocaleDateString(
                        'en-PH',
                        {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        },
                      )}`}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => {
                        setCurrentDate(new Date(date))
                        setView('DAY')
                      }}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                        isToday
                          ? 'bg-blue-600 text-white'
                          : isOutsideMonth
                            ? 'text-slate-400 hover:bg-slate-200'
                            : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {view === 'MONTH'
                        ? date.getDate()
                        : date.toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                          })}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {dayActivities.map(renderActivity)}

                    {dayActivities.length === 0 && view !== 'MONTH' && (
                      <p className="p-2 text-xs text-slate-400">
                        No activities.
                      </p>
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