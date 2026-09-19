'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MobileNavigation } from './mobile-navigation'
import resourceStyles from './resource-navigation.module.css'
import type { ResolvedSite } from '@/lib/types'
import { selectWebsiteLogo } from '@/lib/website-brand'

type NavigationItem = { href: string; label: string }

function HeaderLogo({ site, light }: { site: ResolvedSite; light: boolean }) {
  const logoUrl = selectWebsiteLogo(site, light)
  if (!logoUrl) return <span className="wordmark-text">{site.name}</span>
  return <Image className="site-logo-image" src={logoUrl} alt={`${site.name} logo`} width={220} height={72} sizes="(max-width: 760px) 150px, 190px" unoptimized />
}

export function ResponsiveSiteHeader({ site, navigation, resources, enquiryHref, currentHref, homeSeekers, overlay }: {
  site: ResolvedSite
  navigation: NavigationItem[]
  resources: NavigationItem[]
  enquiryHref: string
  currentHref?: string
  homeSeekers: boolean
  overlay: boolean
}) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (!overlay) return
    const update = () => setScrolled(window.scrollY > 28)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [overlay])

  const useLightLogo = overlay && !scrolled
  const headerClassName = [
    'site-header',
    overlay ? 'site-header--overlay' : 'site-header--solid',
    scrolled ? 'is-scrolled' : '',
  ].filter(Boolean).join(' ')

  return <header className={headerClassName}>
    <Link className="wordmark" href="/" aria-label={`${site.name} home`}>
      <HeaderLogo site={site} light={useLightLogo} />
      {homeSeekers ? <span className="header-brand-note">Beyond the sale.</span> : null}
    </Link>
    <nav aria-label="Primary">
      {navigation.map((item) => <Link href={item.href} aria-current={currentHref === item.href ? 'page' : undefined} key={`${item.href}-${item.label}`}>{item.label}</Link>)}
      <details className={resourceStyles.menu}>
        <summary className={resources.some(item => item.href === currentHref) ? resourceStyles.active : undefined}>Resources <span aria-hidden="true">⌄</span></summary>
        <div className={resourceStyles.dropdown}>{resources.map(item => <Link key={item.href} href={item.href} aria-current={currentHref === item.href ? 'page' : undefined}>{item.label}<span aria-hidden="true">↗</span></Link>)}</div>
      </details>
    </nav>
    <Link className="header-cta" href={enquiryHref}>{homeSeekers ? 'Book a valuation' : 'Enquire now'}</Link>
    <MobileNavigation items={[...navigation, ...resources]} currentHref={currentHref} enquiryHref={enquiryHref} enquiryLabel={homeSeekers ? 'Book a valuation' : 'Enquire now'} />
  </header>
}
