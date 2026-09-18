import { headers } from 'next/headers'
import { resolveSite } from '@/lib/site-repository'
import { selectWebsiteIcon } from '@/lib/website-brand'

export const dynamic = 'force-dynamic'

const FALLBACK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#125b50"/><path d="M18 46V18h10l8 14 8-14h2v28h-8V32l-7 12h-2l-7-12v14z" fill="white"/></svg>`

/**
 * Each hostname resolves its own organisation. Redirecting the metadata icon
 * keeps the favicon tenant-specific while letting the browser cache the
 * organisation's durable branding asset directly.
 */
export default async function Icon() {
  const site = await resolveSite((await headers()).get('host'))
  const iconUrl = site ? selectWebsiteIcon(site) : ''
  if (iconUrl) {
    try {
      const url = new URL(iconUrl)
      if (url.protocol === 'https:' || url.protocol === 'http:') return Response.redirect(url, 302)
    } catch {
      // Fall through to the neutral Arch9 mark when a legacy URL is malformed.
    }
  }
  return new Response(FALLBACK_ICON, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' } })
}
