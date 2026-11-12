'use client'

// Searchable multi-select for a child's medical history: common childhood illnesses from the
// catalog, earlier "Other" entries as suggestions, and "Other: <typed text>" for anything else.
// Selected items show as removable chips. Combobox keyboard pattern: ↑/↓ move, Enter picks,
// Esc closes, Backspace on an empty box removes the last chip.

import { useId, useRef, useState } from 'react'
import useSWR from 'swr'
import { Plus, X } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { controlClass } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { splitCodes, splitOtherConditions, type Condition } from '@/lib/children/medical-history'

type Options = { conditions: Condition[]; suggestions: string[] }
type Item = { kind: 'code' | 'other'; value: string; label: string; hint?: string }

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'The illness list could not be loaded.')
  return d as Options
}

export function useMedicalHistoryOptions() {
  return useSWR<Options>('/api/children/medical-history-options', fetcher, { revalidateOnFocus: false })
}

export function MedicalHistoryPicker({ codes, others, onChange }: {
  codes: string
  others: string
  onChange: (next: { codes: string; others: string }) => void
}) {
  const { data, error } = useMedicalHistoryOptions()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  const selectedCodes = splitCodes(codes)
  const selectedOthers = splitOtherConditions(others)
  const conditions = data?.conditions ?? []
  const labelFor = (code: string) => conditions.find((c) => c.code === code)?.label ?? code.replace(/_/g, ' ').toLowerCase()

  const items: Item[] = (() => {
    const q = query.trim().toLowerCase()
    const taken = new Set(selectedOthers.map((o) => o.toLowerCase()))
    const list: Item[] = conditions
      .filter((c) => !selectedCodes.includes(c.code) && (!q || c.label.toLowerCase().includes(q)))
      .map((c) => ({ kind: 'code', value: c.code, label: c.label }))
    for (const s of data?.suggestions ?? []) {
      if (!taken.has(s.toLowerCase()) && (!q || s.toLowerCase().includes(q))) list.push({ kind: 'other', value: s, label: s, hint: 'entered before' })
    }
    const typed = query.trim().replace(/;/g, ',')
    const exact = list.some((i) => i.label.toLowerCase() === typed.toLowerCase()) || taken.has(typed.toLowerCase())
    if (typed && !exact) list.push({ kind: 'other', value: typed, label: `Other: ${typed}` })
    return list
  })()

  function pick(item: Item) {
    if (item.kind === 'code') onChange({ codes: [...selectedCodes, item.value].join('|'), others })
    else onChange({ codes, others: [...selectedOthers, item.value].join('; ') })
    setQuery('')
    setActive(0)
    input.current?.focus()
  }
  const removeCode = (code: string) => onChange({ codes: selectedCodes.filter((c) => c !== code).join('|'), others })
  const removeOther = (label: string) => onChange({ codes, others: selectedOthers.filter((o) => o !== label).join('; ') })

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      // Never submit the form from here.
      e.preventDefault()
      if (open && items[active]) pick(items[active])
    } else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
    else if (e.key === 'Backspace' && !query) {
      if (selectedOthers.length) removeOther(selectedOthers[selectedOthers.length - 1])
      else if (selectedCodes.length) removeCode(selectedCodes[selectedCodes.length - 1])
    }
  }

  const chip = 'inline-flex items-center gap-1 rounded-full bg-brand-ice px-2.5 py-1 text-xs font-medium text-brand-navy ring-1 ring-inset ring-brand-blue/20'
  return (
    <div className="space-y-2">
      {(selectedCodes.length > 0 || selectedOthers.length > 0) && (
        <ul aria-label="Selected conditions" className="flex flex-wrap gap-1.5">
          {selectedCodes.map((code) => (
            <li key={code} className={chip}>
              {labelFor(code)}
              <button type="button" onClick={() => removeCode(code)} aria-label={`Remove ${labelFor(code)}`} className="rounded-full p-0.5 hover:bg-white"><X size={12} aria-hidden="true" /></button>
            </li>
          ))}
          {selectedOthers.map((label) => (
            <li key={label} className={chip}>
              <span className="text-muted-foreground">Other:</span> {label}
              <button type="button" onClick={() => removeOther(label)} aria-label={`Remove ${label}`} className="rounded-full p-0.5 hover:bg-white"><X size={12} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          ref={input}
          role="combobox"
          aria-label="Search illnesses"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Search an illness, or type another condition…"
          autoComplete="off"
          className={cn(controlClass, 'h-10')}
        />
        {open && items.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Illnesses" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg">
            {items.map((item, i) => (
              <li
                key={`${item.kind}:${item.value}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown keeps focus in the input (blur would close the list first)
                onMouseDown={(e) => { e.preventDefault(); pick(item) }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm', i === active && 'bg-muted')}
              >
                <span className="flex items-center gap-2">
                  {item.label.startsWith('Other: ') && <Plus size={14} aria-hidden="true" className="text-muted-foreground" />}
                  {item.label}
                </span>
                {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-warn">{error.message}</p>}
    </div>
  )
}
