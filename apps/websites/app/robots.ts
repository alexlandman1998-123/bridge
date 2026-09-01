import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { resolveSite } from '@/lib/site-repository'
import { publicOrigin } from '@/lib/public-origin'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers()
  const site = await resolveSite(requestHeaders.get('host'))
  const origin = publicOrigin(requestHeaders.get('host'))
  if (!site || !origin || site.preview) return { rules: { userAgent: '*', disallow: '/' } }
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${origin}/sitemap.xml` }
}
