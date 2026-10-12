import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { SoldPropertyCard } from '@/components/sold-property-card'
import { getKingdomRecentlySold, isKingdomSoldSite } from '@/lib/kingdom-recently-sold'
import { resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Recently sold | Kingdom Real Estate',
  description: 'Explore homes sold by Kingdom Real Estate and I Sell Properties.',
  alternates: { canonical: '/recently-sold' },
}

export default async function RecentlySoldPage() {
  const site = await resolveSite((await headers()).get('host'))
  if (!site || !isKingdomSoldSite(site)) notFound()
  const properties = await getKingdomRecentlySold(site)
  return <main className={`${templateClassName(site.templateKey)} listings-page kingdom-sold-page`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    <SiteHeader site={site} currentHref="/recently-sold" />
    <section className="results-hero"><div className="results-shell">
      <h1>Recently sold.</h1>
      <p>Homes sold by Kingdom Real Estate and I Sell Properties. A new chapter for every property.</p>

    </div></section>
    <section className="results-section" aria-label="Recently sold properties">
      <div className="results-list-heading"><h2>{properties.length} {properties.length === 1 ? 'sold property' : 'sold properties'}</h2></div>
      {properties.length ? <div className="results-property-grid">{properties.map(property => <SoldPropertyCard key={property.id} property={property} />)}</div>
        : <div className="results-empty"><h2>Our next sold homes will appear here.</h2><p>Explore our available homes, or speak to our team about your next move.</p><a href="/properties?type=sale">Browse homes for sale →</a></div>}

    </section>
    <section className="listing-help"><div><p className="eyebrow">YOUR NEXT CHAPTER</p><h2>Thinking of selling?</h2><p>Get a professional valuation and a plan for your property.</p></div><a className="header-cta" href="/valuation">Book a valuation</a></section>
    <SiteFooter site={site} />
  </main>
}
