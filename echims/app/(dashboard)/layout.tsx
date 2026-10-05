import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopNav } from '@/components/dashboard/top-nav'
import { getAuthorizationContext } from '@/lib/auth/authorization'
import { hasPermission, type Role } from '@/lib/auth/permissions'
import { ToastProvider } from '@/components/ui/toast'

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

            <p className="mt-6 text-xs leading-5 text-[#9CA3AF]">
              You will receive access to eCHIMS functions after
              administrator approval.
            </p>
          </div>
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
    <ToastProvider>
      <div className="flex min-h-screen items-stretch bg-[#CAF0F8]">
        <Sidebar
          role={context.role}
          fullName={context.profile.full_name}
        />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <TopNav />

          <main className="min-h-0 flex-1 overflow-y-auto bg-[#CAF0F8] p-8">
            <div className="mx-auto w-full max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}