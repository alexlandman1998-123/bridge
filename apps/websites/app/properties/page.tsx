import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PropertyCard } from '@/components/property-card'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicProperties, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string; type?: string; propertyType?: string; bedrooms?: string; minPrice?: string; maxPrice?: string }> }

export default async function PropertiesPage({ searchParams }: Props) {
  const [requestHeaders, query] = await Promise.all([headers(), searchParams])
  const site = await resolveSite(requestHeaders.get('host'))
  if (!site) notFound()
  const properties = await getPublicProperties(site, query)

  return (
    <main className={templateClassName(site.templateKey)} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
      <SiteHeader site={site} />
      <section className="results-hero">
        <p className="eyebrow">PROPERTY SEARCH</p>
        <h1>Find your next property.</h1>
        <form className="filters" action="/properties">
          <input name="q" defaultValue={query.q} placeholder="Area, suburb or property type" />
          <select name="type" defaultValue={query.type || ''}><option value="">Buy or rent</option><option value="sale">For sale</option><option value="rental">To rent</option></select>
          <select name="propertyType" defaultValue={query.propertyType || ''}><option value="">Any property type</option><option value="House">House</option><option value="Apartment">Apartment</option><option value="Townhouse">Townhouse</option><option value="Land">Land</option></select>
          <select name="bedrooms" defaultValue={query.bedrooms || ''}><option value="">Any bedrooms</option><option value="1">1+ bedrooms</option><option value="2">2+ bedrooms</option><option value="3">3+ bedrooms</option><option value="4">4+ bedrooms</option></select>
          <button type="submit">Apply filters</button>
        </form>
      </section>
      <section className="section results-section">
        <div className="section-heading"><div><p className="eyebrow">{properties.length} MATCH{properties.length === 1 ? '' : 'ES'}</p><h2>Available properties</h2></div></div>
        {properties.length
          ? <div className="property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div>
          : <div className="empty-state"><h2>No properties match those filters.</h2><p>Try clearing a filter or searching a nearby area.</p><a href="/properties">Clear filters</a></div>}
      </section>
      <SiteFooter site={site} />
    </main>
  )
}
