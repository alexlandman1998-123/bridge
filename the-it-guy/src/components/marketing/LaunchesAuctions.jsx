import { useState } from 'react'
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gavel,
  MapPin,
  MoreHorizontal,
  Search,
  TicketCheck,
  UserCheck,
  UsersRound,
} from 'lucide-react'
import { auctionStats, auctionTabs, auctions, launchStats, launchTabs, launches } from '../../data/launchesAuctions'

const metricIcons = {
  upcoming: CalendarDays,
  invited: UsersRound,
  registrations: TicketCheck,
  leads: UserCheck,
  active: Gavel,
  bidders: UsersRound,
  lots: CalendarDays,
  clearance: CheckCircle2,
}

function OverviewStats({ stats, label }) {
  return <section className="wa-stats" aria-label={label}>{stats.map((stat) => { const Icon = metricIcons[stat.id]; return <article className={`wa-stat la-stat la-stat-${stat.id}`} key={stat.id}><span className="wa-stat-icon"><Icon size={19} /></span><span className="wa-stat-copy"><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.detail}</small></span></article> })}</section>
}

function WorkspaceFilters({ placeholder }) {
  return <section className="wa-filter-row"><label className="wa-search"><Search size={17} /><span className="sr-only">{placeholder}</span><input type="search" placeholder={placeholder} /></label><button className="wa-filter-control" type="button">All statuses <ChevronDown size={15} /></button><button className="wa-filter-control" type="button">Next 60 days <CalendarDays size={16} /></button></section>
}

function StatusBadge({ status }) {
  return <span className={`wa-status la-status la-status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
}

function LaunchCard({ launch }) {
  return <article className="la-card"><img src={launch.image} alt="" /><div className="la-card-main"><div className="la-card-heading"><div><span className="la-card-kicker">{launch.development}</span><h3>{launch.title}</h3><p><MapPin size={12} /> {launch.location}</p></div><StatusBadge status={launch.status} /></div><div className="la-card-date"><span><CalendarDays size={13} /> {launch.date}</span><span><Clock3 size={13} /> {launch.time}</span><span><BadgeCheck size={13} /> {launch.readiness}</span></div><dl className="la-card-metrics"><div><dt>Invited</dt><dd>{launch.invited}</dd></div><div><dt>Registrations</dt><dd>{launch.registrations}</dd></div><div><dt>Attending</dt><dd>{launch.attending}</dd></div><div><dt>Qualified Leads</dt><dd>{launch.leads}</dd></div></dl></div><button className="wa-more" type="button" aria-label={`More options for ${launch.title}`}><MoreHorizontal size={18} /></button></article>
}

function AuctionCard({ auction }) {
  return <article className="la-card auction-card"><img src={auction.image} alt="" /><div className="la-card-main"><div className="la-card-heading"><div><span className="la-card-kicker">Property auction</span><h3>{auction.title}</h3><p><MapPin size={12} /> {auction.address}</p></div><StatusBadge status={auction.status} /></div><div className="la-card-date"><span><CalendarDays size={13} /> {auction.date}</span><span><Clock3 size={13} /> {auction.time}</span><span><BadgeCheck size={13} /> Documents {auction.documents.toLowerCase()}</span></div><dl className="la-card-metrics"><div><dt>Guide Price</dt><dd>{auction.guidePrice}</dd></div><div><dt>Registered Bidders</dt><dd>{auction.bidders}</dd></div><div><dt>Property Views</dt><dd>{auction.viewings}</dd></div><div><dt>Documents</dt><dd>{auction.documents}</dd></div></dl></div><button className="wa-more" type="button" aria-label={`More options for ${auction.title}`}><MoreHorizontal size={18} /></button></article>
}

function OverviewPanel({ tabs, activeTab, setActiveTab, action, placeholder, children, totalLabel }) {
  return <section className="wa-campaigns-panel"><div className="wa-panel-toolbar"><div className="wa-tabs" role="tablist">{tabs.map((tab) => <button className={activeTab === tab ? 'wa-tab-active' : ''} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</div><button className="wa-primary-button" type="button">{action} <ChevronRight size={16} /></button></div><div className="wa-campaigns-content"><WorkspaceFilters placeholder={placeholder} /><div className="wa-campaign-list">{children}</div><footer className="wa-list-footer"><span>{totalLabel}</span><div aria-label="Pagination">{[1, 2, 3].map((page) => <button type="button" className={`wa-page-number ${page === 1 ? 'wa-page-number-active' : ''}`} key={page}>{page}</button>)}</div></footer></div></section>
}

export function LaunchesOverview() {
  const [activeTab, setActiveTab] = useState(launchTabs[0])
  return <div className="wa-page launches-page"><OverviewStats stats={launchStats} label="Launch performance" /><OverviewPanel tabs={launchTabs} activeTab={activeTab} setActiveTab={setActiveTab} action="Create Launch" placeholder="Search launches..." totalLabel="Showing 1–3 of 6 launches">{launches.map((launch) => <LaunchCard launch={launch} key={launch.id} />)}</OverviewPanel></div>
}

export function AuctionsOverview() {
  const [activeTab, setActiveTab] = useState(auctionTabs[0])
  return <div className="wa-page auctions-page"><OverviewStats stats={auctionStats} label="Auction performance" /><OverviewPanel tabs={auctionTabs} activeTab={activeTab} setActiveTab={setActiveTab} action="Create Auction" placeholder="Search auctions..." totalLabel="Showing 1–3 of 9 auctions">{auctions.map((auction) => <AuctionCard auction={auction} key={auction.id} />)}</OverviewPanel></div>
}
