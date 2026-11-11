import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { fontVariables } from '@/lib/fonts'
import { AuthProvider } from '@/components/auth/auth-provider'
import { OfflineProvider } from '@/components/offline/offline-provider'
import { Toaster } from '@/components/ui/toast'
import { ConfirmHost } from '@/components/ui/confirm-dialog'
export const metadata: Metadata = {
 title:'eCHIMS - Early Child Health Information & Monitoring System',
 description:'Comprehensive healthcare management system for Rural Health Units',generator:'v0.app',manifest:'/manifest.webmanifest',
}
export const viewport:Viewport={colorScheme:'light',themeColor:[{media:'(prefers-color-scheme: light)',color:'#f5f7fa'}],userScalable:false}
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" className={`light ${fontVariables}`}><body className="antialiased bg-background"><AuthProvider><OfflineProvider>{children}</OfflineProvider></AuthProvider><Toaster/><ConfirmHost/>{process.env.NODE_ENV==='production'&&<Analytics/>}</body></html>}
