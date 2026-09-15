import { ArrowRight, ChevronDown, Mail, MapPin, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import './HomeSeekersDemo.css'
import './HomeSeekersPeople.css'

const nav = ['Buy', 'Sell', 'Rent', 'Developments', 'Our people', 'About', 'Contact']
const hrefFor = (item) => ({ Buy: '/demo/homeseekers/buy', Sell: '/demo/homeseekers/sell', Rent: '/demo/homeseekers/rent', Developments: '/demo/homeseekers/developments', 'Our people': '/demo/homeseekers/people', About: '/demo/homeseekers/about', Contact: '/demo/homeseekers/contact' }[item] || '/demo/homeseekers')

const people = [
  { name: 'Thomas Potgieter', role: 'CEO', area: 'Head Office', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/undefined/2026/7/869_f24595db8e4f4356b442a2980c283791_t_c_cx_10_cy_86_cw_1012_ch_1014_w_304_h_304.avif' },
  { name: 'Rode Potgieter', role: 'Non-Principal Property Practitioner', area: 'Head Office', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/undefined/2026/1/869_b4940769d98b4aa19dbf8d905baeefb4_t_c_cx_0_cy_20_cw_1023_ch_1023_w_304_h_304.avif' },
  { name: 'Alidah Setsetse', role: 'Agent', area: 'Head Office', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/undefined/2026/1/869_bd9c2723d84846ea80da3c1edaf79d29_t_c_cx_0_cy_61_cw_1023_ch_1023_w_304_h_304.avif' },
  { name: 'Amanda van Staden', role: 'Agent', area: 'Head Office', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/undefined/2026/1/869_b6b3482491e341f29fc1db64347825b9_t_c_cx_0_cy_66_cw_1023_ch_1023_w_304_h_304.avif' },
  { name: 'Tabisa Ntebe', role: 'Agent', area: 'Head Office', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/undefined/2025/10/869_e74128dbe1db48499c6f6aa94eb654fa_t_c_cx_0_cy_357_cw_1076_ch_1077_w_304_h_304.avif' },
  { name: 'Yacoob Moosa', role: 'Agent', area: 'Head Office', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/undefined/2026/1/869_588aacad5f4d4efd91ba0d667ae0240f_t_c_cx_0_cy_0_cw_864_ch_864_w_304_h_304.avif' },
]

function HomeSeekersPeople() {
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => { const update = () => setHeaderScrolled(window.scrollY > 42); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])

  return <main className="hs-site hs-people-site">
    <header className={`hs-header hs-people-header${headerScrolled ? ' hs-people-header--scrolled' : ''}`}><a className="hs-logo" href="/demo/homeseekers"><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /></a><nav className="hs-nav" aria-label="Main navigation">{nav.map((item, index) => <a className={item === 'Our people' ? 'is-active' : ''} href={hrefFor(item)} key={item}>{item}{index < 3 && <ChevronDown size={13} />}</a>)}</nav></header>

    <section className="hs-people-hero"><div><p className="hs-eyebrow">Home Seekers / Pretoria</p><h1>World-class<br />property<br />practitioners.</h1><p>A family-driven team helping people and investors find the right place to belong.</p><a href="#team">Meet the team <ArrowRight size={17} /></a></div><p className="hs-people-hero-note">Known by name,<br />not by number.</p></section>

    <section className="hs-people-intro"><p className="hs-eyebrow">The Home Seekers difference</p><h2>Property is personal.<br />So are we.</h2><p>We are a close-knit team of local property people who bring more than market knowledge. From the first conversation to the final handover, you have direct access to people who listen, advise and stay involved.</p></section>

    <section className="hs-people-team" id="team"><header><div><p className="hs-eyebrow">The team</p><h2>Meet your local people.</h2></div><p>Choose a specialist who knows the neighbourhood you are moving into—or moving on from.</p></header><div className="hs-people-grid">{people.map((person, index) => <article className={index === 0 ? 'hs-person-card hs-person-card--featured' : 'hs-person-card'} key={person.name}><figure><img src={person.image} alt={person.name} /><span>{String(index + 1).padStart(2, '0')}</span></figure><div><h3>{person.name}</h3><p>{person.role}</p><small><MapPin size={14} /> {person.area}</small><a href={`/demo/homeseekers/contact?agent=${encodeURIComponent(person.name)}`}>Get in touch <ArrowRight size={16} /></a></div></article>)}</div></section>

    <section className="hs-people-values"><div><p className="hs-eyebrow">What you can expect</p><h2>Clear advice.<br />A steady hand.</h2></div><div>{[['01', 'Local, through and through', 'We work where we live, and know the small details that make a place feel right.'], ['02', 'Straight talk, always', 'Practical advice, honest feedback and a process you can understand.'], ['03', 'With you to the finish', 'Real support from appraisal or search through to keys in hand.']].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="hs-people-contact"><div><p className="hs-eyebrow">Start a conversation</p><h2>Tell us what<br />home means to you.</h2><a href="/demo/homeseekers/contact">Contact Home Seekers <ArrowRight size={17} /></a></div><aside><p><Phone size={17} /> +27 12 880 3127</p><p><Mail size={17} /> info@homeseeker.co.za</p><p><MapPin size={17} /> Moreleta Park, Pretoria</p></aside></section>

    <footer className="hs-footer"><div><img src="/brand/homeseekers/logo.png" alt="Home Seekers" /><p>Gauteng property. Done differently.</p></div><div><h3>Properties</h3><a href="/demo/homeseekers/buy">Buy</a><a href="/demo/homeseekers/rent">Rent</a><a href="/demo/homeseekers/developments">Developments</a><a href="/demo/homeseekers">Areas</a></div><div><h3>Sell</h3><a href="/demo/homeseekers/sell">Sell with Home Seekers</a><a href="/demo/homeseekers/sell#valuation">Request a valuation</a><a href="/demo/homeseekers/sell#promise">45 Day Promise</a></div><div><h3>Company</h3><a href="/demo/homeseekers">About</a><a href="/demo/homeseekers/people">Our people</a><a href="/demo/homeseekers">Contact</a></div><div className="hs-footer-bottom"><span>© Home Seekers</span><span>Privacy · Terms · POPIA</span><span>Powered by Arch9</span></div></footer>
  </main>
}

export default HomeSeekersPeople
