'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { StatusPage, primaryAction, secondaryAction } from '@/components/ui/status-page'

// Inside the dashboard layout: only the content area shows the error; the sidebar and top bar stay.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <StatusPage
      area="content"
      title="Something went wrong"
      message="This section ran into a problem. Your saved records are safe. Try again, or go back to your dashboard."
      actions={<>
        <Link href="/dashboard" className={secondaryAction}>Back to dashboard</Link>
        <button type="button" onClick={reset} className={primaryAction}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
      </>}
    />
  )
}
