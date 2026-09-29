import {
  Users,
  UserCheck,
  Clock,
  UserX,
  ShieldCheck,
} from 'lucide-react'
import { requirePermission } from '@/lib/auth/authorization'

const summaryCards = [
  {
    title: 'Total Users',
    value: '—',
    description: 'Registered system personnel',
    icon: Users,
  },
  {
    title: 'Active Users',
    value: '—',
    description: 'Currently active accounts',
    icon: UserCheck,
  },
  {
    title: 'Pending Approval',
    value: '—',
    description: 'Accounts awaiting review',
    icon: Clock,
  },
  {
    title: 'Inactive Users',
    value: '—',
    description: 'Currently inactive accounts',
    icon: UserX,
  },
]

const sampleUsers = [
  {
    name: 'No user records loaded',
    email: '—',
    role: '—',
    status: '—',
    location: '—',
  },
]

export default async function UserManagementPage() {
  await requirePermission('users.view')

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-[#0077B6]">
            Administration
          </p>

          <h1 className="mt-1 text-3xl font-bold text-[#03045E]">
            User Management
          </h1>

          <p className="mt-2 text-sm text-[#6B7280]">
            Manage eCHIMS personnel accounts, roles, assignments,
            and account access.
          </p>
        </div>

        <button
          type="button"
          className="rounded-xl bg-[#0077B6] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#005F91]"
        >
          + Register Personnel
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <div
              key={card.title}
              className="rounded-2xl border border-[#DDEAF0] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#6B7280]">
                    {card.title}
                  </p>

                  <p className="mt-2 text-3xl font-bold text-[#03045E]">
                    {card.value}
                  </p>
                </div>

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#CAF0F8]">
                  <Icon
                    size={21}
                    className="text-[#0077B6]"
                    strokeWidth={1.7}
                  />
                </div>
              </div>

              <p className="mt-3 text-xs text-[#9CA3AF]">
                {card.description}
              </p>
            </div>
          )
        })}
      </div>

      {/* Account Review */}
      <section className="rounded-2xl border border-[#DDEAF0] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#E5E7EB] px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#03045E]">
              Personnel Accounts
            </h2>

            <p className="mt-1 text-sm text-[#6B7280]">
              Review registered personnel and manage their account status.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Search personnel..."
              className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-4 py-2.5 text-sm text-[#03045E] outline-none transition focus:border-[#0077B6] focus:bg-white focus:ring-2 focus:ring-[#0077B6]/20"
            />

            <select
              defaultValue="all"
              className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-4 py-2.5 text-sm text-[#03045E] outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Personnel
                </th>

                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Role
                </th>

                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Assignment
                </th>

                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Status
                </th>

                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {sampleUsers.map((user) => (
                <tr
                  key={user.name}
                  className="border-b border-[#F1F5F9]"
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#CAF0F8]">
                        <Users
                          size={18}
                          className="text-[#0077B6]"
                          strokeWidth={1.7}
                        />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-[#03045E]">
                          {user.name}
                        </p>

                        <p className="text-xs text-[#6B7280]">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5 text-sm text-[#374151]">
                    {user.role}
                  </td>

                  <td className="px-6 py-5 text-sm text-[#374151]">
                    {user.location}
                  </td>

                  <td className="px-6 py-5">
                    <span className="inline-flex rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-medium text-[#6B7280]">
                      {user.status}
                    </span>
                  </td>

                  <td className="px-6 py-5 text-right">
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] px-3 py-2 text-xs font-medium text-[#374151] transition-colors hover:border-[#0077B6] hover:text-[#0077B6]"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* RBAC Information */}
      <section className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white">
            <ShieldCheck
              size={22}
              className="text-[#0077B6]"
              strokeWidth={1.7}
            />
          </div>

          <div>
            <h2 className="text-base font-bold text-[#03045E]">
              Role-Based Access Control
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#4B5563]">
              Personnel access is determined by their authorized
              database role and assigned health-service area.
              Account registration alone does not grant system
              permissions.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}