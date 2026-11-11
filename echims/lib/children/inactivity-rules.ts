// CP-REV01 §8 — Placeholder for automatic child inactivity rules.
//
// TODO(RHU Daet): the rules are still being confirmed with the RHU. Until then, status changes
// (ACTIVE / INACTIVE / MOVED / LOST / DECEASED) stay manual through the Change status modal
// (components/children/change-status-modal.tsx). Nothing calls this yet.
//
// When the rules are agreed, list them here (e.g. "no visit for N months → suggest INACTIVE")
// and evaluate them server-side, suggesting a status for a health worker to confirm rather than
// changing it silently.

export type InactivityRule = {
  code: string
  description: string
  /** Suggested status when the rule matches; a health worker confirms it. */
  suggestedStatus: 'INACTIVE' | 'MOVED' | 'LOST'
}

export const INACTIVITY_RULES: InactivityRule[] = []
