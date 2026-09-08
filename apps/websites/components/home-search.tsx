'use client'

import { useState } from 'react'
import { rentalPriceRanges, salePriceRanges } from '@/lib/property-search-options'
import styles from './home-search.module.css'

export function HomeSearch({ areas }: { areas: string[] }) {
  const [type, setType] = useState('sale')
  return <form action="/properties" className={styles.finder} role="search" aria-label="Find a property">
    <input type="hidden" name="type" value={type} />
    <div className={styles.top}>
      <div className={styles.tabs} aria-label="Property search type">
        <button type="button" aria-pressed={type === 'sale'} onClick={() => setType('sale')}>Buy a home</button>
        <button type="button" aria-pressed={type === 'rental'} onClick={() => setType('rental')}>Rent a home</button>
      </div>
      <span className={styles.note}>Your next chapter starts here</span>
    </div>
    <div className={styles.fields}>
      <label className={styles.location}><span>Where would you like to live?</span><input name="q" list="home-suburbs" placeholder="Enter a suburb or area" autoComplete="off" /><datalist id="home-suburbs">{areas.map(area => <option key={area} value={area} />)}</datalist></label>
      <label><span>Price range</span><select name="priceRange" key={type} defaultValue=""><option value="">Any price</option>{(type === 'sale' ? salePriceRanges : rentalPriceRanges).map(range => <option value={range.value} key={range.value}>{range.label}</option>)}</select></label>
      <button className={styles.submit} type="submit">Find a home <span aria-hidden="true">↗</span></button>
    </div>
    <details className={styles.more}><summary>More filters <span aria-hidden="true">+</span></summary><div className={styles.extra}>
      <label><span>Bedrooms</span><select name="bedrooms" defaultValue=""><option value="">Any bedrooms</option>{[1, 2, 3, 4].map(n => <option value={n} key={n}>{n}+ bedrooms</option>)}</select></label>
      <label><span>Property type</span><select name="propertyType" defaultValue=""><option value="">All property types</option>{['House', 'Apartment', 'Townhouse', 'Land'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>Listing status</span><select name="availability" defaultValue=""><option value="">Available now</option><option value="featured">Featured properties</option></select></label>
    </div></details>
  </form>
}
