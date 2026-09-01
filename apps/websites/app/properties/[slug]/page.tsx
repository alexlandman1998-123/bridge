import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { LeadForm } from '@/components/lead-form'
import { PropertyGallery } from '@/components/property-gallery'
import { PropertyCard } from '@/components/property-card'
import { getPublicProperties, getPublicProperty, resolveSite } from '@/lib/site-repository'

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
    alternates: { canonical: `/properties/${slug}` },
  }
}

export default async function PropertyPage({ params }: Props) {
  const [{ slug }, requestHeaders] = await Promise.all([params, headers()])
  const site = await resolveSite(requestHeaders.get('host'))
  if (!site) notFound()
  const property = await getPublicProperty(site, slug)
  if (!property) notFound()
  const similar = (await getPublicProperties(site, { type: property.transactionType })).filter((item) => item.id !== property.id).slice(0, 3)
  return <main className="property-page" style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor } as React.CSSProperties}><header className="site-header"><a className="wordmark" href="/">{site.name}</a><a className="header-cta" href="#enquire">Enquire now</a></header><section className="property-hero"><a className="back-link" href="/properties">← All properties</a><PropertyGallery property={property} /><div className="property-heading"><div><p className="eyebrow">{property.transactionType === 'rental' ? 'TO RENT' : 'FOR SALE'} · {property.reference}</p><h1>{property.title}</h1><p>{property.suburb}{property.province ? `, ${property.province}` : ''}</p></div><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong></div></section><section className="property-content"><article><dl className="fact-grid"><div><dt>Bedrooms</dt><dd>{property.bedrooms || '—'}</dd></div><div><dt>Bathrooms</dt><dd>{property.bathrooms || '—'}</dd></div><div><dt>Parking</dt><dd>{property.parkingBays || '—'}</dd></div><div><dt>Floor size</dt><dd>{property.floorSize ? `${property.floorSize} m²` : '—'}</dd></div></dl><h2>About this property</h2><p className="long-copy">{property.description || 'Further property details will be supplied by the listing agent.'}</p>{property.features.length > 0 && <><h2>Features</h2><ul className="feature-list">{property.features.map((feature) => <li key={feature}>{feature}</li>)}</ul></>}</article><aside id="enquire"><p className="eyebrow">REQUEST INFORMATION</p><h2>Speak to a property advisor.</h2><p>Ask a question or arrange a viewing. Your enquiry goes directly to this agency’s CRM.</p><LeadForm propertyId={property.id} /></aside></section>{similar.length > 0 && <section className="section"><div className="section-heading"><div><p className="eyebrow">YOU MAY ALSO LIKE</p><h2>Similar properties</h2></div></div><div className="property-grid">{similar.map((item) => <PropertyCard key={item.id} property={item} />)}</div></section>}</main>
}
