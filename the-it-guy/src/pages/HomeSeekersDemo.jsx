import { ArrowRight, Bath, BedDouble, Car, Check } from 'lucide-react'
import { useState } from 'react'
import HomeSeekersValuationModal from './HomeSeekersValuationModal'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import HomeSeekersFooter from './HomeSeekersFooter'
import './HomeSeekersDemo.css'
import './HomeSeekersEditorial.css'
import './HomeSeekersProcess.css'
import './HomeSeekersGuarantee.css'
import './HomeSeekersResults.css'
import './HomeSeekersAcademy.css'
import './HomeSeekersFooter.css'

const asset = 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/'
const images = {
  hero: `${asset}pages/2026/8/869_eeb9a8cde79f42729798b3578488dc1e_t_w_1440_h_900.avif`,
  careers: `${asset}pages/2025/12/869_424ce675e29a4906a0d709d7ef138c88_t_w_639_h_728.avif`,
}
const listings = [
  { place: 'Waterkloof', price: 'R25,800,000', beds: '5', baths: '7', cars: '5', image: `${asset}residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif` },
  { place: 'Steyn City', price: 'R12,995,000', beds: '3', baths: '3', cars: '2', image: `${asset}residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif` },
  { place: 'Waterkloof', price: 'R3,490,000', beds: 'Land', baths: '', cars: '', image: `${asset}residential/2025/8/869_f02bc109f42a499fb43e3e7b41af6c13_t_w_505_h_490.avif` },
]
const nav = [['Selling', '/demo/homeseekers/selling'], ['Buying', '/demo/homeseekers/buying'], ['Renting', '/demo/homeseekers/renting'], ['Areas', '/demo/homeseekers/areas'], ['About', '/demo/homeseekers/about'], ['Join us', '/demo/homeseekers/join']]

function Eyebrow({ children }) { return <p className="hs-brief-eyebrow"><b>❯</b> {children}</p> }

function ListingCard({ listing }) {
  return <article className="hs-brief-listing">
    <img src={listing.image} alt={`${listing.place} property`} />
    <div><p>For sale · {listing.place}</p><h3>{listing.price}</h3><span><BedDouble size={15} /> {listing.beds}{listing.baths && <><Bath size={15} /> {listing.baths}</>}{listing.cars && <><Car size={15} /> {listing.cars}</>}</span><a href="/demo/homeseekers/buy">View property <ArrowRight size={15} /></a></div>
  </article>
}

export default function HomeSeekersDemo() {
  const [valuationOpen, setValuationOpen] = useState(false)
  return <main className="hs-site hs-brief" id="top">
    <header className="hs-brief-header">
      <a href="#top" className="hs-brief-logo" aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a>
      <nav aria-label="Main navigation">{nav.map(([label, href]) => <a href={href} key={label}>{label}</a>)}</nav>
      <button type="button" className="hs-brief-button hs-brief-header__cta" onClick={() => setValuationOpen(true)}>Book a free valuation</button>
      <HomeSeekersMobileNav links={nav} active="" onValuation={() => setValuationOpen(true)} />
    </header>

    <section className="hs-brief-hero">
      <div className="hs-brief-hero__copy"><Eyebrow>THE <strong>45-DAY GUARANTEE</strong></Eyebrow><h1>Sold in 45 days, or we cut our commission.</h1><p>The performance-accountable property partner for people who expect more than a promise and a listing.</p><div className="hs-brief-actions"><button type="button" className="hs-brief-button" onClick={() => setValuationOpen(true)}>Book a free valuation</button><a className="hs-brief-text-link" href="#guarantee">How the guarantee works <ArrowRight size={16} /></a></div><small>Sole mandate. Listed at the recommended price. <a href="#guarantee">Full terms published - no small print.</a></small></div>
      <img src={images.hero} alt="A Home Seekers property in Pretoria East" />
    </section>

    <section className="hs-brief-problem hs-editorial-problem"><div className="hs-editorial-problem__story"><Eyebrow>WHY WE <strong>DID THIS</strong></Eyebrow><h2>You have heard<br />the pitch before.</h2><div className="hs-editorial-problem__copy"><p>An optimistic price to win the mandate. A listing on the portals. Then silence.</p><p>Three months later the price comes down anyway, and by then the property is stale and buyers assume something is wrong with it.</p><p>We built the 45-day guarantee because a deadline is the only thing that turns a promise into a commitment.</p></div></div><aside className="hs-editorial-problem__proof" aria-label="The cost of a stale listing"><div className="hs-editorial-problem__number">45<span>DAY</span></div><ol><li><span>01</span><p><b>The optimistic price</b>A mandate won before the market agrees.</p></li><li><span>02</span><p><b>The silence</b>A listing goes live, but feedback never arrives.</p></li><li><span>03</span><p><b>The stale listing</b>Time passes. Buyers start asking what is wrong.</p></li></ol></aside></section>

    <section className="hs-brief-section hs-brief-process"><Eyebrow>HOW IT <strong>WORKS</strong></Eyebrow><div className="hs-brief-process__grid">{[
      ['01', 'An honest price.', 'We show you the comparable sales, then tell you what your home will actually sell for. Not what wins us the mandate.'],
      ['02', 'A plan you can see.', 'Photography, video, portal placement, targeted advertising and an agreed contact plan - mapped to dates before we start.'],
      ['03', 'Written feedback every week.', 'Every viewing, every enquiry, every piece of buyer feedback, in writing. You never have to chase us.'],
      ['04', 'Day 45.', 'Sold, or our commission comes down. Either way the decision to continue is yours.'],
    ].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="hs-brief-guarantee" id="guarantee"><div><Eyebrow>THE <strong>GUARANTEE</strong></Eyebrow><h2 style={{ color: '#fff' }}>We put our fee where our mouth is.</h2><p>Most agencies ask you to trust them. We would rather give you something you can hold us to.</p><a className="hs-brief-button hs-brief-button--light" href="#valuation">Talk to us about your property</a><div className="hs-guarantee-marker"><strong>45</strong><span>DAY<br />GUARANTEE</span></div></div><div className="hs-brief-commitments"><article><h3 style={{ color: '#fff' }}>What we commit to</h3><p><Check size={16} /> Live on the market within <em>[working days to confirm]</em> of signature</p><p><Check size={16} /> The full marketing plan, executed as agreed</p><p><Check size={16} /> Written feedback every single week</p><p><Check size={16} /> Commission reduced to <em>[percentage to confirm]</em> if not sold by day 45</p></article><article><h3 style={{ color: '#fff' }}>What we ask of you</h3><p><Check size={16} /> A sole mandate for the guarantee period</p><p><Check size={16} /> Listing at the recommended price</p><p><Check size={16} /> Reasonable access for viewings</p><p><Check size={16} /> Considering market-value offers in good faith</p></article></div></section>

    <section className="hs-brief-results"><div className="hs-brief-results__header"><Eyebrow>RECENTLY <strong>SOLD</strong></Eyebrow><h2>Proof is in the move.</h2><p>We will connect this ledger to approved sales data. Until then, it stays honest: no invented results, just the homes currently on the market.</p></div><article className="hs-results-ledger"><header><span>HOME SEEKERS / RESULTS</span><span>LIVE FEED PENDING</span></header><div className="hs-results-ledger__statement"><strong>SOLD</strong><h3>Built for proof.<br /><em>Connected to live results.</em></h3></div><div className="hs-results-ledger__rows"><div><span>RECENTLY SOLD</span><b>Live data pending</b></div><div><span>ON THE MARKET</span><a href="#on-market">Explore current homes <ArrowRight size={16} /></a></div></div></article></section>

    <section className="hs-brief-areas" id="areas"><Eyebrow>YOUR SUBURB, NOT <strong>“THE AREA”</strong></Eyebrow><h2>Local knowledge<br />gets personal.</h2><p>Clients here do not want general area knowledge. They want someone who knows the estate, the complex and the street.</p><div>{['Moreleta Park', 'Garsfontein', 'Olympus', 'Faerie Glen', 'Menlyn', 'More suburbs'].map((area) => <a href="#valuation" key={area}>{area} <ArrowRight size={16} /></a>)}</div></section>

    <section className="hs-brief-home-values"><Eyebrow>HOW WE <strong>WORK</strong></Eyebrow><div>{[['H', 'Honest, always', 'We tell it straight, even when it is not the easiest thing to say.'], ['O', 'Own the outcome', 'We do not pass blame or disappear when things get difficult.'], ['M', 'Make it personal', 'Every property is a person, a family, an important next step.'], ['E', 'Expertise in action', 'Knowledge only creates value when it is applied.']].map(([letter, title, copy]) => <article key={letter}><strong>{letter}</strong><h3 style={{ color: '#fff' }}>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="hs-brief-section hs-brief-market" id="on-market"><div className="hs-brief-market__heading"><div><Eyebrow>ON THE <strong>MARKET</strong></Eyebrow><h2>Homes worth<br />moving for.</h2></div><a className="hs-brief-text-link" href="/demo/homeseekers/buy">Browse all properties <ArrowRight size={16} /></a></div><div className="hs-brief-listings">{listings.map((listing) => <ListingCard key={listing.price} listing={listing} />)}</div></section>

    <section className="hs-brief-join" id="join-us"><div className="hs-academy-image"><img src={images.careers} alt="Home Seekers team" /></div><div className="hs-academy-copy"><Eyebrow>JOIN <strong>US</strong></Eyebrow><h2>Start a career that moves you <em>forward, faster.</em></h2><p>Whether you are new to property or ready to grow, the Home Seekers academy gives people the training, support and accountability to build a real career.</p><a className="hs-academy-link" href="#contact">Explore the academy <ArrowRight size={18} /></a></div><div className="hs-academy-strip"><span><b>01</b> Training</span><span><b>02</b> Mentorship</span><span><b>03</b> Real pipeline</span></div></section>

    <section className="hs-brief-closing" id="valuation"><div><Eyebrow>YOUR NEXT <strong>MOVE</strong></Eyebrow><h2 style={{ color: '#fff' }}>Find out what your home is worth, and how fast it can sell.</h2></div><button type="button" className="hs-brief-button hs-brief-button--light" onClick={() => setValuationOpen(true)}>Book a free valuation</button></section>

    <section className="hs-brief-contact" id="contact"><div><Eyebrow>START A <strong>CONVERSATION</strong></Eyebrow><h2>Tell us about your move.</h2><p>786 Witdoring Avenue, Moreleta Park, Pretoria<br />+27 12 880 3127 · info@homeseeker.co.za</p></div><form onSubmit={(event) => event.preventDefault()}><input aria-label="Your name" placeholder="Your name" /><input aria-label="Email address" placeholder="Email address" /><textarea aria-label="Your message" placeholder="How can we help?" rows="3" /><button className="hs-brief-button">Send enquiry <ArrowRight size={16} /></button></form></section>

    <HomeSeekersFooter />
    {valuationOpen && <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />}
  </main>
}
