'use client'
// An event keeps legacy module refreshes inside the active account's SWR cache.
export async function refreshOfflineViews(matches: (key: unknown) => boolean) {
  window.dispatchEvent(new CustomEvent('echims-revalidate', { detail: matches }))
}

/** Queue drains call this; the offline banner turns it into one "Synced N records" or error toast. */
export function reportSync(sent: number, failed: number) {
  if (sent > 0 || failed > 0) window.dispatchEvent(new CustomEvent('echims-synced', { detail: { sent, failed } }))
}
