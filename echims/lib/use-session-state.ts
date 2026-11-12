'use client'

// List state (search, filters, page) that survives opening a child and pressing Back.
// Kept in memory for the browser tab (client-side navigation) and mirrored to sessionStorage
// (full reloads); if storage is blocked it still works for in-app Back. Server render and first
// paint use the default, so there is no hydration mismatch.
//   const [q, setQ] = useSessionState('vacc.records.q', '')

import { useCallback, useSyncExternalStore } from 'react'

const memory = new Map<string, string>()
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!
  try { return sessionStorage.getItem(key) } catch { return null }
}

type Widen<T> = T extends string ? string : number

export function useSessionState<T extends string | number>(key: string, initial: T): [Widen<T>, (value: Widen<T>) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null)
  const value = (raw === null ? initial : typeof initial === 'number' ? (Number.isFinite(Number(raw)) ? Number(raw) : initial) : raw) as Widen<T>
  const set = useCallback((next: Widen<T>) => {
    const s = String(next)
    memory.set(key, s)
    try { if (s === String(initial)) sessionStorage.removeItem(key); else sessionStorage.setItem(key, s) } catch { /* memory copy is enough */ }
    listeners.forEach((l) => l())
  }, [key, initial])
  return [value, set]
}
