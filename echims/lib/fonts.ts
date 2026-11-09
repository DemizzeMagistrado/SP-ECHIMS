import { Inter, Libre_Caslon_Text, Plus_Jakarta_Sans } from 'next/font/google'

// Site-wide type, self-hosted by next/font and exposed as CSS variables on <html>.
// globals.css maps them to Tailwind's font-display / font-sans / font-serif.
//   Plus Jakarta Sans: page titles, landing section headings, large stat numbers
//   Inter: UI and body text (the default), including widget and card titles
//   Libre Caslon Text: short editorial accents only, never controls or data
const display = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700', '800'], display: 'swap', variable: '--font-jakarta' })
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-inter' })
const serif = Libre_Caslon_Text({ subsets: ['latin'], weight: ['400'], style: ['normal', 'italic'], display: 'swap', variable: '--font-caslon' })

export const fontVariables = `${display.variable} ${sans.variable} ${serif.variable}`
