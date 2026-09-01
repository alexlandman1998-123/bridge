import Link from 'next/link'
import { propertySlug } from '@/lib/site-repository'
import type { PublicProperty } from '@/lib/types'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export function PropertyCard({ property }: { property: PublicProperty }) {
  return <article className="property-card"><div className="image-placeholder"><span>{property.propertyType}</span><small>{property.transactionType === 'rental' ? 'To let' : 'For sale'}</small></div><div className="property-copy"><p>{property.suburb}{property.province ? `, ${property.province}` : ''}</p><h3>{property.title}</h3><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong><dl><div><dt>Bedrooms</dt><dd>{property.bedrooms || '—'}</dd></div><div><dt>Bathrooms</dt><dd>{property.bathrooms || '—'}</dd></div><div><dt>Parking</dt><dd>{property.parkingBays || '—'}</dd></div></dl><Link href={`/properties/${propertySlug(property)}`}>View property <span aria-hidden="true">→</span></Link></div></article>
}
