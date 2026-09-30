'use client'

import {
  useMemo,
  useState,
} from 'react'

type Assignment = {
  assignment_id: number
  user_id: string
  barangay_id: number
  assigned_date: string
  status: string
  barangay: {
    barangay_id: number
    barangay_name: string
    municipality: string | null
    province: string | null
    rhu_id: number
    rhu_name: string | null
  }
}

type UserRow = {
  user_id: string
  full_name: string
  username: string
  email: string
  contact_number: string | null
  account_status: string
  role: string
  assignment: Assignment | null
}

type UserManagementClientProps = {
  users: UserRow[]
}

export default function UserManagementClient({
  users,
}: UserManagementClientProps) {
  const [selectedUser, setSelectedUser] =
    useState<UserRow | null>(null)

  const [search, setSearch] =
    useState('')

  const [statusFilter, setStatusFilter] =
    useState('ALL')

  const [roleFilter, setRoleFilter] =
    useState('ALL')

  const [processingUserId, setProcessingUserId] =
    useState<string | null>(null)

  const [message, setMessage] =
    useState<string | null>(null)

  const [error, setError] =
    useState<string | null>(null)

  /* =========================================================
     FILTER USERS
  ========================================================= */

  const filteredUsers = useMemo(() => {
    const searchValue =
      search.trim().toLowerCase()

    return users.filter((user) => {
      const matchesSearch =
        !searchValue ||
        user.full_name
          .toLowerCase()
          .includes(searchValue) ||
        user.email
          .toLowerCase()
          .includes(searchValue) ||
        user.username
          .toLowerCase()
          .includes(searchValue)

      const matchesStatus =
        statusFilter === 'ALL' ||
        user.account_status ===
          statusFilter

      const matchesRole =
        roleFilter === 'ALL' ||
        user.role === roleFilter

      return (
        matchesSearch &&
        matchesStatus &&
        matchesRole
      )
    })
  }, [
    users,
    search,
    statusFilter,
    roleFilter,
  ])

  /* =========================================================
     SUMMARY COUNTS
  ========================================================= */

  const pendingCount = users.filter(
    (user) =>
      user.account_status === 'PENDING'
  ).length

  const activeCount = users.filter(
    (user) =>
      user.account_status === 'ACTIVE'
  ).length

  const inactiveCount = users.filter(
    (user) =>
      user.account_status === 'INACTIVE'
  ).length

  const suspendedCount = users.filter(
    (user) =>
      user.account_status === 'SUSPENDED'
  ).length

  /* =========================================================
     UPDATE ACCOUNT
  ========================================================= */

  async function updateAccountStatus(
    user: UserRow,
    accountStatus:
      | 'ACTIVE'
      | 'INACTIVE'
      | 'SUSPENDED'
  ) {
    setProcessingUserId(user.user_id)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(
        '/api/admin/users',
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            userId: user.user_id,
            accountStatus,
          }),
        }
      )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data?.error ??
            'Unable to update account.'
        )
      }

      setMessage(
        accountStatus === 'ACTIVE'
          ? 'Account approved successfully.'
          : accountStatus === 'INACTIVE'
            ? 'Account deactivated successfully.'
            : 'Account suspended successfully.'
      )

      /*
       * Update the selected user's data
       * immediately so the modal reflects
       * the new state.
       */
      setSelectedUser((current) => {
        if (
          !current ||
          current.user_id !==
            user.user_id
        ) {
          return current
        }

        return {
          ...current,

          account_status:
            accountStatus,

          assignment:
            current.assignment
              ? {
                  ...current.assignment,

                  status:
                    accountStatus ===
                    'ACTIVE'
                      ? 'ACTIVE'
                      : accountStatus ===
                          'INACTIVE'
                        ? 'INACTIVE'
                        : current
                            .assignment
                            .status,
                }
              : null,
        }
      })

      /*
       * Reload the page so the server
       * data stays synchronized.
       */
      window.location.reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update account.'
      )
    } finally {
      setProcessingUserId(null)
    }
  }

  /* =========================================================
     WORKPLACE DISPLAY
  ========================================================= */

  function getWorkplace(
    assignment: Assignment | null
  ) {
    if (!assignment) {
      return 'No workplace submitted'
    }

    const barangay =
      assignment.barangay
        ?.barangay_name ??
      'Unknown Barangay'

    const municipality =
      assignment.barangay
        ?.municipality ?? ''

    const province =
      assignment.barangay
        ?.province ?? ''

    const rhu =
      assignment.barangay
        ?.rhu_name ??
      'Unknown RHU'

    return `${barangay}, ${municipality}, ${province} — ${rhu}`
  }

  /* =========================================================
     STATUS BADGE
  ========================================================= */

  function statusBadge(
    status: string
  ) {
    const normalized =
      status.toUpperCase()

    if (
      normalized === 'ACTIVE'
    ) {
      return (
        <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Active
        </span>
      )
    }

    if (
      normalized === 'PENDING'
    ) {
      return (
        <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
          Pending
        </span>
      )
    }

    if (
      normalized === 'SUSPENDED'
    ) {
      return (
        <span className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
          Suspended
        </span>
      )
    }

    return (
      <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
        Inactive
      </span>
    )
  }

  /* =========================================================
     CLOSE MODAL
  ========================================================= */

  function closeModal() {
    if (processingUserId) {
      return
    }

    setSelectedUser(null)
    setMessage(null)
    setError(null)
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="space-y-6">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div>
        <h1 className="text-3xl font-bold text-[#023E8A]">
          User Management
        </h1>

        <p className="mt-1 text-sm text-gray-600">
          Manage registered personnel,
          account verification, and
          workplace assignments.
        </p>
      </div>

      {/* =====================================================
          SUMMARY CARDS
      ===================================================== */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Pending"
          value={pendingCount}
          description="Awaiting verification"
        />

        <SummaryCard
          title="Active"
          value={activeCount}
          description="Authorized accounts"
        />

        <SummaryCard
          title="Inactive"
          value={inactiveCount}
          description="Deactivated accounts"
        />

        <SummaryCard
          title="Suspended"
          value={suspendedCount}
          description="Suspended accounts"
        />
      </div>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* SEARCH */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Search
            </label>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search name, username, or email..."
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20"
            />
          </div>

          {/* STATUS */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Account Status
            </label>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20"
            >
              <option value="ALL">
                All statuses
              </option>

              <option value="PENDING">
                Pending
              </option>

              <option value="ACTIVE">
                Active
              </option>

              <option value="INACTIVE">
                Inactive
              </option>

              <option value="SUSPENDED">
                Suspended
              </option>
            </select>
          </div>

          {/* ROLE */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Role
            </label>

            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20"
            >
              <option value="ALL">
                All roles
              </option>

              <option value="Administrator">
                Administrator
              </option>

              <option value="Public Health Nurse">
                Public Health Nurse
              </option>

              <option value="Rural Health Midwife">
                Rural Health Midwife
              </option>

              <option value="Barangay Health Worker">
                Barangay Health Worker
              </option>

              <option value="Barangay Nutrition Scholar">
                Barangay Nutrition Scholar
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* =====================================================
          MESSAGE
      ===================================================== */}

      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* =====================================================
          TABLE
      ===================================================== */}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  User
                </th>

                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Role
                </th>

                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Account
                </th>

                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Workplace
                </th>

                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(
                  (user) => (
                    <tr
                      key={user.user_id}
                      className="transition hover:bg-[#CAF0F8]/30"
                    >
                      {/* USER */}

                      <td className="px-6 py-5">
                        <div>
                          <p className="font-semibold text-gray-800">
                            {user.full_name}
                          </p>

                          <p className="mt-1 text-sm text-gray-500">
                            {user.email}
                          </p>
                        </div>
                      </td>

                      {/* ROLE */}

                      <td className="px-6 py-5">
                        <span className="text-sm text-gray-700">
                          {user.role}
                        </span>
                      </td>

                      {/* ACCOUNT */}

                      <td className="px-6 py-5">
                        {statusBadge(
                          user.account_status
                        )}
                      </td>

                      {/* WORKPLACE */}

                      <td className="px-6 py-5">
                        <div className="max-w-xs">
                          <p className="text-sm font-medium text-gray-700">
                            {user.assignment
                              ? user
                                  .assignment
                                  .barangay
                                  .barangay_name
                              : 'Not assigned'}
                          </p>

                          {user.assignment && (
                            <>
                              <p className="mt-1 text-xs text-gray-500">
                                {
                                  user
                                    .assignment
                                    .barangay
                                    .rhu_name
                                }
                              </p>

                              {user.assignment
                                .status ===
                                'PENDING' && (
                                <span className="mt-2 inline-flex rounded-full bg-yellow-50 px-2 py-1 text-[11px] font-semibold text-yellow-700">
                                  Pending verification
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      {/* ACTION */}

                      <td className="px-6 py-5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedUser(
                              user
                            )
                          }
                          className="rounded-xl bg-[#0077B6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#005F91]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================
          USER DETAILS MODAL
      ===================================================== */}

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            {/* HEADER */}

            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-[#023E8A]">
                  User Details
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Review account and workplace
                  information.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-3 py-1 text-2xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 p-6">
              {/* =================================================
                  ACCOUNT INFORMATION
              ================================================= */}

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Account Information
                </h3>

                <div className="grid grid-cols-1 gap-4 rounded-2xl bg-gray-50 p-5 md:grid-cols-2">
                  <InfoItem
                    label="Full Name"
                    value={
                      selectedUser.full_name
                    }
                  />

                  <InfoItem
                    label="Username"
                    value={
                      selectedUser.username ||
                      '—'
                    }
                  />

                  <InfoItem
                    label="Email"
                    value={
                      selectedUser.email
                    }
                  />

                  <InfoItem
                    label="Contact Number"
                    value={
                      selectedUser.contact_number ||
                      '—'
                    }
                  />

                  <InfoItem
                    label="Role"
                    value={
                      selectedUser.role
                    }
                  />

                  <div>
                    <p className="text-xs font-medium text-gray-500">
                      Account Status
                    </p>

                    <div className="mt-2">
                      {statusBadge(
                        selectedUser.account_status
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* =================================================
                  WORKPLACE
              ================================================= */}

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Requested Workplace
                </h3>

                {selectedUser.assignment ? (
                  <div className="rounded-2xl border border-[#CAF0F8] bg-[#CAF0F8]/40 p-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <InfoItem
                        label="RHU"
                        value={
                          selectedUser
                            .assignment
                            .barangay
                            .rhu_name ??
                          '—'
                        }
                      />

                      <InfoItem
                        label="Barangay"
                        value={
                          selectedUser
                            .assignment
                            .barangay
                            .barangay_name
                        }
                      />

                      <InfoItem
                        label="Municipality"
                        value={
                          selectedUser
                            .assignment
                            .barangay
                            .municipality ??
                          '—'
                        }
                      />

                      <InfoItem
                        label="Province"
                        value={
                          selectedUser
                            .assignment
                            .barangay
                            .province ??
                          '—'
                        }
                      />

                      <InfoItem
                        label="Assignment Status"
                        value={
                          selectedUser
                            .assignment
                            .status
                        }
                      />

                      <InfoItem
                        label="Requested Date"
                        value={
                          selectedUser
                            .assignment
                            .assigned_date
                            ? new Date(
                                selectedUser
                                  .assignment
                                  .assigned_date
                              ).toLocaleDateString(
                                'en-PH',
                                {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                }
                              )
                            : '—'
                        }
                      />
                    </div>

                    {selectedUser
                      .assignment
                      .status ===
                      'PENDING' && (
                      <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                        This workplace is
                        awaiting administrator
                        verification.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
                    No workplace assignment
                    has been submitted.
                  </div>
                )}
              </section>

              {/* =================================================
                  ACCOUNT VERIFICATION
              ================================================= */}

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Account Verification
                </h3>

                <div className="rounded-2xl border border-gray-200 p-5">
                  {selectedUser.account_status ===
                    'PENDING' && (
                    <>
                      <p className="text-sm leading-6 text-gray-600">
                        Review the user's role
                        and requested workplace
                        before approving the
                        account.
                      </p>

                      {!selectedUser.assignment && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          This user has no
                          workplace assignment.
                          Verify the registration
                          before approving.
                        </div>
                      )}

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={
                            processingUserId ===
                            selectedUser.user_id
                          }
                          onClick={() =>
                            updateAccountStatus(
                              selectedUser,
                              'INACTIVE'
                            )
                          }
                          className="rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingUserId ===
                          selectedUser.user_id
                            ? 'Processing...'
                            : 'Reject Registration'}
                        </button>

                        <button
                          type="button"
                          disabled={
                            processingUserId ===
                              selectedUser.user_id ||
                            !selectedUser.assignment
                          }
                          onClick={() =>
                            updateAccountStatus(
                              selectedUser,
                              'ACTIVE'
                            )
                          }
                          className="rounded-xl bg-[#0077B6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#005F91] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingUserId ===
                          selectedUser.user_id
                            ? 'Processing...'
                            : 'Approve Account'}
                        </button>
                      </div>
                    </>
                  )}

                  {selectedUser.account_status ===
                    'ACTIVE' && (
                    <>
                      <p className="text-sm leading-6 text-gray-600">
                        This account is currently
                        active and authorized.
                      </p>

                      <div className="mt-5 flex justify-end">
                        <button
                          type="button"
                          disabled={
                            processingUserId ===
                            selectedUser.user_id
                          }
                          onClick={() =>
                            updateAccountStatus(
                              selectedUser,
                              'INACTIVE'
                            )
                          }
                          className="rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingUserId ===
                          selectedUser.user_id
                            ? 'Processing...'
                            : 'Deactivate Account'}
                        </button>
                      </div>
                    </>
                  )}

                  {selectedUser.account_status ===
                    'INACTIVE' && (
                    <>
                      <p className="text-sm leading-6 text-gray-600">
                        This account is currently
                        inactive.
                      </p>

                      <div className="mt-5 flex justify-end">
                        <button
                          type="button"
                          disabled={
                            processingUserId ===
                            selectedUser.user_id
                          }
                          onClick={() =>
                            updateAccountStatus(
                              selectedUser,
                              'ACTIVE'
                            )
                          }
                          className="rounded-xl bg-[#0077B6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#005F91] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingUserId ===
                          selectedUser.user_id
                            ? 'Processing...'
                            : 'Reactivate Account'}
                        </button>
                      </div>
                    </>
                  )}

                  {selectedUser.account_status ===
                    'SUSPENDED' && (
                    <>
                      <p className="text-sm leading-6 text-gray-600">
                        This account is currently
                        suspended.
                      </p>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={
                            processingUserId ===
                            selectedUser.user_id
                          }
                          onClick={() =>
                            updateAccountStatus(
                              selectedUser,
                              'ACTIVE'
                            )
                          }
                          className="rounded-xl bg-[#0077B6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#005F91] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingUserId ===
                          selectedUser.user_id
                            ? 'Processing...'
                            : 'Reactivate Account'}
                        </button>

                        <button
                          type="button"
                          disabled={
                            processingUserId ===
                            selectedUser.user_id
                          }
                          onClick={() =>
                            updateAccountStatus(
                              selectedUser,
                              'INACTIVE'
                            )
                          }
                          className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Set Inactive
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* =================================================
                  WORKPLACE SUMMARY
              ================================================= */}

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Authorization Summary
                </h3>

                <div className="rounded-2xl bg-gray-50 p-5">
                  <p className="text-sm leading-6 text-gray-600">
                    The user can access eCHIMS
                    only when the account is
                    <strong className="mx-1 text-gray-800">
                      ACTIVE
                    </strong>
                    and the workplace assignment
                    is
                    <strong className="mx-1 text-gray-800">
                      ACTIVE
                    </strong>
                    .
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <AuthorizationStatus
                      label="Account"
                      active={
                        selectedUser.account_status ===
                        'ACTIVE'
                      }
                    />

                    <AuthorizationStatus
                      label="Workplace"
                      active={
                        selectedUser
                          .assignment
                          ?.status ===
                        'ACTIVE'
                      }
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string
  value: number
  description: string
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">
        {title}
      </p>

      <p className="mt-2 text-3xl font-bold text-[#023E8A]">
        {value}
      </p>

      <p className="mt-1 text-xs text-gray-500">
        {description}
      </p>
    </div>
  )
}

/* =========================================================
   INFO ITEM
========================================================= */

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-gray-800">
        {value}
      </p>
    </div>
  )
}

/* =========================================================
   AUTHORIZATION STATUS
========================================================= */

function AuthorizationStatus({
  label,
  active,
}: {
  label: string
  active: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span className="text-sm font-medium text-gray-700">
        {label}
      </span>

      {active ? (
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          ACTIVE
        </span>
      ) : (
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
          NOT ACTIVE
        </span>
      )}
    </div>
  )
}