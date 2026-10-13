import { useRef, useState } from 'react'

const currency = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)

export default function AgentCommissionCard({ commission = {}, onRefresh }) {
  const trackRef = useRef(null)
  const [page, setPage] = useState(0)
  const cards = [
    { label: 'Commission signed this month', value: commission.signedThisMonth, note: 'Your share · signed OTPs recorded this month' },
    { label: 'Total pipeline commission', value: commission.pipeline, note: 'Your share · active deals awaiting payment' },
  ]
  function openPage(index) {
    const track = trackRef.current
    track?.scrollTo({ left: -index * track.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    setPage(index)
  }
  return <section className="agent-commission" aria-label="Your commission">
    <div className="agent-commission-track" ref={trackRef} onScroll={event => {
      const track = event.currentTarget
      if (track.clientWidth) setPage(Math.min(1, Math.round(Math.abs(track.scrollLeft) / track.clientWidth)))
    }}>
      {cards.map((card, index) => <div className="agent-commission-slide" key={card.label} inert={page !== index}>
        <h2>{card.label}</h2><strong>{currency(card.value)}</strong>
        <p>{card.value === null || card.value === undefined ? 'Commission figures unavailable.' : card.note}</p>
        {(card.value === null || card.value === undefined) && <button type="button" className="agent-commission-retry" onClick={onRefresh}>Try again</button>}
      </div>)}
    </div>
    <div className="agent-commission-controls"><span>{page === 0 ? 'Swipe right for your pipeline' : 'Swipe left for this month'}</span><div>
      {cards.map((card, index) => <button type="button" key={card.label} aria-label={`Show ${card.label.toLowerCase()}`} aria-pressed={page === index} onClick={() => openPage(index)}><span /></button>)}
    </div></div>
  </section>
}
