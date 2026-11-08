'use client'

import { useState } from 'react'
import {
  Apple,
  Baby,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Heart,
  MapPin,
  Package,
  Pill,
  Search,
  Smartphone,
  UserCog,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react'

type Feature = {
  icon: LucideIcon
  title: string
  category: Category
  summary: string
  details: string[]
  roles: string
}

const categories = ['All', 'Records', 'Services', 'Supplies', 'Monitoring', 'Admin'] as const
type Category = Exclude<(typeof categories)[number], 'All'>

const features: Feature[] = [
  {
    icon: Baby,
    title: 'Child profiling',
    category: 'Records',
    summary: 'One health record per child, shared by every service that touches them.',
    details: [
      'Demographics, birth details, and medical history',
      'Linked guardian and household for follow-ups',
      'Developmental milestones over time',
    ],
    roles: 'BHWs, BNSs, midwives',
  },
  {
    icon: FileSpreadsheet,
    title: 'Masterlist upload',
    category: 'Records',
    summary: 'Bring in the barangay masterlists you already keep in spreadsheets.',
    details: [
      'Upload a file using the provided template',
      'Review rows in staging before they become records',
      'Fix or remove bad rows without re-uploading',
    ],
    roles: 'Nurses, midwives',
  },
  {
    icon: WifiOff,
    title: 'Offline mode',
    category: 'Records',
    summary: 'Keep recording in areas with weak or no signal.',
    details: [
      'Entries are saved on the device while offline',
      'Submissions sync once you are back online',
      'Signed-in accounts keep working between visits',
    ],
    roles: 'Field health workers',
  },
  {
    icon: Heart,
    title: 'Vaccination tracking',
    category: 'Services',
    summary: 'Each child’s immunization schedule, worked out from their birth date.',
    details: [
      'Schedule for BCG, Hepatitis B, Pentavalent, OPV, IPV, PCV, and MMR',
      'Record each dose with its vaccine batch',
      'Missed and overdue doses are flagged automatically',
    ],
    roles: 'Midwives, nurses',
  },
  {
    icon: Apple,
    title: 'Nutrition assessment',
    category: 'Services',
    summary: 'Nutritional status from height, weight, and age at every measurement.',
    details: [
      'Status classified as soon as a measurement is saved',
      'Admissions for children who need nutrition management',
      'History of every measurement for each child',
    ],
    roles: 'BNSs, nurses',
  },
  {
    icon: Pill,
    title: 'Supplementation',
    category: 'Services',
    summary: 'Micronutrient supplements given, and whether children are keeping up.',
    details: [
      'Record supplements given per child',
      'Compliance tracking against the schedule',
      'Stock requests when supplies run short',
    ],
    roles: 'BHWs, midwives',
  },
  {
    icon: ClipboardList,
    title: 'Health activities',
    category: 'Services',
    summary: 'Plan immunization days and other sessions, and who staffs them.',
    details: [
      'Schedule activities by barangay',
      'Assign personnel to each activity',
      'Submit for review, then revise and resubmit if needed',
    ],
    roles: 'Nurses, administrators',
  },
  {
    icon: Package,
    title: 'Inventory management',
    category: 'Supplies',
    summary: 'Vaccine and supplement stock, from delivery to the dose given.',
    details: [
      'Stock-in, usage, and allocation to barangays',
      'Trace any batch to where it was used',
      'Low-stock alerts and replenishment requests',
    ],
    roles: 'Nurses, administrators',
  },
  {
    icon: Bell,
    title: 'Alerts',
    category: 'Monitoring',
    summary: 'The rule engine tells you what needs attention, so you don’t have to search.',
    details: [
      'Overdue doses, nutrition concerns, and low stock',
      'In-app notifications for the people responsible',
      'Mark alerts as handled once acted on',
    ],
    roles: 'All roles',
  },
  {
    icon: Smartphone,
    title: 'SMS reminders',
    category: 'Monitoring',
    summary: 'Guardians get a text before their child’s next visit is due.',
    details: [
      'Reminders sent when a rule is triggered',
      'Only to guardians who gave SMS consent',
      'Supplementation reminders as well as vaccines',
    ],
    roles: 'Guardians, BHWs',
  },
  {
    icon: MapPin,
    title: 'Geospatial monitoring',
    category: 'Monitoring',
    summary: 'See where children are across your service area on a map.',
    details: [
      'Children mapped by barangay and household',
      'Spot areas with low coverage',
      'Location-based reports',
    ],
    roles: 'Nurses, administrators',
  },
  {
    icon: FileText,
    title: 'Reports',
    category: 'Monitoring',
    summary: 'Program reports generated from the records you already entered.',
    details: [
      'Coverage, nutrition, and inventory reports',
      'Export to spreadsheet',
      'Filter by barangay and period',
    ],
    roles: 'Nurses, administrators',
  },
  {
    icon: UserCog,
    title: 'User management',
    category: 'Admin',
    summary: 'Control who can use eCHIMS and which barangays they cover.',
    details: [
      'Approve or decline new registrations',
      'Assign users to RHUs and barangays',
      'Suspend accounts that should no longer have access',
    ],
    roles: 'Administrators',
  },
]

const PAGE_SIZE = 6

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2'

export function FeatureList() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('All')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(features[0].title)

  const q = query.trim().toLowerCase()
  const filtered = features.filter(
    (f) =>
      (category === 'All' || f.category === category) &&
      [f.title, f.summary, ...f.details].some((text) => text.toLowerCase().includes(q)),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const active = visible.find((f) => f.title === selected) ?? visible[0]

  const reset = () => setPage(0)

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
      {/* LIST */}
      <div>
        <label htmlFor="feature-search" className="sr-only">
          Search features
        </label>
        <div className="relative">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B6478]"
          />
          <input
            id="feature-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              reset()
            }}
            placeholder="Search, e.g. stock, SMS, MMR"
            className="
              h-12 w-full rounded-xl border border-[#C9DCE6] bg-white pl-11 pr-11
              text-base text-[#03045E] placeholder:text-[#8A93A6]
              transition-[border-color,box-shadow] duration-150
              focus:border-[#087DB9] focus:outline-none focus:ring-4 focus:ring-[#087DB9]/15
              [&::-webkit-search-cancel-button]:hidden
            "
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                reset()
              }}
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#5B6478] hover:bg-[#F4FBFD] hover:text-[#03045E] ${focusRing}`}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div role="group" aria-label="Filter by category" className="mt-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c)
                reset()
              }}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors duration-150 ${focusRing} ${
                category === c
                  ? 'bg-[#03045E] text-white'
                  : 'bg-[#EAF6FA] text-[#03045E] hover:bg-[#CAF0F8]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <p aria-live="polite" className="mt-5 text-sm text-[#5B6478]">
          {filtered.length === 0
            ? 'No features match'
            : `Showing ${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + visible.length} of ${filtered.length}`}
        </p>

        {visible.length > 0 ? (
          <ul className="mt-3 divide-y divide-[#E3EEF3] border-y border-[#E3EEF3]">
            {visible.map((f) => {
              const isActive = f.title === active?.title
              return (
                <li key={f.title}>
                  <button
                    type="button"
                    onClick={() => setSelected(f.title)}
                    aria-expanded={isActive}
                    className={`flex w-full items-start gap-4 px-2 py-4 text-left transition-colors duration-150 ${focusRing} ${
                      isActive ? 'bg-[#F4FBFD]' : 'hover:bg-[#F8FCFD]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
                        isActive ? 'bg-[#087DB9] text-white' : 'bg-[#EAF6FA] text-[#0077B6]'
                      }`}
                    >
                      <f.icon size={20} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-bold">{f.title}</span>
                        <span className="shrink-0 text-xs text-[#5B6478]">{f.category}</span>
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-[#4B5563]">{f.summary}</span>
                    </span>
                  </button>
                  {/* small screens: details open under the selected row */}
                  {isActive && (
                    <div className="px-2 pb-5 pl-16 lg:hidden">
                      <FeatureDetails feature={f} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-[#C9DCE6] px-6 py-10 text-center">
            <p className="font-semibold">Nothing matches “{query}”{category !== 'All' && ` in ${category}`}.</p>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setCategory('All')
                reset()
              }}
              className={`mt-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#087DB9] hover:bg-[#F4FBFD] ${focusRing}`}
            >
              Show all features
            </button>
          </div>
        )}

        {pageCount > 1 && (
          <nav aria-label="Feature pages" className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page"
              className={pagerButton}
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                aria-label={`Page ${i + 1}`}
                aria-current={i === current ? 'page' : undefined}
                className={`${pagerButton} ${i === current ? 'border-[#03045E] bg-[#03045E] text-white hover:bg-[#03045E]' : ''}`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current === pageCount - 1}
              aria-label="Next page"
              className={pagerButton}
            >
              <ChevronRight size={18} />
            </button>
          </nav>
        )}
      </div>

      {/* DETAIL PANEL (large screens) */}
      <div className="hidden lg:block">
        {active && (
          <div
            key={active.title}
            className="sticky top-28 rounded-2xl border border-[#C9DCE6] bg-[#F4FBFD] p-8 animate-in fade-in duration-200 motion-reduce:animate-none"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#087DB9] text-white">
              <active.icon size={24} aria-hidden />
            </span>
            <h3 className="mt-6 text-2xl font-bold">{active.title}</h3>
            <p className="mt-3 max-w-prose text-base leading-7 text-[#4B5563]">{active.summary}</p>
            <div className="mt-6">
              <FeatureDetails feature={active} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FeatureDetails({ feature }: { feature: Feature }) {
  return (
    <>
      <ul className="space-y-2.5">
        {feature.details.map((d) => (
          <li key={d} className="flex gap-3 text-sm leading-6 text-[#03045E] lg:text-base">
            <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#087DB9]" />
            {d}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-[#5B6478]">
        Used by <span className="font-semibold text-[#03045E]">{feature.roles}</span>
      </p>
    </>
  )
}

const pagerButton = `
  flex h-10 min-w-10 items-center justify-center rounded-lg border border-[#C9DCE6]
  px-3 text-sm font-semibold text-[#03045E] transition-colors duration-150
  hover:border-[#087DB9] hover:bg-[#F4FBFD] ${focusRing}
  disabled:pointer-events-none disabled:opacity-40
`
