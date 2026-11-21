export const guardianSessionEvent = 'echims-guardian-session-changed'

export function notifyGuardianSessionChanged() {
  try { window.localStorage.setItem(guardianSessionEvent, crypto.randomUUID()) } catch {
    // Other tabs also verify their session when brought to the foreground.
  }
}
