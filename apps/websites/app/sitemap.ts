import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getPublicPages, getPublicProperties, propertySlug, resolveSite } from '@/lib/site-repository'
import { publicOrigin } from '@/lib/public-origin'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers()
  const site = await resolveSite(requestHeaders.get('host'))
  const origin = publicOrigin(requestHeaders.get('host'))
  if (!site || !origin || site.preview) return []
  const [properties, pages] = await Promise.all([getPublicProperties(site), getPublicPages(site)])
  return [
    { url: origin, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/properties`, changeFrequency: 'daily', priority: 0.9 },
    ...properties.map((property) => ({ url: `${origin}/properties/${propertySlug(property)}`, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...pages.map((page) => ({ url: `${origin}/${page.slug}`, changeFrequency: 'weekly' as const, priority: page.kind === 'campaign' ? 0.7 : 0.6 })),
  ]
}
