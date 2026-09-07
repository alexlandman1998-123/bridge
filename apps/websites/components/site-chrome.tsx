import Image from 'next/image'
import Link from 'next/link'
import type { ResolvedSite } from '@/lib/types'
import { isHomeSeekersTemplate, templateNavigation } from '@/lib/site-templates'

function SiteLogo({ site, dark = false }: { site: ResolvedSite; dark?: boolean }) {
  const logoUrl = dark
    ? site.logoLightUrl || site.logoUrl || site.logoDarkUrl
    : site.logoLightUrl || site.logoUrl || site.logoDarkUrl
  if (!logoUrl) return <span className="wordmark-text">{site.name}</span>
  return <Image className="site-logo-image" src={logoUrl} alt={`${site.name} logo`} width={220} height={72} sizes="(max-width: 760px) 150px, 190px" unoptimized />
}

export function SiteHeader({ site, enquiryHref = '/valuation' }: { site: ResolvedSite; enquiryHref?: string }) {
  const homeSeekers = isHomeSeekersTemplate(site.templateKey)
  const navigation = templateNavigation(site.templateKey)
  return <header className="site-header"><Link className="wordmark" href="/" aria-label={`${site.name} home`}><SiteLogo site={site} /></Link><nav aria-label="Primary">{navigation.map((item) => <Link href={item.href} key={`${item.href}-${item.label}`}>{item.label}</Link>)}</nav><Link className="header-cta" href={enquiryHref}>{homeSeekers ? 'Book a valuation' : 'Enquire now'}</Link><details className="mobile-menu"><summary aria-label="Open navigation"><span /><span /><span /></summary><nav aria-label="Mobile primary">{navigation.map((item) => <Link href={item.href} key={`${item.href}-${item.label}`}>{item.label}</Link>)}<Link className="header-cta" href={enquiryHref}>{homeSeekers ? 'Book a valuation' : 'Enquire now'}</Link></nav></details></header>
}

export function SiteFooter({ site }: { site: ResolvedSite }) {
  const whatsappDigits = site.whatsappNumber?.replace(/\D/g, '') || ''
  const whatsappNumber = whatsappDigits.startsWith('0') ? `27${whatsappDigits.slice(1)}` : whatsappDigits
  const websiteHref = site.website?.startsWith('https://') ? site.website : ''

  return <footer className="site-footer-dark"><div className="footer-top"><Link className="footer-brand" href="/" aria-label={`${site.name} home`}><SiteLogo site={site} dark /></Link><nav aria-label="Footer">{templateNavigation(site.templateKey).map((item) => <Link href={item.href} key={`${item.href}-${item.label}`}>{item.label}</Link>)}</nav><div className="footer-contact">{site.phone ? <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a> : null}{site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : null}{whatsappNumber ? <a href={`https://wa.me/${whatsappNumber}`}>WhatsApp</a> : null}{websiteHref ? <a href={websiteHref}>Company website</a> : null}</div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {site.name}. All rights reserved.</span><span>Powered by Arch9</span></div></footer>
}
