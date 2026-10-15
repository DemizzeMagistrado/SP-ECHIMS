'use client'
// An event keeps legacy module refreshes inside the active account's SWR cache.
export async function refreshOfflineViews(matches: (key: unknown) => boolean) {
  window.dispatchEvent(new CustomEvent('echims-revalidate', { detail: matches }))
}
