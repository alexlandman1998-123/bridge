import type { ResolvedSite } from '@/lib/types'

/**
 * The studio names the two files by the background they are intended for.
 * Keep that decision in one place so the header and footer cannot drift.
 */
export function selectWebsiteLogo(site: Pick<ResolvedSite, 'logoUrl' | 'logoLightUrl' | 'logoDarkUrl'> & { name?: string }, darkBackground = false): string | undefined {
  // The supplied LWP lock-up has a baked black rectangle. Use the clean
  // transparent version across the site so the mark sits naturally on both
  // the dark opening header and the light scrolled state.
  if (site.name === 'LWP Properties') return '/images/lwp-logo-white-transparent.png'
  return darkBackground
    ? site.logoDarkUrl || site.logoUrl || site.logoLightUrl
    : site.logoLightUrl || site.logoUrl || site.logoDarkUrl
}

/** The square organisation mark is used for the browser/app icon, never the wordmark. */
export function selectWebsiteIcon(site: Pick<ResolvedSite, 'logoIconUrl' | 'logoLightUrl' | 'logoDarkUrl' | 'logoUrl'>): string | undefined {
  return site.logoIconUrl || site.logoLightUrl || site.logoDarkUrl || site.logoUrl
}

/** Only render a normal public web link from the studio's optional URL field. */
export function publicWebsiteHref(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}
