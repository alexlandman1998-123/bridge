import { ArrowRight, ArrowUpRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import HomeSeekersFooter from './HomeSeekersFooter'
import './HomeSeekersSelling.css'
import './HomeSeekersSellingResults.css'
import './HomeSeekersSellingRefinement.css'
import './HomeSeekersValuationModal.css'
import './HomeSeekersSellingMobile.css'

const nav = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['Areas', 'areas'], ['About', 'about'], ['Join us', 'join']]
const process = [
  ['01', 'Price it honestly.', 'We show you the comparable sales and the position your home needs to take from day one.'],
  ['02', 'Launch with a plan.', 'Photography, portal placement, targeted exposure and a contact plan—mapped before we begin.'],
  ['03', 'Know what is happening.', 'Every viewing, enquiry and buyer response is reported back to you in writing, every week.'],
  ['04', 'Hold us to day 45.', 'Sold—or our commission comes down. Either way, the decision to continue is yours.'],
]
const salePreviews = [
  { image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif', record: 'Awaiting approved sale record' },
  { image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif', record: 'Awaiting approved sale record' },
  { image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_f02bc109f42a499fb43e3e7b41af6c13_t_w_505_h_490.avif', record: 'Awaiting approved sale record' },
]

export default function HomeSeekersSelling() {
  const [resultIndex, setResultIndex] = useState(0)
  const [valuationOpen, setValuationOpen] = useState(false)
  useEffect(() => { const timer = window.setInterval(() => setResultIndex((index) => (index + 1) % salePreviews.length), 5000); return () => window.clearInterval(timer) }, [])
  const activeSale = salePreviews[resultIndex]
  const nextSale = salePreviews[(resultIndex + 1) % salePreviews.length]
  return <main className="hs-selling">
    <header className="hs-selling__header"><a href="/demo/homeseekers" aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a><nav>{nav.map(([label, slug]) => <a className={slug === 'selling' ? 'is-active' : ''} href={`/demo/homeseekers/${slug}`} key={slug}>{label}</a>)}</nav><button type="button" onClick={() => setValuationOpen(true)} className="hs-selling__header-cta">Book a free valuation</button><HomeSeekersMobileNav links={nav.map(([label, slug]) => [label, `/demo/homeseekers/${slug}`])} active="selling" onValuation={() => setValuationOpen(true)} /></header>

    <section className="hs-selling__hero"><div className="hs-selling__hero-copy"><p className="hs-selling__eyebrow">❯ SELLING WITH <strong>HOME SEEKERS</strong></p><h1>Sell beyond the listing.</h1><p className="hs-selling__intro">A great sale is made long before the listing goes live—with a price grounded in evidence, presentation that earns attention and people who know how to convert interest into an offer.</p><div className="hs-selling__actions"><button type="button" className="hs-selling__button" onClick={() => setValuationOpen(true)}>Book a free valuation <ArrowRight size={17} /></button><a className="hs-selling__text-link" href="#strategy">See how we sell <ArrowRight size={16} /></a></div></div><div className="hs-selling__hero-visual"><img src="https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/pages/2026/8/869_eeb9a8cde79f42729798b3578488dc1e_t_w_1440_h_900.avif" alt="A Home Seekers property" /><div className="hs-selling__day"><span>45</span><p>Days to prove<br />our promise.</p></div></div></section>

    <section className="hs-selling__strategy" id="strategy"><div><p className="hs-selling__eyebrow">❯ THE SELLING <strong>STRATEGY</strong></p><h2>Your home needs more than a listing.</h2></div><div className="hs-selling__strategy-list"><article><span>01</span><h3>Evidence before ego.</h3><p>We use comparable sales, buyer behaviour and local context to set a price that can actually move.</p></article><article><span>02</span><h3>Attention with intent.</h3><p>Every asset and channel is chosen to make the right buyer stop, look and act.</p></article><article><span>03</span><h3>Momentum you can see.</h3><p>Weekly written feedback turns activity into a clear next decision—not a guessing game.</p></article></div></section>

    <section className="hs-selling__results"><div className="hs-selling__results-heading"><p className="hs-selling__eyebrow">❯ SALES <strong>ARCHIVE</strong></p><span className="hs-selling__archive-count">0{resultIndex + 1}<i>/</i>0{salePreviews.length}</span><h2>Proof in motion.</h2><p>Every concluded sale becomes a documented record—not a line in a claim.</p><small>LIVE RESULTS FEED · AWAITING APPROVED SALE DATA</small></div><div className="hs-selling__carousel"><div className="hs-selling__sale-stage"><img key={resultIndex} src={activeSale.image} alt="Home Seekers sale record preview" /><strong>SOLD</strong><span>CONCLUDED SALE / RECORD {String(resultIndex + 1).padStart(2, '0')}</span><div className="hs-selling__next-sale" aria-hidden="true"><img src={nextSale.image} alt="" /><b>NEXT</b></div></div><div className="hs-selling__sale-record"><p>VERIFIED SALE RECORD</p><h3>{activeSale.record}</h3><p className="hs-selling__sale-copy">Address, campaign story and verified sale result will populate here automatically.</p><div className="hs-selling__sale-specs"><span><b>—</b> beds</span><span><b>—</b> baths</span><span><b>—</b> parking</span></div><div className="hs-selling__sale-progress">{salePreviews.map((_, index) => <i className={index === resultIndex ? 'is-active' : ''} key={index} />)}</div></div></div></section>

    <section className="hs-selling__process"><p className="hs-selling__eyebrow">❯ HOW IT <strong>WORKS</strong></p><div>{process.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="hs-selling__valuation" id="valuation"><div className="hs-selling__valuation-copy"><p className="hs-selling__eyebrow">❯ YOUR NEXT <strong>MOVE</strong></p><h2>Get a clear view of what your home can sell for.</h2><p>A no-pressure valuation gives you the evidence to make the right next decision—whether you sell now or later.</p><small>786 Witdoring Avenue, Moreleta Park, Pretoria<br />+27 12 880 3127</small></div><div className="hs-selling__valuation-invite"><span>01 / FREE VALUATION</span><h3>It takes less than a minute to begin.</h3><p>Share the basics. We will come back to you with the right next step.</p><button type="button" className="hs-selling__button hs-selling__button--light" onClick={() => setValuationOpen(true)}>Book a free valuation <ArrowUpRight size={18} /></button></div></section>

    {valuationOpen && <div className="hs-valuation-modal" role="presentation" onMouseDown={() => setValuationOpen(false)}><section className="hs-valuation-modal__panel" role="dialog" aria-modal="true" aria-labelledby="valuation-title" onMouseDown={(event) => event.stopPropagation()}><div className="hs-valuation-modal__intro"><p>❯ FREE <strong>VALUATION</strong></p><h2 id="valuation-title">Start with a clearer picture.</h2><p>Tell us a little about the property. We will use it only to arrange your valuation.</p><small>HOME SEEKERS<br />MOVE FORWARD, FASTER.</small></div><form action="mailto:info@homeseeker.co.za" method="post" encType="text/plain"><button className="hs-valuation-modal__close" type="button" aria-label="Close valuation form" onClick={() => setValuationOpen(false)}><X size={20} /></button><p>BOOK YOUR FREE VALUATION</p><label>Your name<input name="name" required placeholder="Your name" autoFocus /></label><label>Mobile number<input name="phone" type="tel" required placeholder="Your mobile number" /></label><label>Email address<input name="email" type="email" required placeholder="you@example.com" /></label><label>Property address<textarea name="propertyAddress" required rows="2" placeholder="Street address and suburb" /></label><button className="hs-selling__button" type="submit">Request a valuation <ArrowUpRight size={18} /></button></form></section></div>}

    <HomeSeekersFooter />
  </main>
}
