// A page or tab this role cannot use: one look everywhere (same danger tokens and shape as LoadError).
//   if (!canView) return <NoAccess>You do not have access to Inventory.</NoAccess>

import type { ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'

export function NoAccess({ children = 'Your role cannot open this page. Ask your administrator if you need access.' }: { children?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-5">
      <ShieldAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
      <div>
        <h2 className="text-base font-semibold text-brand-navy">Not authorized</h2>
        <p className="mt-1 text-sm text-brand-navy/80">{children}</p>
      </div>
    </div>
  )
}
