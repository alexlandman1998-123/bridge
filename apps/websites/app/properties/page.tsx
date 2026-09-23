import { rentalPriceRanges, salePriceRanges } from '@/lib/property-search-options'
import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PropertyCard } from '@/components/property-card'
import { PropertySort } from '@/components/property-sort'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicProperties, resolveSite } from '@/lib/site-repository'
import { hasEditorialPropertyExperience, templateClassName } from '@/lib/site-templates'

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
  const lwpBuying = hasEditorialPropertyExperience(site) && !rental
  const lwpRenting = hasEditorialPropertyExperience(site) && rental
  const resultLabel = rental ? 'to rent' : 'for sale'
  const clearHref = `/properties?type=${transactionType}`
  const filtered = Object.entries(query).some(([key, value]) => !['type', 'sort'].includes(key) && value)

  return <main className={`${templateClassName(site.templateKey)} listings-page${lwpBuying ? ' lwp-buying-page' : ''}${lwpRenting ? ' lwp-renting-page' : ''}`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    <SiteHeader site={site} currentHref={clearHref} />
    <section className={lwpBuying ? 'lwp-buying-hero' : lwpRenting ? 'lwp-renting-hero' : 'results-hero'}>
      <div className="results-shell">
        {lwpBuying ? <div className="lwp-buying-intro"><div><p className="eyebrow">BUY WITH LOCAL PERSPECTIVE</p><h1>Find the place that feels like yours.</h1><p>From Kyalami to Centurion, we bring the local context behind every home — so your next move feels considered from the first viewing.</p></div><ol aria-label="The LWP buying approach"><li><span>01</span><strong>Search with clarity.</strong><p>Start with the lifestyle, not just the listing.</p></li><li><span>02</span><strong>View with context.</strong><p>Get the detail that a photo gallery cannot show.</p></li><li><span>03</span><strong>Offer with confidence.</strong><p>Make the next move with a team beside you.</p></li></ol></div> : lwpRenting ? <div className="lwp-renting-intro"><p className="eyebrow">RENT WITH ROOM TO BREATHE</p><div><h1>Find a place for the life you have now.</h1><p>A great rental is more than an address. Explore homes with the right rhythm, location and flexibility for your next chapter.</p></div><p className="lwp-renting-location">KYALAMI · MIDRAND · WATERFALL · SANDTON</p></div> : <><p className="eyebrow">{rental ? 'A PLACE TO CALL YOUR OWN' : 'MAKE YOUR NEXT MOVE'}</p><h1>{rental ? 'Settle into somewhere new.' : 'Find a home to make yours.'}</h1><p>{rental ? 'Explore homes to rent, with the right space for the way you live.' : 'Discover homes, explore the possibilities, and find your next chapter.'}</p><nav className="results-tabs" aria-label="Property type"><a aria-current={!rental ? 'page' : undefined} className={!rental ? 'is-active' : ''} href="/properties?type=sale">Buy a home</a><a aria-current={rental ? 'page' : undefined} className={rental ? 'is-active' : ''} href="/properties?type=rental">Rent a home</a></nav></>}
        <form className="results-filters" action="/properties">
          <input type="hidden" name="type" value={transactionType} />
          {(['area', 'availability', 'minPrice', 'maxPrice'] as const).map(key => query[key] ? <input key={key} type="hidden" name={key} value={query[key]} /> : null)}
          <label className="results-query"><span>{lwpBuying ? 'Where would you like to live?' : lwpRenting ? 'Where do you want to be?' : 'Location'}</span><input name="q" defaultValue={query.q} placeholder={lwpRenting ? 'Neighbourhood, building or suburb' : 'Suburb, city or estate'} /></label>
          <label><span>Property type</span><select name="propertyType" defaultValue={query.propertyType || ''}><option value="">Any property</option>{['House', 'Apartment', 'Townhouse', 'Land'].map(type => <option key={type}>{type}</option>)}</select></label>
          <label><span>{rental ? 'Monthly rent' : 'Price range'}</span><select name="priceRange" defaultValue={query.priceRange || ''}><option value="">Any price</option>{(rental ? rentalPriceRanges : salePriceRanges).map(range => <option value={range.value} key={range.value}>{range.label}</option>)}</select></label>
          <label><span>Bedrooms</span><select name="bedrooms" defaultValue={query.bedrooms || ''}><option value="">Any bedrooms</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}+ bedrooms</option>)}</select></label>
          <button type="submit">{lwpBuying ? 'Explore homes' : lwpRenting ? 'Find a rental' : 'Search homes'} <span aria-hidden="true">↗</span></button>
        </form>
      </div>
    </section>
    <section className="results-section" aria-label="Property results">
      {lwpBuying && <div className="lwp-inventory-heading"><div><p className="eyebrow">CURRENT INVENTORY</p><h2>Homes with a point of view.</h2></div><p>Explore homes selected for the way people live across Midrand, Kyalami, Waterfall and beyond.</p></div>}
      {lwpRenting && <div className="lwp-rental-inventory-heading"><div><p className="eyebrow">AVAILABLE TO RENT</p><h2>A place you can settle into.</h2></div><p>Availability, pricing and viewings update from the approved LWP rental feed.</p></div>}
      <div className="results-list-heading"><div><h2>{lwpBuying ? `${properties.length.toString().padStart(2, '0')} homes currently available` : lwpRenting ? `${properties.length.toString().padStart(2, '0')} rentals currently available` : `${properties.length} ${properties.length === 1 ? 'property' : 'properties'} ${resultLabel}`}</h2>{filtered && <a className="clear-filters" href={clearHref}>Clear filters ×</a>}</div><PropertySort query={query} value={sort} /></div>
      {properties.length ? <><div className="results-property-grid">{properties.map(property => <PropertyCard key={property.id} property={property} variant="results" />)}</div><p className="results-count">Showing {properties.length} {properties.length === 1 ? 'property' : 'properties'}</p></> : <div className={lwpBuying ? 'lwp-buying-empty-state' : lwpRenting ? 'lwp-rental-empty-state' : 'empty-state'}><p className="eyebrow">{lwpBuying ? 'NOT SEEING IT YET?' : lwpRenting ? 'A LITTLE MORE HELP?' : 'LET’S FIND YOUR NEXT CHAPTER'}</p><h2>{filtered ? 'A little more room to search.' : lwpBuying ? 'Tell us the dream list. We’ll do the house-hunting.' : lwpRenting ? 'Tell us what home feels like.' : 'Your next home could be on its way.'}</h2><p>{filtered ? 'Try a wider price range or a nearby area. Our team can also help you find the right fit.' : lwpBuying ? 'Some of the best homes never spend long on the market. Share what you are looking for and we will keep an eye out.' : lwpRenting ? 'Share your brief and we will send homes that make sense for the way you actually live.' : 'There are no homes listed here just yet. Tell our team what you’re looking for.'}</p><div>{filtered && <a className="header-cta" href={clearHref}>Clear filters</a>}<a href="/contact">{lwpBuying ? 'Start a property search' : lwpRenting ? 'Start a rental search' : 'Talk to the team'} <span aria-hidden="true">↗</span></a></div></div>}
    </section>
    {lwpRenting && <section className="lwp-rental-process"><p className="eyebrow">A BETTER WAY TO MOVE IN</p><div><article><span>01</span><h2>Shortlist with context.</h2><p>Clear details on every home before you book a viewing.</p></article><article><span>02</span><h2>View with ease.</h2><p>A dedicated LWP advisor helps you find the right fit.</p></article><article><span>03</span><h2>Move in prepared.</h2><p>A simple, transparent process from application to keys.</p></article></div></section>}
    <section className="listing-help"><div><p className="eyebrow">{lwpRenting ? 'LOCAL GUIDANCE, WHEN YOU NEED IT' : 'A LITTLE LOCAL GUIDANCE'}</p><h2>{lwpRenting ? 'Looking for a little more room?' : 'Looking for something specific?'}</h2><p>{lwpRenting ? 'Tell us your wish list and we’ll help you find the place that fits.' : 'Tell us what home looks like to you. We’ll help you take the next step.'}</p></div><a className="header-cta" href="/contact">{lwpRenting ? 'Start a rental search ↗' : 'Let’s talk property ↗'}</a></section>
    <SiteFooter site={site} />
  </main>
}
