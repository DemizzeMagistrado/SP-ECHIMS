'use client'

// Ctrl+K / ⌘K (or the top bar's Search button) opens a page finder over the sidebar modules and
// their tabs, filtered to what the signed-in role can view. ↑/↓ move, Enter opens, Esc closes.
// shortcut: pages only; add record search (children, batches) once those APIs take a query.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { useRouter } from '@/lib/offline/navigation'
import { canPerform, moduleTabs, roleModules, type UserRole } from '@/lib/echims-data'
import { menuGroups } from './sidebar'

type Item = { label: string; group: string; href: string }

export function CommandPalette() {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const items = useMemo<Item[]>(() => {
    if (!role || !roleModules[role]) return []
    return menuGroups.flatMap((g) => g.items.filter((i) => roleModules[role].includes(i.label)).flatMap((i) => {
      const tabs = (moduleTabs[i.label] ?? []).filter((t) => canPerform(role, t.module, 'view'))
      return [{ label: i.label, group: g.title, href: i.href },
        ...tabs.filter((t) => t.href !== i.href).map((t) => ({ label: `${i.label} › ${t.label}`, group: g.title, href: t.href }))]
    }))
  }, [role])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items
  }, [items, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('echims-open-search', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('echims-open-search', onOpen) }
  }, [])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) { setQuery(''); setActive(0); d.showModal() }
    if (!open && d.open) d.close()
  }, [open])

  const go = (item?: Item) => { if (!item) return; setOpen(false); router.push(item.href) }

  return (
    <dialog
      ref={dialog}
      aria-label="Search pages"
      onClose={() => setOpen(false)}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
      className="fixed inset-x-0 top-[12vh] mx-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-brand-navy shadow-[0_24px_48px_-12px_rgba(3,4,94,0.25)] backdrop:bg-brand-navy/40 backdrop:backdrop-blur-[2px] open:animate-in open:fade-in open:zoom-in-95 open:duration-150"
    >
      <div className="flex items-center gap-3 border-b border-brand-line px-4">
        <Search size={18} aria-hidden="true" className="shrink-0 text-brand-muted" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${active}` : undefined}
          aria-label="Search pages"
          placeholder="Go to a page…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
          }}
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-brand-muted"
        />
        <kbd className="rounded-md border border-brand-line px-1.5 py-0.5 text-[11px] font-semibold text-brand-muted">Esc</kbd>
      </div>
      <ul id="palette-results" role="listbox" aria-label="Pages" className="scroll-subtle max-h-[50vh] overflow-y-auto p-2">
        {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-brand-muted">No pages match “{query}”.</li>}
        {results.map((item, i) => (
          <li
            key={item.href + item.label}
            id={`palette-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => go(item)}
            className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ${i === active ? 'bg-brand-ice text-brand-navy' : 'text-brand-navy/90'}`}
          >
            <span className="font-medium">{item.label}</span>
            {i === active ? <CornerDownLeft size={14} aria-hidden="true" className="text-brand-muted" /> : <span className="text-xs text-brand-muted">{item.group}</span>}
          </li>
        ))}
      </ul>
    </dialog>
  )
}

/** Top bar trigger; the palette itself listens for this event and for Ctrl+K. */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('echims-open-search'))}
      aria-label="Search pages (Ctrl+K)"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-line bg-white px-2.5 text-sm text-brand-muted transition hover:bg-brand-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
    >
      <Search size={16} aria-hidden="true" />
      <span className="hidden md:inline">Search</span>
      <kbd className="hidden rounded border border-brand-line px-1 text-[11px] font-semibold md:inline">Ctrl K</kbd>
    </button>
  )
}
