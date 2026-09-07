import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ContentBlocks } from '@/components/content-blocks'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicPage, getPublicProperties, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

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
  return { title: page.seoTitle || `${page.title} | ${site.name}`, description: page.seoDescription, alternates: { canonical: `/${page.slug}` }, openGraph: page.socialImageUrl ? { images: [page.socialImageUrl] } : undefined }
}

export default async function PublicPage({ params }: Props) {
  const { page, site } = await loadPage(params)
  if (!page || !site) notFound()
  const properties = await getPublicProperties(site)
  return <main className={templateClassName(site.templateKey)} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    {site.preview && <div className="preview-banner">Preview site — not yet connected to a client domain</div>}
    <SiteHeader site={site} enquiryHref={page.kind === 'contact' || page.kind === 'valuation' || page.kind === 'campaign' ? '#enquire' : '/contact'} />
    <ContentBlocks page={page} properties={properties} site={site} templateKey={site.templateKey} />
    <SiteFooter site={site} />
  </main>
}
