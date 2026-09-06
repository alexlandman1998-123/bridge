import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './styles.css'
import './brand.css'

export const metadata: Metadata = {
  title: 'PropData Websites',
  description: 'A mobile-first property website powered by PropData.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Analytics /><SpeedInsights /></body></html>
}
