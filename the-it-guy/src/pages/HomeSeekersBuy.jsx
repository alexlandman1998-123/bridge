import { ArrowRight, Bath, BedDouble, Car, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersBuy.css'
import './HomeSeekersBuyOverrides.css'

const homes = [
  { status: 'For sale', price: 'R 4 950 000', suburb: 'Bedfordview', beds: 4, baths: 3, cars: 2, type: 'House', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=88' },
  { status: 'For sale', price: 'R 3 650 000', suburb: 'Edenvale', beds: 3, baths: 2.5, cars: 2, type: 'House', image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=88' },
  { status: 'New listing', price: 'R 7 950 000', suburb: 'Waterkloof Ridge', beds: 5, baths: 4, cars: 3, type: 'House', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=88' },
  { status: 'For sale', price: 'R 2 850 000', suburb: 'Parkhurst', beds: 3, baths: 2, cars: 2, type: 'House', image: 'https://images.unsplash.com/photo-1600047509358-9dc75507daeb?auto=format&fit=crop&w=1200&q=88' },
  { status: 'For sale', price: 'R 5 600 000', suburb: 'Melrose', beds: 4, baths: 3, cars: 2, type: 'House', image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=88' },
  { status: 'For sale', price: 'R 1 950 000', suburb: 'Greenstone', beds: 2, baths: 2, cars: 2, type: 'Apartment', image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=88' },
]
const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']

function HomeSeekersBuy() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('All homes')
  const visibleHomes = useMemo(() => homes.filter((home) => `${home.suburb} ${home.type}`.toLowerCase().includes(query.toLowerCase()) && (type === 'All homes' || home.type === type)), [query, type])
  return <main className="hs-site hs-buy-site">
    <header className="hs-header"><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'Buy' ? 'is-active' : ''} href={item === 'Buy' ? '/demo/homeseekers/buy' : '/demo/homeseekers'} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>
    <section className="hs-buy-hero"><h1>Homes worth<br />a look.</h1><p>From first apartments to family addresses, explore a considered collection of homes across Gauteng.</p></section>
    <section className="hs-buy-search" aria-label="Property search"><div className="hs-buy-query"><Search size={22} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suburb, estate or property" /></div><div className="hs-buy-select"><label>Property type</label><select value={type} onChange={(event) => setType(event.target.value)}><option>All homes</option><option>House</option><option>Apartment</option></select></div><button type="button">More filters <SlidersHorizontal size={17} /></button></section>
    <section className="hs-buy-listings"><div className="hs-buy-listing-head"><p><b>{visibleHomes.length}</b> homes worth seeing</p><span>Showing homes for sale <ArrowRight size={15} /></span></div><div className="hs-buy-grid">{visibleHomes.map((home) => <article className="hs-buy-card" key={`${home.suburb}-${home.price}`}><div><img src={home.image} alt={`${home.suburb} home`} /><span>{home.status}</span></div><section><strong>{home.price}</strong><p>{home.suburb}</p><small>{home.type}</small><footer><span><BedDouble size={15} /> {home.beds}</span><span><Bath size={15} /> {home.baths}</span><span><Car size={15} /> {home.cars}</span><ArrowRight size={18} /></footer></section></article>)}</div>{visibleHomes.length === 0 && <p className="hs-buy-empty">No homes match that search yet.</p>}</section>
    <section className="hs-buy-areas"><p className="hs-eyebrow">Explore locally</p><h2>Start with a neighbourhood.</h2><div>{['Bedfordview', 'Edenvale', 'Greenstone', 'Sandton'].map((area) => <a href="#top" key={area}>{area} <ArrowRight size={16} /></a>)}</div></section>
    <section className="hs-buy-sell"><p className="hs-eyebrow">Thinking of selling?</p><h2>Your home could be<br />worth a look too.</h2><a href="/demo/homeseekers#promise">Discover the 45 day promise <ArrowRight size={17} /></a></section>
  </main>
}
export default HomeSeekersBuy
