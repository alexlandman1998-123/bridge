import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersSell.css'

const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']
const principles = [
  ['01', 'We sell or you save', 'Sell your home in 45 days or we’ll halve our commission.*', 'Get a valuation'],
  ['02', 'Maximum exposure', 'Premium marketing, targeted buyers and maximum reach.', 'See how we market'],
  ['03', 'Local people. Local knowledge.', 'We know this market because it’s our home.', 'Meet our people'],
]

function HomeSeekersSell() {
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => { const update = () => setHeaderScrolled(window.scrollY > 42); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])
  return <main className="hs-site hs-sell-site">
    <header className={`hs-header hs-sell-header${headerScrolled ? ' hs-sell-header--scrolled' : ''}`}><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'Sell' ? 'is-active' : ''} href={item === 'Buy' ? '/demo/homeseekers/buy' : item === 'Sell' ? '/demo/homeseekers/sell' : item === 'Rent' ? '/demo/homeseekers/rent' : item === 'Developments' ? '/demo/homeseekers/developments' : '/demo/homeseekers'} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>
    <section className="hs-sell-hero"><div><p className="hs-eyebrow">Selling in Gauteng</p><h1>Your home.<br />Properly represented.</h1><p>Clear strategy, intelligent marketing and people who know how to turn attention into the right offer.</p><a href="#valuation">Get a valuation <ArrowRight size={17} /></a></div></section>
    <section className="hs-sell-promise"><div><p className="hs-eyebrow">The Home Seekers promise</p><h2>45 days.</h2><p>That’s how serious we are about selling.</p></div><div className="hs-sell-principles">{principles.map(([number, title, copy, action]) => <a href="#valuation" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p><b>{action} <ArrowRight size={15} /></b></a>)}</div></section>
    <section className="hs-sell-process"><p className="hs-eyebrow">A considered launch</p><h2>We don’t list.<br />We launch.</h2><div>{[['01','Position','Price, presentation and a clear campaign plan.'],['02','Reach','Photography, property portals, targeted buyers and social.'],['03','Negotiate','Every enquiry followed up. Every offer properly handled.']].map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="hs-sell-checklist"><div><img src="https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?auto=format&fit=crop&w=1200&q=85" alt="A carefully presented living room" /></div><section><p className="hs-eyebrow">Maximum exposure</p><h2>Everything your home needs to be seen.</h2>{['Professional photography and video','Premium property portal exposure','Targeted social campaigns','Active buyer matching','Clear seller reporting'].map((item) => <p key={item}><Check size={16} /> {item}</p>)}</section></section>
    <section className="hs-sell-valuation" id="valuation"><p className="hs-eyebrow">Ready when you are</p><h2>Find out what<br />your home could sell for.</h2><a href="mailto:hello@homeseekers.co.za">Request your free valuation <ArrowRight size={17} /></a></section>
    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers">Rent</a><a href="/demo/homeseekers">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="#valuation">Sell with Home Seekers</a><a href="#valuation">Request a valuation</a><a href="#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers">About</a><a href="/demo/homeseekers#people">Our people</a><a href="/demo/homeseekers">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}
export default HomeSeekersSell
