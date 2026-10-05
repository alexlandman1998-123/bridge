import { ArrowRight, ArrowUpRight, Bath, BedDouble, Car, Heart, MapPin, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import HomeSeekersValuationModal from './HomeSeekersValuationModal'
import HomeSeekersFooter from './HomeSeekersFooter'
import HomeSeekersLeadForm from './HomeSeekersLeadForm'
import { homeSeekersCard, useHomeSeekersWebsiteData } from './homeSeekersWebsiteData'
import './HomeSeekersBuying.css'
import './HomeSeekersRenting.css'
import './HomeSeekersBrand.css'

const navigation = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['About', 'about'], ['Join us', 'join']]

function RentalCard({ home, featured, onEnquire }) {
  return <article className={`hs-buying-card ${featured ? 'hs-buying-card--feature' : ''}`}><div className="hs-buying-card__image">{home.image ? <img src={home.image} alt={home.address} /> : <div className="hs-buying-card__image-placeholder" aria-hidden="true" />}<span>TO LET</span></div><div className="hs-buying-card__body"><p><MapPin size={14} /> {home.address}</p><h2>{home.price}</h2>{featured && <strong>{home.feature}</strong>}<p className="hs-buying-card__description">{home.description}</p><div className="hs-buying-card__meta"><span><BedDouble size={16} /> {home.beds || '—'}</span><span><Bath size={16} /> {home.baths || '—'}</span><span><Car size={16} /> {home.parking || '—'}</span></div><a href={`/demo/homeseekers/properties/${home.id}`}>View property <ArrowUpRight size={17} /></a><a href="#enquire" onClick={() => onEnquire(home)}>Enquire about this home <ArrowUpRight size={17} /></a></div></article>
}

export default function HomeSeekersRenting() {
  const { listings: websiteListings, loading: listingsLoading, error: listingsError } = useHomeSeekersWebsiteData()
  const rentals = useMemo(() => websiteListings.filter((listing) => listing.transactionType === 'rental').map(homeSeekersCard), [websiteListings])
  const [selectedRental, setSelectedRental] = useState(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('All rentals')
  const [bedrooms, setBedrooms] = useState('Any beds')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [valuationOpen, setValuationOpen] = useState(false)
  const visible = useMemo(() => rentals.filter((home) => (`${home.place} ${home.address}`).toLowerCase().includes(query.toLowerCase()) && (type === 'All rentals' || home.type === type) && (bedrooms === 'Any beds' || home.beds >= Number(bedrooms[0]))), [rentals, query, type, bedrooms])
  const reset = () => { setQuery(''); setType('All rentals'); setBedrooms('Any beds') }
  return <main className="hs-buying hs-renting">
    <header className="hs-buying__header"><a href="/demo/homeseekers" aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a><nav>{navigation.map(([label, slug]) => <a className={slug === 'renting' ? 'is-active' : ''} href={`/demo/homeseekers/${slug}`} key={slug}>{label}</a>)}</nav><a href="#enquire" className="hs-buying__valuation">Find a rental</a><HomeSeekersMobileNav links={navigation.map(([label, slug]) => [label, `/demo/homeseekers/${slug}`])} active="renting" onValuation={() => setValuationOpen(true)} /></header>
    <section className="hs-buying__hero"><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2200&q=90" alt="Modern rental home interior" /><div className="hs-buying__hero-shade" /><div className="hs-buying__hero-copy"><p>❯ RENT A HOME THAT <strong>FITS NOW</strong></p><h1>More than<br />a short stay.</h1><span>PRETORIA EAST &amp; BEYOND</span></div><form className="hs-buying__search" onSubmit={(event) => event.preventDefault()}><div className="hs-buying__search-query"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by suburb, lifestyle or commute" aria-label="Search rentals" /></div><label>Home type<select value={type} onChange={(event) => setType(event.target.value)}><option>All rentals</option><option>House</option><option>Apartment</option><option>Townhouse</option></select></label><label>Bedrooms<select value={bedrooms} onChange={(event) => setBedrooms(event.target.value)}><option>Any beds</option><option>2+ beds</option><option>3+ beds</option><option>4+ beds</option></select></label><button type="submit">Find a rental <ArrowRight size={18} /></button></form></section>
    <section className="hs-buying__explorer" id="homes"><div className="hs-buying__explorer-head"><div><p>❯ AVAILABLE <strong>TO RENT</strong></p><h2>Find the place<br />you can settle into.</h2></div><div className="hs-buying__inventory-note"><span>{visible.length.toString().padStart(2, '0')} HOMES ONLINE</span><p>Current rental homes published by Home Seekers in the CRM.</p></div></div><div className="hs-buying__toolbar"><div><button className={filtersOpen ? 'is-active' : ''} type="button" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={17} /> Filters</button><span>{type}</span><span>{bedrooms}</span></div><span>Sorted by <b>Available now</b></span></div>{filtersOpen && <div className="hs-buying__filters"><label>Home type<select value={type} onChange={(event) => setType(event.target.value)}><option>All rentals</option><option>House</option><option>Apartment</option><option>Townhouse</option></select></label><label>Bedrooms<select value={bedrooms} onChange={(event) => setBedrooms(event.target.value)}><option>Any beds</option><option>2+ beds</option><option>3+ beds</option><option>4+ beds</option></select></label><button type="button" onClick={reset}>Clear filters</button></div>}<div className="hs-buying__grid">{visible.map((home, index) => <RentalCard home={home} featured={index === 0} onEnquire={setSelectedRental} key={home.id} />)}</div>{visible.length === 0 && <div className="hs-buying__empty"><p>{listingsLoading ? 'Loading current rentals…' : listingsError || (rentals.length ? 'NO RENTALS MATCH THESE FILTERS' : 'No rentals are published online right now.')}</p><button type="button" onClick={reset}>Reset search</button></div>}</section>
    <section className="hs-renting__steps"><p>❯ A BETTER WAY <strong>TO MOVE IN</strong></p><div>{[['01','Shortlist with context','Clear details on every home, before you book a viewing.'],['02','View with ease','A dedicated rental advisor helps you find the right fit.'],['03','Move in prepared','A simple, transparent process from application to keys.']].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="hs-buying__match" id="enquire"><div><p>❯ NEED A LITTLE <strong>MORE HELP?</strong></p><h2>Tell us what<br />home feels like.</h2></div><div><p className="hs-buying__match-description">Your next place is about more than the number of rooms. Share your brief and we will send the homes that make sense for the way you actually live.</p><HomeSeekersLeadForm leadIntent="rent" key={selectedRental?.id || "rental-search"} listingId={selectedRental?.id || null} subject={selectedRental ? `Rental enquiry for ${selectedRental.address}` : "Rental search"} buttonLabel={selectedRental ? "Enquire about this home" : "Start a rental search"} /></div></section>
    <HomeSeekersFooter />
    {valuationOpen && <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />}
  </main>
}
