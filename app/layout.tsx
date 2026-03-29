import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mizan · ميزان',
  description: 'Your personal habit OS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-[#0A0A0A] antialiased">{children}</body>
    </html>
  )
}
