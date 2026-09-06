import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'GestioneLido',
  description: 'Gestione ombrelloni dello stabilimento',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,          // il pinch-zoom sulla mappa deve restare possibile
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
