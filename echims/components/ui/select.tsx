'use client'

// Shared dropdown with the native <select> API, so existing code keeps working:
//   <Select value={v} onChange={(e) => setV(e.target.value)}><option value="">All</option>…</Select>
// Also works uncontrolled (name + defaultValue in a FormData form). The trigger matches the other
// controls (40px, rounded-lg, chevron, focus ring, hover, disabled, aria-invalid error). The menu
// is a styled panel in a portal (no clipping in cards/modals), flips near screen edges, highlights
// the selected and active option, supports arrow keys / Home / End / Enter / Esc / type-ahead,
// and shows a search box for long lists (more than 10 options).
// A visually hidden native <select> carries name/value/required for forms and fires the real
// change event, so onChange handlers receive a normal event whose target.value is the new value.

import {
  Children, Fragment, isValidElement, useId, useMemo, useRef, useState,
  type ReactElement, type ReactNode, type SelectHTMLAttributes,
} from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { FloatingPanel } from './floating-panel'
import { cn } from '@/lib/utils'

type Opt = { value: string; label: string; disabled: boolean; group?: string }

function text(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children)
  return ''
}

function collect(children: ReactNode, out: Opt[] = [], group?: string): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const el = child as ReactElement<{ value?: unknown; children?: ReactNode; disabled?: boolean; label?: string }>
    if (el.type === 'option') {
      const label = text(el.props.children)
      out.push({ value: el.props.value === undefined ? label : String(el.props.value), label, disabled: Boolean(el.props.disabled), group })
    } else if (el.type === 'optgroup') collect(el.props.children, out, el.props.label)
    else if (el.type === Fragment) collect(el.props.children, out, group)
  })
  return out
}

const SEARCH_AFTER = 10

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Force the in-menu search on/off (default: on for more than 10 options). */
  searchable?: boolean
  /** Text for the trigger when nothing is chosen and there is no "" option. */
  placeholder?: string
}

export function Select({ className, children, value, defaultValue, onChange, disabled, required, name, id, searchable, placeholder, ...rest }: SelectProps) {
  const options = useMemo(() => collect(children), [children])
  const controlled = value !== undefined
  const [inner, setInner] = useState(() => String(defaultValue ?? options[0]?.value ?? ''))
  const current = controlled ? String(value ?? '') : inner
  const selected = options.find((o) => o.value === current)

  const autoId = useId()
  const triggerId = id ?? `${autoId}-trigger`
  const listId = `${autoId}-list`
  const trigger = useRef<HTMLButtonElement>(null)
  const native = useRef<HTMLSelectElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const typed = useRef({ text: '', at: 0 })

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const withSearch = searchable ?? options.length > SEARCH_AFTER
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const openMenu = () => {
    if (disabled) return
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === current)))
    setOpen(true)
    if (withSearch) requestAnimationFrame(() => search.current?.focus())
  }
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus() }

  const choose = (o: Opt | undefined) => {
    if (!o || o.disabled) return
    close()
    if (o.value === current) return
    if (!controlled) setInner(o.value)
    // Fire the real change event on the native select: React's onChange gets a normal event.
    const el = native.current
    if (el) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, o.value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  const move = (delta: number) => {
    if (!shown.length) return
    let i = active
    for (let n = 0; n < shown.length; n++) {
      i = (i + delta + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setActive(i)
    document.getElementById(`${listId}-${i}`)?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu() }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) typeAhead(e.key, false)
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key === 'Tab') { close(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
    else if (e.key === 'Enter' || (e.key === ' ' && !withSearch)) { e.preventDefault(); choose(shown[active]) }
    else if (!withSearch && e.key.length === 1) typeAhead(e.key, true)
  }

  const typeAhead = (key: string, menuOpen: boolean) => {
    const now = Date.now()
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + key.toLowerCase(), at: now }
    const i = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text))
    if (i < 0) return
    if (menuOpen) { setActive(i); document.getElementById(`${listId}-${i}`)?.scrollIntoView({ block: 'nearest' }) }
    else choose(options[i])
  }

  const isPlaceholder = !selected || selected.value === ''

  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !withSearch && shown[active] ? `${listId}-${active}` : undefined}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-labelledby']}
        aria-describedby={rest['aria-describedby']}
        aria-invalid={rest['aria-invalid']}
        aria-required={required || undefined}
        title={rest.title}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-brand-line bg-white px-3 text-left text-sm text-brand-navy outline-none transition-[border-color,box-shadow,background-color] hover:border-brand-blue/50 hover:bg-brand-ice/40 focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20 disabled:cursor-not-allowed disabled:bg-brand-ice disabled:text-brand-muted aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15',
          open && 'border-brand-blue ring-3 ring-brand-blue/20',
          className,
        )}
      >
        <span className={cn('truncate', isPlaceholder && 'text-brand-muted')}>{selected?.label || placeholder || 'Select…'}</span>
        <ChevronDown size={16} aria-hidden="true" className={cn('shrink-0 text-brand-muted transition-transform duration-150', open && 'rotate-180')} />
      </button>
      <select
        ref={native}
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        required={required}
        disabled={disabled}
        value={current}
        onChange={(e) => { if (!controlled) setInner(e.target.value); onChange?.(e) }}
        // Invalid on submit: send focus to the visible trigger instead.
        onFocus={() => trigger.current?.focus()}
        className="sr-only"
      >
        {options.map((o) => <option key={`${o.group ?? ''}:${o.value}`} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <FloatingPanel anchor={trigger} open={open} onClose={() => close(false)} minWidth={200} maxHeight={300}>
        {withSearch && (
          <div className="sticky top-0 z-[1] border-b border-brand-line bg-white p-2">
            <div className="relative">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input
                ref={search}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={onKeyDown}
                placeholder="Search…"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                className="h-9 w-full rounded-lg border border-brand-line bg-white pl-8 pr-2 text-sm outline-none placeholder:text-brand-muted focus-visible:border-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue/20"
              />
            </div>
          </div>
        )}
        <ul id={listId} role="listbox" aria-labelledby={triggerId} className="p-1">
          {shown.length === 0 && <li className="px-3 py-2.5 text-brand-muted">No matches for “{query}”</li>}
          {shown.map((o, i) => {
            const heading = o.group && o.group !== shown[i - 1]?.group ? o.group : null
            const isSelected = o.value === current
            return (
              <Fragment key={`${o.group ?? ''}:${o.value}`}>
                {heading && <li role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{heading}</li>}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors',
                    i === active && 'bg-brand-ice',
                    isSelected && 'font-semibold text-brand-blue',
                    o.value === '' && !isSelected && 'text-brand-muted',
                    o.disabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span className="min-w-0 break-words">{o.label}</span>
                  {isSelected && <Check size={15} aria-hidden="true" className="shrink-0" />}
                </li>
              </Fragment>
            )
          })}
        </ul>
      </FloatingPanel>
    </>
  )
}
