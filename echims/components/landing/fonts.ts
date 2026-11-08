import { Atkinson_Hyperlegible, Bricolage_Grotesque } from 'next/font/google'

// Shared by the landing, login, and register pages; applied through the .brand class.
export const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display' })
export const body = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body' })
export const brandFonts = `brand ${display.variable} ${body.variable}`
