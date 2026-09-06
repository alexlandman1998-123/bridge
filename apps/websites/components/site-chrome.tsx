import Image from 'next/image'
import Link from 'next/link'
import type { ResolvedSite } from '@/lib/types'

function SiteLogo({ site, dark = false }: { site: ResolvedSite; dark?: boolean }) {
  const logoUrl = dark
    ? site.logoDarkUrl || site.logoLightUrl || site.logoUrl
    : site.logoLightUrl || site.logoUrl || site.logoDarkUrl
  if (!logoUrl) return <span className="wordmark-text">{site.name}</span>
  return <Image className="site-logo-image" src={logoUrl} alt={`${site.name} logo`} width={220} height={72} sizes="(max-width: 760px) 150px, 190px" unoptimized />
}

export function SiteHeader({ site, enquiryHref = '/contact' }: { site: ResolvedSite; enquiryHref?: string }) {
  return <header className="site-header"><Link className="wordmark" href="/" aria-label={`${site.name} home`}><SiteLogo site={site} /></Link><nav aria-label="Primary"><Link href="/properties">Properties</Link><Link href="/about">About</Link><Link href="/valuation">Valuation</Link><Link href="/contact">Contact</Link></nav><Link className="header-cta" href={enquiryHref}>Enquire now</Link></header>
}

export function SiteFooter({ site }: { site: ResolvedSite }) {
  const whatsappDigits = site.whatsappNumber?.replace(/\D/g, '') || ''
  const whatsappNumber = whatsappDigits.startsWith('0') ? `27${whatsappDigits.slice(1)}` : whatsappDigits
  const websiteHref = site.website?.startsWith('https://') ? site.website : ''

  return <footer className="site-footer-dark"><Link className="footer-brand" href="/" aria-label={`${site.name} home`}><SiteLogo site={site} dark /></Link><div className="footer-contact">{site.phone ? <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a> : null}{site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : null}{whatsappNumber ? <a href={`https://wa.me/${whatsappNumber}`}>WhatsApp</a> : null}{websiteHref ? <a href={websiteHref}>Company website</a> : null}</div><span>Powered by PropData</span></footer>
}
