import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mizan · ميزان',
  description: 'Your personal habit OS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#F8F9FA', color: '#202124' }} className="antialiased">{children}</body>
    </html>
  )
}
