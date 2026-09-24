'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function TermsPage() {
  const router = useRouter()

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#CAF0F8] p-4 sm:p-8">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-xl lg:min-h-[665px]">

        {/* LEFT SIDE */}
        <section className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#123C82] to-[#087DB9] p-14 text-white lg:flex">
          <div>
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/echimes%20white%20and%20blue-gtjr6RbRtIsj4rnx93fDvsrSwRYq5X.png"
              alt="eCHIMS logo"
              width={430}
              height={120}
              className="h-auto w-full max-w-[430px]"
            />

            <h1 className="mt-14 text-center text-2xl font-bold leading-relaxed">
              Early Child Health Information and Monitoring System
            </h1>

            <p className="mt-5 text-center text-base text-blue-100">
              Comprehensive healthcare management for Rural Health Units
            </p>
          </div>

          <div>
            <div className="flex justify-center gap-16 text-center">
              <div>
                <p className="text-4xl font-bold text-cyan-300">500+</p>
                <p className="mt-2 text-sm text-blue-100">
                  Children Tracked
                </p>
              </div>

              <div className="border-l border-white/20 pl-16">
                <p className="text-4xl font-bold text-cyan-300">50+</p>
                <p className="mt-2 text-sm text-blue-100">
                  Barangays
                </p>
              </div>
            </div>

            <div className="mt-12 border-t border-white/20 pt-8 text-center text-sm text-blue-100">
              <p>Bachelor of Science in Information Technology</p>
              <p className="mt-3">© 2025 Rural Health Units</p>
            </div>
          </div>
        </section>

        {/* RIGHT SIDE */}
        <section className="flex flex-1 flex-col px-7 py-10 sm:px-14 lg:w-1/2">
          <div className="mx-auto flex w-full max-w-2xl flex-col">

            <Link
              href="/register"
              className="mb-6 text-sm font-semibold text-[#0077B6] hover:underline"
            >
              ← Back to Registration
            </Link>

            <h2 className="text-3xl font-bold text-[#03045E]">
              Terms of Service
            </h2>

            <p className="mt-2 text-[#6B7280]">
              Please review the terms and conditions before using eCHIMS.
            </p>

            <div className="mt-7 max-h-[480px] overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-6 pr-5">
              <div className="space-y-7 text-sm leading-relaxed text-[#4B5563]">

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    1. Acceptance of Terms
                  </h3>
                  <p>
                    By accessing or using eCHIMS, you agree to comply with
                    these Terms of Service. If you do not agree with these
                    terms, please do not use the system.
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    2. Purpose of the System
                  </h3>
                  <p>
                    eCHIMS is an Early Child Health Information and Monitoring
                    System designed to support authorized Rural Health Unit
                    personnel in managing child health, vaccination,
                    nutritional monitoring, micronutrient supplementation,
                    and related health information.
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    3. Authorized Use
                  </h3>
                  <p>
                    Access to eCHIMS is limited to authorized users. Users are
                    responsible for ensuring that information entered into the
                    system is accurate and appropriate for their assigned
                    responsibilities.
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    4. Account Responsibility
                  </h3>
                  <p>
                    Users are responsible for maintaining the confidentiality
                    of their account credentials. Users must not share their
                    passwords or allow unauthorized individuals to access
                    their accounts.
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    5. Proper Use of Information
                  </h3>
                  <p>
                    Information accessed through eCHIMS must only be used for
                    legitimate health-service, monitoring, reporting, and
                    administrative purposes related to the user's authorized
                    duties.
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    6. Account Access and Suspension
                  </h3>
                  <p>
                    The system administrator may review, restrict, suspend,
                    or deactivate an account when necessary to maintain system
                    security and proper use of the platform.
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    7. System Availability
                  </h3>
                  <p>
                    eCHIMS may occasionally be unavailable due to maintenance,
                    technical issues, network interruptions, or other
                    circumstances.
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-base font-bold text-[#03045E]">
                    8. Changes to These Terms
                  </h3>
                  <p>
                    These Terms of Service may be updated when necessary.
                    Users will be expected to comply with the latest
                    applicable version of the terms.
                  </p>
                </section>

              </div>
            </div>

            <p className="mt-4 text-center text-xs text-[#9CA3AF]">
              Last updated: 2026
            </p>

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => router.push('/register')}
                className="rounded-full bg-[#0784BE] px-10 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#056d9e]"
              >
                Accept
              </button>
            </div>

          </div>
        </section>
      </div>
    </main>
  )
}