import { ArrowRight, Bath, BedDouble, Car, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersRent.css'

const rentals = [
  { price: 'R 28 000 / pm', suburb: 'Greenstone Hill', beds: 2, baths: 2, cars: 2, type: 'Apartment', image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=88' },
  { price: 'R 36 000 / pm', suburb: 'Bedfordview', beds: 4, baths: 3, cars: 2, type: 'House', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=88' },
  { price: 'R 18 500 / pm', suburb: 'Edenvale', beds: 2, baths: 2, cars: 1, type: 'Apartment', image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=88' },
  { price: 'R 45 000 / pm', suburb: 'Melrose', beds: 4, baths: 3, cars: 2, type: 'House', image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=88' },
  { price: 'R 22 000 / pm', suburb: 'Sandton', beds: 2, baths: 2, cars: 2, type: 'Apartment', image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=88' },
  { price: 'R 31 000 / pm', suburb: 'Waterkloof Ridge', beds: 3, baths: 2, cars: 2, type: 'House', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=88' },
]
const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']

function HomeSeekersRent() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('All homes')
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => { const update = () => setHeaderScrolled(window.scrollY > 42); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])
  const visible = useMemo(() => rentals.filter((home) => `${home.suburb} ${home.type}`.toLowerCase().includes(query.toLowerCase()) && (type === 'All homes' || type === home.type)), [query, type])
  return <main className="hs-site hs-rent-site">
    <header className={`hs-header hs-rent-header${headerScrolled ? ' hs-rent-header--scrolled' : ''}`}><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item,index) => <a className={item === 'Rent' ? 'is-active' : ''} href={item === 'Buy' ? '/demo/homeseekers/buy' : item === 'Sell' ? '/demo/homeseekers/sell' : item === 'Rent' ? '/demo/homeseekers/rent' : item === 'Developments' ? '/demo/homeseekers/developments' : '/demo/homeseekers'} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>
    <section className="hs-rent-hero"><div><h1>Find a place<br />to land.</h1><p>A more considered way to rent in Gauteng—from first viewings to move-in day.</p></div></section>
    <section className="hs-rent-search"><div><Search size={22} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suburb, estate or property" /></div><label>Property type<select value={type} onChange={(e) => setType(e.target.value)}><option>All homes</option><option>House</option><option>Apartment</option></select></label><button>More filters <SlidersHorizontal size={17} /></button></section>
    <section className="hs-rent-listings"><header><p><b>{visible.length}</b> homes to rent</p><span>Available now <ArrowRight size={15} /></span></header><div>{visible.map((home) => <article key={`${home.suburb}-${home.price}`}><figure><img src={home.image} alt={`${home.suburb} rental`} /><span>To let</span></figure><section><strong>{home.price}</strong><p>{home.suburb}</p><small>{home.type}</small><footer><span><BedDouble size={15} /> {home.beds}</span><span><Bath size={15} /> {home.baths}</span><span><Car size={15} /> {home.cars}</span><ArrowRight size={18} /></footer></section></article>)}</div>{visible.length === 0 && <p className="hs-rent-empty">No rentals match that search yet.</p>}</section>
    <section className="hs-rent-steps"><p className="hs-eyebrow">Renting, simplified</p><h2>Move with more clarity.</h2><div>{[['01','Find your fit','Search the places that suit how you want to live.'],['02','Apply simply','A clear process and the support you need along the way.'],['03','Settle in','The details handled, so you can make it home.']].map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="hs-rent-help"><div><p className="hs-eyebrow">Need a hand?</p><h2>We’ll help you find your next home.</h2><a href="mailto:hello@homeseekers.co.za">Talk to our rental team <ArrowRight size={17} /></a></div><img src="https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85" alt="Bright rental home interior" /></section>
    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers/rent">Rent</a><a href="/demo/homeseekers">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="/demo/homeseekers/sell">Sell with Home Seekers</a><a href="/demo/homeseekers/sell#valuation">Request a valuation</a><a href="/demo/homeseekers/sell#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers">About</a><a href="/demo/homeseekers#people">Our people</a><a href="/demo/homeseekers">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}
export default HomeSeekersRent
