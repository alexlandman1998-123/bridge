import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ContactPageContent } from '@/components/contact-page'
import { ContentBlocks } from '@/components/content-blocks'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicPage, getPublicProperties, resolveSite } from '@/lib/site-repository'
import { isHomeSeekersTemplate, templateClassName } from '@/lib/site-templates'

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
  return <main className={`${templateClassName(site.templateKey)} ${page.kind}-page`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    {site.preview && <div className="preview-banner">Preview site — not yet connected to a client domain</div>}
    <SiteHeader site={site} currentHref={`/${page.slug}`} />
    {page.kind === 'contact' && isHomeSeekersTemplate(site.templateKey) ? <ContactPageContent page={page} site={site} /> : <ContentBlocks page={page} properties={properties} site={site} templateKey={site.templateKey} />}
    {page.kind === 'about' && isHomeSeekersTemplate(site.templateKey) && <section className="listing-help"><div><p className="eyebrow">YOUR NEXT CHAPTER</p><h2>Good advice starts with a conversation.</h2><p>Tell us about your next move. We’re here to help.</p></div><a className="header-cta" href="/contact">Talk to the team ↗</a></section>}
    <SiteFooter site={site} />
  </main>
}
