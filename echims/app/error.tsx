'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { LoadingGate } from '@/components/brand/loading-gate'
import { StatusPage, primaryAction, secondaryAction } from '@/components/ui/status-page'

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <main className="bg-[linear-gradient(180deg,#CAF0F8_0%,#E4F6FA_40%,#F1FAFC_100%)]">
      <LoadingGate ready doneLabel="">
        <StatusPage
          title="Something went wrong"
          message="This page ran into a problem. Your saved records are safe. Try again, or go back to your dashboard."
          actions={<>
            <Link href="/dashboard" className={secondaryAction}>Back to dashboard</Link>
            <button type="button" onClick={reset} className={primaryAction}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
          </>}
        />
      </LoadingGate>
    </main>
  )
}
