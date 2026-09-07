import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PropertyCard } from '@/components/property-card'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicProperties, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string; type?: string; propertyType?: string; bedrooms?: string; minPrice?: string; maxPrice?: string; area?: string; priceRange?: string; availability?: string }> }

export default async function PropertiesPage({ searchParams }: Props) {
  const [requestHeaders, query] = await Promise.all([headers(), searchParams])
  const site = await resolveSite(requestHeaders.get('host'))
  if (!site) notFound()
  const properties = await getPublicProperties(site, query)
  const transactionType = query.type === 'rental' ? 'rental' : 'sale'
  const resultLabel = transactionType === 'rental' ? 'to rent' : 'for sale'

  return (
    <main className={templateClassName(site.templateKey)} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
      <SiteHeader site={site} />
      <section className="results-hero">
        <div className="results-shell">
          <h1>Find your next move.</h1>
          <p>Discover homes and spaces that feel right for you.</p>
          <nav className="results-tabs" aria-label="Property type"><a className={transactionType === 'sale' ? 'is-active' : ''} href="/properties?type=sale">Buy</a><a className={transactionType === 'rental' ? 'is-active' : ''} href="/properties?type=rental">Rent</a></nav>
          <form className="results-filters" action="/properties">
            <input type="hidden" name="type" value={transactionType} />
            <label className="results-query"><span className="sr-only">Search properties</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.7" cy="10.7" r="5.8" stroke="currentColor" strokeWidth="1.8"/><path d="m15.2 15.2 4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><input name="q" defaultValue={query.q} placeholder="Search suburb, city or estate" /></label>
            <select name="propertyType" aria-label="Property type" defaultValue={query.propertyType || ''}><option value="">Property type</option><option value="House">House</option><option value="Apartment">Apartment</option><option value="Townhouse">Townhouse</option><option value="Land">Land</option></select>
            <select name="priceRange" aria-label="Price range" defaultValue={query.priceRange || ''}><option value="">Price range</option><option value="under-3000000">Under R3m</option><option value="3000000-5000000">R3m – R5m</option><option value="5000000-10000000">R5m – R10m</option><option value="10000000-plus">R10m+</option></select>
            <select name="bedrooms" aria-label="Bedrooms" defaultValue={query.bedrooms || ''}><option value="">Bedrooms</option><option value="1">1+ bedrooms</option><option value="2">2+ bedrooms</option><option value="3">3+ bedrooms</option><option value="4">4+ bedrooms</option></select>
            <button type="submit">Search</button>
          </form>
        </div>
      </section>
      <section className="results-section">
        <div className="results-list-heading"><h2>{properties.length} {properties.length === 1 ? 'property' : 'properties'} {resultLabel}</h2><label>Sort: Newest first <select aria-label="Sort properties"><option>Newest first</option></select></label></div>
        {properties.length
          ? <><div className="results-property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} variant="results" />)}</div><p className="results-count">Showing 1 – {properties.length} of {properties.length} properties</p></>
          : <div className="empty-state"><h2>No properties match those filters.</h2><p>Try clearing a filter or searching a nearby area.</p><a href="/properties">Clear filters</a></div>}
      </section>
      <SiteFooter site={site} />
    </main>
  )
}
