'use client'
// Last good response of pages that load without SWR, per account, kept for this browser tab only.
// A revisit starts from it (no loader) while the page's own loader refreshes it in the background.
// Everything is dropped when a different account reads or writes, and on sign-out.
let account: string | null = null
const store = new Map<string, unknown>()

function use(owner: string) {
  if (owner !== account) { store.clear(); account = owner }
}

export function readPageCache<T>(owner: string | null | undefined, key: string): T | undefined {
  if (!owner) return undefined
  use(owner)
  return store.get(key) as T | undefined
}

export function writePageCache<T>(owner: string | null | undefined, key: string, value: T) {
  if (!owner) return
  use(owner)
  store.set(key, value)
}

export function clearPageCache() {
  store.clear()
  account = null
}
