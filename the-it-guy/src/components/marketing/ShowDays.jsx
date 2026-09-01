import { useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Home,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Search,
  UserRound,
  UsersRound,
} from 'lucide-react'
import {
  showDayChecklist,
  showDayDetail,
  showDayDetailTabs,
  showDayPlaceholderTabs,
  showDays,
  showDaysStats,
  showDaysTabs,
} from '../../data/showDays'

const statIcons = { 'show-days': CalendarDays, registrations: UsersRound, attendees: Eye, attendance: CheckCircle2 }

export function ShowDaysStats() {
  return (
    <section className="wa-stats" aria-label="Show day performance">
      {showDaysStats.map((stat) => { const Icon = statIcons[stat.id]; return <article className={`wa-stat show-stat show-stat-${stat.id}`} key={stat.id}><span className="wa-stat-icon"><Icon size={19} /></span><span className="wa-stat-copy"><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.detail}</small></span></article> })}
    </section>
  )
}

export function ShowDaysFilters() {
  return <section className="wa-filter-row" aria-label="Show day filters"><label className="wa-search"><Search size={17} /><span className="sr-only">Search show days</span><input type="search" placeholder="Search show days..." /></label><button className="wa-filter-control" type="button">All statuses <ChevronDown size={15} /></button><button className="wa-filter-control" type="button">This month <CalendarDays size={16} /></button></section>
}

function ShowDayStatus({ status }) {
  return <span className={`wa-status show-status show-status-${status.toLowerCase()}`}>{status}</span>
}

export function ShowDayCard({ showDay, onOpen }) {
  const open = () => onOpen(showDay.id)
  return (
    <article className="show-day-card" role="link" tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } }}>
      <img src={showDay.image} alt={showDay.imageAlt} />
      <div className="show-day-card-main">
        <div className="show-day-card-heading"><div><h3>{showDay.title}</h3><p>{showDay.address}</p></div><ShowDayStatus status={showDay.status} /></div>
        <div className="show-day-card-date"><span><CalendarDays size={13} /> {showDay.date}</span><span><Clock3 size={13} /> {showDay.time}</span></div>
        <dl className="show-day-metrics"><div><dt>Registrations</dt><dd>{showDay.registrations}</dd></div><div><dt>Attendees</dt><dd>{showDay.attendees}</dd></div><div><dt>Confirmed</dt><dd>{showDay.confirmed}</dd></div><div><dt>Interested Leads</dt><dd>{showDay.interestedLeads}</dd></div></dl>
      </div>
      <button className="wa-more" type="button" aria-label={`More options for ${showDay.title}`} onClick={(event) => event.stopPropagation()}><MoreHorizontal size={18} /></button>
    </article>
  )
}

export function ShowDaysOverview({ onOpenShowDay }) {
  const [activeTab, setActiveTab] = useState(showDaysTabs[0])
  return (
    <div className="wa-page show-days-page">
      <ShowDaysStats />
      <section className="wa-campaigns-panel"><div className="wa-panel-toolbar"><div className="wa-tabs" role="tablist" aria-label="Show day status">{showDaysTabs.map((tab) => <button className={activeTab === tab ? 'wa-tab-active' : ''} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</div><button className="wa-primary-button" type="button">Create Show Day <ChevronRight size={16} /></button></div><div className="wa-campaigns-content"><ShowDaysFilters /><div className="wa-campaign-list">{showDays.map((showDay) => <ShowDayCard showDay={showDay} onOpen={onOpenShowDay} key={showDay.id} />)}</div><footer className="wa-list-footer"><span>Showing 1–3 of 8 show days</span><div aria-label="Pagination">{[1, 2, 3].map((page) => <button type="button" className={`wa-page-number ${page === 1 ? 'wa-page-number-active' : ''}`} key={page}>{page}</button>)}</div></footer></div></section>
    </div>
  )
}

export function ShowDayHeader({ onBack }) {
  return (
    <>
      <div className="show-day-detail-top"><nav aria-label="Breadcrumb"><button type="button" onClick={onBack}>Events</button><ChevronRight size={13} /><button type="button" onClick={onBack}>Show Days</button><ChevronRight size={13} /><span>{showDayDetail.title}</span></nav><button className="wa-secondary-button" type="button">Edit Show Day</button></div>
      <header className="show-day-property-header"><img src={showDayDetail.image} alt={showDayDetail.imageAlt} /><div><h1>{showDayDetail.title}</h1><p>{showDayDetail.address}</p><div><span><CalendarDays size={14} /> {showDayDetail.date}</span><span><Clock3 size={14} /> {showDayDetail.time}</span></div></div><ShowDayStatus status={showDayDetail.status} /><button className="wa-more" type="button" aria-label="More show day options"><MoreHorizontal size={18} /></button></header>
    </>
  )
}

export function ShowDayTabs({ activeTab, onChange }) {
  return <div className="show-day-detail-tabs" role="tablist" aria-label="Show day workspace">{showDayDetailTabs.map((tab) => <button className={activeTab === tab.id ? 'show-day-detail-tab-active' : ''} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => onChange(tab.id)} key={tab.id}>{tab.label}{tab.count ? ` (${tab.count})` : ''}</button>)}</div>
}

function DetailRow({ icon: Icon, label, children }) {
  return <div className="show-detail-row"><span className="show-detail-row-label"><Icon size={15} /> {label}</span><div>{children}</div></div>
}

export function ShowDayDetailsCard() {
  return (
    <section className="show-workspace-card show-details-card"><h2>Show Day Details</h2><div className="show-details-list"><DetailRow icon={CalendarDays} label="Date">{showDayDetail.dayDate}</DetailRow><DetailRow icon={Clock3} label="Time">{showDayDetail.time}</DetailRow><DetailRow icon={Home} label="Property">{showDayDetail.title}</DetailRow><DetailRow icon={MapPin} label="Address">{showDayDetail.address}</DetailRow><DetailRow icon={UserRound} label="Host Agent"><span className="show-agent"><i>{showDayDetail.hostInitials}</i>{showDayDetail.hostAgent}</span></DetailRow><DetailRow icon={Phone} label="Contact"><span className="show-contact-lines"><span>{showDayDetail.contactNumber}</span><span><Mail size={13} /> {showDayDetail.email}</span></span></DetailRow><DetailRow icon={Eye} label="Description"><p>{showDayDetail.description}</p></DetailRow></div></section>
  )
}

export function ShowDaySummaryCard() {
  const rows = [{ label: 'Registrations', value: showDayDetail.registrations, icon: UsersRound }, { label: 'Attendees', value: showDayDetail.attendees, icon: UsersRound }, { label: 'Confirmed', value: showDayDetail.confirmed, icon: CheckCircle2 }, { label: 'Attendance rate', value: showDayDetail.attendanceRate, icon: CheckCircle2 }]
  return <section className="show-workspace-card show-summary-card"><h2>Show Day Summary</h2><div>{rows.map(({ label, value, icon: Icon }) => <div className="show-summary-row" key={label}><span><Icon size={16} /></span><p><strong>{value}</strong><small>{label}</small></p></div>)}</div></section>
}

export function ShowDayChecklist() {
  return <section className="show-workspace-card show-checklist"><h2>Show Day Checklist</h2><div>{showDayChecklist.map((item) => <div key={item.label}><span><Check size={15} /> {item.label}</span><small className={`show-check-status show-check-${item.status.toLowerCase()}`}>{item.status}</small></div>)}</div></section>
}

export function ShowDayLeadsCard() {
  return <section className="show-workspace-card show-leads-card"><h2>Interested Leads</h2><strong>{showDayDetail.interestedLeads}</strong><p>New leads generated</p><button className="wa-secondary-button" type="button">View Leads</button></section>
}

export function ShowDayPromotionCard() {
  return <section className="show-workspace-card show-promotion-card"><h2>Promote Show Day</h2><p>Share your show day and get more registrations.</p><button className="show-share-whatsapp" type="button"><MessageCircle size={15} /> Share via WhatsApp</button><button type="button"><Mail size={15} /> Share via Email</button><button type="button"><Copy size={15} /> Copy Link</button></section>
}

function ShowDayOverviewTab() {
  return <div className="show-detail-grid"><div className="show-detail-main"><ShowDayDetailsCard /><ShowDayChecklist /></div><aside className="show-detail-aside"><ShowDaySummaryCard /><ShowDayLeadsCard /><ShowDayPromotionCard /></aside></div>
}

function ShowDayPlaceholderTab({ tabId }) {
  const tab = showDayPlaceholderTabs[tabId]
  return <section className="show-workspace-card show-placeholder-tab"><span><Link2 size={23} /></span><h2>{tab.title}</h2><p>{tab.description}</p><div>{tab.fields.map((field) => <span key={field}><Check size={13} /> {field}</span>)}</div></section>
}

export function ShowDayDetail({ onBack }) {
  const [activeTab, setActiveTab] = useState('overview')
  return <div className="wa-page show-days-page show-day-detail-page"><button className="wa-back-link show-mobile-back" type="button" onClick={onBack}><ArrowLeft size={15} /> Show Days</button><ShowDayHeader onBack={onBack} /><ShowDayTabs activeTab={activeTab} onChange={setActiveTab} />{activeTab === 'overview' ? <ShowDayOverviewTab /> : <ShowDayPlaceholderTab tabId={activeTab} />}</div>
}
