'use client'

import { useState } from 'react'
import {
  Apple,
  Baby,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  Package,
  Search,
  Smartphone,
  X,
} from 'lucide-react'

const features = [
  [
    Baby,
    'Child Profiling',
    'Comprehensive child health records including demographics, medical history, and developmental milestones',
  ],
  [
    Heart,
    'Vaccination Tracking',
    'Monitor vaccination schedules, record administered vaccines, and track immunization status',
  ],
  [
    Apple,
    'Nutrition Assessment',
    'Track nutritional status using height, weight, and age-based assessments',
  ],
  [
    Package,
    'Inventory Management',
    'Manage vaccine and supplement stock levels with automatic alerts for low inventory',
  ],
  [
    Smartphone,
    'SMS Notifications',
    'Send health reminders and alerts directly to parents via SMS',
  ],
  [
    MapPin,
    'Geospatial Monitoring',
    'Track child locations across service areas and generate location-based reports',
  ],
] as const

const PAGE_SIZE = 3

export function FeatureList() {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const q = query.trim().toLowerCase()
  const filtered = features.filter(
    ([, title, description]) =>
      title.toLowerCase().includes(q) || description.toLowerCase().includes(q),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  const onSearch = (value: string) => {
    setQuery(value)
    setPage(0)
  }

  return (
    <div className="mt-10 sm:mt-12">
      {/* SEARCH */}
      <div className="mx-auto max-w-md">
        <label htmlFor="feature-search" className="sr-only">
          Search features
        </label>
        <div className="relative">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]"
          />
          <input
            id="feature-search"
            type="search"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search features…"
            className="
              h-12 w-full rounded-full border border-[#E5E7EB] bg-white
              pl-11 pr-11 text-sm text-[#03045E] placeholder:text-[#9CA3AF]
              transition-[border-color,box-shadow] duration-200
              focus:border-[#087DB9] focus:outline-none focus:ring-4 focus:ring-[#087DB9]/15
              sm:text-base
              [&::-webkit-search-cancel-button]:hidden
            "
          />
          {query && (
            <button
              type="button"
              onClick={() => onSearch('')}
              aria-label="Clear search"
              className="
                absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center
                rounded-full text-[#6B7280] transition-colors hover:bg-[#F4FBFD] hover:text-[#03045E]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]
              "
            >
              <X size={16} />
            </button>
          )}
        </div>
        <p aria-live="polite" className="mt-3 text-center text-xs text-[#6B7280] sm:text-sm">
          {filtered.length === features.length
            ? `${features.length} features`
            : `${filtered.length} of ${features.length} features match`}
        </p>
      </div>

      {/* GRID */}
      {visible.length > 0 ? (
        <div
          key={`${q}-${current}`}
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8"
        >
          {visible.map(([Icon, title, description], i) => (
            <article
              key={title}
              style={{ animationDelay: `${i * 80}ms` }}
              className="
                group rounded-2xl border border-[#E5E7EB] bg-white p-6
                animate-in fade-in slide-in-from-bottom-3 fill-mode-both
                transition-[border-color,box-shadow,transform] duration-300
                hover:-translate-y-1 hover:border-[#90E0EF] hover:shadow-lg hover:shadow-[#087DB9]/10
                sm:rounded-3xl lg:p-7
              "
            >
              <div
                className="
                  flex h-12 w-12 items-center justify-center rounded-2xl
                  bg-[#E5F5FA] text-[#0077B6]
                  transition-colors duration-300
                  group-hover:bg-[#087DB9] group-hover:text-white
                "
              >
                <Icon size={22} />
              </div>
              <h3 className="mt-5 text-base font-bold sm:mt-6 sm:text-lg">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#6B7280] sm:mt-3 sm:leading-relaxed">
                {description}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-[#E5E7EB] px-6 py-12 text-center">
          <p className="font-semibold">No features match “{query}”</p>
          <button
            type="button"
            onClick={() => onSearch('')}
            className="mt-3 text-sm font-semibold text-[#087DB9] hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* PAGINATION */}
      {pageCount > 1 && (
        <nav
          aria-label="Feature pages"
          className="mt-8 flex items-center justify-center gap-2 sm:mt-10"
        >
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
              className={`${pagerButton} ${
                i === current
                  ? 'border-[#087DB9] bg-[#087DB9] text-white hover:bg-[#056d9e]'
                  : ''
              }`}
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
  )
}

const pagerButton = `
  flex h-10 min-w-10 items-center justify-center rounded-full border border-[#E5E7EB]
  px-3 text-sm font-semibold text-[#03045E] transition-colors duration-200
  hover:border-[#087DB9] hover:bg-[#F4FBFD]
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2
  disabled:pointer-events-none disabled:opacity-40
`
