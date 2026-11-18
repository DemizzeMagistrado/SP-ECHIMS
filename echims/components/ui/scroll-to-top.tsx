'use client'
// Fixed bottom-right "back to top" button: appears after 300px of scrolling (fade + rise), smooth
// scroll (instant with reduced motion). Pages with long multi-section tabs (Inventory) use it.
import { useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let frame = 0
    const check = () => { frame = 0; setVisible(window.scrollY > 300) }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check) }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll) }
  }, [])

  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      className={cn(
        'fixed bottom-6 right-6 z-50 flex size-10 cursor-pointer items-center justify-center rounded-[10px] bg-[#07075F] text-white shadow-[0_2px_8px_rgba(12,18,96,0.18)] transition-[opacity,transform,background-color,box-shadow] duration-200 hover:bg-[#1A1A80] hover:shadow-[0_4px_12px_rgba(12,18,96,0.25)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#0B759A] motion-reduce:transition-none print:hidden',
        visible ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ChevronUp size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
