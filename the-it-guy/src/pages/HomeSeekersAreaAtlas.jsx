import { homeSeekersPath } from './homeSeekersRoutes.js'
import { ArrowUpRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { homeSeekersAreas } from './homeSeekersAreasData'
import './HomeSeekersAreas.css'

export default function HomeSeekersAreaAtlas({ id = 'atlas', onSelectedChange }) {
  const [selectedId, setSelectedId] = useState(homeSeekersAreas[0].id)
  const [query, setQuery] = useState('')
  const selected = homeSeekersAreas.find((area) => area.id === selectedId) || homeSeekersAreas[0]
  const visibleAreas = useMemo(() => homeSeekersAreas.filter((area) => area.name.toLowerCase().includes(query.toLowerCase())), [query])

  function selectArea(area) {
    setSelectedId(area.id)
    onSelectedChange?.(area)
  }

  return <section className="hs-areas__atlas" id={id} aria-labelledby={`${id}-title`}>
    <div className="hs-areas__atlas-head">
      <div>
        <p>❯ EXPLORE THE <strong>ATLAS</strong></p>
        <h2 id={`${id}-title`}>One city.<br />Many ways to belong.</h2>
      </div>
      <label><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a suburb" aria-label="Find an area" /></label>
    </div>
    <div className="hs-areas__body">
      <div className="hs-areas__grid">
        {visibleAreas.map((area) => <button className={area.id === selectedId ? 'is-active' : ''} type="button" key={area.id} onClick={() => selectArea(area)} aria-pressed={area.id === selectedId}>
          <img src={area.image} alt="" loading="lazy" />
          <span>{area.number}</span><strong>{area.name}</strong><i aria-hidden="true">↗</i>
        </button>)}
        {visibleAreas.length === 0 && <p className="hs-areas__empty">No suburb matches that search.</p>}
      </div>
      <aside className="hs-areas__profile" aria-live="polite">
        <span>AREA NOTE / {selected.number}</span>
        <h3>{selected.name}</h3>
        <p>{selected.note}</p>
        <ul>{selected.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        <a href={homeSeekersPath("/contact")}>Talk to a local advisor <ArrowUpRight size={17} aria-hidden="true" /></a>
        <small>Profile copy is a design preview. Local specialist and live market information will connect here.</small>
      </aside>
    </div>
  </section>
}
