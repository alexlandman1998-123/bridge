import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { LeadForm } from '@/components/lead-form'
import { PropertyCard } from '@/components/property-card'
import { resolveSite } from '@/lib/site-repository'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const requestHeaders = await headers()
  const site = await resolveSite(requestHeaders.get('host'))
  if (!site) notFound()

  return (
    <main style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor } as React.CSSProperties}>
      {site.preview && <div className="preview-banner">Preview site — not yet connected to a client domain</div>}
      <header className="site-header"><a className="wordmark" href="#top">{site.name}</a><nav aria-label="Primary"><a href="/properties">Properties</a><a href="#about">About</a><a href="#enquire">Contact</a></nav><a className="header-cta" href="#enquire">Enquire now</a></header>
      <section className="hero" id="top"><div><p className="eyebrow">PROPERTY, SIMPLIFIED</p><h1>Find the place that feels like home.</h1><p>Beautifully presented property, knowledgeable people and a simpler way to move.</p><form action="/properties" className="search-shell"><button name="type" value="sale" type="submit">Buy</button><button name="type" value="rental" type="submit">Rent</button><label>Where do you want to live?<input aria-label="Where do you want to live?" name="q" placeholder="Suburb, city or area" /></label><button className="search-button" type="submit">Search properties</button></form></div></section>
      <section className="section" id="properties"><div className="section-heading"><div><p className="eyebrow">CURATED LISTINGS</p><h2>Featured properties</h2></div><a href="/properties">View all properties →</a></div><div className="property-grid">{site.properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div></section>
      <section className="split-section" id="about"><div><p className="eyebrow">LOCAL KNOWLEDGE</p><h2>Property advice that starts with people.</h2><p>Every PropData website begins with a polished, fast and conversion-focused property experience—then takes on the agency’s own identity.</p></div><div className="quote">“A neutral, mobile-first foundation designed for trusted local agencies.”</div></section>
      <section className="enquiry-section" id="enquire"><div><p className="eyebrow">LET’S TALK</p><h2>Start your next move.</h2><p>Tell us what you are looking for and the right team member will be in touch.</p>{site.phone && <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a>}</div><LeadForm /></section>
      <footer><span>{site.name}</span><span>Powered by PropData</span></footer>
    </main>
  )
}
