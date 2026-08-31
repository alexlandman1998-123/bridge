import { ArrowRight, ChevronDown, Mail, MapPin, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersPeople.css'

const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']
const hrefFor = (item) => ({ Buy: '/demo/homeseekers/buy', Sell: '/demo/homeseekers/sell', Rent: '/demo/homeseekers/rent', Developments: '/demo/homeseekers/developments', 'Our people': '/demo/homeseekers/people', About: '/demo/homeseekers/about', Contact: '/demo/homeseekers/contact' }[item] || '/demo/homeseekers')

const people = [
  { name: 'Amelia Hart', role: 'Director · Sales', area: 'Bedfordview & Edenvale', image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=85' },
  { name: 'Matthew Cole', role: 'Property Partner', area: 'Sandton & Melrose', image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=85' },
  { name: 'Lerato Mokoena', role: 'Property Partner', area: 'Greenstone & Modderfontein', image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=900&q=85' },
  { name: 'Daniel Ross', role: 'Leasing Partner', area: 'Bedfordview & surrounds', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85' },
  { name: 'Mia Jacobs', role: 'Developments Partner', area: 'Gauteng', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85' },
  { name: 'Zane Naidoo', role: 'Property Partner', area: 'Johannesburg North', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=85' },
]

function HomeSeekersPeople() {
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => { const update = () => setHeaderScrolled(window.scrollY > 42); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])

  return <main className="hs-site hs-people-site">
    <header className={`hs-header hs-people-header${headerScrolled ? ' hs-people-header--scrolled' : ''}`}><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'Our people' ? 'is-active' : ''} href={hrefFor(item)} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>

    <section className="hs-people-hero"><div><p className="hs-eyebrow">Home Seekers / Gauteng</p><h1>Good people.<br />Great property<br />decisions.</h1><p>Local specialists with sharp thinking, genuine care and a shared love for the places we call home.</p><a href="#team">Meet the team <ArrowRight size={17} /></a></div><p className="hs-people-hero-note">Known by name,<br />not by number.</p></section>

    <section className="hs-people-intro"><p className="hs-eyebrow">The Home Seekers difference</p><h2>Property is personal.<br />So are we.</h2><p>We are a close-knit team of local property people who bring more than market knowledge. From the first conversation to the final handover, you have direct access to people who listen, advise and stay involved.</p></section>

    <section className="hs-people-team" id="team"><header><div><p className="hs-eyebrow">The team</p><h2>Meet your local people.</h2></div><p>Choose a specialist who knows the neighbourhood you are moving into—or moving on from.</p></header><div className="hs-people-grid">{people.map((person, index) => <article className={index === 0 ? 'hs-person-card hs-person-card--featured' : 'hs-person-card'} key={person.name}><figure><img src={person.image} alt={person.name} /><span>{String(index + 1).padStart(2, '0')}</span></figure><div><h3>{person.name}</h3><p>{person.role}</p><small><MapPin size={14} /> {person.area}</small><a href={`mailto:hello@homeseekers.co.za?subject=Enquiry%20for%20${encodeURIComponent(person.name)}`}>Get in touch <ArrowRight size={16} /></a></div></article>)}</div></section>

    <section className="hs-people-values"><div><p className="hs-eyebrow">What you can expect</p><h2>Clear advice.<br />A steady hand.</h2></div><div>{[['01', 'Local, through and through', 'We work where we live, and know the small details that make a place feel right.'], ['02', 'Straight talk, always', 'Practical advice, honest feedback and a process you can understand.'], ['03', 'With you to the finish', 'Real support from appraisal or search through to keys in hand.']].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="hs-people-contact"><div><p className="hs-eyebrow">Start a conversation</p><h2>Tell us what<br />home means to you.</h2><a href="mailto:hello@homeseekers.co.za">Contact Home Seekers <ArrowRight size={17} /></a></div><aside><p><Phone size={17} /> +27 11 000 0000</p><p><Mail size={17} /> hello@homeseekers.co.za</p><p><MapPin size={17} /> Gauteng, South Africa</p></aside></section>

    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers/rent">Rent</a><a href="/demo/homeseekers/developments">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="/demo/homeseekers/sell">Sell with Home Seekers</a><a href="/demo/homeseekers/sell#valuation">Request a valuation</a><a href="/demo/homeseekers/sell#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers">About</a><a href="/demo/homeseekers/people">Our people</a><a href="/demo/homeseekers">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}

export default HomeSeekersPeople
