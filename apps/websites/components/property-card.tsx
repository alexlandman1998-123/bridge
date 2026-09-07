import Link from 'next/link'
import Image from 'next/image'
import { propertySlug } from '@/lib/site-repository'
import type { PublicProperty } from '@/lib/types'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export function PropertyCard({ property }: { property: PublicProperty }) {
  const image = property.media.find((media) => media.type === 'image' && media.url)
  return <article className="property-card">
    <Link className="property-image" href={`/properties/${propertySlug(property)}`} aria-label={`View ${property.title}`}>
      {image ? <Image src={image.url} alt={image.caption || property.title} fill sizes="(max-width: 760px) 100vw, 33vw" /> : <div className="image-placeholder" />}
      <span className="property-status">{property.isShowcase ? 'Preview listing' : property.transactionType === 'rental' ? 'To let' : 'For sale'}</span>
    </Link>
    <div className="property-copy"><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong><p>{property.suburb}{property.province ? `, ${property.province}` : ''}</p><h3><Link href={`/properties/${propertySlug(property)}`}>{property.title}</Link></h3><dl><div><dt>Bedrooms</dt><dd>{property.bedrooms || '—'} beds</dd></div><div><dt>Bathrooms</dt><dd>{property.bathrooms || '—'} baths</dd></div><div><dt>Parking</dt><dd>{property.parkingBays || '—'} parking</dd></div></dl></div></article>
}
