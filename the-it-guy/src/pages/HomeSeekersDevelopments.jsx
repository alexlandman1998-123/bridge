import { ArrowRight, ChevronDown, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersDevelopments.css'

const developments = [
  { status: 'Now selling', name: 'The Grove Residences', location: 'Bedfordview', detail: 'Two and three-bedroom residences from R 2 950 000.', image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88' },
  { status: 'Launching soon', name: 'Westcliff House', location: 'Melrose', detail: 'A private collection of contemporary townhomes.', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=88' },
  { status: 'Now selling', name: 'The Line', location: 'Sandton', detail: 'City apartments designed around everyday ease.', image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=88' },
]

const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']
const hrefFor = (item) => ({ Buy: '/demo/homeseekers/buy', Sell: '/demo/homeseekers/sell', Rent: '/demo/homeseekers/rent', Developments: '/demo/homeseekers/developments' }[item] || '/demo/homeseekers')

function HomeSeekersDevelopments() {
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => {
    const update = () => setHeaderScrolled(window.scrollY > 42)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return <main className="hs-site hs-developments-site">
    <header className={`hs-header hs-developments-header${headerScrolled ? ' hs-developments-header--scrolled' : ''}`}>
      <a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a>
      <nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'Developments' ? 'is-active' : ''} href={hrefFor(item)} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav>
    </header>

    <section className="hs-developments-hero"><div><p className="hs-eyebrow">New developments</p><h1>A better way<br />to begin.</h1><p>Thoughtful new homes in places that make everyday life feel considered.</p><a href="#collection">Explore developments <ArrowRight size={17} /></a></div></section>

    <section className="hs-developments-intro"><p className="hs-eyebrow">Built around how you live</p><h2>More than a new address.</h2><p>We represent developments with a point of view: well located, intelligently designed and made for the life you want to build.</p></section>

    <section className="hs-development-collection" id="collection"><header><div><p className="hs-eyebrow">Featured collection</p><h2>Places taking shape.</h2></div><a href="mailto:hello@homeseekers.co.za">Talk to our developments team <ArrowRight size={17} /></a></header><div className="hs-development-grid">{developments.map((development) => <a href="mailto:hello@homeseekers.co.za" className="hs-development-card" key={development.name}><figure><img src={development.image} alt={development.name} /><span>{development.status}</span></figure><section><h3>{development.name}</h3><p><MapPin size={14} /> {development.location}</p><small>{development.detail}</small><b>View development <ArrowRight size={16} /></b></section></a>)}</div></section>

    <section className="hs-developments-steps"><div><p className="hs-eyebrow">Choosing with clarity</p><h2>From first look<br />to front door.</h2></div><div>{[['01','See the potential','A focused collection means less noise and better choices.'],['02','Know the numbers','Clear guidance on pricing, deposits and what comes next.'],['03','Make it yours','A steady hand from enquiry through to handover.']].map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="hs-developments-cta"><div><p className="hs-eyebrow">Have a project in mind?</p><h2>Let’s find your<br />next beginning.</h2><a href="mailto:hello@homeseekers.co.za">Speak to our team <ArrowRight size={17} /></a></div><img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=88" alt="Modern new home interior" /></section>

    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers/rent">Rent</a><a href="/demo/homeseekers/developments">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="/demo/homeseekers/sell">Sell with Home Seekers</a><a href="/demo/homeseekers/sell#valuation">Request a valuation</a><a href="/demo/homeseekers/sell#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers">About</a><a href="/demo/homeseekers#people">Our people</a><a href="/demo/homeseekers">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}

export default HomeSeekersDevelopments
