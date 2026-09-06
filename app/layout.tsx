import type { ReactNode } from 'react'
import './globals.css'
import RegistraSW from './RegistraSW'

export const metadata = {
  title: 'GestioneLido',
  description: 'Gestione ombrelloni dello stabilimento',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Lido', statusBarStyle: 'default' as const },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,          // il pinch-zoom sulla mappa deve restare possibile
  themeColor: '#0f766e',
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}<RegistraSW /></body>
    </html>
  )
}
