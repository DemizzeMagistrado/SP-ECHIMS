'use client'

// Shared date picker with the <input type="date"> API (value / onChange(e) / min / max as
// YYYY-MM-DD, or name + defaultValue in a FormData form), so <DateInput> callers need no change.
// - Type MM/DD/YYYY (slashes are added for you) or open the calendar with the icon / Alt+↓.
// - Calendar: brand colors, today ringed, selected day filled navy, days outside min/max grayed,
//   month and year quick pickers (for birth dates), Today and Clear, full keyboard support
//   (arrows, PageUp/PageDown = month, Shift+PageUp/PageDown = year, Home/End, Enter, Esc).
// - The calendar is a 312px popover in a portal (never clipped by modals, no inner scrollbar):
//   below the field, above if there is no room, shifted to stay on screen. Phones: bottom sheet.
// A visually hidden native input carries name/value/required and fires the real input event, so
// onChange handlers get a normal event whose target.value is YYYY-MM-DD ('' when cleared).

import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { FloatingPanel } from './floating-panel'
import { Button } from './button'
import { cn } from '@/lib/utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

type YMD = { y: number; m: number; d: number } // m: 0-11

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = ({ y, m, d }: YMD) => `${y}-${pad(m + 1)}-${pad(d)}`
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
function fromIso(v: string | undefined | null): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '')
  if (!m) return null
  const r = { y: +m[1], m: +m[2] - 1, d: +m[3] }
  return r.m < 12 && r.d >= 1 && r.d <= daysIn(r.y, r.m) ? r : null
}
const toText = (v: string) => { const p = fromIso(v); return p ? `${pad(p.m + 1)}/${pad(p.d)}/${p.y}` : '' }
function addDays(p: YMD, n: number): YMD {
  const t = new Date(Date.UTC(p.y, p.m, p.d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }
}
function addMonths(p: YMD, n: number): YMD {
  const t = new Date(Date.UTC(p.y, p.m + n, 1))
  const y = t.getUTCFullYear(), m = t.getUTCMonth()
  return { y, m, d: Math.min(p.d, daysIn(y, m)) }
}
function todayManila(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}
/** Digits only → MM/DD/YYYY with slashes as you type. */
function maskText(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}
function parseText(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return null
  const iso = `${m[3]}-${m[1]}-${m[2]}`
  return fromIso(iso) ? iso : null
}

export type DatePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'min' | 'max'> & {
  value?: string
  defaultValue?: string
  min?: string
  max?: string
}

export function DatePicker({ value, defaultValue, onChange, min, max, disabled, required, name, id, className, placeholder = 'MM/DD/YYYY', ...rest }: DatePickerProps) {
  const controlled = value !== undefined
  const [inner, setInner] = useState(defaultValue ?? '')
  const current = controlled ? value ?? '' : inner

  const [text, setText] = useState(toText(current))
  const [seen, setSeen] = useState(current)
  const [error, setError] = useState<string | null>(null)
  // Follow outside changes (reset forms, prefill) without fighting what is being typed.
  if (seen !== current) { setSeen(current); if (parseText(text) !== current) setText(toText(current)); setError(null) }

  const autoId = useId()
  const inputId = id ?? `${autoId}-input`
  const errorId = `${autoId}-error`
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const native = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)

  const today = todayManila()
  const outOfRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max))
  const rangeMessage = (iso: string) => (min && iso < min ? `Choose ${toText(min)} or later.` : max && iso > max ? `Choose ${toText(max)} or earlier.` : null)

  const commit = (iso: string) => {
    if (!controlled) setInner(iso)
    setSeen(iso)
    const el = native.current
    if (el && el.value !== iso) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, iso)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  const onType = (raw: string) => {
    const masked = maskText(raw)
    setText(masked)
    setError(null)
    if (!masked) return commit('')
    const iso = parseText(masked)
    if (iso && !outOfRange(iso)) commit(iso)
  }
  const onBlur = () => {
    if (!text) return
    const iso = parseText(text)
    if (!iso) { setError('Enter a real date as MM/DD/YYYY.'); commit(''); return }
    const msg = rangeMessage(iso)
    if (msg) { setError(msg); commit('') }
  }

  const pick = (iso: string) => {
    setText(toText(iso)); setError(null); commit(iso); setOpen(false)
    input.current?.focus()
  }

  return (
    <div ref={wrap} className={cn('relative w-full min-w-0', className)}>
      <input
        ref={input}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        aria-invalid={rest['aria-invalid'] ?? (error ? true : undefined)}
        aria-describedby={[rest['aria-describedby'], error ? errorId : null].filter(Boolean).join(' ') || undefined}
        aria-label={rest['aria-label']}
        aria-required={required || undefined}
        onChange={(e) => onType(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
        className="h-10 w-full rounded-lg border border-brand-line bg-white pl-3 pr-10 text-sm tabular-nums text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-brand-muted hover:border-brand-blue/50 focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20 disabled:cursor-not-allowed disabled:bg-brand-ice disabled:text-brand-muted aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close calendar' : 'Open calendar'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-md text-brand-muted outline-none hover:bg-brand-ice hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:pointer-events-none"
      >
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      <input
        ref={native}
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        required={required}
        disabled={disabled}
        value={current}
        onChange={(e) => onChange?.(e)}
        onFocus={() => input.current?.focus()}
        className="sr-only"
      />
      {error && <p id={errorId} className="mt-1 text-xs font-medium text-danger">{error}</p>}
      <FloatingPanel
        anchor={wrap}
        open={open}
        // Outside press: give focus back to the field unless the press focused something else.
        onClose={() => { setOpen(false); requestAnimationFrame(() => { if (!document.activeElement || document.activeElement === document.body) input.current?.focus() }) }}
        width={312}
        fit
        sheetOnMobile
        label="Choose a date"
      >
        <Calendar value={current} min={min} max={max} today={today} onPick={pick} onClose={() => { setOpen(false); input.current?.focus() }} onClear={() => { setText(''); setError(null); commit(''); setOpen(false); input.current?.focus() }} />
      </FloatingPanel>
    </div>
  )
}

function Calendar({ value, min, max, today, onPick, onClose, onClear }: {
  value: string; min?: string; max?: string; today: string
  onPick: (iso: string) => void; onClose: () => void; onClear: () => void
}) {
  const clamp = (iso: string) => (min && iso < min ? min : max && iso > max ? max : iso)
  const [focus, setFocus] = useState<YMD>(() => fromIso(value) ?? fromIso(clamp(today))!)
  const [view, setView] = useState<'days' | 'months' | 'years'>('days')
  const grid = useRef<HTMLDivElement>(null)
  const disabledDay = (iso: string) => Boolean((min && iso < min) || (max && iso > max))
  const minY = fromIso(min)?.y ?? 1900
  const maxY = fromIso(max)?.y ?? new Date().getFullYear() + 10

  useEffect(() => {
    if (view === 'days') grid.current?.querySelector<HTMLButtonElement>('[data-focus="true"]')?.focus({ preventScroll: true })
  }, [focus, view])

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(focus.y, focus.m, 1)).getUTCDay()
    const start = addDays({ y: focus.y, m: focus.m, d: 1 }, -first)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [focus.y, focus.m])

  const onKey = (e: KeyboardEvent) => {
    const k = e.key
    const step: Record<string, () => YMD> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1), PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -new Date(Date.UTC(focus.y, focus.m, focus.d)).getUTCDay()),
      End: () => addDays(focus, 6 - new Date(Date.UTC(focus.y, focus.m, focus.d)).getUTCDay()),
    }
    if (step[k]) { e.preventDefault(); setFocus(step[k]()); return }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
  }

  const years = useMemo(() => {
    const out: number[] = []
    for (let y = maxY; y >= minY; y--) out.push(y)
    return out
  }, [minY, maxY])

  const headerBtn = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 font-display text-sm font-bold text-brand-navy outline-none hover:bg-brand-ice focus-visible:ring-2 focus-visible:ring-brand-blue/30'
  const navBtn = 'inline-flex size-8 items-center justify-center rounded-lg text-brand-navy outline-none hover:bg-brand-ice focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:opacity-35'
  const prevDisabled = Boolean(min && toIso({ y: focus.y, m: focus.m, d: 1 }) <= min)
  const nextDisabled = Boolean(max && toIso({ y: focus.y, m: focus.m, d: daysIn(focus.y, focus.m) }) >= max)

  return (
    <div role="dialog" aria-label="Choose a date" className="p-3 max-sm:mx-auto max-sm:max-w-sm max-sm:p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button type="button" className={navBtn} aria-label="Previous month" disabled={view !== 'days' || prevDisabled} onClick={() => setFocus(addMonths(focus, -1))}><ChevronLeft size={16} aria-hidden="true" /></button>
        <div className="flex items-center">
          <button type="button" className={headerBtn} aria-label="Choose month" aria-pressed={view === 'months'} onClick={() => setView(view === 'months' ? 'days' : 'months')}>
            {MONTHS[focus.m]}<ChevronDown size={13} aria-hidden="true" className="text-brand-muted" />
          </button>
          <button type="button" className={headerBtn} aria-label="Choose year" aria-pressed={view === 'years'} onClick={() => setView(view === 'years' ? 'days' : 'years')}>
            {focus.y}<ChevronDown size={13} aria-hidden="true" className="text-brand-muted" />
          </button>
        </div>
        <button type="button" className={navBtn} aria-label="Next month" disabled={view !== 'days' || nextDisabled} onClick={() => setFocus(addMonths(focus, 1))}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>

      {view === 'days' && (
        <div ref={grid} role="grid" aria-label={`${MONTHS[focus.m]} ${focus.y}`} onKeyDown={onKey}>
          <div role="row" className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-brand-muted">
            {WEEK.map((w) => <span key={w} role="columnheader" className="py-1">{w}</span>)}
          </div>
          {Array.from({ length: 6 }, (_, r) => (
            <div key={r} role="row" className="grid grid-cols-7 gap-0.5">
              {cells.slice(r * 7, r * 7 + 7).map((c) => {
                const iso = toIso(c)
                const outside = c.m !== focus.m
                const isFocus = c.y === focus.y && c.m === focus.m && c.d === focus.d
                const off = disabledDay(iso)
                const selected = iso === value
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    tabIndex={isFocus ? 0 : -1}
                    data-focus={isFocus}
                    aria-selected={selected}
                    aria-current={iso === today ? 'date' : undefined}
                    aria-disabled={off || undefined}
                    aria-label={`${MONTHS[c.m]} ${c.d}, ${c.y}`}
                    onClick={() => { if (!off) onPick(iso) }}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !off) { e.preventDefault(); onPick(iso) } }}
                    className={cn(
                      'mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-blue/50',
                      outside ? 'text-brand-muted/60' : 'text-brand-navy',
                      !off && !selected && 'hover:bg-brand-ice',
                      iso === today && !selected && 'font-bold text-brand-blue ring-1 ring-brand-blue/50',
                      selected && 'bg-brand-navy font-semibold text-white',
                      off && 'cursor-not-allowed text-slate-300 line-through decoration-slate-300/70',
                    )}
                  >{c.d}</button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {view === 'months' && (
        <div className="grid grid-cols-3 gap-1.5 py-1">
          {MONTHS.map((name, m) => {
            const off = Boolean((min && toIso({ y: focus.y, m, d: daysIn(focus.y, m) }) < min) || (max && toIso({ y: focus.y, m, d: 1 }) > max))
            return (
              <button key={name} type="button" disabled={off} onClick={() => { setFocus({ y: focus.y, m, d: Math.min(focus.d, daysIn(focus.y, m)) }); setView('days') }}
                className={cn('rounded-lg py-2 text-sm outline-none hover:bg-brand-ice focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:text-slate-300', m === focus.m && 'bg-brand-navy font-semibold text-white hover:bg-brand-navy')}>
                {name.slice(0, 3)}
              </button>
            )
          })}
        </div>
      )}

      {view === 'years' && (
        <div className="scroll-subtle grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto py-1">
          {years.map((y) => (
            <button key={y} type="button" ref={(el) => { if (el && y === focus.y) el.scrollIntoView({ block: 'center' }) }}
              onClick={() => { setFocus({ y, m: focus.m, d: Math.min(focus.d, daysIn(y, focus.m)) }); setView('months') }}
              className={cn('rounded-lg py-2 text-sm tabular-nums outline-none hover:bg-brand-ice focus-visible:ring-2 focus-visible:ring-brand-blue/30', y === focus.y && 'bg-brand-navy font-semibold text-white hover:bg-brand-navy')}>
              {y}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-brand-line pt-3">
        <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
        <Button size="sm" variant="tonal" disabled={disabledDay(today)} title={disabledDay(today) ? 'Today is outside the allowed dates' : undefined} onClick={() => onPick(today)}>Today</Button>
      </div>
    </div>
  )
}
