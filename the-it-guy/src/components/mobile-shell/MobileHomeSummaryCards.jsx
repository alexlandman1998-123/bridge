import { useState } from 'react'
import { ArrowUpRight, CalendarDays, CircleDollarSign, ListChecks, UsersRound } from 'lucide-react'
import { inferLeadCategoryFromRecord } from '../../lib/leadCategory.js'
import './mobile-home-summary.css'

const currency = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)

export default function MobileHomeSummaryCards({ snapshot, today, onOpen, onTasks, onCommission, onRefresh }) {
  const [page, setPage] = useState(0)
  const leadsAvailable = snapshot.newLeadsAvailable !== false && Array.isArray(snapshot.newLeads)
  const leadCounts = (snapshot.newLeads || []).reduce((counts, lead) => {
    const category = inferLeadCategoryFromRecord(lead)
    if (category === 'buyer' || category === 'seller') counts[category] += 1
    return counts
  }, { buyer: 0, seller: 0 })
  const tasks = today.items.followUps || []
  const overdue = tasks.filter(task => task.status === 'Overdue').length
  const appointments = today.items.appointments.filter(item => item.today)
  const next = appointments.find(item => item.time >= today.asOf)
  const monthlyCommission = snapshot.commission?.signedThisMonth
  const commissionAvailable = Number.isFinite(monthlyCommission)
  const personalCommission = snapshot.category === 'agent'
  const cards = [
    { key: 'leads', title: 'New Leads', icon: UsersRound, tag: 'Your pipeline',
      action: leadsAvailable ? 'View new leads' : 'Retry new leads',
      open: leadsAvailable ? () => onOpen(`/mobile/leads?stage=new${snapshot.category === 'principal' ? '' : '&scope=assigned'}`) : onRefresh },
    { key: 'appointments', title: 'Appointments Today', icon: CalendarDays, tag: 'Your schedule',
      value: today.available.appointments ? today.counts.appointments : '—',
      detail: !today.available.appointments ? 'Appointments couldn’t load' : next
        ? `Next at ${new Date(next.time).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false })} · ${next.appointmentLabel || 'Appointment'}`
        : appointments.length ? 'No more appointments ahead today' : 'Nothing scheduled for today',
      action: today.available.appointments ? 'View today’s calendar' : 'Retry appointments',
      open: today.available.appointments ? () => onOpen('/mobile/calendar') : onRefresh },
    { key: 'tasks', title: 'Tasks Outstanding', icon: ListChecks, tag: 'Your to-do list',
      value: today.available.followUps ? tasks.length : '—',
      detail: !today.available.followUps ? 'Tasks couldn’t load' : overdue ? `${overdue} overdue · ready to follow up` : tasks.length ? 'Open tasks, including upcoming work' : 'You’re all caught up',
      action: today.available.followUps ? 'View outstanding tasks' : 'Retry tasks',
      open: today.available.followUps ? onTasks : onRefresh },
    { key: 'commission', title: 'Commission This Month', icon: CircleDollarSign, tag: 'Your earnings',
      value: commissionAvailable ? currency(monthlyCommission) : '—',
      detail: commissionAvailable ? 'Your share · signed this month' : personalCommission ? 'Commission couldn’t load' : 'Not available in this workspace',
      action: commissionAvailable ? 'View commission breakdown' : personalCommission ? 'Retry commission' : 'Personal commission',
      open: commissionAvailable ? onCommission : personalCommission ? onRefresh : null },
  ]

  return <section className="mobile-home-summary" aria-label="Today summary" aria-roledescription="carousel">
    <div className="mobile-home-summary-track" onScroll={event => {
      const track = event.currentTarget
      const step = track.children[1]?.offsetLeft - track.children[0]?.offsetLeft
      if (step) {
        const nextPage = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / step)))
        setPage(current => current === nextPage ? current : nextPage)
      }
    }}>
      {cards.map((card, index) => {
        const Icon = card.icon
        const label = card.key === 'leads'
          ? `${card.title}: Buyer: ${leadsAvailable ? leadCounts.buyer : '—'}. Seller: ${leadsAvailable ? leadCounts.seller : '—'}. ${card.action}`
          : `${card.title}: ${card.value}. ${card.detail}. ${card.action}`
        return <button type="button" key={card.key} className={`mobile-home-summary-card mobile-home-summary-card--${card.key}`} onClick={card.open} disabled={!card.open} aria-label={label}>
          <span className="mobile-home-summary-card-top"><span className="mobile-home-summary-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span><span className="mobile-home-summary-eyebrow">{card.tag}</span><span className="mobile-home-summary-position" aria-label={`Card ${index + 1} of 4`} aria-current={page === index ? 'true' : undefined}>0{index + 1}<span> / 04</span></span></span>
          <span className="mobile-home-summary-title">{card.title}</span>
          {card.key !== 'leads' && <strong className="mobile-home-summary-value">{card.value}</strong>}
          {card.key === 'leads' && <span className="mobile-home-lead-stats" role="group" aria-label="New lead breakdown">
            <span><span>Buyer</span><strong>{leadsAvailable ? leadCounts.buyer : '—'}</strong></span>
            <span><span>Seller</span><strong>{leadsAvailable ? leadCounts.seller : '—'}</strong></span>
          </span>}
          {card.key === 'appointments' && next && today.available.appointments ? <span className="mobile-home-summary-next">
            <span>Next appointment<strong>{new Date(next.time).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false })}</strong></span>
            <span>{next.appointmentLabel || 'Appointment'}</span>
          </span> : card.key === 'tasks' && overdue && today.available.followUps ? <span className="mobile-home-summary-detail mobile-home-summary-task-detail"><span className="mobile-home-summary-badge">{overdue} overdue</span><span>Ready to follow up</span></span>
            : card.key !== 'leads' && <span className="mobile-home-summary-detail">{card.detail}</span>}
          <span className="mobile-home-summary-action">{card.action}<span className="mobile-home-summary-arrow"><ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" /></span></span>
        </button>
      })}
    </div>
  </section>
}
