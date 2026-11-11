import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopNav } from '@/components/dashboard/top-nav'
import { getAuthorizationContext } from '@/lib/auth/authorization'
import { hasPermission, type Role } from '@/lib/auth/permissions'
import { DashboardShell } from '@/components/dashboard/shell'
import { SessionGate } from '@/components/auth/session-gate'
import { NavProgress } from '@/components/dashboard/nav-progress'
import { LoadingGate } from '@/components/brand/loading-gate'
import { CommandPalette } from '@/components/dashboard/command-palette'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const context = await getAuthorizationContext()

  if (!context) {
    redirect('/login')
  }

  // ---------------------------------------------------------
  // PENDING ACCOUNT
  // ---------------------------------------------------------

  if (context.accountStatus === 'PENDING') {
    return (
      <div className="flex min-h-screen flex-col bg-[#CAF0F8]">
        <TopNav />

        <main className="flex flex-1 items-center justify-center p-8">
          {/* Always ready: lets the sign-in overlay know this page has rendered. */}
          <LoadingGate ready className="w-full max-w-2xl">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-10 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#CAF0F8]">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0077B6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </div>

            <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#0077B6]">
              Account Status
            </p>

            <h1 className="mt-2 text-3xl font-bold text-[#03045E]">
              Pending Administrator Approval
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#6B7280]">
              Your email has been verified and you are signed in.
              Your eCHIMS registration is currently under review by
              an administrator.
            </p>

            <div className="mt-6 rounded-2xl bg-[#F8FAFC] p-5 text-left">
              <p className="text-sm font-semibold text-[#03045E]">
                Registered Account
              </p>

              <div className="mt-3 space-y-2 text-sm text-[#6B7280]">
                <p>
                  <span className="font-medium text-[#374151]">
                    Name:
                  </span>{' '}
                  {context.profile.full_name}
                </p>

                <p>
                  <span className="font-medium text-[#374151]">
                    Email:
                  </span>{' '}
                  {context.profile.email}
                </p>

                <p>
                  <span className="font-medium text-[#374151]">
                    Status:
                  </span>{' '}
                  Pending
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs leading-5 text-[#6B7280]">
              You will receive access to eCHIMS functions after
              administrator approval.
            </p>
          </div>
          </LoadingGate>
        </main>
      </div>
    )
  }

  // ---------------------------------------------------------
  // ACTIVE ACCOUNT
  // ---------------------------------------------------------

  if (context.accountStatus !== 'ACTIVE') {
    redirect('/login')
  }

  if (!context.role) {
    redirect('/unauthorized')
  }

  if (!hasPermission(context.role as Role, 'dashboard.view')) {
    redirect('/unauthorized')
  }

  return (
      <DashboardShell>
        <a href="#main-content" className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
        <NavProgress />
        <CommandPalette />
        {/* Same sky tone as the sign-in page, so arriving after login feels continuous */}
        <div className={`brand flex min-h-screen items-stretch bg-[linear-gradient(180deg,#CAF0F8_0%,#E4F6FA_40%,#F1FAFC_100%)] bg-fixed text-[#03045E] animate-in fade-in duration-500`}>
          <Sidebar
            role={context.role}
            fullName={context.profile.full_name}
          />

          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <TopNav />

            <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-7xl">
                <SessionGate>{children}</SessionGate>
              </div>
            </main>
          </div>
        </div>
      </DashboardShell>
  )
}