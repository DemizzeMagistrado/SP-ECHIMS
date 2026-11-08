import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { FeatureList } from '@/components/landing/feature-list'
import { Reveal } from '@/components/landing/reveal'

const workflowSteps = [
  ['Register Child Profile', 'Capture demographics, guardian details, and household location once.'],
  ['Record Health Services', 'Log vaccinations, nutrition measurements, and supplementation at each visit.'],
  ['Rule Engine Evaluation', 'Rules flag missed doses, growth concerns, and low stock automatically.'],
  ['Generate Notifications', 'Guardians and health workers receive timely SMS reminders and alerts.'],
] as const

const stats = [
  ['500+', 'Children Tracked'],
  ['50+', 'Barangays Served'],
  ['24/7', 'Available'],
] as const

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2'

const primaryButton = `
  group inline-flex items-center justify-center gap-2 rounded-full bg-[#087DB9]
  px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#087DB9]/20
  transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#056d9e] hover:shadow-lg
  active:translate-y-0 sm:px-8 sm:py-4 sm:text-base ${focusRing}
`

const secondaryButton = `
  inline-flex items-center justify-center rounded-full border border-[#087DB9] bg-white/40
  px-7 py-3.5 text-sm font-semibold text-[#0077B6]
  transition-all duration-200 hover:-translate-y-0.5 hover:bg-white
  active:translate-y-0 sm:px-8 sm:py-4 sm:text-base ${focusRing}
`

const navLink = `rounded-full px-4 py-2 text-sm font-medium text-[#03045E]/80 transition-colors hover:bg-[#CAF0F8] hover:text-[#03045E] ${focusRing}`

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#03045E]">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-[#087DB9]/10 bg-[#F4FBFD]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
          <Link href="/" aria-label="eCHIMS Home" className={`shrink-0 rounded-lg ${focusRing}`}>
            <img
              src="/landing-logo.png"
              alt="eCHIMS logo"
              width={170}
              height={48}
              className="h-auto w-[125px] object-contain sm:w-[150px] lg:w-[170px]"
              fetchPriority="high"
            />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <a href="#features" className={navLink}>Features</a>
            <a href="#how-it-works" className={navLink}>How It Works</a>
          </nav>

          <Link
            href="/login"
            className={`shrink-0 rounded-full bg-[#087DB9] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#056d9e] sm:px-7 sm:py-3 sm:text-base ${focusRing}`}
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-[#CAF0F8] px-4 py-16 text-center sm:px-8 sm:py-24 lg:py-32">
        {/* decorative drifting blobs */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-[#90E0EF]/60 blur-3xl motion-safe:animate-pulse [animation-duration:6s]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-20 -z-10 h-96 w-96 rounded-full bg-[#087DB9]/20 blur-3xl motion-safe:animate-pulse [animation-duration:8s]" />

        <div className="mx-auto max-w-5xl">
          <h1 className="mx-auto max-w-4xl text-balance text-3xl font-bold leading-[1.15] animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700 sm:text-4xl md:text-5xl lg:text-6xl">
            Rule-Based Early Child Health Information and Monitoring System
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-[#4B5563] animate-in fade-in slide-in-from-bottom-4 fill-mode-both delay-150 duration-700 sm:text-base md:text-lg">
            Comprehensive health management system designed for rural health
            units and barangay health workers to track, monitor, and improve
            child health outcomes.
          </p>

          <div className="mx-auto mt-10 flex max-w-sm flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 fill-mode-both delay-300 duration-700 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
            <Link href="/register" className={primaryButton}>
              Get Started
              <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <a href="#features" className={secondaryButton}>
              Learn More
            </a>
          </div>

          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-6 animate-in fade-in fill-mode-both delay-500 duration-1000 sm:grid-cols-3 sm:gap-4 lg:mt-16">
            {stats.map(([value, label], i) => (
              <div
                key={label}
                className={i === 1 ? 'border-y border-[#087DB9]/15 py-5 sm:border-x sm:border-y-0 sm:py-0' : ''}
              >
                <dt className="sr-only">{label}</dt>
                <dd className="text-2xl font-bold text-[#087DB9] sm:text-3xl">{value}</dd>
                <dd aria-hidden className="mt-1 text-xs text-[#4B5563] sm:text-sm">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-20 px-4 py-16 sm:scroll-mt-24 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <h2 className="text-2xl font-bold sm:text-3xl lg:text-4xl">Key Features</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#6B7280] sm:text-base lg:text-lg">
              Everything you need to manage child health services
            </p>
          </Reveal>
          <Reveal delay={100}>
            <FeatureList />
          </Reveal>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-20 bg-[#F7F9FA] px-4 py-16 text-center sm:scroll-mt-24 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="text-2xl font-bold sm:text-3xl lg:text-4xl">How It Works</h2>
            <p className="mt-4 text-sm text-[#6B7280] sm:text-base lg:text-lg">
              Simple workflow for better child health outcomes
            </p>
          </Reveal>

          <ol className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:mt-14 lg:grid-cols-4">
            {workflowSteps.map(([step, description], index) => (
              <li key={step}>
                <Reveal delay={index * 120} className="h-full">
                  <div className="h-full rounded-2xl bg-white p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md sm:rounded-3xl sm:p-7">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#087DB9] text-sm font-bold text-white">
                      {index + 1}
                    </div>
                    <h3 className="mt-5 text-base font-bold">{step}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#6B7280]">{description}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="bg-gradient-to-r from-[#03045E] to-[#087DB9] px-4 py-16 text-center text-white sm:px-8 sm:py-24">
        <Reveal className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">
            Ready to Transform Child Health Care?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
            Join health units across rural communities improving child health outcomes.
          </p>
          <Link
            href="/register"
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#0077B6] shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F4FBFD] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#03045E] sm:px-8 sm:py-4 sm:text-base"
          >
            Get Started Now
            <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="px-4 py-12 text-center text-sm text-[#6B7280] sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="font-bold text-[#03045E]">eCHIMS</p>
          <p className="mx-auto mt-3 max-w-xl leading-6">
            Early Child Health Information and Monitoring System
          </p>
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-2">
            <Link href="/terms" className={`rounded-full px-3 py-1.5 transition-colors hover:text-[#0077B6] ${focusRing}`}>
              Terms of Service
            </Link>
            <Link href="/privacy" className={`rounded-full px-3 py-1.5 transition-colors hover:text-[#0077B6] ${focusRing}`}>
              Privacy Policy
            </Link>
          </div>
          <p className="mt-8 border-t border-[#E5E7EB] pt-8 text-xs leading-6 sm:text-sm">
            © {new Date().getFullYear()} Early Child Health Information and Monitoring System. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  )
}
