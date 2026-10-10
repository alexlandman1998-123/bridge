import { homeSeekersPath } from './homeSeekersRoutes.js'
import { ArrowRight, Compass } from 'lucide-react'
import { useState } from 'react'
import HomeSeekersValuationModal from './HomeSeekersValuationModal'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import HomeSeekersFooter from './HomeSeekersFooter'
import HomeSeekersAreaAtlas from './HomeSeekersAreaAtlas'
import { homeSeekersAreas } from './homeSeekersAreasData'
import './HomeSeekersAreas.css'
import './HomeSeekersBrand.css'

const nav = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['Areas', 'areas'], ['About', 'about'], ['Join us', 'join']]

export default function HomeSeekersAreas() {
  const [selected, setSelected] = useState(homeSeekersAreas[0])
  const [valuationOpen, setValuationOpen] = useState(false)
  return <main className="hs-areas">
    <header className="hs-areas__header"><a href={homeSeekersPath("/")} aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a><nav>{nav.map(([label, slug]) => <a className={slug === 'areas' ? 'is-active' : ''} href={homeSeekersPath(`/${slug}`)} key={slug}>{label}</a>)}</nav><button type="button" onClick={() => setValuationOpen(true)}>Book a free valuation</button><HomeSeekersMobileNav links={nav.map(([label, slug]) => [label, homeSeekersPath(`/${slug}`)])} active="areas" onValuation={() => setValuationOpen(true)} /></header>
    <section className="hs-areas__hero"><div className="hs-areas__hero-copy"><p>❯ LOCAL KNOWLEDGE, <strong>MADE PERSONAL</strong></p><h1>Find your<br /><em>place</em> in it.</h1><p>Every street tells a different version of home. Start with the local context that makes the decision clearer.</p><a href="#atlas">Explore the local atlas <ArrowRight size={18} /></a></div><div className="hs-areas__hero-image"><img src={selected.image} alt={selected.name} /><div><span>PRETORIA EAST / LOCAL ATLAS</span><strong>{selected.name}</strong></div><i><Compass size={23} /> LOCAL<br />COMPASS</i></div></section>
    <HomeSeekersAreaAtlas onSelectedChange={setSelected} />
    <section className="hs-areas__signal"><div><p>❯ THE RIGHT MOVE STARTS <strong>LOCALLY</strong></p><h2>Not just the suburb.<br />The street, the fit,<br />the next chapter.</h2></div><div><p>Tell us what matters around your next home: commute, schools, morning coffee, garden space, weekend rhythm. We will help you understand the places that suit it.</p><a href={homeSeekersPath("/contact")}>Start a local conversation <ArrowRight size={18} /></a></div></section>
    <HomeSeekersFooter />
    {valuationOpen && <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />}
  </main>
}
