'use client'

import { useState } from 'react'

export function PropertySearch() {
  const [transactionType, setTransactionType] = useState<'sale' | 'rental'>('sale')

  return <form action="/properties" className="search-shell">
    <input name="type" type="hidden" value={transactionType} />
    <button aria-pressed={transactionType === 'sale'} className={transactionType === 'sale' ? 'is-selected' : ''} onClick={() => setTransactionType('sale')} type="button">Buy</button>
    <button aria-pressed={transactionType === 'rental'} className={transactionType === 'rental' ? 'is-selected' : ''} onClick={() => setTransactionType('rental')} type="button">Rent</button>
    <label className="search-location"><span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20 10.5c0 5.5-8 10-8 10s-8-4.5-8-10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.7"/></svg>Location</span><input aria-label="Location" name="q" placeholder="Suburb, city or area" /></label>
    <label className="search-property-type"><span>Property type</span><select aria-label="Property type" name="propertyType" defaultValue=""><option value="">All property types</option><option value="House">House</option><option value="Apartment">Apartment</option><option value="Townhouse">Townhouse</option><option value="Land">Land</option></select></label>
    <button className="search-button" type="submit"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.7" cy="10.7" r="5.8" stroke="currentColor" strokeWidth="1.8"/><path d="m15.2 15.2 4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><span>Search</span></button>
  </form>
}
