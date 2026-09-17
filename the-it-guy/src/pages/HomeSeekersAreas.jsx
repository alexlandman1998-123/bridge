import { ArrowRight, ArrowUpRight, Compass, MapPin, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import HomeSeekersValuationModal from './HomeSeekersValuationModal'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'
import HomeSeekersFooter from './HomeSeekersFooter'
import './HomeSeekersAreas.css'
import './HomeSeekersBrand.css'

const areas = [
  { id: 'waterkloof', name: 'Waterkloof', number: '01', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif', note: 'Leafy streets, established homes and a quiet sense of permanence.', tags: ['Established homes', 'Garden living', 'Close to the city'] },
  { id: 'menlyn', name: 'Menlyn', number: '02', image: 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif', note: 'A connected address where work, leisure and home sit close together.', tags: ['Connected living', 'Apartments & homes', 'Lifestyle precinct'] },
  { id: 'faerie-glen', name: 'Faerie Glen', number: '03', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=88', note: 'Family-shaped living with room to settle into everyday rituals.', tags: ['Family rhythm', 'Everyday ease', 'Outdoor living'] },
  { id: 'moreleta-park', name: 'Moreleta Park', number: '04', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=88', note: 'A grounded, generous suburb for people who want space without leaving life behind.', tags: ['Generous space', 'Community feel', 'Practical location'] },
  { id: 'brooklyn', name: 'Brooklyn', number: '05', image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=88', note: 'An energetic, central pocket with a more considered kind of city energy.', tags: ['Central address', 'Character homes', 'Walkable moments'] },
  { id: 'olympus', name: 'Olympus', number: '06', image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=88', note: 'Newer estates, long views and a lifestyle that gives everyone room to breathe.', tags: ['Estate living', 'Open outlooks', 'Growing community'] },
]
const nav = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['Areas', 'areas'], ['About', 'about'], ['Join us', 'join']]

export default function HomeSeekersAreas() {
  const [selectedId, setSelectedId] = useState('waterkloof')
  const [query, setQuery] = useState('')
  const [valuationOpen, setValuationOpen] = useState(false)
  const selected = areas.find((area) => area.id === selectedId) || areas[0]
  const visibleAreas = useMemo(() => areas.filter((area) => area.name.toLowerCase().includes(query.toLowerCase())), [query])
  return <main className="hs-areas">
    <header className="hs-areas__header"><a href="/demo/homeseekers" aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a><nav>{nav.map(([label, slug]) => <a className={slug === 'areas' ? 'is-active' : ''} href={`/demo/homeseekers/${slug}`} key={slug}>{label}</a>)}</nav><button type="button" onClick={() => setValuationOpen(true)}>Book a free valuation</button><HomeSeekersMobileNav links={nav.map(([label, slug]) => [label, `/demo/homeseekers/${slug}`])} active="areas" onValuation={() => setValuationOpen(true)} /></header>
    <section className="hs-areas__hero"><div className="hs-areas__hero-copy"><p>❯ LOCAL KNOWLEDGE, <strong>MADE PERSONAL</strong></p><h1>Find your<br /><em>place</em> in it.</h1><p>Every street tells a different version of home. Start with the local context that makes the decision clearer.</p><a href="#atlas">Explore the local atlas <ArrowRight size={18} /></a></div><div className="hs-areas__hero-image"><img src={selected.image} alt={selected.name} /><div><span>PRETORIA EAST / LOCAL ATLAS</span><strong>{selected.name}</strong></div><i><Compass size={23} /> LOCAL<br />COMPASS</i></div></section>
    <section className="hs-areas__atlas" id="atlas"><div className="hs-areas__atlas-head"><div><p>❯ EXPLORE THE <strong>ATLAS</strong></p><h2>One city.<br />Many ways to belong.</h2></div><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a suburb" aria-label="Find an area" /></label></div><div className="hs-areas__body"><div className="hs-areas__grid">{visibleAreas.map((area) => <button className={area.id === selectedId ? 'is-active' : ''} type="button" key={area.id} onClick={() => setSelectedId(area.id)}><img src={area.image} alt="" /><span>{area.number}</span><strong>{area.name}</strong><i>↗</i></button>)}{visibleAreas.length === 0 && <p className="hs-areas__empty">No suburb matches that search.</p>}</div><aside className="hs-areas__profile"><span>AREA NOTE / {selected.number}</span><h3>{selected.name}</h3><p>{selected.note}</p><ul>{selected.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul><a href="mailto:info@homeseeker.co.za?subject=Local%20area%20conversation">Talk to a local advisor <ArrowUpRight size={17} /></a><small>Profile copy is a design preview. Local specialist and live market information will connect here.</small></aside></div></section>
    <section className="hs-areas__signal"><div><p>❯ THE RIGHT MOVE STARTS <strong>LOCALLY</strong></p><h2>Not just the suburb.<br />The street, the fit,<br />the next chapter.</h2></div><div><p>Tell us what matters around your next home: commute, schools, morning coffee, garden space, weekend rhythm. We will help you understand the places that suit it.</p><a href="mailto:info@homeseeker.co.za?subject=Help%20me%20find%20my%20area">Start a local conversation <ArrowRight size={18} /></a></div></section>
    <HomeSeekersFooter />
    {valuationOpen && <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />}
  </main>
}
