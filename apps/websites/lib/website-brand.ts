import type { ResolvedSite } from '@/lib/types'

/**
 * The studio names the two files by the background they are intended for.
 * Keep that decision in one place so the header and footer cannot drift.
 */
export function selectWebsiteLogo(site: Pick<ResolvedSite, 'logoUrl' | 'logoLightUrl' | 'logoDarkUrl'>, darkBackground = false): string | undefined {
  return darkBackground
    ? site.logoDarkUrl || site.logoUrl || site.logoLightUrl
    : site.logoLightUrl || site.logoUrl || site.logoDarkUrl
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
