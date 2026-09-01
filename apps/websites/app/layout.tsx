import type { Metadata } from 'next'
import './styles.css'

export const metadata: Metadata = {
  title: 'PropData Websites',
  description: 'A mobile-first property website powered by PropData.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
