'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicProperty } from '@/lib/types'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export function RecentlySoldStrip({ properties }: { properties: PublicProperty[] }) {
  const sold = properties.filter((property) => property.transactionType === 'sale').slice(0, 8)
  const trackRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(0)
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (sold.length < 2) return
    const timer = window.setInterval(() => {
      const track = trackRef.current
      if (!track) return
      const next = (activeRef.current + 1) % sold.length
      const card = track.querySelectorAll<HTMLElement>('.lwp-sold-card')[next]
      if (!card) return
      track.scrollTo({ left: card.offsetLeft, behavior: 'smooth' })
      activeRef.current = next
      setActive(next)
    }, 4600)
    return () => window.clearInterval(timer)
  }, [sold.length])
  if (!sold.length) return null
  return <section className="lwp-recently-sold" aria-labelledby="recently-sold-heading">
    <header className="lwp-recently-sold-heading"><div><span>Market pulse</span><h2 id="recently-sold-heading">Recently sold.</h2></div><p>Homes moved with local insight.</p></header>
    <div className="lwp-sold-track" ref={trackRef} onScroll={(event) => {
      const track = event.currentTarget
      const cards = Array.from(track.querySelectorAll<HTMLElement>('.lwp-sold-card'))
      const nearest = cards.reduce((best, card, index) => Math.abs(card.offsetLeft - track.scrollLeft) < Math.abs(cards[best].offsetLeft - track.scrollLeft) ? index : best, 0)
      activeRef.current = nearest
      setActive(nearest)
    }}>
      {sold.map((property, index) => {
        const image = property.media.find((media) => media.type === 'image' && media.url)
        return <article className="lwp-sold-card" key={property.id}>
          <div className="lwp-sold-image">{image ? <img src={image.url} alt="" /> : null}<span className="lwp-sold-stamp">Sold</span></div>
          <div className="lwp-sold-copy"><p>{property.suburb || 'Local collection'}</p><strong>{property.price ? money.format(property.price) : 'Price on request'}</strong><span>{property.consultant?.name ? `With ${property.consultant.name}` : 'LWP Properties'}</span><i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i></div>
        </article>
      })}
    </div>
    <div className="lwp-sold-progress" aria-hidden="true"><span style={{ width: `${Math.max(12, ((active + 1) / sold.length) * 100)}%` }} /></div>
  </section>
}
