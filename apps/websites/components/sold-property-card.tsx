import Image from 'next/image'
import type { SoldProperty } from '@/lib/kingdom-recently-sold'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export function SoldPropertyCard({ property }: { property: SoldProperty }) {
  const image = property.media[0]
  return <article className="property-result-card kingdom-sold-card">
    <div className="property-result-image">
      {image ? <Image src={image.url} alt={property.title} fill sizes="(max-width: 760px) 100vw, 33vw" /> : <div className="image-placeholder"><span>Photo unavailable</span></div>}
      <span className="kingdom-sold-badge">Sold</span>
    </div>
    <div className="property-result-copy">
      <p className="property-result-type">{property.propertyType} · Sold</p>
      <h3 className="property-result-suburb">{property.suburb || property.title}</h3>
      <p className="property-result-region">{property.title}{property.province ? ` · ${property.province}` : ''}</p>
      {property.price ? <p className="kingdom-sold-price"><span>Last asking price</span><strong>{money.format(property.price)}</strong></p> : null}
      <div className="property-result-divider" />
      <div className="property-result-features">
        {property.bedrooms ? <span>{property.bedrooms} beds</span> : null}
        {property.bathrooms ? <span>{property.bathrooms} baths</span> : null}
        {property.parkingBays ? <span>{property.parkingBays} parking</span> : null}
      </div>
      <p className="kingdom-sold-agency">Sold by {property.sourceAgency}</p>
    </div>
  </article>
}
