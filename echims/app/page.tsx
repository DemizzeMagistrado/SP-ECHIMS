import Link from 'next/link'
import {
  Apple,
  Baby,
  Heart,
  MapPin,
  Package,
  Smartphone,
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
]

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-[#03045E]">

      {/* HEADER */}
      <header className="flex h-16 items-center justify-between bg-[#F4FBFD] px-6 sm:px-12 lg:px-16">
        <Link href="/" aria-label="eCHIMS Home">
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/echims%20blue%20and%20white-uMjflMPgqvEd7e3iQnVdDphmz1oAkU.png"
            alt="eCHIMS logo"
            width={170}
            height={48}
            className="h-auto w-full max-w-[170px] object-contain"
            fetchPriority="high"
          />
        </Link>

        <Link
          href="/login"
          className="rounded-full bg-[#087DB9] px-7 py-3 font-semibold text-white transition-colors hover:bg-[#056d9e]"
        >
          Sign In
        </Link>
      </header>

      {/* HERO */}
      <section className="bg-[#CAF0F8] px-6 py-24 text-center sm:px-12 lg:py-28">
        <h1 className="mx-auto max-w-4xl text-balance text-5xl font-bold leading-tight text-[#03045E] sm:text-6xl">
          Rule-Based Early Child Health Information and Monitoring System
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[#6B7280]">
          Comprehensive health management system designed for rural health
          units and barangay health workers to track, monitor, and improve
          child health outcomes
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">

          {/* GET STARTED → REGISTRATION */}
          <Link
            href="/register"
            className="rounded-full bg-[#087DB9] px-8 py-4 font-semibold text-white hover:bg-[#056d9e]"
          >
            Get Started →
          </Link>

          {/* LEARN MORE → FEATURES */}
          <a
            href="#features"
            className="rounded-full border border-[#087DB9] px-8 py-4 font-semibold text-[#0077B6] hover:bg-white/50"
          >
            Learn More
          </a>

        </div>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-6">
          <div>
            <p className="text-3xl font-bold text-[#087DB9]">500+</p>
            <p className="mt-1 text-sm text-[#6B7280]">
              Children Tracked
            </p>
          </div>

          <div>
            <p className="text-3xl font-bold text-[#087DB9]">50+</p>
            <p className="mt-1 text-sm text-[#6B7280]">
              Barangays Served
            </p>
          </div>

          <div>
            <p className="text-3xl font-bold text-[#087DB9]">24/7</p>
            <p className="mt-1 text-sm text-[#6B7280]">
              Available
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section
        id="features"
        className="scroll-mt-16 px-6 py-24 sm:px-12 lg:px-32"
      >
        <div className="mx-auto max-w-6xl">

          <div className="text-center">
            <h2 className="text-4xl font-bold">
              Key Features
            </h2>

            <p className="mt-4 text-lg text-[#6B7280]">
              Everything you need to manage child health services
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map(([Icon, title, description]) => {
              const FeatureIcon = Icon as typeof Baby

              return (
                <article
                  key={title as string}
                  className="rounded-3xl border border-[#E5E7EB] p-7"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E5F5FA] text-[#0077B6]">
                    <FeatureIcon size={23} />
                  </div>

                  <h3 className="mt-6 text-lg font-bold">
                    {title as string}
                  </h3>

                  <p className="mt-3 leading-relaxed text-[#6B7280]">
                    {description as string}
                  </p>
                </article>
              )
            })}
          </div>

        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-[#F7F9FA] px-6 py-24 text-center sm:px-12">
        <h2 className="text-4xl font-bold">
          How It Works
        </h2>

        <p className="mt-4 text-lg text-[#6B7280]">
          Simple workflow for better child health outcomes
        </p>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-4">
          {[
            'Register Child Profile',
            'Record Health Services',
            'Rule Engine Evaluation',
            'Generate Notifications',
          ].map((step, index) => (
            <div
              key={step}
              className="rounded-3xl bg-white p-7 text-left shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#087DB9] font-bold text-white">
                {index + 1}
              </div>

              <h3 className="mt-5 font-bold">
                {step}
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">
                Systematic tools that help health workers deliver timely and
                informed care.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="bg-gradient-to-r from-[#03045E] to-[#087DB9] px-6 py-24 text-center text-white">
        <h2 className="text-4xl font-bold">
          Ready to Transform Child Health Care?
        </h2>

        <p className="mt-5 text-blue-100">
          Join health units across rural communities improving child health
          outcomes
        </p>

        {/* GET STARTED NOW → REGISTRATION */}
        <Link
          href="/register"
          className="mt-9 inline-block rounded-full bg-white px-8 py-4 font-semibold text-[#0077B6] hover:bg-[#F4FBFD]"
        >
          Get Started Now
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-12 text-center text-sm text-[#6B7280]">

        <p className="font-bold text-[#03045E]">
          eCHIMS
        </p>

        <p className="mt-3">
          Early Child Health Information and Monitoring System
        </p>

        <div className="mt-5 flex justify-center gap-5">
          <Link
            href="/terms"
            className="hover:text-[#0077B6] hover:underline"
          >
            Terms of Service
          </Link>

          <Link
            href="/privacy"
            className="hover:text-[#0077B6] hover:underline"
          >
            Privacy Policy
          </Link>
        </div>

        <p className="mt-8 border-t border-[#E5E7EB] pt-8">
          © 2025 Early Child Health Information and Monitoring System.
          All rights reserved.
        </p>

      </footer>

    </main>
  )
}