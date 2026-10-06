import { ArrowUpRight, ArrowRight, Building2, Check, ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { buildMobileToday } from '../../services/mobileTodayModel.js'
import AgentTodaySheet from './AgentTodaySheet'
import MobileDevelopmentCard from './MobileDevelopmentCard.jsx'
import { WORKFLOW_MAIN_STAGE_LABELS } from '../../core/workflows/workflowConstants.js'
import './agent-dashboard.css'

function summary(snapshot, key, fallback = '0') {
  return snapshot.summaryCards?.find((card) => card.key === key)?.value ?? fallback
}

function EmptyPage({ title, body }) {
  return <div className="agent-book-empty"><Check size={22} aria-hidden="true" /><h3>{title}</h3><p>{body}</p></div>
}

export default function AgentDashboard({ snapshot, onOpen, onRefresh }) {
  const bookRef = useRef(null)
  const [page, setPage] = useState(0)
  const [selection, setSelection] = useState(null)
  const deals = snapshot.activeWork || []
  const listings = snapshot.listings || []
  const developer = snapshot.category === 'developer'
  const pages = ['Today', 'Deals', developer ? 'Developments' : 'Listings']
  const developments = snapshot.developments || []
  const currentDevelopments = developments.filter((item) => !['archived', 'deleted', 'cancelled', 'canceled', 'closed', 'completed', 'inactive'].includes(String(item.status || '').trim().toLowerCase()))
  const today = snapshot.today || buildMobileToday({ availability: { appointments: false, followUps: false, deals: false } })
  const action = today.action
  const incomplete = Object.values(today.available).some((value) => !value)

  function openItem(item) {
    if (item.kind === 'deals' && item.to) { onOpen(item.to); return }
    setSelection({ item })
  }

  function openPage(index) {
    const book = bookRef.current
    const panel = book?.children[index]
    if (!panel) return
    const left = panel.offsetLeft - book.children[0].offsetLeft
    book.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    setPage(index)
  }

  function syncPage() {
    const book = bookRef.current
    if (!book) return
    const step = book.children[1]?.offsetLeft - book.children[0]?.offsetLeft
    if (!step) return
    const closest = Math.max(0, Math.min(pages.length - 1, Math.round(book.scrollLeft / step)))
    setPage((current) => current === closest ? current : closest)
  }

  return (
    <div className="agent-dashboard" data-mobile-home data-agent-dashboard>
      <header className="agent-dashboard-intro">
        <p>{snapshot.greeting || 'Welcome back'}, {snapshot.displayName || 'there'}</p>
        <div className="agent-today-title"><h1>Today</h1><span>{today.dateLabel}</span></div>
      </header>

      <div className="agent-today-counts" aria-label="Today summary">
        {[["appointments", "Appointments today"], ["followUps", "Follow-ups due"], ["deals", "Deals to move"]].map(([key, label]) => <button type="button" key={key} onClick={() => setSelection({ category: key })}><strong>{today.counts[key] ?? '—'}</strong><span>{label}</span></button>)}
      </div>
      {incomplete && <p className="agent-today-unavailable">Some updates couldn’t load. <button type="button" onClick={onRefresh}>Try again</button></p>}

      <nav className="agent-book-tabs" aria-label="Dashboard pages" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : Math.max(0, Math.min(2, page + (event.key === 'ArrowRight' ? 1 : -1)))
        openPage(next)
        event.currentTarget.children[next]?.focus()
      }}>
        {pages.map((label, index) => <button key={label} type="button" aria-current={page === index ? 'page' : undefined} aria-controls={`agent-book-${index}`} onClick={() => openPage(index)}>{label}</button>)}
      </nav>

      <div className="agent-book" ref={bookRef} onScroll={syncPage} aria-label="Swipe through your dashboard">
        <section className="agent-book-page agent-book-today" id="agent-book-0" aria-label="Today" inert={page !== 0}>
          <div className="agent-book-page-top"><span>{action ? action.rank > 4 ? 'Coming up next' : 'Needs your attention' : 'Your day'}</span><ArrowUpRight size={18} aria-hidden="true" /></div>
          {action ? <button className="agent-next-move" type="button" onClick={() => openItem(action)}>
            <h2>{action.title}</h2>
            {action.body && <p>{action.body}</p>}
            {action.meta && <span className="agent-next-meta">{action.meta}</span>}
            <span className="agent-next-cta">{action.cta}<ArrowRight size={18} aria-hidden="true" /></span>
          </button> : <div className="agent-next-move agent-today-clear"><Check size={24} aria-hidden="true" /><h2>{incomplete ? 'Your day is unavailable.' : 'No actions due today.'}</h2><p>{incomplete ? 'Try again to check your appointments and follow-ups.' : 'No appointments or follow-ups are due, and no deal has a recorded next action.'}</p></div>}
          <div className="agent-today-list">
            <div className="agent-section-heading"><h3>Also on your radar</h3><button type="button" onClick={() => setSelection({ category: 'followUps' })}>Follow-ups</button></div>
            {today.radar.length ? today.radar.map((item) => <button type="button" className="agent-work-row" key={item.id} onClick={() => openItem(item)}><span><strong>{item.title}</strong><small>{[item.body, item.meta].filter(Boolean).join(' · ')}</small></span><ChevronRight size={16} aria-hidden="true" /></button>) : <p className="agent-radar-empty">{action ? 'That’s your next item. ' : ''}Your active deals and {developer ? 'developments' : 'listings'} are one swipe away.</p>}
            {deals.length > 0 && <button className="agent-capture-link" type="button" onClick={() => openPage(1)}>Review active deals<ArrowUpRight size={16} aria-hidden="true" /></button>}
          </div>
        </section>

        <section className="agent-book-page agent-book-deals" id="agent-book-1" aria-label="Deals" inert={page !== 1}>
          <div className="agent-book-page-top"><h2 className="agent-deals-title">Your deals</h2><span>{summary(snapshot, 'active')} active</span></div>
          <p className="agent-deals-description">Tap a deal for its full details.</p>
          <div className="agent-deal-list">
            {deals.length ? deals.map((deal) => <button type="button" className="agent-deal-row agent-deal-preview" key={deal.id} onClick={() => onOpen(deal.to || '/mobile/transactions')}>
              <span className="agent-deal-summary"><span className="agent-deal-stage">{WORKFLOW_MAIN_STAGE_LABELS[deal.stage] || deal.stage || 'In progress'}</span>{(deal.value || deal.eyebrow) && <span className="agent-deal-value">{deal.value || deal.eyebrow}</span>}</span>
              <span className="agent-deal-identity"><span><strong>{deal.unitLabel || deal.title}</strong>{deal.unitLabel && deal.propertyTitle && <span className="agent-deal-property">{deal.propertyTitle}</span>}</span><ChevronRight size={17} aria-hidden="true" /></span>
              <span className="agent-deal-next"><span className="agent-deal-next-label">Next: </span>{deal.nextAction || 'Review the next step.'}</span>
            </button>) : <EmptyPage title="Room for your next deal." body="Active transactions will appear here as your pipeline grows." />}
          </div>
          <button className="agent-page-link" type="button" onClick={() => onOpen('/mobile/transactions')}>All transactions<ArrowRight size={17} aria-hidden="true" /></button>
        </section>

        <section className="agent-book-page" id="agent-book-2" aria-label={pages[2]} inert={page !== 2}>
          <div className="agent-book-page-top"><span>{developer ? 'Your portfolio' : 'On the market'}</span><Building2 size={18} aria-hidden="true" /></div>
          <h2 className="agent-page-title">Your {developer ? 'developments' : 'listings'}.</h2>
          <p className="agent-page-description">{developer ? `${summary(snapshot, 'developments')} developments · ${summary(snapshot, 'available')} units available.` : `${summary(snapshot, 'listings')} active listings & mandates.`}</p>
          <div className="agent-listing-list">
            {developer ? developments.length ? developments.slice(0, 5).map((development) => <button type="button" className="agent-deal-row" key={development.id} onClick={() => onOpen(development.to)}><span className="agent-deal-stage">{development.status}</span><strong>{development.title}</strong><span className="agent-deal-next">{development.activeDeals} live deals · {development.availableUnits} available units</span><span className="agent-deal-foot"><span>{development.totalUnits} units</span><ArrowUpRight size={18} aria-hidden="true" /></span></button>) : <EmptyPage title="Your portfolio starts here." body="Your connected developments will appear here when available." /> : listings.length ? listings.map((listing, index) => <article className="agent-listing-row" key={listing.id}><span className="agent-listing-number">{String(index + 1).padStart(2, '0')}</span><div><span className="agent-deal-stage">{listing.status}</span><h3>{listing.title}</h3>{listing.address && listing.address !== listing.title && <p>{listing.address}</p>}<strong>{listing.value || 'Price not set'}</strong></div></article>) : <EmptyPage title="Your next mandate starts here." body="Active property listings will appear here when available." />}
          </div>
          <button className="agent-page-link" type="button" onClick={() => onOpen(developer ? '/mobile/developments' : '/mobile/listings')}>Open {developer ? 'developments' : 'listings'}<ArrowRight size={17} aria-hidden="true" /></button>
        </section>
      </div>

      <div className="agent-book-position"><span>Swipe to explore</span><span aria-label={`Page ${page + 1} of 3`}>{pages.map((label, index) => <i key={label} className={page === index ? 'is-current' : ''} />)}</span><span>0{page + 1} / 03</span></div>
      <div className="agent-dashboard-summary"><div><strong>{summary(snapshot, 'active')}</strong><span>Active deals</span></div><div><strong>{summary(snapshot, 'pipeline', '—')}</strong><span>Pipeline value</span></div></div>
      {developer && currentDevelopments.length > 0 && <section className="agent-home-developments" aria-label="Current developments">
        <div className="agent-home-developments-heading"><h2>Current developments</h2><a href="/mobile/developments" onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onOpen('/mobile/developments')
        }}>View all<ArrowRight size={15} aria-hidden="true" /></a></div>
        <div className="agent-development-scroller" role="region" aria-label="Swipe through current developments" tabIndex={0}>
          {currentDevelopments.map((development) => <MobileDevelopmentCard key={development.id} item={development} compact onOpen={(item) => onOpen(item.to)} />)}
        </div>
      </section>}
      {selection && <AgentTodaySheet selection={selection} today={today} onClose={() => setSelection(null)} onOpen={onOpen} onRefresh={onRefresh} />}
    </div>
  )
}
