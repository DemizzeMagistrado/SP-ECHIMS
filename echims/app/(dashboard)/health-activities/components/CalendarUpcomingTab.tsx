'use client'
import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Activity, isUpcoming } from './activity-utils'
import { ActivityCalendar } from './ActivityCalendar'
import { UpcomingActivityCard } from './UpcomingActivityCard'

const PER_PAGE = 4
const UPCOMING_DAYS = 14

export function CalendarUpcomingTab({ activities, onOpen }: { activities: Activity[]; onOpen: (activity: Activity) => void }) {
  const upcoming = activities
    .filter((activity) => isUpcoming(activity, UPCOMING_DAYS))
    .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.schedule_id - b.schedule_id)

  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(upcoming.length / PER_PAGE))
  const current = Math.min(page, pageCount) // filters can shrink the list under the current page
  const visible = upcoming.slice((current - 1) * PER_PAGE, current * PER_PAGE)

  const pageButton = 'inline-flex size-8 items-center justify-center rounded-lg border text-[13px] font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-[#0B759A]'

  return (
    // Calendar ~62%, upcoming ~38%; stacks below lg. Both cards share the row height.
    <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
      <ActivityCalendar activities={activities} onOpen={onOpen} />

      <section aria-labelledby="upcoming-title" className="flex min-w-0 flex-col rounded-xl border border-[#D5E2EA] bg-white p-4">
        <div className="flex shrink-0 items-baseline justify-between gap-2">
          <h3 id="upcoming-title" className="text-lg font-bold text-[#0C1260]">Upcoming activities</h3>
          <span className="text-[13px] text-[#55617F]">Next {UPCOMING_DAYS} days</span>
        </div>

        {/* Never more than 4 cards, so the card keeps its height however many activities there are. */}
        <div key={current} className="mt-3 flex flex-[1_1_auto] flex-col gap-2.5 overflow-hidden animate-in fade-in duration-150 motion-reduce:animate-none">
          {visible.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <CalendarDays size={28} aria-hidden="true" className="text-[#BFD3DE]" />
              <p className="text-sm font-semibold text-[#0C1260]">Nothing scheduled in the next {UPCOMING_DAYS} days</p>
              <p className="text-xs text-[#55617F]">Approved and ongoing activities that match your filters appear here.</p>
            </div>
          ) : visible.map((activity) => <UpcomingActivityCard key={activity.schedule_id} activity={activity} onOpen={onOpen} />)}
        </div>

        <nav aria-label="Upcoming activity pages" className="mt-3.5 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#EAF0F4] pt-3.5">
          <span className="text-xs text-[#55617F]">Page {current} of {pageCount} · {upcoming.length} {upcoming.length === 1 ? 'activity' : 'activities'}</span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)} className={cn(pageButton, 'border-[#D5E2EA] bg-white text-[#0C1260] hover:bg-[#E6F1F7] disabled:cursor-not-allowed disabled:text-[#BFD3DE] disabled:hover:bg-white')}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Page ${n}`}
                aria-current={n === current ? 'page' : undefined}
                onClick={() => setPage(n)}
                className={cn(pageButton, n === current ? 'border-[#07075F] bg-[#07075F] text-white' : 'border-[#D5E2EA] bg-white text-[#0C1260] hover:bg-[#E6F1F7]')}
              >
                {n}
              </button>
            ))}
            <button type="button" aria-label="Next page" disabled={current >= pageCount} onClick={() => setPage(current + 1)} className={cn(pageButton, 'border-[#D5E2EA] bg-white text-[#0C1260] hover:bg-[#E6F1F7] disabled:cursor-not-allowed disabled:text-[#BFD3DE] disabled:hover:bg-white')}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </span>
        </nav>
      </section>
    </div>
  )
}
