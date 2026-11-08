'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// Holds every entrance animation inside it paused until the block scrolls into view,
// then plays them once. Children use the usual animate-in classes with their own delays.
export function InView({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin: '0px 0px -15% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`in-view ${visible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  )
}
