import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ContentBlocks } from '@/components/content-blocks'
import { getPublicPage, getPublicProperties, resolveSite } from '@/lib/site-repository'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

async function loadPage(params: Props['params']) {
  const [{ slug }, requestHeaders] = await Promise.all([params, headers()])
  const site = await resolveSite(requestHeaders.get('host'))
  const page = site ? await getPublicPage(site, slug) : null
  return { page, site }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page, site } = await loadPage(params)
  if (!page || !site) return { title: 'Page not found' }
  return { title: page.seoTitle || `${page.title} | ${site.name}`, description: page.seoDescription, alternates: { canonical: `/${page.slug}` } }
}

export default async function PublicPage({ params }: Props) {
  const { page, site } = await loadPage(params)
  if (!page || !site) notFound()
  const properties = await getPublicProperties(site)
  return <main style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor } as React.CSSProperties}>
    {site.preview && <div className="preview-banner">Preview site — not yet connected to a client domain</div>}
    <header className="site-header"><a className="wordmark" href="/">{site.name}</a><nav aria-label="Primary"><a href="/properties">Properties</a><a href="/#about">About</a><a href="/#enquire">Contact</a></nav><a className="header-cta" href="#enquire">Enquire now</a></header>
    <ContentBlocks page={page} properties={properties} />
    <footer><span>{site.name}</span><span>Powered by PropData</span></footer>
  </main>
}
