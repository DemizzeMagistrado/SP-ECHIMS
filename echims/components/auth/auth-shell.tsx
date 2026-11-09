import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { Logo } from '@/components/brand/logo'

const points = [
  'Immunization, nutrition, and supplementation in one child record',
  'Rules flag overdue doses and send SMS reminders to guardians',
  'Keeps working offline in the field',
]

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2'

// Shared frame for the sign-in and registration pages. Uses the landing page's
// sky-to-white background so moving between them feels like one site.
export function AuthShell({
  children,
  scrollable = false,
}: {
  children: ReactNode
  /** Long forms scroll inside the card on large screens instead of stretching it. */
  scrollable?: boolean
}) {
  return (
    <main className={`brand flex min-h-screen flex-col items-center bg-[linear-gradient(180deg,#CAF0F8_0%,#E6F7FB_45%,#FFFFFF_100%)] px-4 py-5 text-[#03045E] sm:px-8 sm:py-8`}>
      <div className="flex w-full max-w-6xl items-center animate-in fade-in slide-in-from-top-2 fill-mode-both duration-500">
        <Link
          href="/"
          className={`group inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#03045E]/80 transition-colors hover:bg-white/60 hover:text-[#03045E] ${focusRing}`}
        >
          <ArrowLeft size={16} aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5" />
          Back to home
        </Link>
      </div>

      <div className="my-auto w-full max-w-6xl pt-4 sm:pt-6">
        <div className="grid overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_-40px_rgba(3,4,94,0.45)] animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-4 fill-mode-both duration-500 ease-out lg:grid-cols-[0.9fr_1.1fr]">
          {/* Brand panel (large screens) */}
          <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-[#03045E] p-12 text-white lg:flex xl:p-14">
            <div aria-hidden className="absolute -right-32 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(8,125,185,0.6),transparent)]" />
            <div aria-hidden className="absolute -bottom-40 -left-24 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(144,224,239,0.18),transparent)]" />
            <div>
              <Logo tone="light" size={80} priority className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700 [animation-delay:200ms]" />
              <h1 className="mt-12 max-w-[20ch] text-3xl font-bold leading-tight animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700 [animation-delay:300ms]">
                Early Child Health Information and Monitoring System
              </h1>
              <p className="mt-4 max-w-[40ch] font-serif text-lg italic leading-7 text-[#CAF0F8] animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700 [animation-delay:400ms]">
                Health management for rural health units and barangay health workers.
              </p>
              <ul className="mt-10 space-y-4">
                {points.map((p, i) => (
                  <li
                    key={p}
                    style={{ animationDelay: `${500 + i * 110}ms` }}
                    className="flex gap-3 text-sm leading-6 text-white/90 animate-in fade-in slide-in-from-left-3 fill-mode-both duration-500"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#087DB9]">
                      <Check size={12} aria-hidden />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-12 border-t border-white/15 pt-6 text-sm text-[#CAF0F8]/80">
              <p>Bachelor of Science in Information Technology</p>
              <p className="mt-1">© {new Date().getFullYear()} Rural Health Units</p>
            </div>
          </section>

          {/* Form */}
          <section
            className={`flex flex-col justify-center px-6 py-10 sm:px-12 sm:py-12 lg:min-h-[640px] ${
              scrollable ? 'lg:max-h-[min(860px,calc(100svh-7rem))] lg:justify-start lg:overflow-y-auto' : ''
            }`}
          >
            <div className="mx-auto w-full max-w-md">
              <Logo size={44} className="mb-8 lg:hidden" />
              {children}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
