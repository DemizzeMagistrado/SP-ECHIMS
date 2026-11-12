'use client'

// "Pick or type" text field: a normal input with a styled suggestion panel (replaces native
// <datalist>, whose popup is unstyled and dark on some browsers). Suggestions filter as you type,
// arrow keys / Enter / Esc work, and any custom text is still allowed.
//   <Combobox value={reason} onChange={setReason} options={['No mobile phone', 'Far from the RHU']} />

import { useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react'
import { FloatingPanel } from './floating-panel'
import { cn } from '@/lib/utils'

export type ComboboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'list'> & {
  value: string
  onChange: (value: string) => void
  options: string[]
}

export function Combobox({ value, onChange, options, className, disabled, onKeyDown, onFocus, ...rest }: ComboboxProps) {
  const listId = `${useId()}-list`
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const shown = useMemo(() => {
    const q = value.trim().toLowerCase()
    // Exact match: show every option so the user can switch to another one.
    if (!q || options.some((o) => o.toLowerCase() === q)) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, value])
  const isOpen = open && shown.length > 0 && !disabled

  const pick = (o: string) => { onChange(o); setOpen(false); setActive(-1) }
  const move = (delta: number) => {
    if (!isOpen) { setOpen(true); return }
    const i = (active + delta + shown.length) % shown.length
    setActive(i)
    document.getElementById(`${listId}-${i}`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <>
      <input
        ref={input}
        {...rest}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={(e) => { setOpen(true); onFocus?.(e) }}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
          else if (e.key === 'Enter' && isOpen && active >= 0) { e.preventDefault(); pick(shown[active]) }
          else if (e.key === 'Escape' && isOpen) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
          else if (e.key === 'Tab') setOpen(false)
          onKeyDown?.(e)
        }}
        className={cn(
          'h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-brand-muted hover:border-brand-blue/50 focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20 disabled:cursor-not-allowed disabled:bg-brand-ice disabled:text-brand-muted aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15',
          className,
        )}
      />
      <FloatingPanel anchor={input} open={isOpen} onClose={() => setOpen(false)} minWidth={200} maxHeight={260}>
        <ul id={listId} role="listbox" aria-label="Suggestions" className="p-1">
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o === value}
              // Keep focus in the input while choosing.
              onMouseDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={cn('cursor-pointer rounded-lg px-3 py-2 transition-colors', i === active && 'bg-brand-ice', o === value && 'font-semibold text-brand-blue')}
            >
              {o}
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </>
  )
}
