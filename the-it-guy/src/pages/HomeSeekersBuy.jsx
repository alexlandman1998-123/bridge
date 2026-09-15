import { ArrowRight, Bath, BedDouble, Car, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersBuy.css'
import './HomeSeekersBuyOverrides.css'

const homes = [
  { status: 'For sale', price: 'R25,800,000', suburb: 'Waterkloof', beds: 5, baths: 7, cars: 5, type: 'Freehold', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif' },
  { status: 'For sale', price: 'R12,995,000', suburb: 'Steyn City', beds: 3, baths: 3, cars: 2, type: 'House', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif' },
  { status: 'For sale', price: 'R3,490,000', suburb: 'Waterkloof', beds: '—', baths: '—', cars: '—', type: 'Vacant land', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_f02bc109f42a499fb43e3e7b41af6c13_t_w_505_h_490.avif' },
]
const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']
const localAreas = [
  { name: 'Pretoria', count: 'Featured homes', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif' },
  { name: 'Waterkloof', count: 'Featured homes', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_f02bc109f42a499fb43e3e7b41af6c13_t_w_505_h_490.avif' },
  { name: 'Midrand', count: 'Featured homes', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif' },
]

function HomeSeekersBuy() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('All homes')
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 42)
    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateHeader)
  }, [])
  const visibleHomes = useMemo(() => homes.filter((home) => `${home.suburb} ${home.type}`.toLowerCase().includes(query.toLowerCase()) && (type === 'All homes' || home.type === type)), [query, type])
  return <main className="hs-site hs-buy-site">
    <header className={`hs-header hs-buy-header${headerScrolled ? ' hs-buy-header--scrolled' : ''}`}><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'Buy' ? 'is-active' : ''} href={item === 'Buy' ? '/demo/homeseekers/buy' : item === 'Sell' ? '/demo/homeseekers/sell' : item === 'Rent' ? '/demo/homeseekers/rent' : item === 'Developments' ? '/demo/homeseekers/developments' : item === 'Our people' ? '/demo/homeseekers/people' : item === 'About' ? '/demo/homeseekers/about' : item === 'Contact' ? '/demo/homeseekers/contact' : '/demo/homeseekers'} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>
    <section className="hs-buy-hero"><h1>Homes worth<br />a look.</h1><p>From first apartments to family addresses, explore a considered collection of homes across Gauteng.</p></section>
    <section className="hs-buy-search" aria-label="Property search"><div className="hs-buy-query"><Search size={22} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suburb, estate or property" /></div><div className="hs-buy-select"><label>Property type</label><select value={type} onChange={(event) => setType(event.target.value)}><option>All homes</option><option>House</option><option>Apartment</option></select></div><button type="button">More filters <SlidersHorizontal size={17} /></button></section>
    <section className="hs-buy-listings"><div className="hs-buy-listing-head"><p><b>{visibleHomes.length}</b> homes worth seeing</p><span>Showing homes for sale <ArrowRight size={15} /></span></div><div className="hs-buy-grid">{visibleHomes.map((home) => <article className="hs-buy-card" key={`${home.suburb}-${home.price}`}><div><img src={home.image} alt={`${home.suburb} home`} /><span>{home.status}</span></div><section><strong>{home.price}</strong><p>{home.suburb}</p><small>{home.type}</small><footer><span><BedDouble size={15} /> {home.beds}</span><span><Bath size={15} /> {home.baths}</span><span><Car size={15} /> {home.cars}</span><ArrowRight size={18} /></footer></section></article>)}</div>{visibleHomes.length === 0 && <p className="hs-buy-empty">No homes match that search yet.</p>}</section>
    <section className="hs-buy-areas"><p className="hs-eyebrow">Explore locally</p><h2>Start with a neighbourhood.</h2><div className="hs-buy-area-cards">{localAreas.map((area) => <a href={`/demo/homeseekers/buy?area=${encodeURIComponent(area.name)}`} key={area.name}><img src={area.image} alt="" /><span><b>{area.name}</b><small>{area.count} <ArrowRight size={15} /></small></span></a>)}</div></section>
    <section className="hs-buy-sell"><p className="hs-eyebrow">Thinking of selling?</p><h2>Your home could be<br />worth a look too.</h2><a href="/demo/homeseekers#promise">Discover the 45 day promise <ArrowRight size={17} /></a></section>
    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers">Rent</a><a href="/demo/homeseekers">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="/demo/homeseekers#promise">Sell with Home Seekers</a><a href="/demo/homeseekers#promise">Request a valuation</a><a href="/demo/homeseekers#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers">About</a><a href="/demo/homeseekers#people">Our people</a><a href="/demo/homeseekers">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}
export default HomeSeekersBuy
