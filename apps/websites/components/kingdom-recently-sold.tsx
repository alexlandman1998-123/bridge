import Link from 'next/link'
import type { SoldProperty } from '@/lib/kingdom-recently-sold'
import { SoldPropertyCard } from './sold-property-card'

export function KingdomRecentlySold({ properties }: { properties: SoldProperty[] }) {
  return <section className="results-section kingdom-sold-section" aria-labelledby="kingdom-sold-heading">
    <div className="results-list-heading"><div><p className="eyebrow">RECENT RESULTS</p><h2 id="kingdom-sold-heading">Recently sold.</h2></div><Link href="/recently-sold">View all sold properties →</Link></div>
    {properties.length ? <div className="results-property-grid">{properties.slice(0, 3).map(property => <SoldPropertyCard property={property} key={property.id} />)}</div>
      : <p className="kingdom-sold-empty">Our next chapter of sold homes will appear here. Thinking of selling? <Link href="/valuation">Book a valuation.</Link></p>}
  </section>
}
