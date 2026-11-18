'use client'

import { useEffect, useState } from 'react'
import { Logo } from '@/components/brand/logo'

/** Only on paper: the dark wordmark and the time the page was printed. */
export function PrintHeader() {
  const [printed, setPrinted] = useState('')
  useEffect(() => {
    const stamp = () => setPrinted(new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' }))
    stamp()
    window.addEventListener('beforeprint', stamp)
    return () => window.removeEventListener('beforeprint', stamp)
  }, [])
  return (
    <div className="print-header hidden items-end justify-between border-b border-black pb-3 mb-6 print:flex">
      <Logo variant="wordmark" tone="dark" size={36} />
      <p className="text-xs">Printed {printed}</p>
    </div>
  )
}
