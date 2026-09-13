import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SiteAnalyticsTracker } from '@/components/site-analytics'
import './styles.css'
import './brand.css'

export const metadata: Metadata = {
  title: 'Arch9 Websites',
  description: 'A mobile-first property website platform.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<SiteAnalyticsTracker /><Analytics /><SpeedInsights /></body></html>
}
