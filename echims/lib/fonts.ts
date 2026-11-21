import localFont from 'next/font/local'

// Site-wide type, self-hosted from app/fonts (latin subset, woff2; SIL OFL 1.1, licenses alongside)
// so builds, dev and the offline app never depend on Google Fonts. Exposed as CSS variables on
// <html>; globals.css maps them to Tailwind's font-display / font-sans / font-serif.
//   Plus Jakarta Sans: page titles, landing section headings, large stat numbers
//   Inter: UI and body text (the default), including widget and card titles
//   Libre Caslon Text: short editorial accents only, never controls or data
const display = localFont({
  src: [
    { path: '../app/fonts/plus-jakarta-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../app/fonts/plus-jakarta-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../app/fonts/plus-jakarta-sans-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-jakarta',
  fallback: ['system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
})
const sans = localFont({
  src: [
    { path: '../app/fonts/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../app/fonts/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../app/fonts/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
})
const serif = localFont({
  src: [
    { path: '../app/fonts/libre-caslon-text-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../app/fonts/libre-caslon-text-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-caslon',
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
})

export const fontVariables = `${display.variable} ${sans.variable} ${serif.variable}`
