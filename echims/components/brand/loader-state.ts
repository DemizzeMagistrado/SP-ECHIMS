'use client'
import { useEffect, useState } from 'react'

// Shared timing for every loader → content handoff.
export const SHOW_DELAY = 200 // fast loads never show the loader
export const MIN_SHOWN = 400 // once shown, it stays this long so it never blinks
export const FADE = 250 // crossfade length; matches --fade in globals.css

// Small shared store: which logo loaders are on screen, which gates still wait for data,
// and whether a full-screen transition overlay (sign-in / sign-out) is up.
let visibleLoaders = 0
let lastLoaderGone = -Infinity
let overlayUp = false
let gateMounts = 0
const waiting = new Set<symbol>()
const refreshing = new Set<symbol>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getWaiting = () => waiting.size
export const getRefreshing = () => refreshing.size
export const getOverlayUp = () => overlayUp
export const getGateMounts = () => gateMounts
export function noteGateMount() { gateMounts++; emit() }
export function setOverlayUp(up: boolean) { if (overlayUp !== up) { overlayUp = up; emit() } }
export function setWaiting(id: symbol, isWaiting: boolean) {
  if (isWaiting === waiting.has(id)) return
  if (isWaiting) waiting.add(id); else waiting.delete(id)
  emit()
}

/**
 * Content already on screen is being refetched (new filter or range, kept previous data).
 * The top progress bar shows it instead of an in-page loader.
 */
export function useRefreshSignal(active: boolean) {
  const [id] = useState(() => Symbol('refresh'))
  useEffect(() => {
    if (active === refreshing.has(id)) return
    if (active) refreshing.add(id); else refreshing.delete(id)
    emit()
  }, [id, active])
  useEffect(() => () => { if (refreshing.delete(id)) emit() }, [id])
}

/** A logo loader is visible now or left a moment ago, so the next one should appear at once, without its intro. */
export function loaderOnScreen() {
  return visibleLoaders > 0 || performance.now() - lastLoaderGone < 150
}

/** Rendered inside every LogoLoader to keep the count above. */
export function LoaderPresence({ instant }: { instant: boolean }) {
  useEffect(() => {
    let counted = false
    const count = () => { counted = true; visibleLoaders++ }
    const t = instant ? (count(), undefined) : window.setTimeout(count, SHOW_DELAY)
    return () => {
      window.clearTimeout(t)
      if (counted) { visibleLoaders--; lastLoaderGone = performance.now() }
    }
  }, [instant])
  return null
}

/** Resolves once fonts are in and two frames have painted, so a reveal never shows half-laid-out content. */
export async function afterPaint() {
  await (document.fonts?.ready ?? Promise.resolve()).catch(() => {})
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}
