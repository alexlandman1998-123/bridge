import { ArrowRight, ChevronDown, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersAbout.css'

const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']
const hrefFor = (item) => ({ Buy: '/demo/homeseekers/buy', Sell: '/demo/homeseekers/sell', Rent: '/demo/homeseekers/rent', Developments: '/demo/homeseekers/developments', 'Our people': '/demo/homeseekers/people', About: '/demo/homeseekers/about', Contact: '/demo/homeseekers/contact' }[item] || '/demo/homeseekers')

function HomeSeekersAbout() {
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => { const update = () => setHeaderScrolled(window.scrollY > 42); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])

  return <main className="hs-site hs-about-site">
    <header className={`hs-header hs-about-header${headerScrolled ? ' hs-about-header--scrolled' : ''}`}><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'About' ? 'is-active' : ''} href={hrefFor(item)} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>

    <section className="hs-about-hero"><div><p className="hs-eyebrow">Home Seekers / Gauteng</p><h1>Property,<br />done properly.</h1><p>Thoughtful local advice, clear direction and a more personal way to move through property.</p></div><p className="hs-about-hero-note">For the places<br />you call home.</p></section>

    <section className="hs-about-statement"><p className="hs-eyebrow">Our point of view</p><h2>We believe the right move starts with a better conversation.</h2><p>Home Seekers was built for people who want property to feel simpler, clearer and more human. We bring straight-talking advice, local knowledge and real care to every sale, search, lease and new beginning.</p></section>

    <section className="hs-about-story"><figure><img src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1600&q=88" alt="Contemporary Gauteng home" /></figure><div><p className="hs-eyebrow">Built locally</p><h2>Closer to the places that matter.</h2><p>We work across Gauteng with a sharp focus on the suburbs we know best. That means sharper pricing, stronger marketing and informed advice that goes beyond a listing or a postcode.</p><p>Whether you are buying, selling, renting or investing, our job is to give you the confidence to make the next move feel right.</p><a href="/demo/homeseekers/people">Meet our people <ArrowRight size={17} /></a></div></section>

    <section className="hs-about-principles"><header><p className="hs-eyebrow">How we work</p><h2>Less noise.<br />More clarity.</h2></header><div>{[['01', 'Know the local detail', 'The character of a street, the rhythm of a suburb and the value behind the address.'], ['02', 'Say what needs saying', 'Honest guidance, clear communication and no needless property theatre.'], ['03', 'Keep the process moving', 'A steady, responsive team from the first call through to the final signature.']].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="hs-about-place"><div><p className="hs-eyebrow">Gauteng, our home</p><h2>Here for the next chapter.</h2><p>From Bedfordview to Sandton, Edenvale to Greenstone, we help people find a better fit for how they want to live.</p><a href="/demo/homeseekers/buy">Explore homes <ArrowRight size={17} /></a></div><aside><MapPin size={28} /><span>Local first.<br />Always.</span></aside></section>

    <section className="hs-about-contact"><div><p className="hs-eyebrow">Start here</p><h2>Let’s talk about<br />what’s next.</h2><a href="mailto:hello@homeseekers.co.za">Speak to Home Seekers <ArrowRight size={17} /></a></div><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=88" alt="Light-filled home interior" /></section>

    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers/rent">Rent</a><a href="/demo/homeseekers/developments">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="/demo/homeseekers/sell">Sell with Home Seekers</a><a href="/demo/homeseekers/sell#valuation">Request a valuation</a><a href="/demo/homeseekers/sell#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers/about">About</a><a href="/demo/homeseekers/people">Our people</a><a href="/demo/homeseekers">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}

export default HomeSeekersAbout
