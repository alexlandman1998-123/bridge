import { ArrowUpRight, ArrowRight, Building2, Check, ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import './agent-dashboard.css'

const PAGES = ['Today', 'Deals', 'Listings']

function summary(snapshot, key, fallback = '0') {
  return snapshot.summaryCards?.find((card) => card.key === key)?.value ?? fallback
}

function EmptyPage({ title, body }) {
  return <div className="agent-book-empty"><Check size={22} aria-hidden="true" /><h3>{title}</h3><p>{body}</p></div>
}

export default function AgentDashboard({ snapshot, onOpen, onAction }) {
  const bookRef = useRef(null)
  const [page, setPage] = useState(0)
  const tasks = snapshot.tasks || []
  const deals = snapshot.activeWork || []
  const listings = snapshot.listings || []
  const nextTask = tasks[0]
  const nextDeal = deals.find((deal) => deal.nextAction) || deals[0]
  const action = nextTask
    ? { title: nextTask.title, body: nextTask.related, meta: nextTask.dueTime || nextTask.due, to: nextTask.route || '/mobile/tasks' }
    : nextDeal
      ? { title: nextDeal.nextAction || 'Review your next step', body: nextDeal.title, meta: nextDeal.stage, to: nextDeal.to || '/mobile/transactions' }
      : { title: 'Start your next conversation', body: 'Capture a lead and keep your pipeline moving.', to: '/mobile/leads' }
  const captureAction = snapshot.quickActions?.find((item) => ['create_lead', 'add_lead'].includes(item.key))

  function openPage(index) {
    const book = bookRef.current
    const panel = book?.children[index]
    if (!panel) return
    const left = panel.getBoundingClientRect().left - book.getBoundingClientRect().left + book.scrollLeft
    book.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    setPage(index)
  }

  function syncPage() {
    const book = bookRef.current
    if (!book) return
    const left = book.getBoundingClientRect().left
    let closest = 0
    let distance = Infinity
    Array.from(book.children).forEach((panel, index) => {
      const current = Math.abs(panel.getBoundingClientRect().left - left)
      if (current < distance) { distance = current; closest = index }
    })
    setPage(closest)
  }

  return (
    <div className="agent-dashboard" data-mobile-home data-agent-dashboard>
      <header className="agent-dashboard-intro">
        <p>{snapshot.greeting || 'Welcome back'}, {snapshot.displayName || 'there'}</p>
        <h1>Make your next move.</h1>
      </header>

      <nav className="agent-book-tabs" aria-label="Dashboard pages" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : Math.max(0, Math.min(2, page + (event.key === 'ArrowRight' ? 1 : -1)))
        openPage(next)
        event.currentTarget.children[next]?.focus()
      }}>
        {PAGES.map((label, index) => <button key={label} type="button" aria-current={page === index ? 'page' : undefined} aria-controls={`agent-book-${index}`} onClick={() => openPage(index)}>{label}<span aria-hidden="true">0{index + 1}</span></button>)}
      </nav>

      <div className="agent-book" ref={bookRef} onScroll={syncPage} aria-label="Swipe through your dashboard">
        <section className="agent-book-page agent-book-today" id="agent-book-0" aria-label="Today" inert={page !== 0}>
          <div className="agent-book-page-top"><span>Your next move</span><ArrowUpRight size={18} aria-hidden="true" /></div>
          <button className="agent-next-move" type="button" onClick={() => onOpen(action.to)}>
            <h2>{action.title}</h2>
            {action.body && <p>{action.body}</p>}
            {action.meta && <span className="agent-next-meta">{action.meta}</span>}
            <span className="agent-next-cta">{nextTask ? 'View task' : nextDeal ? 'Open deal' : 'Open leads'}<ArrowRight size={18} aria-hidden="true" /></span>
          </button>
          <div className="agent-today-list">
            <div className="agent-section-heading"><h3>On your radar</h3><button type="button" onClick={() => onOpen('/mobile/tasks')}>View tasks</button></div>
            {tasks.length > 1 ? tasks.slice(1, 4).map((task) => <button type="button" className="agent-work-row" key={task.id} onClick={() => onOpen(task.route || '/mobile/tasks')}><span><strong>{task.title}</strong><small>{task.related || task.due || 'Task'}</small></span><ChevronRight size={16} aria-hidden="true" /></button>) : <p className="agent-radar-empty">{tasks.length ? 'Your next task is above. Open tasks for the full picture.' : 'No scheduled tasks available. Your active deals are one swipe away.'}</p>}
            {captureAction && <button className="agent-capture-link" type="button" onClick={() => onAction(captureAction)}>Capture a new lead<ArrowUpRight size={16} aria-hidden="true" /></button>}
          </div>
        </section>

        <section className="agent-book-page" id="agent-book-1" aria-label="Deals" inert={page !== 1}>
          <div className="agent-book-page-top"><span>Moving forward</span><span>{summary(snapshot, 'active')} active</span></div>
          <h2 className="agent-page-title">Your deals.</h2>
          <p className="agent-page-description">The next step, always in sight.</p>
          <div className="agent-deal-list">
            {deals.length ? deals.map((deal) => <button type="button" className="agent-deal-row" key={deal.id} onClick={() => onOpen(deal.to || '/mobile/transactions')}><span className="agent-deal-stage">{deal.stage || 'In progress'}</span><strong>{deal.title}</strong><span className="agent-deal-next">{deal.nextAction || 'Open deal to review the next step.'}</span><span className="agent-deal-foot"><span>{deal.value || deal.eyebrow}</span><ArrowUpRight size={18} aria-hidden="true" /></span></button>) : <EmptyPage title="Room for your next deal." body="Active transactions will appear here as your pipeline grows." />}
          </div>
          <button className="agent-page-link" type="button" onClick={() => onOpen('/mobile/transactions')}>All transactions<ArrowRight size={17} aria-hidden="true" /></button>
        </section>

        <section className="agent-book-page" id="agent-book-2" aria-label="Listings" inert={page !== 2}>
          <div className="agent-book-page-top"><span>On the market</span><Building2 size={18} aria-hidden="true" /></div>
          <h2 className="agent-page-title">Your listings.</h2>
          <p className="agent-page-description">{summary(snapshot, 'listings')} active listings & mandates.</p>
          <div className="agent-listing-list">
            {listings.length ? listings.map((listing, index) => <article className="agent-listing-row" key={listing.id}><span className="agent-listing-number">{String(index + 1).padStart(2, '0')}</span><div><span className="agent-deal-stage">{listing.status}</span><h3>{listing.title}</h3>{listing.address && listing.address !== listing.title && <p>{listing.address}</p>}<strong>{listing.value || 'Price not set'}</strong></div></article>) : <EmptyPage title="Your next mandate starts here." body="Active property listings will appear here when available." />}
          </div>
          <button className="agent-page-link" type="button" onClick={() => onOpen('/mobile/listings')}>Open listings<ArrowRight size={17} aria-hidden="true" /></button>
        </section>
      </div>

      <div className="agent-book-position"><span>Swipe to explore</span><span aria-label={`Page ${page + 1} of 3`}>{PAGES.map((label, index) => <i key={label} className={page === index ? 'is-current' : ''} />)}</span><span>0{page + 1} / 03</span></div>
      <div className="agent-dashboard-summary"><div><strong>{summary(snapshot, 'active')}</strong><span>Active deals</span></div><div><strong>{summary(snapshot, 'pipeline', '—')}</strong><span>Pipeline value</span></div></div>
    </div>
  )
}
