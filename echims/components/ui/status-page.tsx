'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { useAuth } from '@/components/auth/auth-provider'

export const primaryAction = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
export const secondaryAction = 'inline-flex items-center justify-center gap-2 rounded-lg border border-brand-line bg-white px-5 py-2.5 text-sm font-semibold text-brand-navy hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * 404 / error screens. area=content fills the dashboard content area (sidebar and top bar stay);
 * area=page fills the viewport. Callers outside the dashboard wrap it in a LoadingGate for the
 * entrance fade; inside it, the dashboard template's PageGate already provides it.
 */
export function StatusPage({ code, title, message, actions, area = 'page' }: {
  code?: string; title: string; message: string; actions: ReactNode; area?: 'page' | 'content'
}) {
  return (
    <div className={`flex items-center justify-center px-4 py-10 ${area === 'page' ? 'min-h-dvh' : 'min-h-[calc(100dvh-7rem)] lg:min-h-[calc(100dvh-8rem)]'}`}>
      <div className="w-full max-w-md text-center">
        <Logo variant="mark" size={56} className="mx-auto" />
        {code && <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[#035C8C]">{code}</p>}
        <h1 className={`${code ? 'mt-2' : 'mt-6'} font-display text-2xl font-bold text-brand-navy sm:text-3xl`}>{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-brand-muted">{message}</p>
        <div className="mt-8 flex flex-col-reverse justify-center gap-2 sm:flex-row">{actions}</div>
      </div>
    </div>
  )
}

/** "Back to dashboard" when signed in, otherwise "Back to home". Pass signedIn to skip the session lookup. */
export function HomeLink({ signedIn }: { signedIn?: boolean }) {
  const { user } = useAuth()
  signedIn ??= Boolean(user)
  return <Link href={signedIn ? '/dashboard' : '/'} className={primaryAction}>{signedIn ? 'Back to dashboard' : 'Back to home'}</Link>
}
