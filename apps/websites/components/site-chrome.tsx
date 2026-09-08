import { MobileNavigation } from './mobile-navigation'
import Image from 'next/image'
import Link from 'next/link'
import resourceStyles from './resource-navigation.module.css'
import type { ResolvedSite } from '@/lib/types'
import { isHomeSeekersTemplate, templateNavigation } from '@/lib/site-templates'

const resources = [{ href: '/blog', label: 'Journal' }, { href: '/calculators', label: 'Calculators' }, { href: '/preapproval', label: 'Get preapproved' }]

function SiteLogo({ site, dark = false }: { site: ResolvedSite; dark?: boolean }) {
  const logoUrl = dark
    ? site.logoLightUrl || site.logoUrl || site.logoDarkUrl
    : site.logoLightUrl || site.logoUrl || site.logoDarkUrl
  if (!logoUrl) return <span className="wordmark-text">{site.name}</span>
  return <Image className="site-logo-image" src={logoUrl} alt={`${site.name} logo`} width={220} height={72} sizes="(max-width: 760px) 150px, 190px" unoptimized />
}

export function SiteHeader({ site, enquiryHref = '/valuation', homepage = false, currentHref }: { site: ResolvedSite; enquiryHref?: string; homepage?: boolean; currentHref?: string }) {
  const homeSeekers = isHomeSeekersTemplate(site.templateKey)
  const navigation = templateNavigation(site.templateKey).filter(item => !(homepage || homeSeekers) || item.label !== 'Our people')
  return <header className="site-header"><Link className="wordmark" href="/" aria-label={`${site.name} home`}><SiteLogo site={site} /></Link><nav aria-label="Primary">{navigation.map((item) => <Link href={item.href} aria-current={currentHref === item.href ? 'page' : undefined} key={`${item.href}-${item.label}`}>{item.label}</Link>)}<details className={resourceStyles.menu}><summary className={resources.some(item => item.href === currentHref) ? resourceStyles.active : undefined}>Resources <span aria-hidden="true">⌄</span></summary><div className={resourceStyles.dropdown}>{resources.map(item => <Link key={item.href} href={item.href} aria-current={currentHref === item.href ? 'page' : undefined}>{item.label}<span aria-hidden="true">↗</span></Link>)}</div></details></nav><Link className="header-cta" href={enquiryHref}>{homeSeekers ? 'Book a valuation' : 'Enquire now'}</Link><MobileNavigation items={[...navigation, ...resources]} currentHref={currentHref} enquiryHref={enquiryHref} enquiryLabel={homeSeekers ? 'Book a valuation' : 'Enquire now'} /></header>
}

export function SiteFooter({ site }: { site: ResolvedSite }) {
  const homeSeekers = isHomeSeekersTemplate(site.templateKey)
  const explore = homeSeekers ? [
    { href: '/properties?type=sale', label: 'Buy' }, { href: '/properties?type=rental', label: 'Rent' }, { href: '/valuation', label: 'Sell' }, { href: '/properties', label: 'Developments' },
  ] : templateNavigation(site.templateKey)
  const agency = homeSeekers ? [{ href: '/about', label: 'About us' }, { href: '/about', label: 'Our team' }, { href: '/contact', label: 'Contact' }] : templateNavigation(site.templateKey)
  explore.push(...resources)
  const social = Object.entries(site.socialLinks || {}) as Array<[string, string]>

  return <footer className="site-footer-dark"><div className="footer-top">
    <div className="footer-identity"><Link className="footer-brand" href="/" aria-label={`${site.name} home`}><SiteLogo site={site} dark /></Link>{site.tagline ? <p>{site.tagline}</p> : null}{social.length ? <div className="footer-socials">{social.map(([network, href]) => <a aria-label={network} href={href} key={network} rel="noreferrer" target="_blank">{network.slice(0, 1).toUpperCase()}</a>)}</div> : null}</div>
    <nav className="footer-column" aria-label="Explore"><p>Explore</p>{explore.map((item) => <Link href={item.href} key={`${item.href}-${item.label}`}>{item.label}</Link>)}</nav>
    <nav className="footer-column" aria-label="Agency"><p>{site.name}</p>{agency.map((item) => <Link href={item.href} key={`${item.href}-${item.label}`}>{item.label}</Link>)}</nav>
    <div className="footer-cta"><h2>Find your next chapter.</h2><Link href="/properties">Browse properties <span aria-hidden="true">↗</span></Link></div>
  </div><div className="footer-bottom"><span>© {new Date().getFullYear()} {site.name}. All rights reserved.</span><span className="footer-legal">{site.privacyPolicyUrl ? <a href={site.privacyPolicyUrl}>Privacy Policy</a> : null}{site.termsUrl ? <a href={site.termsUrl}>Terms of Use</a> : null}</span><span>Powered by Arch9</span></div></footer>
}
