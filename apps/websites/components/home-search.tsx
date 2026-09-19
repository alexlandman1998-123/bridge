'use client'

import { useState } from 'react'
import { rentalPriceRanges, salePriceRanges } from '@/lib/property-search-options'
import styles from './home-search.module.css'

export function HomeSearch({ areas }: { areas: string[] }) {
  const [type, setType] = useState('sale')
  return <form action="/properties" className={styles.finder} role="search" aria-label="Find a property">
    <input type="hidden" name="type" value={type} />
    <div className={styles.top}>
      <div>
        <p className={styles.kicker}>Find your place</p>
        <div className={styles.tabs} aria-label="Property search type">
          <button type="button" aria-pressed={type === 'sale'} onClick={() => setType('sale')}>Buy</button>
          <button type="button" aria-pressed={type === 'rental'} onClick={() => setType('rental')}>Rent</button>
        </div>
      </div>
      <span className={styles.note}>A considered start to your next move</span>
    </div>
    <div className={styles.fields}>
      <label className={styles.location}><span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="1.8"/></svg>Location</span><input name="q" list="home-suburbs" placeholder="Suburb, area or city" autoComplete="off" /><datalist id="home-suburbs">{areas.map(area => <option key={area} value={area} />)}</datalist></label>
      <label><span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M6.5 8.5h11M6.5 15.5h11M9 5.5l-2.5 3 2.5 3M15 12.5l2.5 3-2.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Budget</span><select name="priceRange" key={type} defaultValue=""><option value="">Any price</option>{(type === 'sale' ? salePriceRanges : rentalPriceRanges).map(range => <option value={range.value} key={range.value}>{range.label}</option>)}</select></label>
      <details className={styles.more}><summary><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>Filters <span aria-hidden="true">+</span></summary><div className={styles.extra}>
        <label><span>Bedrooms</span><select name="bedrooms" defaultValue=""><option value="">Any bedrooms</option>{[1, 2, 3, 4].map(n => <option value={n} key={n}>{n}+ bedrooms</option>)}</select></label>
        <label><span>Property type</span><select name="propertyType" defaultValue=""><option value="">All property types</option>{['House', 'Apartment', 'Townhouse', 'Land'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Listing status</span><select name="availability" defaultValue=""><option value="">Available now</option><option value="featured">Featured properties</option></select></label>
      </div></details>
      <button className={styles.submit} type="submit">Search homes <span aria-hidden="true">↗</span></button>
    </div>
  </form>
}
