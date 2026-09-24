import Image from 'next/image'
import Link from 'next/link'
import { hasPublishedBlogPosts } from '@/lib/site-repository'
import type { ResolvedSite } from '@/lib/types'
import { hasEditorialPropertyExperience, isHomeSeekersTemplate, templateNavigation } from '@/lib/site-templates'
import { selectWebsiteLogo } from '@/lib/website-brand'
import { ResponsiveSiteHeader } from './responsive-site-header'

function resourceLinks(hasBlogPosts: boolean) {
  return [
    ...(hasBlogPosts ? [{ href: '/blog', label: 'Journal' }] : []),
    { href: '/areas', label: 'Areas' },
    { href: '/calculators', label: 'Calculators' },
    { href: '/preapproval', label: 'Get preapproved' },
  ]
}

function SiteLogo({ site, dark = false }: { site: ResolvedSite; dark?: boolean }) {
  const logoUrl = selectWebsiteLogo(site, dark)
  if (!logoUrl) return <span className="wordmark-text">{site.name}</span>
  return <Image className="site-logo-image" src={logoUrl} alt={`${site.name} logo`} width={220} height={72} sizes="(max-width: 760px) 150px, 190px" unoptimized />
}

export async function SiteHeader({ site, enquiryHref = '/valuation', homepage = false, currentHref }: { site: ResolvedSite; enquiryHref?: string; homepage?: boolean; currentHref?: string }) {
  const homeSeekers = isHomeSeekersTemplate(site.templateKey)
  const navigation = templateNavigation(site.templateKey).filter(item => !(homepage || homeSeekers) || item.label !== 'Our people')
  const resources = resourceLinks(await hasPublishedBlogPosts(site))
  return <ResponsiveSiteHeader site={site} navigation={navigation} resources={resources} enquiryHref={enquiryHref} currentHref={currentHref} homeSeekers={homeSeekers} overlay={homepage && homeSeekers && hasEditorialPropertyExperience(site)} />
}

export async function SiteFooter({ site }: { site: ResolvedSite }) {
  const homeSeekers = isHomeSeekersTemplate(site.templateKey)
  const resources = resourceLinks(await hasPublishedBlogPosts(site))
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
