'use client'

import { useState } from 'react'

const areas = ['Waterkloof Ridge', 'Brooklyn', 'Lynnwood']

export function PropertySearch() {
  const [transactionType, setTransactionType] = useState<'sale' | 'rental'>('sale')

  return <form action="/properties" className="search-shell search-discovery">
    <input name="type" type="hidden" value={transactionType} />
    <div className="search-tabs" aria-label="Property search type">
      <button aria-pressed={transactionType === 'sale'} className={transactionType === 'sale' ? 'is-selected' : ''} onClick={() => setTransactionType('sale')} type="button">Buy</button>
      <button aria-pressed={transactionType === 'rental'} className={transactionType === 'rental' ? 'is-selected' : ''} onClick={() => setTransactionType('rental')} type="button">Rent</button>
      <a href="/properties">Developments</a>
      <a href="/properties">Areas</a>
      <a href="/properties">New launches</a>
    </div>
    <div className="search-fields">
      <label className="search-query"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.7" cy="10.7" r="5.8" stroke="currentColor" strokeWidth="1.8"/><path d="m15.2 15.2 4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><input aria-label="Search properties" name="q" placeholder="Search by suburb, development or property reference" /></label>
      <label><span>Area</span><select aria-label="Area" name="area" defaultValue=""><option value="">Any area</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
      <label><span>Price range</span><select aria-label="Price range" name="priceRange" defaultValue=""><option value="">Any price</option><option value="under-3000000">Under R3m</option><option value="3000000-5000000">R3m – R5m</option><option value="5000000-10000000">R5m – R10m</option><option value="10000000-plus">R10m+</option></select></label>
      <label><span>Bedrooms</span><select aria-label="Bedrooms" name="bedrooms" defaultValue=""><option value="">Any bedrooms</option><option value="1">1+ bedrooms</option><option value="2">2+ bedrooms</option><option value="3">3+ bedrooms</option><option value="4">4+ bedrooms</option></select></label>
      <label><span>Property type</span><select aria-label="Property type" name="propertyType" defaultValue=""><option value="">All property types</option><option value="House">House</option><option value="Apartment">Apartment</option><option value="Townhouse">Townhouse</option><option value="Land">Land</option></select></label>
      <label><span>Listing status</span><select aria-label="Listing status" name="availability" defaultValue=""><option value="">Available now</option><option value="featured">Featured properties</option></select></label>
      <button className="search-button" type="submit"><span>Search properties</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.7" cy="10.7" r="5.8" stroke="currentColor" strokeWidth="1.8"/><path d="m15.2 15.2 4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>
    </div>
  </form>
}
