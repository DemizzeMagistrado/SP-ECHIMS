import { Archivo, Inter, Libre_Caslon_Text } from 'next/font/google'

// Site-wide type, self-hosted by next/font and exposed as CSS variables on <html>.
// globals.css maps them to Tailwind's font-display / font-sans / font-serif.
//   Archivo (variable width axis): display headings and big numbers
//   Inter: UI and body text (the default)
//   Libre Caslon Text: short editorial accents only, never controls or data
const display = Archivo({ subsets: ['latin'], axes: ['wdth'], display: 'swap', variable: '--font-archivo' })
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-inter' })
const serif = Libre_Caslon_Text({ subsets: ['latin'], weight: ['400'], style: ['normal', 'italic'], display: 'swap', variable: '--font-caslon' })

export const fontVariables = `${display.variable} ${sans.variable} ${serif.variable}`
