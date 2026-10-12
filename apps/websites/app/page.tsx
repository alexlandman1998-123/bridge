import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getKingdomRecentlySold } from '@/lib/kingdom-recently-sold'
import { ContentBlocks } from '@/components/content-blocks'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicBlogPosts, getPublicPage, resolveSite } from '@/lib/site-repository'
import styles from './homepage.module.css'
import { hasEditorialPropertyExperience, usesEditorialTemplate, templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'

const loadHome = cache(async () => {
  const requestHeaders = await headers()
  const site = await resolveSite(requestHeaders.get('host'))
  const [page, blogPosts, soldProperties] = site
    ? await Promise.all([getPublicPage(site, ''), getPublicBlogPosts(site), getKingdomRecentlySold(site)])
    : [null, [], []]
  return { page, site, blogPosts, soldProperties }
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
  const { page, site, blogPosts, soldProperties } = await loadHome()
  if (!site || !page) notFound()

  return (
    <main className={`${templateClassName(site.templateKey)} ${usesEditorialTemplate(site.templateKey) ? styles.homepage : ''}${hasEditorialPropertyExperience(site) ? ` ${styles['lwp-home']}` : ''}`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
      <SiteHeader site={site} enquiryHref="/valuation" homepage />
      <ContentBlocks page={page} properties={site.properties} site={site} templateKey={site.templateKey} blogPosts={blogPosts} soldProperties={soldProperties} />
      <SiteFooter site={site} />
    </main>
  )
}
