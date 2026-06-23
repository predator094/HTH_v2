import type { Metadata } from 'next'
import './globals.css'
import SiteGate from '@/components/SiteGate'

export const metadata: Metadata = {
  title: 'H2H — Hand to Hand',
  description: 'Hand-to-hand file and text sharing — no accounts, no fuss',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <SiteGate>{children}</SiteGate>
      </body>
    </html>
  )
}
