import { rentalPriceRanges, salePriceRanges } from '@/lib/property-search-options'
import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PropertyCard } from '@/components/property-card'
import { PropertySort } from '@/components/property-sort'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicProperties, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'
type Query = { q?: string; type?: string; propertyType?: string; bedrooms?: string; minPrice?: string; maxPrice?: string; area?: string; priceRange?: string; availability?: string; sort?: string }
type Props = { searchParams: Promise<Query> }
const loadSite = cache(async () => resolveSite((await headers()).get('host')))

export async function generateMetadata({ searchParams }: Props) {
  const [site, query] = await Promise.all([loadSite(), searchParams])
  return { title: `${query.type === 'rental' ? 'Homes to rent' : 'Homes for sale'} | ${site?.name || 'Property search'}` }
}

export default async function PropertiesPage({ searchParams }: Props) {
  const [site, incoming] = await Promise.all([loadSite(), searchParams])
  if (!site) notFound()
  const transactionType = incoming.type === 'rental' ? 'rental' : 'sale'
  const query = { ...incoming, type: transactionType }
  const properties = await getPublicProperties(site, query)
  const sort = ['price-asc', 'price-desc'].includes(query.sort || '') ? query.sort! : 'recommended'
  if (sort !== 'recommended') properties.sort((a, b) => {
    if (!a.price) return b.price ? 1 : 0
    if (!b.price) return -1
    return sort === 'price-asc' ? a.price - b.price : b.price - a.price
  })
  const rental = transactionType === 'rental'
  const resultLabel = rental ? 'to rent' : 'for sale'
  const clearHref = `/properties?type=${transactionType}`
  const filtered = Object.entries(query).some(([key, value]) => !['type', 'sort'].includes(key) && value)

  return <main className={`${templateClassName(site.templateKey)} listings-page`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    {site.preview && <div className="preview-banner">Preview site — not yet connected to a client domain</div>}
    <SiteHeader site={site} currentHref={clearHref} />
    <section className="results-hero">
      <div className="results-shell">
        <p className="eyebrow">{rental ? 'A PLACE TO CALL YOUR OWN' : 'MAKE YOUR NEXT MOVE'}</p>
        <h1>{rental ? 'Settle into somewhere new.' : 'Find a home to make yours.'}</h1>
        <p>{rental ? 'Explore homes to rent, with the right space for the way you live.' : 'Discover homes, explore the possibilities, and find your next chapter.'}</p>
        <nav className="results-tabs" aria-label="Property type"><a aria-current={!rental ? 'page' : undefined} className={!rental ? 'is-active' : ''} href="/properties?type=sale">Buy a home</a><a aria-current={rental ? 'page' : undefined} className={rental ? 'is-active' : ''} href="/properties?type=rental">Rent a home</a></nav>
        <form className="results-filters" action="/properties">
          <input type="hidden" name="type" value={transactionType} />
          {(['area', 'availability', 'minPrice', 'maxPrice'] as const).map(key => query[key] ? <input key={key} type="hidden" name={key} value={query[key]} /> : null)}
          <label className="results-query"><span>Location</span><input name="q" defaultValue={query.q} placeholder="Suburb, city or estate" /></label>
          <label><span>Property type</span><select name="propertyType" defaultValue={query.propertyType || ''}><option value="">Any property</option>{['House', 'Apartment', 'Townhouse', 'Land'].map(type => <option key={type}>{type}</option>)}</select></label>
          <label><span>{rental ? 'Monthly rent' : 'Price range'}</span><select name="priceRange" defaultValue={query.priceRange || ''}><option value="">Any price</option>{(rental ? rentalPriceRanges : salePriceRanges).map(range => <option value={range.value} key={range.value}>{range.label}</option>)}</select></label>
          <label><span>Bedrooms</span><select name="bedrooms" defaultValue={query.bedrooms || ''}><option value="">Any bedrooms</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}+ bedrooms</option>)}</select></label>
          <button type="submit">Search homes <span aria-hidden="true">↗</span></button>
        </form>
      </div>
    </section>
    <section className="results-section" aria-label="Property results">
      <div className="results-list-heading"><div><h2>{properties.length} {properties.length === 1 ? 'property' : 'properties'} {resultLabel}</h2>{filtered && <a className="clear-filters" href={clearHref}>Clear filters ×</a>}</div><PropertySort query={query} value={sort} /></div>
      {properties.length ? <><div className="results-property-grid">{properties.map(property => <PropertyCard key={property.id} property={property} variant="results" />)}</div><p className="results-count">Showing {properties.length} {properties.length === 1 ? 'property' : 'properties'}</p></> : <div className="empty-state"><p className="eyebrow">LET’S FIND YOUR NEXT CHAPTER</p><h2>{filtered ? 'A little more room to search.' : 'Your next home could be on its way.'}</h2><p>{filtered ? 'Try a wider price range or a nearby area. Our team can also help you find the right fit.' : 'There are no homes listed here just yet. Tell our team what you’re looking for.'}</p><div>{filtered && <a className="header-cta" href={clearHref}>Clear filters</a>}<a href="/contact">Talk to the team <span aria-hidden="true">↗</span></a></div></div>}
    </section>
    <section className="listing-help"><div><p className="eyebrow">A LITTLE LOCAL GUIDANCE</p><h2>Looking for something specific?</h2><p>Tell us what home looks like to you. We’ll help you take the next step.</p></div><a className="header-cta" href="/contact">Let’s talk property ↗</a></section>
    <SiteFooter site={site} />
  </main>
}
