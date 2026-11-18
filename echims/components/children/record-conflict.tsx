'use client'

// Shows two versions of a child record side by side (yours vs the saved one) and lets the user
// decide, instead of a generic save error. Used for edit conflicts (someone else saved while you
// were editing) and duplicate registrations (an offline draft or new record matches a saved child).

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { FieldChange } from '@/lib/children/profile-fields'

export function RecordConflict({ title, description, rows, actions, note }: {
  title: string
  description: ReactNode
  rows: FieldChange[]
  actions: ReactNode
  note?: ReactNode
}) {
  return (
    <section aria-labelledby="record-conflict-title" className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-warn/25 bg-warn-soft p-4">
        <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
        <div>
          <h3 id="record-conflict-title" className="font-semibold text-brand-navy">{title}</h3>
          <div className="mt-1 text-sm text-brand-navy/80">{description}</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Your version compared with the saved record</caption>
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Field</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Yours</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Saved record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const differs = r.yours !== r.saved
              return (
                <tr key={r.field} className={differs ? 'bg-warn-soft/40' : undefined}>
                  <th scope="row" className="px-4 py-2.5 text-left font-medium text-muted-foreground">{r.label}</th>
                  <td className="px-4 py-2.5 text-foreground">{r.yours || <span className="text-muted-foreground">Empty</span>}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.saved || <span className="text-muted-foreground">Empty</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </section>
  )
}
