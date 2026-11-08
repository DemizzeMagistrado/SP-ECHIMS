'use client'

import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2'

// Signed-in visitors go straight to their dashboard instead of the sign-in form.
export function HeaderActions() {
  const { isReady, user } = useAuth()

  if (isReady && user) {
    return (
      <Link
        href="/dashboard"
        className={`rounded-lg bg-[#087DB9] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#056d9e] ${focusRing}`}
      >
        Open dashboard
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-[#03045E] transition-colors hover:bg-[#CAF0F8] ${focusRing}`}
      >
        Sign in
      </Link>
      <Link
        href="/register"
        className={`hidden rounded-lg bg-[#087DB9] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#056d9e] sm:inline-block ${focusRing}`}
      >
        Create account
      </Link>
    </div>
  )
}
