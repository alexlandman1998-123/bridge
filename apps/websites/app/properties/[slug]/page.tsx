import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { LeadForm } from '@/components/lead-form'
import { PropertyActions } from '@/components/property-actions'
import { PropertyGallery } from '@/components/property-gallery'
import { PropertyCard } from '@/components/property-card'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { presentListingFeatures } from '@/lib/listing-features'
import { getPublicProperties, getPublicProperty, propertySlug, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, requestHeaders] = await Promise.all([params, headers()])
  const site = await resolveSite(requestHeaders.get('host'))
  const property = site ? await getPublicProperty(site, slug) : null
  if (!site || !property) return { title: 'Property not found' }
  return {
    title: `${property.title} | ${site.name}`,
    description: property.description || `${property.propertyType} in ${property.suburb}.`,
    alternates: { canonical: `/properties/${propertySlug(property)}` },
  }
}

function DetailIcon({ kind }: { kind: 'bed' | 'bath' | 'parking' | 'size' }) {
  const paths = {
    bed: <path d="M3 11.5h18v7H3zM3 18.5v2M21 18.5v2M5 11.5V8.7A1.7 1.7 0 0 1 6.7 7h3.6a1.7 1.7 0 0 1 1.7 1.7v2.8M13 11.5V8.7A1.7 1.7 0 0 1 14.7 7h2.6A1.7 1.7 0 0 1 19 8.7v2.8" />,
    bath: <path d="M5 12h14v3.2A3.8 3.8 0 0 1 15.2 19H8.8A3.8 3.8 0 0 1 5 15.2zM3 12h18M7 12V8.5A2.5 2.5 0 0 1 9.5 6H11" />,
    parking: <path d="M3 12.5h18l-1.1 5H4.1zM6 12.5l1.4-3h9.2l1.4 3M6 17.5v1.8M18 17.5v1.8" />,
    size: <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>
}

function FeatureIcon({ icon }: { icon: string }) {
  const paths: Record<string, React.ReactNode> = {
    utensils: <path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M15 3v18M15 4h2a3 3 0 0 1 3 3v5h-5" />, armchair: <path d="M5 12V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4M4 12h16v5H4zM6 17v3M18 17v3" />, leaf: <path d="M20 4C12 4 5 7 5 14c0 3.5 2.5 6 6 6 7 0 9-7 9-16ZM4 20c3-4 6-6 11-8" />, sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>, 'map-pin': <><path d="M20 10c0 5-8 10-8 10S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>, 'paw-print': <><circle cx="7" cy="9" r="1.6" /><circle cx="12" cy="6" r="1.6" /><circle cx="17" cy="9" r="1.6" /><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 3-4 3s-4-1-4-3Z" /></>, wifi: <><path d="M3 9a13 13 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 15a4.5 4.5 0 0 1 6 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>, waves: <path d="M3 8c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2M3 14c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2" />, 'shield-check': <><path d="M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.7-4.7" /></>, 'battery-charging': <><rect x="3" y="7" width="17" height="10" rx="1" /><path d="M21 10v4M12 8l-2 4h3l-2 4" /></>, droplet: <path d="M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11Z" />, 'book-open': <path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H12v16H7.5A3.5 3.5 0 0 0 4 23V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 4H12v16h4.5a3.5 3.5 0 0 1 3.5 3V5.5Z" />, house: <><path d="m3 11 9-8 9 8v10H3z" /><path d="M9 21v-6h6v6" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[icon]}</svg>
}

export default async function PropertyPage({ params }: Props) {
  const [{ slug }, requestHeaders] = await Promise.all([params, headers()])
  const site = await resolveSite(requestHeaders.get('host'))
  if (!site) notFound()
  const property = await getPublicProperty(site, slug)
  if (!property) notFound()
  const canonicalSlug = propertySlug(property)
  if (slug !== canonicalSlug) permanentRedirect(`/properties/${canonicalSlug}`)
  const similar = (await getPublicProperties(site, { type: property.transactionType })).filter((item) => item.id !== property.id).slice(0, 3)
  const features = presentListingFeatures(property.features)
  const facts = [
    { kind: 'bed' as const, value: property.bedrooms, label: 'Bedrooms' }, { kind: 'bath' as const, value: property.bathrooms, label: 'Bathrooms' },
    { kind: 'parking' as const, value: property.parkingBays, label: property.parkingBays === 1 ? 'Garage / parking' : 'Garages / parking' }, { kind: 'size' as const, value: property.floorSize ? `${property.floorSize} m²` : undefined, label: 'Floor size' },
  ].filter((fact) => fact.value)
  const whatsappHref = site.whatsappNumber ? `https://wa.me/${site.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I’m interested in ${property.title}.`)}` : undefined

  return (
    <main className={`property-page ${templateClassName(site.templateKey)}`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
      <SiteHeader site={site} enquiryHref="#enquire" currentHref="/properties" />
      <section className="listing-detail-shell">
        <Link className="listing-back-link" href="/properties">← All properties</Link>
        <PropertyGallery property={property} />
        <div className="listing-meta-row"><p className="listing-status">{property.transactionType === 'rental' ? 'TO RENT' : 'FOR SALE'} <span>·</span> SOLE MANDATE</p><PropertyActions /></div>
      </section>
      <section className="listing-detail-grid">
        <article className="listing-summary-card"><h1>{property.title}</h1><p className="listing-location">{property.suburb}{property.province ? `, ${property.province}` : ''}</p><div className="listing-card-divider" /><dl className="listing-facts">{facts.map((fact) => <div key={fact.kind}><DetailIcon kind={fact.kind} /><div><dd>{fact.value}</dd><dt>{fact.label}</dt></div></div>)}</dl></article>
        <div className="listing-conversion-stack"><div className="listing-price"><p>ASKING PRICE</p><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong>{property.price ? <Link href={`/calculators?price=${property.price}#bond-calculator`}>Estimate your monthly bond payment</Link> : null}</div>
        <aside className="listing-agent-card" id="enquire"><div className="listing-agent-intro">{site.contactImageUrl ? <Image className="listing-agent-photo" src={site.contactImageUrl} alt={`${site.name} property consultant`} width={64} height={64} /> : <span>{site.name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2)}</span>}<div><p>MEET YOUR PROPERTY CONSULTANT</p><h2>{site.name} team</h2></div></div><p className="listing-agent-copy">Arrange a viewing or ask a question. Your enquiry goes directly to the local team.</p><LeadForm propertyId={property.id} source="website_listing_enquiry" />{whatsappHref ? <a className="listing-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp agent</a> : null}</aside></div>
        <article className="listing-detail-copy"><div className="listing-description-card"><h2>A home made for easy living</h2><p className="listing-description">{property.description || 'Further property details will be supplied by the listing agent.'}</p></div>
          {features.length ? <div className="listing-feature-tags" aria-label="Property features">{features.map((feature) => <span className={feature.icon ? '' : 'is-legacy'} key={feature.key}>{feature.icon ? <FeatureIcon icon={feature.icon} /> : null}{feature.label}</span>)}</div> : null}
          {property.amenities.length ? <section className="listing-amenities"><h2>More about this home</h2><ul>{property.amenities.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
        </article>
      </section>
      {similar.length > 0 ? <section className="section"><div className="section-heading"><div><p className="eyebrow">YOU MAY ALSO LIKE</p><h2>Similar properties</h2></div></div><div className="property-grid">{similar.map((item) => <PropertyCard key={item.id} property={item} />)}</div></section> : null}
      <div className="listing-mobile-actions"><a href="#enquire">Enquire</a>{whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a> : null}</div>
      <SiteFooter site={site} />
    </main>
  )
}
