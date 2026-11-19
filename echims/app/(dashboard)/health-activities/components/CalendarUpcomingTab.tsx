'use client'
import { CalendarDays } from 'lucide-react'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { type Activity, isUpcoming } from './activity-utils'
import { ActivityCalendar } from './ActivityCalendar'
import { UpcomingActivityCard } from './UpcomingActivityCard'

const PER_PAGE = 5
const UPCOMING_DAYS = 14

export function CalendarUpcomingTab({ activities, onOpen }: { activities: Activity[]; onOpen: (activity: Activity) => void }) {
  const upcoming = activities
    .filter((activity) => isUpcoming(activity, UPCOMING_DAYS))
    .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.schedule_id - b.schedule_id)

  const { visible, props: pager } = usePagination(upcoming, PER_PAGE)

  return (
    // Calendar ~62%, upcoming ~38%; stacks below lg. Both cards share the row height.
    <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
      <ActivityCalendar activities={activities} onOpen={onOpen} />

      <section aria-labelledby="upcoming-title" className="flex min-w-0 flex-col rounded-xl border border-[#D5E2EA] bg-white p-4">
        <div className="flex shrink-0 items-baseline justify-between gap-2">
          <h3 id="upcoming-title" className="text-lg font-bold text-[#0C1260]">Upcoming activities</h3>
          <span className="text-[13px] text-[#55617F]">Next {UPCOMING_DAYS} days</span>
        </div>

        {/* At most 5 cards per page (shared pagination rule). */}
        <div key={pager.page} className="mt-3 flex flex-[1_1_auto] flex-col gap-2.5 animate-in fade-in duration-150 motion-reduce:animate-none">
          {visible.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <CalendarDays size={28} aria-hidden="true" className="text-[#BFD3DE]" />
              <p className="text-sm font-semibold text-[#0C1260]">Nothing scheduled in the next {UPCOMING_DAYS} days</p>
              <p className="text-xs text-[#55617F]">Approved and ongoing activities that match your filters appear here.</p>
            </div>
          ) : visible.map((activity) => <UpcomingActivityCard key={activity.schedule_id} activity={activity} onOpen={onOpen} />)}
        </div>

        <Pagination {...pager} label="Upcoming activity pages" className="mt-3.5 shrink-0 flex-wrap border-t border-brand-line px-0 pt-3.5" />
      </section>
    </div>
  )
}
