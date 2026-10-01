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
] as const

const workflowSteps = [
  'Register Child Profile',
  'Record Health Services',
  'Rule Engine Evaluation',
  'Generate Notifications',
]

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#03045E]">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="flex h-16 items-center justify-between bg-[#F4FBFD] px-4 sm:h-20 sm:px-8 lg:px-16">
        <Link
          href="/"
          aria-label="eCHIMS Home"
          className="shrink-0"
        >
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/echims%20blue%20and%20white-uMjflMPgqvEd7e3iQnVdDphmz1oAkU.png"
            alt="eCHIMS logo"
            width={170}
            height={48}
            className="h-auto w-[125px] object-contain sm:w-[150px] lg:w-[170px]"
            fetchPriority="high"
          />
        </Link>

        <Link
          href="/login"
          className="
            shrink-0 rounded-full
            bg-[#087DB9]
            px-5 py-2.5
            text-sm font-semibold text-white
            transition-colors
            hover:bg-[#056d9e]
            sm:px-7 sm:py-3 sm:text-base
          "
        >
          Sign In
        </Link>
      </header>

      {/* =====================================================
          HERO
      ===================================================== */}

      <section
        className="
          bg-[#CAF0F8]
          px-4 py-14
          text-center
          sm:px-8 sm:py-20
          lg:px-12 lg:py-28
        "
      >
        <div className="mx-auto max-w-5xl">

          <h1
            className="
              mx-auto max-w-4xl
              text-balance
              text-3xl font-bold
              leading-[1.15]
              text-[#03045E]
              sm:text-4xl
              md:text-5xl
              lg:text-6xl
            "
          >
            Rule-Based Early Child Health Information and Monitoring System
          </h1>

          <p
            className="
              mx-auto mt-5
              max-w-3xl
              text-sm leading-7
              text-[#6B7280]
              sm:mt-6 sm:text-base
              md:text-lg
            "
          >
            Comprehensive health management system designed for rural health
            units and barangay health workers to track, monitor, and improve
            child health outcomes.
          </p>

          {/* ACTIONS */}

          <div
            className="
              mx-auto mt-8
              flex max-w-sm
              flex-col gap-3
              sm:mt-10 sm:max-w-none
              sm:flex-row
              sm:justify-center
              sm:gap-4
            "
          >
            <Link
              href="/register"
              className="
                rounded-full
                bg-[#087DB9]
                px-7 py-3.5
                text-sm font-semibold
                text-white
                transition-colors
                hover:bg-[#056d9e]
                sm:px-8 sm:py-4 sm:text-base
              "
            >
              Get Started →
            </Link>

            <a
              href="#features"
              className="
                rounded-full
                border border-[#087DB9]
                px-7 py-3.5
                text-sm font-semibold
                text-[#0077B6]
                transition-colors
                hover:bg-white/50
                sm:px-8 sm:py-4 sm:text-base
              "
            >
              Learn More
            </a>
          </div>

          {/* STATISTICS */}

          <div
            className="
              mx-auto mt-12
              grid max-w-3xl
              grid-cols-1 gap-6
              sm:mt-14
              sm:grid-cols-3
              sm:gap-4
              lg:mt-16 lg:gap-6
            "
          >
            <div>
              <p className="text-2xl font-bold text-[#087DB9] sm:text-3xl">
                500+
              </p>

              <p className="mt-1 text-xs text-[#6B7280] sm:text-sm">
                Children Tracked
              </p>
            </div>

            <div className="border-y border-[#087DB9]/10 py-5 sm:border-x sm:border-y-0 sm:py-0">
              <p className="text-2xl font-bold text-[#087DB9] sm:text-3xl">
                50+
              </p>

              <p className="mt-1 text-xs text-[#6B7280] sm:text-sm">
                Barangays Served
              </p>
            </div>

            <div>
              <p className="text-2xl font-bold text-[#087DB9] sm:text-3xl">
                24/7
              </p>

              <p className="mt-1 text-xs text-[#6B7280] sm:text-sm">
                Available
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* =====================================================
          FEATURES
      ===================================================== */}

      <section
        id="features"
        className="
          scroll-mt-16
          px-4 py-14
          sm:px-8 sm:py-20
          lg:px-16 lg:py-24
          xl:px-32
        "
      >
        <div className="mx-auto max-w-6xl">

          <div className="text-center">

            <h2
              className="
                text-2xl font-bold
                sm:text-3xl
                lg:text-4xl
              "
            >
              Key Features
            </h2>

            <p
              className="
                mx-auto mt-3
                max-w-2xl
                text-sm leading-6
                text-[#6B7280]
                sm:mt-4 sm:text-base
                lg:text-lg
              "
            >
              Everything you need to manage child health services
            </p>

          </div>

          <div
            className="
              mt-10
              grid grid-cols-1
              gap-4
              sm:mt-12
              sm:grid-cols-2
              sm:gap-6
              lg:mt-16
              lg:grid-cols-3
              lg:gap-8
            "
          >
            {features.map(([Icon, title, description]) => (
              <article
                key={title}
                className="
                  rounded-2xl
                  border border-[#E5E7EB]
                  p-5
                  transition
                  hover:border-[#90E0EF]
                  hover:shadow-sm
                  sm:rounded-3xl
                  sm:p-6
                  lg:p-7
                "
              >
                <div
                  className="
                    flex h-11 w-11
                    items-center justify-center
                    rounded-xl
                    bg-[#E5F5FA]
                    text-[#0077B6]
                    sm:h-12 sm:w-12
                    sm:rounded-2xl
                  "
                >
                  <Icon size={22} />
                </div>

                <h3 className="mt-5 text-base font-bold sm:mt-6 sm:text-lg">
                  {title}
                </h3>

                <p
                  className="
                    mt-2
                    text-sm leading-6
                    text-[#6B7280]
                    sm:mt-3
                    sm:leading-relaxed
                  "
                >
                  {description}
                </p>
              </article>
            ))}
          </div>

        </div>
      </section>

      {/* =====================================================
          HOW IT WORKS
      ===================================================== */}

      <section
        className="
          bg-[#F7F9FA]
          px-4 py-14
          text-center
          sm:px-8 sm:py-20
          lg:px-12 lg:py-24
        "
      >
        <div className="mx-auto max-w-6xl">

          <h2
            className="
              text-2xl font-bold
              sm:text-3xl
              lg:text-4xl
            "
          >
            How It Works
          </h2>

          <p
            className="
              mt-3
              text-sm
              text-[#6B7280]
              sm:mt-4
              sm:text-base
              lg:text-lg
            "
          >
            Simple workflow for better child health outcomes
          </p>

          <div
            className="
              mx-auto mt-10
              grid max-w-5xl
              grid-cols-1
              gap-4
              sm:mt-12
              sm:grid-cols-2
              sm:gap-6
              lg:mt-14
              lg:grid-cols-4
            "
          >
            {workflowSteps.map((step, index) => (
              <div
                key={step}
                className="
                  rounded-2xl
                  bg-white
                  p-5
                  text-left
                  shadow-sm
                  sm:rounded-3xl
                  sm:p-7
                "
              >
                <div
                  className="
                    flex h-9 w-9
                    items-center justify-center
                    rounded-full
                    bg-[#087DB9]
                    text-sm font-bold
                    text-white
                    sm:h-10 sm:w-10
                  "
                >
                  {index + 1}
                </div>

                <h3 className="mt-4 text-sm font-bold sm:mt-5 sm:text-base">
                  {step}
                </h3>

                <p className="mt-2 text-sm leading-6 text-[#6B7280] sm:mt-3">
                  Systematic tools that help health workers deliver timely and
                  informed care.
                </p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* =====================================================
          CALL TO ACTION
      ===================================================== */}

      <section
        className="
          bg-gradient-to-r
          from-[#03045E]
          to-[#087DB9]
          px-4 py-14
          text-center text-white
          sm:px-8 sm:py-20
          lg:py-24
        "
      >
        <div className="mx-auto max-w-3xl">

          <h2
            className="
              text-2xl font-bold
              leading-tight
              sm:text-3xl
              lg:text-4xl
            "
          >
            Ready to Transform Child Health Care?
          </h2>

          <p
            className="
              mx-auto mt-4
              max-w-2xl
              text-sm leading-6
              text-blue-100
              sm:mt-5
              sm:text-base
            "
          >
            Join health units across rural communities improving child health
            outcomes.
          </p>

          <Link
            href="/register"
            className="
              mt-7 inline-block
              rounded-full
              bg-white
              px-7 py-3.5
              text-sm font-semibold
              text-[#0077B6]
              transition-colors
              hover:bg-[#F4FBFD]
              sm:mt-9
              sm:px-8 sm:py-4
              sm:text-base
            "
          >
            Get Started Now
          </Link>

        </div>
      </section>

      {/* =====================================================
          FOOTER
      ===================================================== */}

      <footer
        className="
          px-4 py-10
          text-center
          text-sm
          text-[#6B7280]
          sm:px-8 sm:py-12
        "
      >
        <div className="mx-auto max-w-6xl">

          <p className="font-bold text-[#03045E]">
            eCHIMS
          </p>

          <p className="mx-auto mt-3 max-w-xl leading-6">
            Early Child Health Information and Monitoring System
          </p>

          <div
            className="
              mt-5
              flex flex-col
              items-center gap-3
              sm:flex-row
              sm:justify-center
              sm:gap-5
            "
          >
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

          <p
            className="
              mt-8
              border-t border-[#E5E7EB]
              pt-8
              text-xs leading-6
              sm:text-sm
            "
          >
            © 2025 Early Child Health Information and Monitoring System.
            All rights reserved.
          </p>

        </div>
      </footer>

    </main>
  )
}