import { useEffect, useRef, useState } from 'react'

/**
 * Keeps a loader up for at least `minMs` once it has been visible (the loader itself
 * stays invisible for its first 200ms), so fast loads never flash it.
 */
export function useMinimumLoading(loading: boolean, minMs = 400) {
  const shownAt = useRef<number | null>(null)
  const [hold, setHold] = useState(false)
  useEffect(() => {
    if (loading) {
      const t = window.setTimeout(() => { shownAt.current = Date.now() }, 200)
      return () => window.clearTimeout(t)
    }
    if (shownAt.current === null) return
    const left = shownAt.current + minMs - Date.now()
    shownAt.current = null
    if (left <= 0) return
    setHold(true)
    const t = window.setTimeout(() => setHold(false), left)
    return () => window.clearTimeout(t)
  }, [loading, minMs])
  return loading || hold
}
