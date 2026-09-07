'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { propertySlug } from '@/lib/site-repository'
import type { PublicProperty } from '@/lib/types'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

function FeatureIcon({ type }: { type: 'bed' | 'bath' | 'parking' }) {
  if (type === 'bed') return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M3 12h18v7H3zM5 12V8.5A2.5 2.5 0 0 1 7.5 6h2A2.5 2.5 0 0 1 12 8.5V12m0-2.5A2.5 2.5 0 0 1 14.5 7h2A2.5 2.5 0 0 1 19 9.5V12M5 19v2m14-2v2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/></svg>
  if (type === 'bath') return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 12h16M6 12V9.5m12 2.5V9.5M5 12c0 4.1 2.6 6 7 6s7-1.9 7-6M8 18v2m8-2v2M8 8a1.5 1.5 0 1 1 3 0v1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 14.5 6.5 9h11l2.5 5.5V18H4zM7 18v2m10-2v2M7.5 14.5h.01m8.98 0h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/></svg>
}

function CompactCard({ property }: { property: PublicProperty }) {
  const image = property.media.find((media) => media.type === 'image' && media.url)
  const href = `/properties/${propertySlug(property)}`
  const features = [
    property.bedrooms ? { type: 'bed' as const, value: property.bedrooms, label: 'bedrooms' } : null,
    property.bathrooms ? { type: 'bath' as const, value: property.bathrooms, label: 'bathrooms' } : null,
    property.parkingBays ? { type: 'parking' as const, value: property.parkingBays, label: 'parking bays' } : null,
  ].filter(Boolean) as Array<{ type: 'bed' | 'bath' | 'parking'; value: number; label: string }>

  return <article className="featured-property-card">
    <Link className="featured-property-image" href={href} aria-label={`View ${property.title}`}>
      {image ? <Image src={image.url} alt={image.caption || property.title} fill sizes="(max-width: 760px) 85vw, (max-width: 1120px) 46vw, 28vw" /> : <div className="featured-property-placeholder" />}
    </Link>
    <Link className="featured-property-details" href={href} aria-label={`View ${property.title}`}>
      <strong>{property.price ? money.format(property.price) : 'Price on request'}</strong>
      <span className="featured-property-suburb">{property.suburb || 'Location on request'}</span>
      {property.province ? <span className="featured-property-region">{property.province}</span> : null}
      {features.length ? <span className="featured-property-divider" aria-hidden="true" /> : null}
      {features.length ? <span className="featured-property-features">{features.map((feature) => <span key={feature.type}><FeatureIcon type={feature.type} /><span>{feature.value}</span><span className="sr-only"> {feature.label}</span></span>)}</span> : null}
    </Link>
  </article>
}

export function FeaturedPropertyCarousel({ heading = 'Featured properties', properties }: { heading?: string; properties: PublicProperty[] }) {
  const sale = useMemo(() => properties.filter((property) => property.transactionType === 'sale'), [properties])
  const rental = useMemo(() => properties.filter((property) => property.transactionType === 'rental'), [properties])
  const hasBoth = sale.length > 0 && rental.length > 0
  const [type, setType] = useState<'sale' | 'rental'>(sale.length ? 'sale' : 'rental')
  const [canScrollBack, setCanScrollBack] = useState(false)
  const [canScrollForward, setCanScrollForward] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(100)
  const trackRef = useRef<HTMLDivElement>(null)
  const visibleProperties = type === 'sale' ? sale : rental

  function updateScrollState() {
    const track = trackRef.current
    if (!track) return
    setCanScrollBack(track.scrollLeft > 2)
    setCanScrollForward(track.scrollLeft + track.clientWidth < track.scrollWidth - 2)
    setScrollProgress(track.scrollWidth <= track.clientWidth ? 100 : Math.max(12, ((track.clientWidth + track.scrollLeft) / track.scrollWidth) * 100))
  }

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    updateScrollState()
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(track)
    return () => observer.disconnect()
  }, [visibleProperties.length])

  function changeType(next: 'sale' | 'rental') {
    setType(next)
    requestAnimationFrame(() => trackRef.current?.scrollTo({ left: 0, behavior: 'auto' }))
  }

  function scrollByCard(direction: -1 | 1) {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector<HTMLElement>('.featured-property-card')
    track.scrollBy({ left: direction * ((card?.offsetWidth || 320) + 20), behavior: 'smooth' })
  }

  return <section className="featured-properties-section" aria-labelledby="featured-properties-heading">
    <div className="content-shell featured-properties-shell">
      <header className="featured-properties-header">
        <h2 id="featured-properties-heading">{heading}</h2>
        <div className="featured-properties-actions">
          {hasBoth ? <div className="featured-property-toggle" aria-label="Listing type"><button aria-pressed={type === 'sale'} className={type === 'sale' ? 'is-active' : ''} onClick={() => changeType('sale')} type="button">For sale</button><button aria-pressed={type === 'rental'} className={type === 'rental' ? 'is-active' : ''} onClick={() => changeType('rental')} type="button">To rent</button></div> : null}
          <Link className="featured-view-all" href={`/properties?type=${type}`}>View all properties <span aria-hidden="true">→</span></Link>
        </div>
      </header>
      {visibleProperties.length ? <>
        <div className="featured-carousel" onScroll={updateScrollState} ref={trackRef} tabIndex={0} aria-label={`${type === 'sale' ? 'For sale' : 'To rent'} featured properties`}>
          {visibleProperties.map((property) => <CompactCard key={property.id} property={property} />)}
        </div>
        {(canScrollBack || canScrollForward) ? <div className="featured-carousel-footer"><div className="featured-progress" aria-hidden="true"><span style={{ width: `${scrollProgress}%` }} /></div><div className="featured-carousel-controls"><button aria-label="Previous featured property" disabled={!canScrollBack} onClick={() => scrollByCard(-1)} type="button">←</button><button aria-label="Next featured property" disabled={!canScrollForward} onClick={() => scrollByCard(1)} type="button">→</button></div></div> : null}
      </> : <p className="featured-empty">No featured properties are available at the moment.</p>}
    </div>
  </section>
}
