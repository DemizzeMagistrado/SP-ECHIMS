'use client'

import { useState } from 'react'

type UserRecord = {
  user_id: string
  full_name: string
  username: string
  email: string
  contact_number: string | null
  account_status: string
  created_at: string

  role: string

  assignment: {
    barangayName: string
    municipality: string
    province: string
    rhuName: string
  } | null
}

export default function UserManagementClient({
  users,
}: {
  users: UserRecord[]
}) {
  const [rows, setRows] = useState(users)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function updateStatus(
    userId: string,
    accountStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  ) {
    setLoadingId(userId)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          accountStatus,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.error ?? 'Unable to update account.')
        return
      }

      setRows((current) =>
        current.map((user) =>
          user.user_id === userId
            ? {
                ...user,
                account_status: accountStatus,
              }
            : user
        )
      )
    } catch {
      alert('Unable to connect to the server.')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#03045E]">
          User Management
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Review and manage eCHIMS user accounts.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-4 text-left text-xs font-semibold">
                User
              </th>

              <th className="px-5 py-4 text-left text-xs font-semibold">
                Email
              </th>

              <th className="px-5 py-4 text-left text-xs font-semibold">
                Status
              </th>

              <th className="px-5 py-4 text-right text-xs font-semibold">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((user) => (
              <tr
                key={user.user_id}
                className="border-t border-gray-100"
              >
                <td className="px-5 py-4">
                  <p className="font-medium text-[#03045E]">
                    {user.full_name}
                  </p>

                  <p className="text-xs text-gray-500">
                    @{user.username}
                  </p>
                </td>

                <td className="px-5 py-4 text-sm text-gray-600">
                  {user.email}
                </td>

                <td className="px-5 py-4">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                    {user.account_status}
                  </span>
                </td>

                <td className="px-5 py-4">
                  <span className="rounded-full bg-[#E0F2FE] px-3 py-1 text-xs font-medium text-[#0369A1]">
                    {user.role}
                  </span>
                </td>

                <td className="px-5 py-4">
                  {user.assignment ? (
                    <div>
                      <p className="text-sm font-medium text-[#03045E]">
                        {user.assignment.barangayName}
                      </p>

                      <p className="text-xs text-gray-500">
                        {user.assignment.municipality},{' '}
                        {user.assignment.province}
                      </p>

                      <p className="text-xs text-gray-500">
                        {user.assignment.rhuName}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">
                      No active assignment
                    </span>
                  )}
                </td>
                
                <td className="px-5 py-4 text-right">
                  {user.account_status === 'PENDING' && (
                    <button
                      disabled={loadingId === user.user_id}
                      onClick={() =>
                        updateStatus(
                          user.user_id,
                          'ACTIVE'
                        )
                      }
                      className="rounded-lg bg-[#0077B6] px-4 py-2 text-sm font-medium text-white hover:bg-[#005F91] disabled:opacity-50"
                    >
                      Activate
                    </button>
                  )}

                  {user.account_status === 'ACTIVE' && (
                    <button
                      disabled={loadingId === user.user_id}
                      onClick={() =>
                        updateStatus(
                          user.user_id,
                          'INACTIVE'
                        )
                      }
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Deactivate
                    </button>
                  )}

                  {user.account_status === 'INACTIVE' && (
                    <button
                      disabled={loadingId === user.user_id}
                      onClick={() =>
                        updateStatus(
                          user.user_id,
                          'ACTIVE'
                        )
                      }
                      className="rounded-lg bg-[#0077B6] px-4 py-2 text-sm font-medium text-white hover:bg-[#005F91] disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}