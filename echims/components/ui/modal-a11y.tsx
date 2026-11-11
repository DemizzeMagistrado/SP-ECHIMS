'use client'

import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keyboard behaviour for the hand-built overlay modals (div[aria-modal="true"]; native <dialog>s
 * already get it from the browser). Mounted once in the root layout:
 * - focus moves into the modal when it opens and back to the trigger when it closes;
 * - Tab / Shift+Tab stay inside the topmost modal;
 * - Esc presses its Close/Cancel button, but only while nothing has been typed into it,
 *   so a half-filled form is never thrown away by a stray keypress.
 */
export function ModalA11y() {
  useEffect(() => {
    const opened = new Map<HTMLElement, { trigger: Element | null; dirty: boolean }>()
    const top = () => Array.from(opened.keys()).filter((m) => m.isConnected).pop()
    const focusables = (m: HTMLElement) => Array.from(m.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)

    const scan = () => {
      document.querySelectorAll<HTMLElement>('[aria-modal="true"]:not(dialog)').forEach((m) => {
        if (opened.has(m)) return
        opened.set(m, { trigger: document.activeElement, dirty: false })
        if (!m.hasAttribute('aria-label') && !m.hasAttribute('aria-labelledby')) {
          const heading = m.querySelector('h1, h2, h3')?.textContent?.trim()
          if (heading) m.setAttribute('aria-label', heading)
        }
        if (!m.contains(document.activeElement)) (focusables(m)[0] ?? m).focus({ preventScroll: true })
      })
      opened.forEach((state, m) => {
        if (m.isConnected) return
        opened.delete(m)
        if (state.trigger instanceof HTMLElement && state.trigger.isConnected) state.trigger.focus({ preventScroll: true })
      })
    }

    const onKey = (e: KeyboardEvent) => {
      const m = top()
      // A native modal <dialog> (e.g. a confirm) on top owns the keyboard.
      if (!m || e.defaultPrevented || document.querySelector('dialog:modal')) return
      if (e.key === 'Tab') {
        const items = focusables(m)
        if (items.length === 0) { e.preventDefault(); return }
        const first = items[0], last = items[items.length - 1]
        const outside = !m.contains(document.activeElement)
        if (e.shiftKey && (document.activeElement === first || outside)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (document.activeElement === last || outside)) { e.preventDefault(); first.focus() }
      }
      if (e.key === 'Escape' && !opened.get(m)?.dirty) {
        const close = Array.from(m.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
          .find((b) => /^(close|cancel)\b/i.test(b.getAttribute('aria-label') ?? b.textContent?.trim() ?? ''))
        if (close) { e.preventDefault(); close.click() }
      }
    }
    const onInput = (e: Event) => {
      const m = top()
      if (m && m.contains(e.target as Node)) opened.get(m)!.dirty = true
    }

    scan()
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('keydown', onKey)
    document.addEventListener('input', onInput, true)
    return () => { observer.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('input', onInput, true) }
  }, [])
  return null
}
