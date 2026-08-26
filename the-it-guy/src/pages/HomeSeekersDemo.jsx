import {
  ArrowLeft,
  Bath,
  BedDouble,
  Car,
  Check,
  ChevronRight,
  Heart,
  Home,
  Menu,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import './HomeSeekersDemo.css'

const heroImage = '/brand/agency-intake-buy.webp'

const listings = [
  {
    id: 'waterkloof-ridge',
    suburb: 'Waterkloof Ridge',
    price: 'R8,950,000',
    facts: { beds: 5, baths: 4, garages: 3 },
    image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=85',
    gallery: [
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=85',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85',
    ],
    description: 'A quiet ridge address shaped around open entertaining, soft evening light and an outlook that makes every arrival feel deliberate.',
    features: ['Ridge-view entertainment deck', 'Designer kitchen', 'Private guest suite', 'Heated pool'],
  },
  {
    id: 'silver-lakes',
    suburb: 'Silver Lakes',
    price: 'R6,750,000',
    facts: { beds: 4, baths: 3, garages: 2 },
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=85',
    gallery: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=85',
      'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1200&q=85',
    ],
    description: 'A polished estate home with generous proportions, crisp detailing and an easy indoor-outdoor rhythm for family living.',
    features: ['Estate security', 'Double-volume lounge', 'Covered patio', 'Study wing'],
  },
  {
    id: 'brooklyn',
    suburb: 'Brooklyn',
    price: 'R5,450,000',
    facts: { beds: 3, baths: 3, garages: 2 },
    image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=85',
    gallery: [
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=85',
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&w=1200&q=85',
    ],
    description: 'Modern lock-up-and-go living with warm materiality, privacy and a location that keeps Pretoria close without feeling busy.',
    features: ['Courtyard garden', 'Integrated appliances', 'Backup power', 'Walkable location'],
  },
  {
    id: 'menlyn-maine',
    suburb: 'Menlyn Maine',
    price: 'R3,995,000',
    facts: { beds: 2, baths: 2, garages: 2 },
    image: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1400&q=85',
    gallery: [
      'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1400&q=85',
      'https://images.unsplash.com/photo-1600607688066-890987f18a86?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?auto=format&fit=crop&w=1200&q=85',
    ],
    description: 'A high-floor apartment with hotel-level finishes, clean sightlines and the city folded neatly beneath the balcony.',
    features: ['Concierge lobby', 'City balcony', 'Secure parking', 'Lifestyle precinct'],
  },
]

const agents = [
  {
    name: 'Bianca Marais',
    role: 'Senior Property Partner',
    area: 'Pretoria East',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=85',
  },
  {
    name: 'Dylan Naidoo',
    role: 'Seller Strategy Lead',
    area: 'Waterkloof and Brooklyn',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=85',
  },
  {
    name: 'Aimee van der Merwe',
    role: 'Buyer Network Specialist',
    area: 'Silver Lakes',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=1000&q=85',
  },
]

const promiseSteps = [
  { day: '01', title: 'Your home launches.', copy: 'Photography, positioning and the first buyer signal go live with intent.' },
  { day: '15', title: 'Marketing is fully active.', copy: 'Every channel is working, every response is tracked, every warm lead is followed up.' },
  { day: '30', title: 'The network works harder.', copy: 'Buyer matching tightens around the best-fit audience and objections are fed back into the campaign.' },
  { day: '45', title: 'Still not sold?', copy: 'Then HomeSeekers halves the commission. Simple, memorable, accountable.' },
]

const marketingRows = [
  'Professional photography',
  'Property24 and Private Property exposure',
  'Targeted social campaigns',
  'Buyer matching',
  'Active follow-up',
  'Seller reporting',
]

function HomeSeekersDemo() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [valuationOpen, setValuationOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState(null)
  const [saved, setSaved] = useState(() => new Set())
  const [leadSent, setLeadSent] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('homeseekers-demo-lock')
    return () => document.documentElement.classList.remove('homeseekers-demo-lock')
  }, [])

  const toggleSaved = (event, id) => {
    event.stopPropagation()
    setSaved((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <main className="hs-demo">
      <header className="hs-header">
        <a className="hs-logo" href="#top" aria-label="HomeSeekers demo home">
          <img src="/brand/homeseekers/logo.png" alt="HomeSeekers" />
        </a>
        <button className="hs-icon-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
      </header>

      <section id="top" className="hs-hero" aria-label="HomeSeekers 45 day promise">
        <img className="hs-hero-image" src={heroImage} alt="" />
        <div className="hs-hero-shade" />
        <div className="hs-hero-copy">
          <p className="hs-kicker">Arch9 concept demo</p>
          <h1>45</h1>
          <p className="hs-hero-title">Days to sell your home.</p>
          <p className="hs-hero-subtitle">Or we halve our commission.</p>
          <button className="hs-primary-cta" type="button" onClick={() => setValuationOpen(true)}>
            Start your 45 days <ChevronRight size={18} />
          </button>
          <small>*T&Cs apply. Demo content only.</small>
        </div>
      </section>

      <section id="promise" className="hs-promise">
        <div className="hs-section-label">The Promise</div>
        {promiseSteps.map((step) => (
          <article className="hs-promise-step" key={step.day}>
            <div className="hs-day">DAY {step.day}</div>
            <div>
              <h2>{step.title}</h2>
              <p>{step.copy}</p>
            </div>
          </article>
        ))}
        <div className="hs-half-commission">
          <span>1/2</span>
          <p>our commission.</p>
        </div>
      </section>

      <section id="homes" className="hs-section hs-listings-section">
        <div className="hs-section-heading">
          <span className="hs-section-label">Available Now</span>
          <h2>Homes we're obsessed with.</h2>
        </div>
        <div className="hs-carousel" aria-label="Featured homes">
          {listings.map((listing, index) => (
            <button className="hs-property-card" type="button" key={listing.id} onClick={() => setSelectedListing(listing)}>
              <span className="hs-card-index">{String(index + 1).padStart(2, '0')} / {String(listings.length).padStart(2, '0')}</span>
              <img src={listing.image} alt={`${listing.suburb} property`} />
              <span className="hs-save-button" onClick={(event) => toggleSaved(event, listing.id)} aria-label="Save property" role="button" tabIndex={0}>
                <Heart size={18} fill={saved.has(listing.id) ? 'currentColor' : 'none'} />
              </span>
              <span className="hs-card-copy">
                <strong>{listing.suburb}</strong>
                <span>{listing.price}</span>
                <span>{listing.facts.beds} BED / {listing.facts.baths} BATH / {listing.facts.garages} GARAGE</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section id="marketing" className="hs-section hs-launch-section">
        <div>
          <span className="hs-section-label">Seller Launch</span>
          <h2>We don't list. We launch.</h2>
        </div>
        <img src="https://images.unsplash.com/photo-1616047006789-b7af5afb8c20?auto=format&fit=crop&w=1400&q=85" alt="Luxury living room prepared for marketing" />
        <div className="hs-launch-rows">
          {marketingRows.map((row) => (
            <div className="hs-launch-row" key={row}>
              <Check size={17} />
              <span>{row}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="agents" className="hs-section hs-agents-section">
        <div className="hs-section-heading">
          <span className="hs-section-label">Our Agents</span>
          <h2>Meet the people behind the promise.</h2>
        </div>
        <div className="hs-agent-carousel" aria-label="HomeSeekers agents">
          {agents.map((agent) => (
            <article className="hs-agent-card" key={agent.name}>
              <img src={agent.image} alt={agent.name} />
              <div>
                <h3>{agent.name}</h3>
                <p>{agent.role}</p>
                <span>{agent.area}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="valuation" className="hs-valuation">
        <span className="hs-section-label">Seller Valuation</span>
        <h2>Your 45 days starts here.</h2>
        <p>Find out what your home could sell for, and see how the bespoke website journey connects into Arch9 CRM later.</p>
        <button className="hs-primary-cta hs-light-cta" type="button" onClick={() => setValuationOpen(true)}>
          Get my free valuation <ChevronRight size={18} />
        </button>
      </section>

      <button className="hs-floating-search" type="button" onClick={() => setSearchOpen(true)}>
        <Search size={18} />
        <span>Search homes</span>
        <Heart size={16} fill={saved.size ? 'currentColor' : 'none'} />
      </button>

      {menuOpen && (
        <div className="hs-menu" role="dialog" aria-modal="true" aria-label="HomeSeekers menu">
          <button className="hs-icon-button hs-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X size={22} />
          </button>
          {['Buy', 'Sell', 'The 45', 'Our Agents', 'About HomeSeekers', 'Contact'].map((item) => (
            <a href={`#${item === 'The 45' ? 'promise' : item === 'Our Agents' ? 'agents' : item.toLowerCase().split(' ')[0]}`} key={item} onClick={() => setMenuOpen(false)}>
              {item}
            </a>
          ))}
          <p>Instagram / Facebook</p>
        </div>
      )}

      {searchOpen && (
        <BottomSheet title="Where are you looking?" onClose={() => setSearchOpen(false)}>
          <div className="hs-field">
            <Search size={18} />
            <input type="search" placeholder="Search suburb, estate or area" />
          </div>
          <div className="hs-segmented">
            <button type="button">Buy</button>
            <button type="button">Rent</button>
          </div>
          <div className="hs-filter-chips">
            {['R2m-R4m', 'R4m-R8m', 'R8m+', '2 Bed', '3 Bed', '4+ Bed'].map((filter) => (
              <button type="button" key={filter}>{filter}</button>
            ))}
          </div>
          <button className="hs-sheet-submit" type="button" onClick={() => setSearchOpen(false)}>Show homes</button>
        </BottomSheet>
      )}

      {valuationOpen && (
        <BottomSheet title={leadSent ? 'Request received.' : 'Get your free valuation'} onClose={() => setValuationOpen(false)}>
          {leadSent ? (
            <div className="hs-success-state">
              <Check size={28} />
              <p>Demo confirmation shown. In the future build, this would create the seller lead in Arch9 CRM.</p>
            </div>
          ) : (
            <form className="hs-form" onSubmit={(event) => {
              event.preventDefault()
              setLeadSent(true)
            }}>
              <input required placeholder="Name" />
              <input required placeholder="Mobile number" />
              <input required type="email" placeholder="Email" />
              <input required placeholder="Suburb / area" />
              <select required defaultValue="">
                <option value="" disabled>Property type</option>
                <option>House</option>
                <option>Apartment</option>
                <option>Estate home</option>
              </select>
              <button className="hs-sheet-submit" type="submit">Submit valuation request</button>
            </form>
          )}
        </BottomSheet>
      )}

      {selectedListing && (
        <div className="hs-detail" role="dialog" aria-modal="true" aria-label={`${selectedListing.suburb} detail`}>
          <div className="hs-detail-hero">
            <img src={selectedListing.image} alt={`${selectedListing.suburb} hero`} />
            <button className="hs-icon-button hs-detail-back" type="button" onClick={() => setSelectedListing(null)} aria-label="Back to properties">
              <ArrowLeft size={20} />
            </button>
            <button className="hs-icon-button hs-detail-heart" type="button" onClick={(event) => toggleSaved(event, selectedListing.id)} aria-label="Save property">
              <Heart size={19} fill={saved.has(selectedListing.id) ? 'currentColor' : 'none'} />
            </button>
            <div className="hs-detail-title">
              <span>{selectedListing.price}</span>
              <h2>{selectedListing.suburb}</h2>
            </div>
          </div>
          <div className="hs-detail-body">
            <div className="hs-detail-facts">
              <span><BedDouble size={17} /> {selectedListing.facts.beds} Bed</span>
              <span><Bath size={17} /> {selectedListing.facts.baths} Bath</span>
              <span><Car size={17} /> {selectedListing.facts.garages} Garage</span>
            </div>
            <p>{selectedListing.description}</p>
            <div className="hs-gallery">
              {selectedListing.gallery.map((image) => (
                <img src={image} alt="" key={image} />
              ))}
            </div>
            <div className="hs-features">
              {selectedListing.features.map((feature) => (
                <span key={feature}>{feature}</span>
              ))}
            </div>
            <button className="hs-sheet-submit" type="button">Book a viewing</button>
            <button className="hs-secondary-action" type="button">Ask about this home</button>
          </div>
        </div>
      )}
    </main>
  )
}

function BottomSheet({ children, onClose, title }) {
  return (
    <div className="hs-sheet-backdrop" role="presentation">
      <section className="hs-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="hs-sheet-handle" />
        <button className="hs-icon-button hs-sheet-close" type="button" onClick={onClose} aria-label="Close panel">
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  )
}

export default HomeSeekersDemo
