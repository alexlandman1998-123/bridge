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

type Query = { q?: string; agency?: string }
export default async function RecentlySoldPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [requestHeaders, query] = await Promise.all([headers(), searchParams])
  const site = await resolveSite(requestHeaders.get('host'))
  if (!site || !isKingdomSoldSite(site)) notFound()
  const sold = await getKingdomRecentlySold(site)
  const search = String(query.q || '').trim().toLowerCase()
  const agency = ['kingdom', 'isell'].includes(query.agency || '') ? query.agency : ''
  const properties = sold.filter(property => (!search || [property.suburb, property.title, property.province].join(' ').toLowerCase().includes(search))
    && (!agency || property.partnerListing === (agency === 'isell')))
  return <main className={`${templateClassName(site.templateKey)} listings-page kingdom-sold-page`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    <SiteHeader site={site} currentHref="/recently-sold" />
    <section className="results-hero"><div className="results-shell">
      <p className="eyebrow">RECENT RESULTS</p><h1>Recently sold.</h1>
      <p>Homes sold by Kingdom Real Estate and I Sell Properties. A new chapter for every property.</p>
      <form className="results-filters kingdom-sold-filters" action="/recently-sold">
        <label><span>Location</span><input name="q" defaultValue={query.q} placeholder="Suburb, area or property" /></label>
        <label><span>Agency</span><select name="agency" defaultValue={agency}><option value="">Both agencies</option><option value="kingdom">Kingdom Real Estate</option><option value="isell">I Sell Properties</option></select></label>
        <button type="submit">Search sold homes <span aria-hidden="true">↗</span></button>
      </form>
    </div></section>
    <section className="results-section" aria-label="Recently sold properties">
      <div className="results-list-heading"><h2>{properties.length} {properties.length === 1 ? 'sold property' : 'sold properties'}</h2>{search || agency ? <a className="clear-filters" href="/recently-sold">Clear filters</a> : null}</div>
      {properties.length ? <div className="results-property-grid">{properties.map(property => <SoldPropertyCard key={property.id} property={property} />)}</div>
        : <div className="results-empty"><h2>{sold.length ? 'No sold homes match your search.' : 'Our next sold homes will appear here.'}</h2><p>{sold.length ? 'Try another area or view both agencies.' : 'Explore our available homes, or speak to our team about your next move.'}</p><a href={sold.length ? '/recently-sold' : '/properties?type=sale'}>{sold.length ? 'View all sold homes' : 'Browse homes for sale'} →</a></div>}
    </section>
    <section className="listing-help"><div><p className="eyebrow">YOUR NEXT CHAPTER</p><h2>Thinking of selling?</h2><p>Get a professional valuation and a plan for your property.</p></div><a className="header-cta" href="/valuation">Book a valuation</a></section>
    <SiteFooter site={site} />
  </main>
}
