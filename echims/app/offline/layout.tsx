import { Suspense, type ReactNode } from 'react'

export const dynamic = 'force-static'

export default function OfflineLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <Suspense fallback={<p>Loading offline workspace…</p>}>
      {children}
    </Suspense>
  )
}