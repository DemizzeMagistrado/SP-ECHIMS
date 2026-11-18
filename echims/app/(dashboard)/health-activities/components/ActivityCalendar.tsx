'use client'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, activityTypeMeta } from '@/lib/constants/activity-types'
import { type Activity, activityName, addDays, dateKey, formatTime, formatTimeRange, getBarangayName, minutesOf } from './activity-utils'
import { ActivityStatusBadge } from './StatusBadge'

type View = 'MONTH' | 'WEEK'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3
const HOUR_PX = 44

const startOfWeek = (date: Date) => addDays(date, -date.getDay())
const byTime = (a: Activity, b: Activity) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.schedule_id - b.schedule_id
const tentative = (a: Activity) => a.status === 'PENDING' || a.status === 'NEEDS_REVISION'
const shortTime = (value: string | null) => formatTime(value).replace(':00', '').replace(' ', '').toLowerCase()

/** Chip / block colours: type tint with a type bar; hollow + dashed while awaiting approval; faded when cancelled. */
function eventStyle(activity: Activity) {
  const type = activityTypeMeta(activity.activity_type)
  return tentative(activity)
    ? { backgroundColor: '#FFFFFF', borderColor: type.fg, borderLeftColor: type.fg }
    : { backgroundColor: type.bg, borderColor: type.bg, borderLeftColor: type.fg }
}
const eventClass = (activity: Activity) => cn(
  'border border-l-[3px] text-[#0C1260] transition-[box-shadow,filter] duration-[120ms] hover:shadow-[0_2px_8px_rgba(12,18,96,0.14)] focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-[#0B759A]',
  tentative(activity) && 'border-dashed',
  activity.status === 'CANCELLED' && 'opacity-55 line-through',
)
const eventLabel = (activity: Activity) => `${activityName(activity)}, ${formatTimeRange(activity)}, ${activity.status.replace('_', ' ').toLowerCase()}`

export function ActivityCalendar({ activities, onOpen }: { activities: Activity[]; onOpen: (activity: Activity) => void }) {
  const [view, setView] = useState<View>('MONTH')
  const [cursor, setCursor] = useState(() => new Date())
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  // Current time for the today highlight and the week view's now-line; ticks each minute.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const today = dateKey(now)

  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const activity of activities) map.set(activity.schedule_date, [...(map.get(activity.schedule_date) ?? []), activity])
    for (const list of map.values()) list.sort(byTime)
    return map
  }, [activities])

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const weekStart = startOfWeek(cursor)
  const gridStart = view === 'MONTH' ? startOfWeek(monthStart) : weekStart
  const cellCount = view === 'MONTH'
    ? Math.ceil((monthStart.getDay() + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7) * 7
    : 7
  const days = Array.from({ length: cellCount }, (_, i) => addDays(gridStart, i))

  const heading = view === 'MONTH'
    ? cursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    : `${weekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`

  function move(direction: number) {
    setCursor((previous) => view === 'MONTH'
      // Day 1, so moving from the 31st cannot skip a month.
      ? new Date(previous.getFullYear(), previous.getMonth() + direction, 1)
      : addDays(previous, direction * 7))
  }

  const periodKey = `${view}|${dateKey(gridStart)}`
  const dayList = dayOpen ? byDay.get(dayOpen) ?? [] : []

  return (
    <section aria-label="Activity calendar" className="min-w-0 rounded-xl border border-[#D5E2EA] bg-white p-4 sm:p-5">
      {/* Toolbar: period title, then Today / arrows / view switch; wraps on a phone. */}
      <div className="flex flex-wrap items-center gap-3">
        <h3 aria-live="polite" className="mr-auto text-lg font-bold text-[#0C1260]">{heading}</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCursor(new Date())} className="h-9 rounded-lg border border-[#BFD3DE] bg-white px-3 text-[13px] font-medium text-[#0C1260] transition-colors hover:border-[#07075F] hover:bg-[#E6F1F7] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#0B759A]">Today</button>
          <div className="flex">
            {[-1, 1].map((direction) => (
              <button
                key={direction}
                type="button"
                aria-label={`${direction < 0 ? 'Previous' : 'Next'} ${view === 'MONTH' ? 'month' : 'week'}`}
                onClick={() => move(direction)}
                className={cn('inline-flex size-9 items-center justify-center border border-[#BFD3DE] bg-white text-[#0C1260] transition-colors hover:bg-[#E6F1F7] focus-visible:relative focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-[#0B759A]', direction < 0 ? 'rounded-l-lg' : '-ml-px rounded-r-lg')}
              >
                {direction < 0 ? <ChevronLeft size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Calendar view" className="inline-flex rounded-lg border border-[#BFD3DE] bg-white p-0.5">
            {(['MONTH', 'WEEK'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn('h-8 rounded-md px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-[#0B759A]', view === option ? 'bg-[#07075F] text-white' : 'text-[#0C1260] hover:bg-[#E6F1F7]')}
              >
                {option === 'MONTH' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Re-keyed per period so each change fades in instead of snapping. */}
      <div key={periodKey} className="mt-4 animate-in fade-in duration-200 motion-reduce:animate-none">
        {view === 'MONTH' ? (
          <div className="overflow-hidden rounded-lg border border-[#EAF0F4]">
            <div className="grid grid-cols-7 bg-[#F5F8FA]">
              {WEEKDAYS.map((d) => <div key={d} className="border-b-2 border-[#D5E2EA] py-2 text-center text-xs font-semibold uppercase tracking-[0.5px] text-[#55617F]">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((date, index) => {
                const key = dateKey(date)
                const outside = date.getMonth() !== cursor.getMonth()
                const list = byDay.get(key) ?? []
                const hidden = list.length - MAX_CHIPS
                return (
                  <div
                    key={key}
                    className={cn(
                      'min-h-[68px] min-w-0 border-[#EAF0F4] p-1 sm:min-h-[118px] sm:p-1.5',
                      index % 7 !== 6 && 'border-r',
                      index < days.length - 7 && 'border-b',
                      outside ? 'bg-[#FBFCFD]' : 'bg-white',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`${date.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}, ${list.length} ${list.length === 1 ? 'activity' : 'activities'}`}
                      aria-current={key === today ? 'date' : undefined}
                      onClick={() => (list.length ? setDayOpen(key) : (setCursor(date), setView('WEEK')))}
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-lg text-[13px] transition-colors focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-[#0B759A]',
                        key === today ? 'bg-[#07075F] font-bold text-white' : outside ? 'text-[#BFD3DE] hover:bg-[#F2F7FB]' : 'font-medium text-[#1E2A55] hover:bg-[#E6F1F7]',
                      )}
                    >
                      {date.getDate()}
                    </button>

                    {/* Phone: dots (one per activity, type colour). */}
                    {list.length > 0 && (
                      <span aria-hidden="true" className="mt-1 flex flex-wrap items-center gap-[3px] px-1 sm:hidden">
                        {list.slice(0, 4).map((a) => <span key={a.schedule_id} className="size-1.5 rounded-full" style={{ backgroundColor: activityTypeMeta(a.activity_type).fg }} />)}
                        {list.length > 4 && <span className="text-[10px] font-semibold text-[#55617F]">+{list.length - 4}</span>}
                      </span>
                    )}

                    {/* Wider screens: readable chips (time, type, barangay), then "+N more". */}
                    <div className="mt-1 hidden space-y-1 sm:block">
                      {list.slice(0, hidden > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((activity) => (
                        <button
                          key={activity.schedule_id}
                          type="button"
                          title={eventLabel(activity)}
                          aria-label={eventLabel(activity)}
                          onClick={() => onOpen(activity)}
                          className={cn('flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-[3px] text-left text-[11.5px] leading-tight', eventClass(activity))}
                          style={eventStyle(activity)}
                        >
                          {activity.start_time && <span className="shrink-0 font-semibold tabular-nums">{shortTime(activity.start_time)}</span>}
                          <span className="min-w-0 truncate">{activityTypeMeta(activity.activity_type).short} · {getBarangayName(activity)}</span>
                          {activity.conflict_status === 'DETECTED' && <AlertTriangle size={11} aria-hidden="true" className="ml-auto shrink-0 text-[#9C6B10]" />}
                        </button>
                      ))}
                      {hidden > 0 && (
                        <button type="button" onClick={() => setDayOpen(key)} className="w-full rounded-md px-1.5 py-0.5 text-left text-[11.5px] font-semibold text-[#0B759A] hover:bg-[#E6F1F7] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-[#0B759A]">
                          +{hidden + 1} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <WeekGrid days={days} byDay={byDay} now={now} onOpen={onOpen} />
        )}
      </div>

      {/* Legend: type colours, plus what dashed and faded mean. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#55617F]">
        {ACTIVITY_TYPES.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: ACTIVITY_TYPE_META[type].fg }} />
            {ACTIVITY_TYPE_META[type].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-4 rounded-sm border border-dashed border-[#55617F] bg-white" />Awaiting approval
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="text-[#8896B0] line-through">Abc</span>Cancelled
        </span>
      </div>

      {/* "+N more" / a busy day: that day's list, like a calendar day popover. */}
      {dayOpen && (
        <Modal
          open
          size="sm"
          onClose={() => setDayOpen(null)}
          cancelLabel="Close"
          title={new Date(`${dayOpen}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          subtitle={`${dayList.length} ${dayList.length === 1 ? 'activity' : 'activities'}`}
        >
          <ul className="space-y-2">
            {dayList.map((activity) => (
              <li key={activity.schedule_id}>
                <button
                  type="button"
                  onClick={() => { setDayOpen(null); onOpen(activity) }}
                  className={cn('flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left', eventClass(activity))}
                  style={eventStyle(activity)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{formatTimeRange(activity)}</span>
                    <ActivityStatusBadge status={activity.status} size="sm" className="no-underline" />
                  </span>
                  <span className="text-sm">{activityName(activity)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  )
}

/** Week view: a time grid (blocks sized by start–end), an all-day row for untimed activities, and a now-line. */
function WeekGrid({ days, byDay, now, onOpen }: { days: Date[]; byDay: Map<string, Activity[]>; now: Date; onOpen: (activity: Activity) => void }) {
  const today = dateKey(now)
  const week = days.map((d) => ({ date: d, key: dateKey(d), list: byDay.get(dateKey(d)) ?? [] }))
  const timed = week.flatMap((d) => d.list.filter((a) => minutesOf(a.start_time) !== null))
  const untimed = week.some((d) => d.list.some((a) => minutesOf(a.start_time) === null))

  // 7 AM – 6 PM, widened to fit any activity this week.
  const startHour = Math.min(7, ...timed.map((a) => Math.floor(minutesOf(a.start_time)! / 60)))
  const endHour = Math.max(18, ...timed.map((a) => Math.ceil((minutesOf(a.end_time) ?? minutesOf(a.start_time)! + 60) / 60)))
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  return (
    <div className="scroll-subtle overflow-x-auto rounded-lg border border-[#EAF0F4]">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] bg-[#F5F8FA]">
          <div className="border-b-2 border-[#D5E2EA]" />
          {week.map(({ date, key }) => (
            <div key={key} className="border-b-2 border-l border-[#D5E2EA] border-l-[#EAF0F4] py-2 text-center">
              <span className="block text-xs font-semibold uppercase tracking-[0.5px] text-[#55617F]">{WEEKDAYS[date.getDay()]}</span>
              <span className={cn('mt-0.5 inline-flex size-7 items-center justify-center rounded-lg text-sm', key === today ? 'bg-[#07075F] font-bold text-white' : 'font-semibold text-[#0C1260]')}>{date.getDate()}</span>
            </div>
          ))}
        </div>

        {untimed && (
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-[#EAF0F4]">
            <div className="px-1.5 py-2 text-right text-[11px] text-[#8896B0]">All day</div>
            {week.map(({ key, list }) => (
              <div key={key} className="space-y-1 border-l border-[#EAF0F4] p-1">
                {list.filter((a) => minutesOf(a.start_time) === null).map((activity) => (
                  <button key={activity.schedule_id} type="button" title={eventLabel(activity)} aria-label={eventLabel(activity)} onClick={() => onOpen(activity)} className={cn('block w-full truncate rounded-md px-1.5 py-[3px] text-left text-[11.5px]', eventClass(activity))} style={eventStyle(activity)}>
                    {activityTypeMeta(activity.activity_type).short} · {getBarangayName(activity)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
          {/* Hour labels */}
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-[#8896B0]" style={{ top: i * HOUR_PX }}>
                {i === 0 ? '' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}
              </span>
            ))}
          </div>

          {week.map(({ key, list }) => {
            const blocks = list.filter((a) => minutesOf(a.start_time) !== null)
            // Overlapping activities sit side by side: each takes the first free lane.
            const laneEnds: number[] = []
            const placed = blocks.map((activity) => {
              const start = minutesOf(activity.start_time)!
              const end = Math.max(minutesOf(activity.end_time) ?? start + 60, start + 30)
              let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
              if (lane === -1) { lane = laneEnds.length; laneEnds.push(end) } else laneEnds[lane] = end
              return { activity, start, end, lane }
            })
            const lanes = Math.max(1, laneEnds.length)
            return (
              <div key={key} className={cn('relative border-l border-[#EAF0F4]', key === today && 'bg-[#F7FBFD]')} style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h, i) => <div key={h} aria-hidden="true" className="absolute inset-x-0 border-t border-[#EAF0F4]" style={{ top: i * HOUR_PX }} />)}
                {placed.map(({ activity, start, end, lane }) => (
                  <button
                    key={activity.schedule_id}
                    type="button"
                    title={eventLabel(activity)}
                    aria-label={eventLabel(activity)}
                    onClick={() => onOpen(activity)}
                    className={cn('absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11.5px] leading-tight', eventClass(activity))}
                    style={{
                      ...eventStyle(activity),
                      top: ((start - startHour * 60) / 60) * HOUR_PX + 1,
                      height: Math.max(((end - start) / 60) * HOUR_PX - 2, 22),
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    <span className="block font-semibold tabular-nums">{shortTime(activity.start_time)}–{shortTime(activity.end_time)}</span>
                    <span className="block truncate">{activityTypeMeta(activity.activity_type).short}</span>
                    <span className="block truncate text-[#55617F]">{getBarangayName(activity)}</span>
                  </button>
                ))}
                {key === today && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[#C42B2B]" style={{ top: ((nowMinutes - startHour * 60) / 60) * HOUR_PX }}>
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-[#C42B2B]" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
