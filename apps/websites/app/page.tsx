import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ContentBlocks } from '@/components/content-blocks'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicPage, resolveSite } from '@/lib/site-repository'

export const dynamic = 'force-dynamic'

const loadHome = cache(async () => {
  const requestHeaders = await headers()
  const site = await resolveSite(requestHeaders.get('host'))
  const page = site ? await getPublicPage(site, '') : null
  return { page, site }
})

export async function generateMetadata(): Promise<Metadata> {
  const { page, site } = await loadHome()
  if (!page || !site) return { title: 'Website not found' }
  return {
    title: page.seoTitle || site.name,
    description: page.seoDescription,
    alternates: { canonical: '/' },
    openGraph: page.socialImageUrl ? { images: [page.socialImageUrl] } : undefined,
  }
}

export default async function HomePage() {
  const { page, site } = await loadHome()
  if (!site || !page) notFound()

  return (
    <main style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
      {site.preview && <div className="preview-banner">Preview site — not yet connected to a client domain</div>}
      <SiteHeader site={site} enquiryHref="#enquire" />
      <ContentBlocks page={page} properties={site.properties} />
      <SiteFooter site={site} />
    </main>
  )
}
