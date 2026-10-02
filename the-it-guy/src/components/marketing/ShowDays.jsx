import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { canPersistMarketingEvents, listMarketingEvents } from '../../services/marketingEventRepository'
import './ShowDaysLanding.css'
import Modal from '../ui/Modal'
import { buildShowDayMetrics, getShowDayAction } from '../../services/showDayWorkspaceModel'
import { useOrganisation } from '../../context/OrganisationContext'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  UserRound,
  UsersRound,
} from 'lucide-react'
import {
  showDayChecklist,
  showDayDetail,
  showDayDetailTabs,
  showDays,
} from '../../data/showDays'
import { useMarketingEvents } from '../../lib/marketingEventStore'
import { checkInMarketingEventRsvp, listMarketingEventRsvps, processMarketingEventConversion, updateMarketingEventRsvpInterest } from '../../services/marketingEventOperationsService'

const LANDING_TABS = ['All show days', 'Upcoming', 'Completed', 'Draft', 'Cancelled']
const statIcons = { 'show-days': CalendarDays, registrations: UsersRound, attendees: Eye, attendance: TrendingUp, leads: UserRound }

export function ShowDaysStats({ events = [], loading = false }) {
  const total = (key) => events.reduce((sum, event) => sum + Math.max(0, Number(event[key]) || 0), 0)
  const registrations = total('registrations')
  const stats = [
    { id: 'show-days', label: 'Show days', value: events.length, detail: 'Across your event workspace' },
    { id: 'registrations', label: 'Registrations', value: registrations, detail: 'Visitors registered' },
    { id: 'attendees', label: 'Attendees', value: total('attendees'), detail: 'Visitors checked in' },
    { id: 'attendance', label: 'Attendance rate', value: registrations ? `${Math.round(total('attendees') / registrations * 100)}%` : '—', detail: 'Check-ins ÷ registrations' },
    { id: 'leads', label: 'Interested leads', value: total('interestedLeads'), detail: 'Recorded buyer interest' },
  ]
  return <section className="show-landing-stats" aria-label="Show day performance">{stats.map((stat) => { const Icon = statIcons[stat.id]; return <article className={`show-landing-stat show-landing-stat-${stat.id}`} key={stat.id}><div><span>{stat.label}</span><Icon size={19} /></div><strong>{loading ? '—' : stat.value}</strong><small>{stat.detail}</small></article> })}</section>
}

export function ShowDaysFilters({ query, onQuery, sort, onSort }) {
  return <section className="show-landing-filters" aria-label="Show day filters"><label><Search size={18} /><input type="search" aria-label="Search show days" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by property or address" /></label><select aria-label="Sort show days" value={sort} onChange={(event) => onSort(event.target.value)}><option value="newest">Newest events first</option><option value="oldest">Oldest events first</option><option value="registrations">Most registrations</option><option value="title">Property A–Z</option></select></section>
}

function ShowDayStatus({ status }) {
  return <span className={`wa-status show-status show-status-${status.toLowerCase()}`}>{status}</span>
}

export function ShowDayCard({ showDay, onOpen }) {
  const status = showDay.status || 'Draft'
  const [now] = useState(() => Date.now())
  const ended = status.toLowerCase() === 'upcoming' && showDay.endsAt && new Date(showDay.endsAt).getTime() < now
  return <article className="show-landing-event"><button className="show-landing-property" type="button" onClick={() => onOpen(showDay.id)} aria-label={`View show day: ${showDay.title}`}>
    {showDay.image ? <img src={showDay.image} alt="" /> : <span className="show-landing-image-placeholder"><Home size={30} /></span>}
    <div><div className="show-landing-property-heading"><h3>{showDay.title || 'Untitled show day'}</h3><ShowDayStatus status={status} /></div><p><MapPin size={15} />{showDay.address || 'Address to be confirmed'}</p><div className="show-landing-schedule"><span><CalendarDays size={15} />{showDay.date || 'Date to be confirmed'}</span><span><Clock3 size={15} />{showDay.time || 'Time to be confirmed'}</span>{showDay.hostAgent || showDay.hostName ? <span><UserRound size={15} />{showDay.hostAgent || showDay.hostName}</span> : null}</div>{ended ? <small className="show-landing-ended">Event has ended · review its status</small> : null}</div><ChevronRight className="show-landing-open-icon" size={20} />
    </button><div className="show-landing-event-footer"><dl>{[['Registrations', showDay.registrations], ['Confirmed', showDay.confirmed], ['Attendees', showDay.attendees], ['Interested leads', showDay.interestedLeads]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Math.max(0, Number(value) || 0)}</dd></div>)}</dl><button type="button" onClick={() => onOpen(showDay.id)}>View show day<ChevronRight size={16} /></button></div></article>
}

export function ShowDaysOverview({ onOpenShowDay, onCreateShowDay }) {
  const { organisation } = useOrganisation()
  const organisationId = organisation?.organisationId || organisation?.id || ''
  const shared = canPersistMarketingEvents(organisationId)
  const [result, setResult] = useState({ organisationId: '', events: [], error: '', warning: '', loading: true })
  const [activeTab, setActiveTab] = useState('All show days')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (!organisationId) return
        if (!shared) {
          let local = []
          try { const stored = JSON.parse(window.localStorage.getItem('arch9.marketing-events.v1') || '{}'); local = Array.isArray(stored.showDays) ? stored.showDays : [] } catch { /* Empty local planner if storage is unavailable. */ }
          if (alive) setResult({ organisationId, events: local, error: '', warning: '', loading: false })
          return
        }
        const records = await listMarketingEvents(organisationId, 'showDays')
        const rows = await Promise.allSettled(records.map((event) => event.publicToken ? listMarketingEventRsvps(event.id) : Promise.resolve(null)))
        if (!alive) return
        const events = records.map((event, index) => ({ ...event, ...buildShowDayMetrics(event, rows[index].status === 'fulfilled' ? rows[index].value : null) }))
        setResult({ organisationId, events, loading: false, error: '', warning: rows.some((item) => item.status === 'rejected') ? 'Some registration records could not load. Those events show their last saved totals.' : '' })
      } catch (error) { if (alive) setResult({ organisationId, events: [], loading: false, warning: '', error: error.message || 'Could not load show days.' }) }
    }
    void load()
    return () => { alive = false }
  }, [organisationId, shared])
  const current = result.organisationId === organisationId ? result : { events: [], loading: true, error: '', warning: '' }
  const events = current.events
  const visible = useMemo(() => events.filter((event) => (activeTab === 'All show days' || (event.status || 'Draft').toLowerCase() === activeTab.toLowerCase()) && `${event.title} ${event.address}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''))
    if (sort === 'registrations') return (Number(b.registrations) || 0) - (Number(a.registrations) || 0)
    const date = (event) => Date.parse(event.startsAt || event.date || event.createdAt) || 0
    return sort === 'oldest' ? date(a) - date(b) : date(b) - date(a)
  }), [activeTab, events, query, sort])
  return <div className="wa-page show-days-page show-landing-page"><header className="show-landing-header"><div><h1>Show days</h1><p>Your properties, visitors and follow-ups in one place.</p></div><button className="wa-primary-button" type="button" onClick={onCreateShowDay}>Create show day<ChevronRight size={17} /></button></header>
    <ShowDaysStats events={events} loading={current.loading} />
    <section className="show-landing-panel"><header><div><h2>Your show days</h2><p>{current.loading ? 'Loading your events…' : `${events.length} ${events.length === 1 ? 'event' : 'events'} in ${shared ? 'your organisation' : 'this device’s local plan'}`}</p></div>{!shared ? <span className="show-landing-local">Local planner</span> : null}</header>
      <div className="show-landing-tabs" role="tablist" aria-label="Show day status">{LANDING_TABS.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)} key={tab}>{tab}<span>{current.loading ? '—' : events.filter((event) => tab === 'All show days' || (event.status || 'Draft').toLowerCase() === tab.toLowerCase()).length}</span></button>)}</div>
      <div className="show-landing-content"><ShowDaysFilters query={query} onQuery={setQuery} sort={sort} onSort={setSort} />{current.error ? <p className="show-operations-error" role="alert">{current.error}</p> : null}{current.warning ? <p className="show-landing-warning" role="status">{current.warning}</p> : null}
        <div className="show-landing-list">{current.loading ? <div className="show-landing-empty"><CalendarDays size={30} /><h3>Loading show days</h3><p>Getting your event and visitor records.</p></div> : visible.length ? visible.map((event) => <ShowDayCard showDay={event} onOpen={onOpenShowDay} key={event.id} />) : !current.error ? <div className="show-landing-empty"><CalendarDays size={30} /><h3>{events.length ? 'No matching show days' : 'Make your next viewing an event'}</h3><p>{events.length ? 'Try another status or search for a different property.' : 'Choose a listing, set a date and bring your visitors together.'}</p><button type="button" className="wa-secondary-button" onClick={events.length ? () => { setQuery(''); setActiveTab('All show days') } : onCreateShowDay}>{events.length ? 'Clear filters' : 'Create your first show day'}</button></div> : null}</div>
        <footer>Showing {visible.length} of {events.length} show days</footer></div>
    </section></div>
}

export function ShowDayHeader({ onBack, detail, onEdit, onAction }) {
  const action = getShowDayAction(detail)
  return <><div className="show-day-detail-top"><nav aria-label="Breadcrumb"><button type="button" onClick={onBack}>Events</button><ChevronRight size={13} /><button type="button" onClick={onBack}>Show Days</button><ChevronRight size={13} /><span>{detail.title}</span></nav></div>
    <header className="show-event-banner" style={detail.image ? { backgroundImage: `linear-gradient(90deg, rgba(14,32,42,.88), rgba(14,32,42,.48)), url(${JSON.stringify(detail.image)})` } : undefined}>
      <div className="show-event-banner-copy"><ShowDayStatus status={detail.status || 'Draft'} /><h1>{detail.title}</h1><p><MapPin size={16} />{detail.address || 'Address to be confirmed'}</p><div className="show-event-meta"><span><CalendarDays size={16} />{detail.date}</span><span><Clock3 size={16} />{detail.time}</span><span><UserRound size={16} />{detail.hostAgent || 'Host unassigned'}</span></div></div>
      <div className="show-event-banner-actions">{detail.listingId ? <Link className="wa-secondary-button" to={`/agent/listings/${encodeURIComponent(detail.listingId)}`}>View listing <Eye size={16} /></Link> : null}<button className="wa-secondary-button" type="button" onClick={onEdit}>Edit show day</button><button className="wa-primary-button" type="button" onClick={() => onAction(action.tab)}>{action.label}<ChevronRight size={16} /></button></div>
    </header></>
}

export function ShowDayTabs({ activeTab, onChange, metrics = {} }) {
  const counts = { registrations: metrics.registrations, attendees: metrics.attendees, leads: metrics.leads ?? metrics.interestedLeads }
  return <div className="show-event-menu" role="tablist" aria-label="Show day workspace">{showDayDetailTabs.map((tab) => <button id={`show-tab-${tab.id}`} aria-controls="show-event-content" className={activeTab === tab.id ? 'show-event-menu-active' : ''} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => onChange(tab.id)} key={tab.id}>{tab.label}{counts[tab.id] !== undefined ? <span>{counts[tab.id]}</span> : null}</button>)}</div>
}

export function ShowDaySummaryCard({ detail }) {
  const stats = [['Registrations', detail.registrations, UsersRound], ['Confirmed', detail.confirmed, CheckCircle2], ['Attendees', detail.attendees, UserRound], ['Attendance rate', detail.attendanceRate, TrendingUp], ['Interested leads', detail.interestedLeads, Home]]
  return <section className="show-event-stats" aria-label="Event results">{stats.map(([label, value, icon]) => <article key={label}><span>{createElement(icon, { size: 19 })}</span><div><p>{label}</p><strong>{value}</strong></div></article>)}</section>
}

export function ShowDayDetailsCard({ detail }) {
  const listing = detail.listing || {}
  const price = Number(listing.price || listing.askingPrice || 0)
  const features = [['Bedrooms', listing.bedrooms], ['Bathrooms', listing.bathrooms], ['Parking', listing.parking || listing.garages]].filter(([, value]) => value != null)
  return <section className="show-workspace-card show-event-property"><div className="show-section-heading"><span className="show-section-icon"><Home size={20} /></span><div><h2>Property & hosting</h2><p>The home, the host and the visitor briefing.</p></div></div>
    <div className="show-event-property-preview">{detail.image ? <img src={detail.image} alt={detail.imageAlt || detail.title} /> : null}<div>{detail.listingId ? <Link to={`/agent/listings/${encodeURIComponent(detail.listingId)}`}>{listing.title || detail.title}<ChevronRight size={15} /></Link> : <h3>{listing.title || detail.title}</h3>}<p>{detail.address}</p><strong>{price ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(price) : 'Asking price not recorded'}</strong></div></div>
    {features.length ? <dl className="show-property-features">{features.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    <div className="show-event-host"><span>{detail.hostAvatarUrl ? <img src={detail.hostAvatarUrl} alt="" /> : detail.hostInitials || <UserRound size={22} />}</span><div><small>Host agent</small><strong>{detail.hostAgent || 'Unassigned'}</strong>{detail.contactNumber ? <a href={`tel:${detail.contactNumber}`}><Phone size={14} />{detail.contactNumber}</a> : null}{detail.email ? <a href={`mailto:${detail.email}`}><Mail size={14} />{detail.email}</a> : null}{!detail.contactNumber && !detail.email ? <p>Contact details not recorded.</p> : null}</div></div>
    <div className="show-event-notes"><h3>Event notes</h3><p>{detail.description || detail.registrationMessage || 'No event notes added yet.'}</p></div>
  </section>
}

export function ShowDayChecklist({ detail = {} }) {
  const items = Array.isArray(detail.checklist) ? detail.checklist : showDayChecklist.map((item) => ({ ...item, status: 'Pending' }))
  const complete = items.filter((item) => String(item.status).toLowerCase() === 'completed').length
  return <section className="show-workspace-card show-event-readiness"><div className="show-section-heading"><span className="show-section-icon"><ClipboardCheck size={20} /></span><div><h2>Event readiness</h2><p>{complete} of {items.length} tasks complete · {items.length - complete} outstanding</p></div></div><progress aria-label="Event readiness" value={complete} max={items.length || 1} />{!Array.isArray(detail.checklist) ? <p className="show-readiness-note">No task updates recorded yet.</p> : null}
    <ul>{items.map((item) => { const status = String(item.status || 'Pending').toLowerCase(); const icon = status === 'completed' ? CheckCircle2 : status === 'scheduled' ? Clock3 : Circle; return <li key={item.id || item.label} className={`show-task-${status}`}><span className="show-task-icon">{createElement(icon, { size: 18 })}</span><div><strong>{item.label}</strong><small>{item.ownerName || item.owner || 'Unassigned'}</small></div><span className={`show-check-status show-check-${status}`}>{item.status || 'Pending'}</span></li> })}</ul>
  </section>
}

function ShowDayOverviewTab({ detail, metrics, onChange }) {
  return <><div className="show-event-overview"><ShowDayDetailsCard detail={detail} /><ShowDayChecklist detail={detail} /></div><section className="show-workspace-card show-event-next"><div><span className="show-event-eyebrow">{getShowDayAction(detail).tab === 'leads' ? 'After the event' : 'Next steps'}</span><h2>Results & next actions</h2><p>{metrics.interestedLeads} interested {metrics.interestedLeads === 1 ? 'buyer' : 'buyers'} · {metrics.outstandingFollowUps == null ? 'Open Leads to review follow-up status.' : `${metrics.outstandingFollowUps} awaiting a follow-up outcome.`}</p></div><button className="wa-primary-button" type="button" onClick={() => onChange('leads')}>View leads<ChevronRight size={16} /></button></section></>
}

export function ShowDayPromotionCard({ detail }) {
  const rsvpUrl = detail.publicToken ? `${window.location.origin}/marketing/rsvp/${encodeURIComponent(detail.publicToken)}` : ''
  const [qrResult, setQrResult] = useState({ source: '', image: '' })
  const qr = qrResult.source === rsvpUrl ? qrResult.image : ''
  const [notice, setNotice] = useState('')
  useEffect(() => { let alive = true; if (rsvpUrl) QRCode.toDataURL(rsvpUrl, { width: 240, margin: 2 }).then((url) => { if (alive) setQrResult({ source: rsvpUrl, image: url }) }).catch(() => { if (alive) setNotice('QR code could not be generated. Use the RSVP link instead.') }); return () => { alive = false } }, [rsvpUrl])
  const copy = async () => { try { await navigator.clipboard.writeText(rsvpUrl); setNotice('RSVP link copied.') } catch { setNotice('Could not copy. Select and copy the RSVP link below.') } }
  return <section className="show-workspace-card show-event-promote"><div><h2>Promote your show day</h2><p>Share the RSVP page with prospective visitors.</p>{rsvpUrl ? <><label>Public RSVP link<input value={rsvpUrl} readOnly onFocus={(event) => event.target.select()} /></label><div className="show-event-share-actions"><a className="wa-secondary-button" href={rsvpUrl} target="_blank" rel="noreferrer"><Eye size={16} />Preview RSVP page</a><button className="wa-secondary-button" type="button" onClick={() => void copy()}><Copy size={16} />Copy link</button><a className="wa-primary-button" href={`https://wa.me/?text=${encodeURIComponent(`${detail.title}\n${rsvpUrl}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />Share via WhatsApp</a></div></> : <p className="marketing-event-empty">Save this event to make its RSVP link available.</p>}{notice ? <p role="status">{notice}</p> : null}</div>{qr ? <div className="show-event-qr"><img src={qr} alt="Show day RSVP QR code" /><a href={qr} download="show-day-rsvp-qr.png">Download QR code</a></div> : null}</section>
}

function ShowDayRegistrations({ detail, organisationId, rows, loading, mode = 'registrations', onRefresh }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const visible = (rows || []).filter((row) => (mode !== 'attendees' || row.status !== 'cancelled') && (mode !== 'leads' || row.crm_lead_id || ['high', 'medium'].includes(row.interest_level) || ['attended_interested', 'attended_follow_up'].includes(row.conversion_outcome)) && (filter === 'all' || row.status === filter) && `${row.full_name} ${row.email} ${row.mobile}`.toLowerCase().includes(query.toLowerCase()))
  const run = async (row, operation) => { setBusy(row.id); setError(''); try { await operation(); await onRefresh() } catch (failure) { setError(failure.message || 'The change could not be saved.') } finally { setBusy('') } }
  const title = mode === 'attendees' ? 'Attendees' : mode === 'leads' ? 'Leads & follow-up' : 'Registrations'
  return <section className="show-workspace-card show-operations-card"><div className="show-operations-heading"><div><h2>{title}</h2><p>{mode === 'attendees' ? 'Check in visitors and review recorded arrival times.' : mode === 'leads' ? 'Review interest and record the next step for each visitor.' : 'Manage RSVPs and check visitors in when they arrive.'}</p></div></div><div className="show-event-filters"><label><Search size={17} /><input aria-label={`Search ${title}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or mobile" /></label><select aria-label="RSVP status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></div>{error ? <p className="show-operations-error" role="alert">{error}</p> : null}
    {loading ? <p className="marketing-event-empty">Loading registrations…</p> : <div className="show-operations-list">{visible.length ? visible.map((row) => <article key={row.id}><div><strong>{row.full_name}</strong><span>{row.email} · {row.mobile}</span><span>{row.status} · {row.guest_count || 1} guest(s){row.checked_in_at ? ` · Arrived ${new Date(row.checked_in_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}` : ''}</span>{row.note ? <span>{row.note}</span> : null}{mode === 'leads' ? <><span>{row.conversion_processed_at ? 'Outcome recorded' : 'Awaiting follow-up outcome'} · {row.assigned_agent_name || 'See CRM lead for assignment'}</span>{row.crm_lead_id ? <Link to={`/pipeline/leads/${encodeURIComponent(row.crm_lead_id)}`}>Open CRM lead<ChevronRight size={13} /></Link> : null}</> : null}</div><label>Interest<select aria-label={`Interest for ${row.full_name}`} disabled={Boolean(busy)} value={row.interest_level || ''} onChange={(event) => { const value = event.target.value; void run(row, () => updateMarketingEventRsvpInterest(row.id, value)) }}><option value="">Not set</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="not_interested">Not interested</option></select></label><label>Outcome<select aria-label={`Outcome for ${row.full_name}`} disabled={Boolean(busy)} value={row.conversion_outcome || ''} onChange={(event) => { const value = event.target.value; if (value) void run(row, () => processMarketingEventConversion({ rsvp: row, event: detail, organisationId, outcome: value })) }}><option value="">Set outcome</option><option value="attended_interested">Interested</option><option value="attended_follow_up">Follow up</option><option value="no_show">No show</option><option value="cancelled">Cancelled</option><option value="not_a_fit">Not a fit</option></select></label><button disabled={Boolean(busy) || row.status === 'cancelled'} className={row.checked_in_at ? 'wa-secondary-button' : 'wa-primary-button'} type="button" onClick={() => void run(row, () => checkInMarketingEventRsvp(row.id, !row.checked_in_at))}>{busy === row.id ? 'Saving…' : row.checked_in_at ? 'Undo check-in' : 'Check in'}</button></article>) : <p className="marketing-event-empty">No matching {title.toLowerCase()} recorded.</p>}</div>}
  </section>
}

function ShowDayActivity({ detail, rows }) {
  const entries = [{ id: 'created', date: detail.createdAt, text: 'Show day created' }, { id: 'updated', date: detail.updatedAt !== detail.createdAt ? detail.updatedAt : null, text: 'Event last updated' }, ...(rows || []).flatMap((row) => [{ id: `${row.id}-registered`, date: row.submitted_at, text: `${row.full_name} registered` }, { id: `${row.id}-arrived`, date: row.checked_in_at, text: `${row.full_name} checked in` }, { id: `${row.id}-outcome`, date: row.conversion_processed_at, text: `${row.full_name}: ${(row.conversion_outcome || 'outcome recorded').replaceAll('_', ' ')}` }])].filter((entry) => entry.date).sort((a, b) => new Date(b.date) - new Date(a.date))
  return <section className="show-workspace-card show-event-activity"><h2>Recorded activity</h2><p>Event and visitor milestones from the available records.</p>{entries.length ? <ol>{entries.map((entry) => <li key={entry.id}><span><Clock3 size={16} /></span><div><strong>{entry.text}</strong><time dateTime={entry.date}>{new Date(entry.date).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</time></div></li>)}</ol> : <p className="marketing-event-empty">No activity timestamps recorded yet.</p>}</section>
}

export function ShowDayDetail({ onBack, showDayId }) {
  const [activeTab, setActiveTab] = useState('overview')
  const { organisation } = useOrganisation()
  const organisationId = organisation?.organisationId || organisation?.id || ''
  const { events, updateEvent, persistenceError } = useMarketingEvents('showDays', showDays, { organisationId })
  const detail = events.find((event) => event.id === showDayId) || (showDayId ? { id: showDayId, title: 'Show day unavailable', status: 'Draft', date: 'Date to be confirmed', time: 'Time to be confirmed' } : showDayDetail)
  const [records, setRecords] = useState({ eventId: '', rows: null })
  const [loadError, setLoadError] = useState('')
  const [editor, setEditor] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const rows = records.eventId === detail.id ? records.rows : null
  const refresh = useCallback(async () => { if (!detail.publicToken) return; const next = await listMarketingEventRsvps(detail.id); setRecords({ eventId: detail.id, rows: next }); setLoadError('') }, [detail.id, detail.publicToken])
  useEffect(() => { let alive = true; setActiveTab('overview'); setLoadError(''); if (detail.publicToken) listMarketingEventRsvps(detail.id).then((next) => { if (alive) setRecords({ eventId: detail.id, rows: next }) }).catch((error) => { if (alive) setLoadError(error.message || 'Could not load registrations.') }); return () => { alive = false } }, [detail.id, detail.publicToken])
  const metrics = buildShowDayMetrics(detail, rows)
  const openEditor = () => { setSaveError(''); setEditor({ title: detail.title, address: detail.address, description: detail.description, hostName: detail.hostAgent || '', status: detail.status || 'Draft' }) }
  const save = async (event) => { event.preventDefault(); setSaving(true); setSaveError(''); try { await updateEvent(detail.id, { title: editor.title, address: editor.address, description: editor.description, status: editor.status, hostAgent: editor.hostName, hostName: editor.hostName, metadata: { ...detail.metadata, hostName: editor.hostName } }); setEditor(null) } catch (error) { setSaveError(error.message || 'Could not save show day.') } finally { setSaving(false) } }
  const content = activeTab === 'overview' ? <ShowDayOverviewTab detail={detail} metrics={metrics} onChange={setActiveTab} /> : activeTab === 'promote' ? <ShowDayPromotionCard detail={detail} /> : activeTab === 'activity' ? <ShowDayActivity detail={detail} rows={rows} /> : <ShowDayRegistrations key={`${detail.id}-${activeTab}`} detail={detail} organisationId={organisationId} rows={rows} loading={Boolean(detail.publicToken && !rows && !loadError)} mode={activeTab} onRefresh={refresh} />
  return <div className="wa-page show-days-page show-day-detail-page"><ShowDayHeader onBack={onBack} detail={detail} onEdit={openEditor} onAction={setActiveTab} /><ShowDayTabs activeTab={activeTab} onChange={setActiveTab} metrics={metrics} /><ShowDaySummaryCard detail={metrics} />{loadError || persistenceError ? <p className="show-operations-error" role="alert">{loadError || persistenceError} Displayed totals use the saved event snapshot until records load.</p> : null}<div id="show-event-content" role="tabpanel" aria-labelledby={`show-tab-${activeTab}`}>{content}</div>
    <Modal open={Boolean(editor)} title="Edit show day" onClose={() => { if (!saving) setEditor(null) }}>{editor ? <form className="show-event-edit" onSubmit={(event) => void save(event)}>{[['title', 'Event title'], ['address', 'Address'], ['hostName', 'Host agent']].map(([key, label]) => <label key={key}>{label}<input required={key === 'title'} value={editor[key] || ''} onChange={(event) => setEditor({ ...editor, [key]: event.target.value })} /></label>)}<label>Status<select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value })}>{['Draft', 'Upcoming', 'Completed', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></label><label>Event notes<textarea value={editor.description || ''} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>{saveError ? <p className="show-operations-error" role="alert">{saveError}</p> : null}<div><button className="wa-secondary-button" type="button" disabled={saving} onClick={() => setEditor(null)}>Cancel</button><button className="wa-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div></form> : null}</Modal>
  </div>
}
