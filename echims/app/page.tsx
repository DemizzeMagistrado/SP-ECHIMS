import Link from 'next/link'
import {
  Apple,
  Baby,
  BellRing,
  Check,
  Clock,
  Heart,
  MessageSquareText,
  Pill,
  Radar,
} from 'lucide-react'
import { FeatureList } from '@/components/landing/feature-list'
import { InView } from '@/components/landing/in-view'
import { BackToTop, LandingHeader, SectionLink } from '@/components/landing/section-nav'


const programs = [
  [Heart, 'Immunization', 'Each child’s vaccine schedule, from birth doses onward'],
  [Apple, 'Nutrition', 'Growth and nutritional status at every visit'],
  [Pill, 'Supplementation', 'Micronutrients given and compliance over time'],
  [Radar, 'Monitoring', 'Alerts, SMS reminders, maps, and reports'],
] as const

const highlights = ['Works offline in the field', 'SMS reminders to guardians', 'Access by role and barangay']

// Sample record for the illustration; follows the national EPI schedule.
const doses = [
  ['At birth', 'BCG, Hepatitis B', 'given'],
  ['6 weeks', 'Pentavalent 1, OPV 1, PCV 1', 'given'],
  ['10 weeks', 'Pentavalent 2, OPV 2, PCV 2', 'given'],
  ['14 weeks', 'Pentavalent 3, OPV 3, PCV 3, IPV', 'due'],
  ['9 months', 'MMR 1', 'upcoming'],
] as const

const ruleChecks = [
  'Schedules are worked out from each child’s birth date',
  'Missed doses and nutrition concerns are flagged automatically',
  'Guardians are reminded by SMS before the visit is due',
]

const steps = [
  ['Register the child', 'Barangay health worker', 'Profile, guardian, and household are entered once and reused by every service.'],
  ['Record each service', 'Midwife or nurse', 'Vaccines, measurements, and supplements are logged at the visit, online or offline.'],
  ['Rules check the record', 'eCHIMS', 'Every record is compared against schedules and thresholds as soon as it changes.'],
  ['The right people are told', 'Guardians and RHU staff', 'Guardians get an SMS reminder; staff see alerts for overdue doses and low stock.'],
] as const

const roles = [
  ['Barangay Health Worker', 'Registers children and households, records services in the field, and follows up on reminders.'],
  ['Barangay Nutrition Scholar', 'Takes measurements, tracks nutritional status, and records supplementation.'],
  ['Rural Health Midwife', 'Administers and records vaccines, and manages the immunization schedule for their barangays.'],
  ['Public Health Nurse', 'Oversees RHU programs, reviews health activities, manages stock, and generates reports.'],
  ['Administrator', 'Approves accounts, assigns users to RHUs and barangays, and keeps access up to date.'],
] as const

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2'

const fadeUp = 'animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700 ease-out'
const delay = (ms: number) => ({ animationDelay: `${ms}ms` })

const primaryButton = `inline-flex items-center justify-center rounded-lg bg-[#087DB9] px-6 py-3.5 text-base font-semibold text-white transition-colors duration-150 hover:bg-[#056d9e] ${focusRing}`
const secondaryButton = `inline-flex items-center justify-center rounded-lg border border-[#03045E]/25 bg-white px-6 py-3.5 text-base font-semibold text-[#03045E] transition-colors duration-150 hover:border-[#03045E] ${focusRing}`

export default function LandingPage() {
  return (
    <main className={`brand min-h-screen overflow-x-hidden bg-white text-[#03045E]`}>
      <SectionLink to="features" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Skip to features
      </SectionLink>

      <LandingHeader />

      {/* HERO: the system as a whole */}
      <section className="relative isolate overflow-hidden bg-[linear-gradient(180deg,#CAF0F8_0%,#DDF5FA_55%,#FFFFFF_100%)]">
        <div aria-hidden className="absolute -z-10 right-[-10%] top-[8%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(144,224,239,0.55),transparent)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-8 sm:py-20 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-16">
          <div>
            <p className={`font-serif text-lg italic text-[#087DB9] ${fadeUp}`} style={delay(100)}>
              Rule-Based Early Child Health Information and Monitoring System
            </p>
            <h1 className={`mt-4 max-w-[17ch] text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl ${fadeUp}`} style={delay(200)}>
              Every child’s health record, in one system for your RHU.
            </h1>
            <p className={`mt-6 max-w-[58ch] text-lg leading-8 text-[#2D3A55] ${fadeUp}`} style={delay(350)}>
              eCHIMS brings immunization, nutrition, and supplementation records
              together for rural health units and barangay health workers, and
              its rules flag which children need follow-up.
            </p>
            <div className={`mt-9 flex flex-col gap-3 sm:flex-row ${fadeUp}`} style={delay(500)}>
              <Link href="/register" className={primaryButton}>Create an account</Link>
              <Link href="/login" className={secondaryButton}>Sign in</Link>
            </div>
            <ul className="mt-8 flex flex-col gap-x-6 gap-y-2 text-sm text-[#2D3A55] sm:flex-row sm:flex-wrap">
              {highlights.map((h, i) => (
                <li key={h} className={`flex items-center gap-2 ${fadeUp}`} style={delay(650 + i * 100)}>
                  <Check size={16} aria-hidden className="text-[#087DB9]" />
                  {h}
                </li>
              ))}
            </ul>
          </div>

          {/* Four programs around one shared child record */}
          <div className="relative mx-auto w-full max-w-lg">
            <ul className="grid grid-cols-2 gap-3 sm:gap-4">
              {programs.map(([Icon, name, text], i) => (
                <li
                  key={name}
                  style={delay(400 + i * 140)}
                  className="rounded-2xl bg-white p-5 shadow-[0_18px_40px_-24px_rgba(3,4,94,0.45)] animate-in fade-in zoom-in-95 fill-mode-both duration-700 ease-out sm:p-6"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF6FA] text-[#0077B6]">
                    <Icon size={22} aria-hidden />
                  </span>
                  <p className="mt-4 font-bold sm:text-lg">{name}</p>
                  <p className="mt-1 text-sm leading-6 text-[#4B5563]">{text}</p>
                </li>
              ))}
            </ul>
            <div
              aria-hidden
              style={delay(1100)}
              className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[#03045E] text-white ring-8 ring-[#E3F6FA] animate-in fade-in zoom-in-50 fill-mode-both duration-500 sm:h-24 sm:w-24"
            >
              <Baby size={26} />
              <span className="mt-1 text-[11px] font-bold leading-none sm:text-xs">One record</span>
            </div>
          </div>
        </div>
      </section>

      {/* RULE ENGINE IN ACTION */}
      <section className="px-4 py-16 sm:px-8 sm:py-24">
        <InView className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <h2 className={`max-w-[20ch] font-display text-3xl font-bold tracking-tight sm:text-4xl ${fadeUp}`}>
              The rules catch what’s due, so nobody has to remember.
            </h2>
            <p className={`mt-4 max-w-[55ch] text-lg leading-8 text-[#4B5563] ${fadeUp}`} style={delay(100)}>
              Every time a record changes, eCHIMS checks it against the schedule and
              tells the right people what to do next.
            </p>
            <ul className="mt-8 space-y-4">
              {ruleChecks.map((c, i) => (
                <li key={c} className={`flex gap-3 text-base leading-7 ${fadeUp}`} style={delay(200 + i * 120)}>
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EAF6FA] text-[#0077B6]">
                    <Check size={14} aria-hidden />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <figure aria-label="Example child immunization record in eCHIMS" className="relative mx-auto w-full max-w-lg">
            <div className={`rounded-2xl border border-[#E3EEF3] bg-white p-5 shadow-[0_24px_60px_-24px_rgba(3,4,94,0.35)] sm:p-7 ${fadeUp}`} style={delay(150)}>
              <div className="flex items-start justify-between gap-4 border-b border-[#E3EEF3] pb-5">
                <div>
                  <p className="text-xl font-bold">Liza M. Santos</p>
                  <p className="mt-1 text-sm text-[#5B6478]">14 weeks old, Brgy. San Isidro</p>
                </div>
                <span className="rounded-md bg-[#E6F5EE] px-2.5 py-1 text-xs font-bold text-[#1E7A52]">Nutrition: normal</span>
              </div>
              <ol className="mt-4 space-y-1">
                {doses.map(([age, vaccines, status], i) => (
                  <li
                    key={age}
                    style={delay(450 + i * 160)}
                    className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-sm animate-in fade-in slide-in-from-left-2 fill-mode-both duration-500 ${
                      status === 'due' ? 'bg-[#FFF5DD]' : ''
                    }`}
                  >
                    <span className="text-[#5B6478]">{age}</span>
                    <span className={status === 'upcoming' ? 'text-[#5B6478]' : 'font-semibold'}>{vaccines}</span>
                    {status === 'given' && <span className="flex items-center gap-1 text-xs font-bold text-[#1E7A52]"><Check size={14} aria-hidden />Given</span>}
                    {status === 'due' && <span className="flex items-center gap-1 text-xs font-bold text-[#8A5A00]"><Clock size={14} aria-hidden />Due in 3 days</span>}
                    {status === 'upcoming' && <span className="text-xs text-[#5B6478]">Upcoming</span>}
                  </li>
                ))}
              </ol>
            </div>
            <div
              style={delay(1450)}
              className="relative mx-3 -mt-3 rounded-xl bg-[#03045E] p-4 text-white shadow-lg animate-in fade-in slide-in-from-top-3 fill-mode-both duration-500 sm:mx-6 sm:p-5"
            >
              <p className="flex items-center gap-2 text-sm font-bold">
                <BellRing size={16} aria-hidden className="text-[#90E0EF]" />
                Rule triggered: Pentavalent 3 due
              </p>
              <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-[#CAF0F8]">
                <MessageSquareText size={16} aria-hidden className="mt-1 shrink-0" />
                SMS reminder sent to guardian. The visit was added to the BHW’s follow-up list.
              </p>
            </div>
            <figcaption className="sr-only">
              Four dose groups recorded as given, Pentavalent 3 due in three days, and an automatic SMS reminder to the guardian.
            </figcaption>
          </figure>
        </InView>
      </section>

      {/* FEATURES */}
      <section id="features" tabIndex={-1} className="outline-none scroll-mt-20 bg-[linear-gradient(180deg,#FFFFFF_0%,#F0F9FC_14%,#F0F9FC_86%,#FFFFFF_100%)] px-4 py-16 sm:scroll-mt-24 sm:px-8 sm:py-24">
        <InView className="mx-auto max-w-7xl">
          <h2 className={`font-display text-3xl font-bold tracking-tight sm:text-4xl ${fadeUp}`}>Everything an RHU tracks, in one system</h2>
          <p className={`mt-4 max-w-[60ch] text-lg leading-8 text-[#4B5563] ${fadeUp}`} style={delay(100)}>
            Search or filter the modules, then select one to see what it handles and who uses it.
          </p>
          <div className={fadeUp} style={delay(200)}>
            <FeatureList />
          </div>
        </InView>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" tabIndex={-1} className="outline-none scroll-mt-20 px-4 py-16 sm:scroll-mt-24 sm:px-8 sm:py-24">
        <InView className="mx-auto max-w-7xl">
          <h2 className={`font-display text-3xl font-bold tracking-tight sm:text-4xl ${fadeUp}`}>How it works</h2>
          <p className={`mt-4 max-w-[60ch] text-lg leading-8 text-[#4B5563] ${fadeUp}`} style={delay(100)}>
            Health workers record what they already do. The rules handle the follow-up.
          </p>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {steps.map(([title, who, text], i) => (
              <li key={title} className="relative pt-6">
                <span aria-hidden className="draw-x absolute inset-x-0 top-0 h-0.5 bg-[#90E0EF]" style={delay(200 + i * 200)} />
                <span
                  style={delay(250 + i * 200)}
                  className="absolute -top-4 left-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#087DB9] text-sm font-bold text-white ring-4 ring-white animate-in fade-in zoom-in-50 fill-mode-both duration-500"
                >
                  {i + 1}
                </span>
                <div className={fadeUp} style={delay(350 + i * 200)}>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-1 text-sm font-bold text-[#087DB9]">{who}</p>
                  <p className="mt-3 text-base leading-7 text-[#4B5563]">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </InView>
      </section>

      {/* ROLES */}
      <section id="roles" tabIndex={-1} className="outline-none scroll-mt-20 bg-[linear-gradient(180deg,#FFFFFF_0%,#EAF6FA_100%)] px-4 py-16 sm:scroll-mt-24 sm:px-8 sm:py-24">
        <InView className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <div>
            <h2 className={`font-display text-3xl font-bold tracking-tight sm:text-4xl ${fadeUp}`}>Built for the people doing the work</h2>
            <p className={`mt-4 max-w-[45ch] text-lg leading-8 text-[#4B5563] ${fadeUp}`} style={delay(100)}>
              Each account sees only the tools and barangays assigned to its role.
            </p>
          </div>
          <dl className="divide-y divide-[#DCEAF0] border-y border-[#DCEAF0]">
            {roles.map(([role, text], i) => (
              <div
                key={role}
                style={delay(150 + i * 110)}
                className="grid gap-1 py-5 animate-in fade-in slide-in-from-right-6 fill-mode-both duration-700 ease-out sm:grid-cols-[14rem_1fr] sm:gap-6"
              >
                <dt className="font-bold">{role}</dt>
                <dd className="leading-7 text-[#4B5563]">{text}</dd>
              </div>
            ))}
          </dl>
        </InView>
      </section>

      {/* CALL TO ACTION */}
      <section className="bg-[linear-gradient(180deg,#EAF6FA_0%,#EAF6FA_50%,#FFFFFF_50%)] px-4 sm:px-8">
        <InView className="relative isolate mx-auto flex max-w-7xl flex-col gap-8 overflow-hidden rounded-3xl bg-[#03045E] px-6 py-12 text-white sm:px-12 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
          <div aria-hidden className="absolute -z-10 -right-24 -top-32 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(8,125,185,0.55),transparent)]" />
          <div className={fadeUp}>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Start tracking your barangay’s children</h2>
            <p className="mt-3 max-w-[55ch] text-lg leading-8 text-[#CAF0F8]">
              Register with your RHU details. Your administrator approves the account and assigns your barangays.
            </p>
          </div>
          <div className={`flex shrink-0 flex-col gap-3 sm:flex-row ${fadeUp}`} style={delay(150)}>
            <Link href="/register" className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-[#03045E] transition-colors hover:bg-[#CAF0F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#03045E]">
              Create an account
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center rounded-lg border border-white/40 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#03045E]">
              Sign in
            </Link>
          </div>
        </InView>
      </section>

      {/* FOOTER */}
      <footer className="px-4 pb-10 pt-14 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-[#5B6478] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-[#03045E]">eCHIMS</p>
            <p className="mt-1">© {new Date().getFullYear()} Early Child Health Information and Monitoring System</p>
          </div>
          <nav aria-label="Legal" className="-mx-3 flex gap-1">
            <Link href="/terms" className={`rounded-lg px-3 py-2 hover:text-[#03045E] ${focusRing}`}>Terms of Service</Link>
            <Link href="/privacy" className={`rounded-lg px-3 py-2 hover:text-[#03045E] ${focusRing}`}>Privacy Policy</Link>
          </nav>
        </div>
      </footer>

      <BackToTop />
    </main>
  )
}
