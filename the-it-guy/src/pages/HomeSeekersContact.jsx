import { ArrowRight, ChevronDown, Mail, MapPin, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersContact.css'

const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']
const hrefFor = (item) => ({ Buy: '/demo/homeseekers/buy', Sell: '/demo/homeseekers/sell', Rent: '/demo/homeseekers/rent', Developments: '/demo/homeseekers/developments', 'Our people': '/demo/homeseekers/people', About: '/demo/homeseekers/about', Contact: '/demo/homeseekers/contact' }[item] || '/demo/homeseekers')

function HomeSeekersContact() {
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => { const update = () => setHeaderScrolled(window.scrollY > 42); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])
  const submit = (event) => { event.preventDefault(); setSent(true) }

  return <main className="hs-site hs-contact-site">
    <header className={`hs-header hs-contact-header${headerScrolled ? ' hs-contact-header--scrolled' : ''}`}><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'Contact' ? 'is-active' : ''} href={hrefFor(item)} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>

    <section className="hs-contact-hero"><div><p className="hs-eyebrow">Get in touch</p><h1>Let’s talk<br />property.</h1><p>Whether you are ready to make a move or simply want an honest view of the market, we are here.</p></div><p className="hs-contact-hero-note">Gauteng,<br />South Africa.</p></section>

    <section className="hs-contact-intro"><p className="hs-eyebrow">A good place to start</p><h2>A conversation<br />changes everything.</h2><p>Tell us what you are thinking about. Buying, selling, renting, a new development—or just the next step. We will point you in the right direction.</p></section>

    <section className="hs-contact-details"><div className="hs-contact-methods"><a href="tel:+27110000000"><Phone size={22} /><span><small>Call us</small><strong>+27 11 000 0000</strong></span><ArrowRight size={18} /></a><a href="mailto:hello@homeseekers.co.za"><Mail size={22} /><span><small>Email us</small><strong>hello@homeseekers.co.za</strong></span><ArrowRight size={18} /></a><div><MapPin size={22} /><span><small>Our area</small><strong>Gauteng, South Africa</strong></span></div></div><form className="hs-contact-form" onSubmit={submit}><div><p className="hs-eyebrow">Send an enquiry</p><h2>How can we help?</h2></div>{sent ? <div className="hs-contact-success"><strong>Thank you.</strong><p>We have received your enquiry and will be in touch shortly.</p><button type="button" onClick={() => setSent(false)}>Send another enquiry <ArrowRight size={16} /></button></div> : <><label>Your name<input required name="name" placeholder="Your full name" /></label><label>Email address<input required type="email" name="email" placeholder="you@email.com" /></label><label>I’m interested in<select name="interest" defaultValue=""><option value="" disabled>Select an option</option><option>Buying a home</option><option>Selling a home</option><option>Renting a home</option><option>New developments</option><option>Something else</option></select></label><label>Tell us a little more<textarea name="message" placeholder="What can we help with?" rows="4" /></label><button type="submit">Send enquiry <ArrowRight size={17} /></button></>}</form></section>

    <section className="hs-contact-visit"><img src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88" alt="Home Seekers area" /><div><p className="hs-eyebrow">People who know the area</p><h2>Prefer a face-to-face?</h2><p>Our local team is always happy to make time for a proper property conversation.</p><a href="/demo/homeseekers/people">Meet our people <ArrowRight size={17} /></a></div></section>

    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers/rent">Rent</a><a href="/demo/homeseekers/developments">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="/demo/homeseekers/sell">Sell with Home Seekers</a><a href="/demo/homeseekers/sell#valuation">Request a valuation</a><a href="/demo/homeseekers/sell#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers/about">About</a><a href="/demo/homeseekers/people">Our people</a><a href="/demo/homeseekers/contact">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}

export default HomeSeekersContact
