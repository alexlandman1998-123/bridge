import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import HomeSeekersValuationModal from './HomeSeekersValuationModal'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import './HomeSeekersPageShell.css'

const pages = {
  selling: { label: 'SELLING', title: 'Sell with accountable action.', copy: 'The 45-day guarantee, pricing strategy and launch plan will live here.' },
  buying: { label: 'BUYING', title: 'Find a home worth moving for.', copy: 'The full buyer search and property discovery experience will live here.' },
  renting: { label: 'RENTING', title: 'Rent with confidence.', copy: 'The tenant and rental-property journeys will live here.' },
  areas: { label: 'AREAS', title: 'Local knowledge gets personal.', copy: 'Individual Pretoria East suburb guides and local specialists will live here.' },
  about: { label: 'ABOUT HOME SEEKERS', title: 'Move forward. Faster.', copy: 'The Home Seekers story, team and way of working will live here.' },
  join: { label: 'JOIN US', title: 'Build a career that moves you forward.', copy: 'The training academy and recruitment journey will live here.' },
  valuation: { label: 'FREE VALUATION', title: 'Find out what your home is worth.', copy: 'The valuation enquiry flow and guarantee eligibility will live here.' },
}
const navigation = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['Areas', 'areas'], ['About', 'about'], ['Join us', 'join']]

export default function HomeSeekersPageShell({ page }) {
  const [valuationOpen, setValuationOpen] = useState(false)
  const content = pages[page] || pages.about
  return <main className="hs-page-shell">
    <header className="hs-page-shell__header"><a href="/demo/homeseekers" aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a><nav>{navigation.map(([label, slug]) => <a className={slug === page ? 'is-active' : ''} href={`/demo/homeseekers/${slug}`} key={slug}>{label}</a>)}</nav><button type="button" onClick={() => setValuationOpen(true)} className="hs-page-shell__button">Book a free valuation</button><HomeSeekersMobileNav links={navigation.map(([label, slug]) => [label, `/demo/homeseekers/${slug}`])} active={page} onValuation={() => setValuationOpen(true)} /></header>
    <section className="hs-page-shell__hero"><p>❯ {content.label}</p><h1>{content.title}</h1><div><span>PAGE IN PROGRESS</span><p>{content.copy}</p><a href="/demo/homeseekers">Back to homepage <ArrowRight size={17} /></a></div></section>
    {valuationOpen && <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />}
  </main>
}
