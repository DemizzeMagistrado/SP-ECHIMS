'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import './globals.css'
import { fontVariables } from '@/lib/fonts'
import { StatusPage, primaryAction, secondaryAction } from '@/components/ui/status-page'

// Replaces the root layout when it fails, so it brings its own <html>, styles and fonts.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <html lang="en" className={`light ${fontVariables}`}>
      <body className="antialiased bg-[linear-gradient(180deg,#CAF0F8_0%,#E4F6FA_40%,#F1FAFC_100%)]">
        <main className="animate-in fade-in duration-500">
          <StatusPage
            title="Something went wrong"
            message="eCHIMS ran into a problem loading. Your saved records are safe. Try again, or go back to your dashboard."
            actions={<>
              {/* A full page load: the app shell itself failed, so client navigation may not work. */}
              <a href="/dashboard" className={secondaryAction}>Back to dashboard</a>
              <button type="button" onClick={reset} className={primaryAction}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
            </>}
          />
        </main>
      </body>
    </html>
  )
}
