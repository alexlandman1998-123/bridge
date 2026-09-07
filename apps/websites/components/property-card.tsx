import Link from 'next/link'
import Image from 'next/image'
import { propertySlug } from '@/lib/site-repository'
import type { PublicProperty } from '@/lib/types'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

function FeatureIcon({ kind }: { kind: 'bed' | 'bath' | 'parking' }) {
  if (kind === 'bed') return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M3 11.5h18v7H3zM3 18.5v2M21 18.5v2M5 11.5V8.7A1.7 1.7 0 0 1 6.7 7h3.6a1.7 1.7 0 0 1 1.7 1.7v2.8M13 11.5V8.7A1.7 1.7 0 0 1 14.7 7h2.6A1.7 1.7 0 0 1 19 8.7v2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  if (kind === 'bath') return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 12h14v3.2A3.8 3.8 0 0 1 15.2 19H8.8A3.8 3.8 0 0 1 5 15.2zM3 12h18M7 12V8.5A2.5 2.5 0 0 1 9.5 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M3 12.5h18l-1.1 5H4.1zM6 12.5l1.4-3h9.2l1.4 3M6 17.5v1.8M18 17.5v1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}

export function PropertyCard({ property, variant = 'default' }: { property: PublicProperty; variant?: 'default' | 'results' }) {
  const image = property.media.find((media) => media.type === 'image' && media.url)
  if (variant === 'results') return <article className="property-result-card">
    <Link className="property-result-image" href={`/properties/${propertySlug(property)}`} aria-label={`View ${property.title}`}>
      {image ? <Image src={image.url} alt={image.caption || property.title} fill sizes="(max-width: 760px) 100vw, 33vw" /> : <div className="image-placeholder" />}
    </Link>
    <div className="property-result-copy"><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong><p className="property-result-suburb">{property.suburb || property.title}</p>{property.province ? <p className="property-result-region">{property.province}</p> : null}<div className="property-result-divider" /><div className="property-result-features">{property.bedrooms ? <span><FeatureIcon kind="bed" />{property.bedrooms}</span> : null}{property.bathrooms ? <span><FeatureIcon kind="bath" />{property.bathrooms}</span> : null}{property.parkingBays ? <span><FeatureIcon kind="parking" />{property.parkingBays}</span> : null}</div></div>
  </article>
  return <article className="property-card">
    <Link className="property-image" href={`/properties/${propertySlug(property)}`} aria-label={`View ${property.title}`}>
      {image ? <Image src={image.url} alt={image.caption || property.title} fill sizes="(max-width: 760px) 100vw, 33vw" /> : <div className="image-placeholder" />}
      <span className="property-status">{property.isShowcase ? 'Preview listing' : property.transactionType === 'rental' ? 'To let' : 'For sale'}</span>
    </Link>
    <div className="property-copy"><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong><p>{property.suburb}{property.province ? `, ${property.province}` : ''}</p><h3><Link href={`/properties/${propertySlug(property)}`}>{property.title}</Link></h3><dl><div><dt>Bedrooms</dt><dd>{property.bedrooms || '—'} beds</dd></div><div><dt>Bathrooms</dt><dd>{property.bathrooms || '—'} baths</dd></div><div><dt>Parking</dt><dd>{property.parkingBays || '—'} parking</dd></div></dl></div></article>
}
