import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useOrganisation } from '../../context/OrganisationContext'
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
  showDaysTabs,
} from '../../data/showDays'
import { formatEventDate, useMarketingEvents } from '../../lib/marketingEventStore'
import { listMarketingEventListings } from '../../services/marketingEventRepository'
import { getMarketingEventReadiness } from '../../services/marketingEventReadinessService'
import { checkInMarketingEventRsvp, getMarketingEventOperations, listMarketingEventRsvps, processMarketingEventConversion, retryMarketingEventOperation, updateMarketingEventRsvpInterest } from '../../services/marketingEventOperationsService'

const statIcons = { 'show-days': CalendarDays, registrations: UsersRound, attendees: Eye, attendance: CheckCircle2 }

export function ShowDaysStats({ events = showDays }) {
  const registrations = events.reduce((total, event) => total + Number(event.registrations || 0), 0)
  const attendees = events.reduce((total, event) => total + Number(event.attendees || 0), 0)
  const stats = [
    { id: 'show-days', label: 'Show Days', value: String(events.length), detail: 'In your local plan' },
    { id: 'registrations', label: 'Registrations', value: String(registrations), detail: 'Across show days' },
    { id: 'attendees', label: 'Attendees', value: String(attendees), detail: 'Checked in' },
    { id: 'attendance', label: 'Attendance Rate', value: registrations ? `${Math.round((attendees / registrations) * 100)}%` : '0%', detail: 'Across show days' },
  ]
  return (
    <section className="wa-stats" aria-label="Show day performance">
      {stats.map((stat) => { const Icon = statIcons[stat.id]; return <article className={`wa-stat show-stat show-stat-${stat.id}`} key={stat.id}><span className="wa-stat-icon"><Icon size={19} /></span><span className="wa-stat-copy"><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.detail}</small></span></article> })}
    </section>
  )
}

export function ShowDaysFilters({ query, onQuery, status, onStatus }) {
  return <section className="wa-filter-row" aria-label="Show day filters"><label className="wa-search"><Search size={17} /><span className="sr-only">Search show days</span><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search show days..." /></label><label className="wa-filter-control"><span className="sr-only">Filter show days by status</span><select value={status} onChange={(event) => onStatus(event.target.value)}><option value="All">All statuses</option><option>Upcoming</option><option>Completed</option><option>Draft</option><option>Cancelled</option></select><ChevronDown size={15} /></label><span className="wa-filter-control"><CalendarDays size={16} /> Local event plan</span></section>
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

function CreateShowDayForm({ onClose, onCreate, organisationId }) {
  const [values, setValues] = useState({ title: '', address: '', date: '', time: '10:00', endTime: '14:00', status: 'Draft', listingId: '', listingLabel: '', description: '' })
  const [listings, setListings] = useState([])
  const [error, setError] = useState('')
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))
  useEffect(() => { if (!organisationId) return; listMarketingEventListings(organisationId).then(setListings).catch((loadError) => setError(loadError.message || 'Could not load listings.')) }, [organisationId])
  const selectListing = (event) => { const listing = listings.find((row) => row.id === event.target.value); setValues((current) => ({ ...current, listingId: listing?.id || '', listingLabel: listing?.label || '', title: current.title || listing?.label || '', address: current.address || listing?.label || '' })) }
  const submit = async (event) => { event.preventDefault(); if (!values.title.trim() || !values.date) return; if (organisationId && !values.listingId) { setError('Link this show day to a saved listing.'); return }; await onCreate({ ...values, startDate: values.date, startTime: values.time, endTime: values.endTime, title: values.title.trim(), date: formatEventDate(values.date), dayDate: formatEventDate(values.date), registrations: '0', attendees: '0', confirmed: '0', interestedLeads: '0', attendanceRate: '0%', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=520&q=84', imageAlt: 'Property prepared for a show day' }); onClose() }
  return <section className="marketing-event-form" aria-label="Create show day"><div><div><span>New event</span><h2>Create show day</h2><p>Link the listing, schedule and public RSVP before promoting the event.</p></div><button className="wa-more" type="button" aria-label="Close show day form" onClick={onClose}>×</button></div><form onSubmit={submit}>{organisationId ? <label>Linked listing<select required value={values.listingId} onChange={selectListing}><option value="">Select saved listing</option>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.label}</option>)}</select></label> : null}<label>Property title<input required value={values.title} onChange={update('title')} placeholder="e.g. 3 Bedroom Home in Constantia Park" /></label><label>Address<input required value={values.address} onChange={update('address')} placeholder="Street, suburb, city" /></label><label>Date<input required type="date" value={values.date} onChange={update('date')} /></label><label>Start time<input required type="time" value={values.time} onChange={update('time')} /></label><label>End time<input required type="time" value={values.endTime} onChange={update('endTime')} /></label><label>Status<select value={values.status} onChange={update('status')}><option>Draft</option><option>Upcoming</option></select></label><label>Description<textarea value={values.description} onChange={update('description')} placeholder="Visitor and host briefing" /></label>{error ? <p className="wa-error">{error}</p> : null}<footer><button type="button" className="wa-secondary-button" onClick={onClose}>Cancel</button><button className="wa-primary-button" type="submit">Save show day <ChevronRight size={16} /></button></footer></form></section>
}

export function ShowDaysOverview({ onOpenShowDay }) {
  const { organisation } = useOrganisation()
  const organisationId = organisation?.organisationId || organisation?.id || ''
  const { events, createEvent } = useMarketingEvents('showDays', showDays, { organisationId })
  const [activeTab, setActiveTab] = useState(showDaysTabs[0])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [creating, setCreating] = useState(false)
  const visible = useMemo(() => events.filter((event) => (activeTab === 'All Show Days' || event.status === activeTab) && (status === 'All' || event.status === status) && `${event.title} ${event.address}`.toLowerCase().includes(query.toLowerCase())), [activeTab, events, query, status])
  return (
    <div className="wa-page show-days-page">
      <ShowDaysStats events={events} />
      <section className="wa-campaigns-panel"><div className="wa-panel-toolbar"><div className="wa-tabs" role="tablist" aria-label="Show day status">{showDaysTabs.map((tab) => <button className={activeTab === tab ? 'wa-tab-active' : ''} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</div><button className="wa-primary-button" type="button" onClick={() => setCreating(true)}>Create Show Day <ChevronRight size={16} /></button></div><div className="wa-campaigns-content"><ShowDaysFilters query={query} onQuery={setQuery} status={status} onStatus={setStatus} />{creating ? <CreateShowDayForm organisationId={organisationId} onClose={() => setCreating(false)} onCreate={createEvent} /> : null}<div className="wa-campaign-list">{visible.length ? visible.map((showDay) => <ShowDayCard showDay={showDay} onOpen={onOpenShowDay} key={showDay.id} />) : <p className="marketing-event-empty">No show days match these filters.</p>}</div><footer className="wa-list-footer"><span>Showing {visible.length} of {events.length} show days</span></footer></div></section>
    </div>
  )
}

export function ShowDayHeader({ onBack, detail, onEdit }) {
  return (
    <>
      <div className="show-day-detail-top"><nav aria-label="Breadcrumb"><button type="button" onClick={onBack}>Events</button><ChevronRight size={13} /><button type="button" onClick={onBack}>Show Days</button><ChevronRight size={13} /><span>{detail.title}</span></nav><button className="wa-secondary-button" type="button" onClick={onEdit}>Edit Show Day</button></div>
      <header className="show-day-property-header"><img src={detail.image} alt={detail.imageAlt} /><div><h1>{detail.title}</h1><p>{detail.address}</p><div><span><CalendarDays size={14} /> {detail.date}</span><span><Clock3 size={14} /> {detail.time}</span></div></div><ShowDayStatus status={detail.status} /><button className="wa-more" type="button" aria-label="More show day options"><MoreHorizontal size={18} /></button></header>
    </>
  )
}

export function ShowDayTabs({ activeTab, onChange, detail }) {
  const counts = { registrations: detail.registrations, attendees: detail.attendees, leads: detail.interestedLeads }
  return <div className="show-day-detail-tabs" role="tablist" aria-label="Show day workspace">{showDayDetailTabs.map((tab) => <button className={activeTab === tab.id ? 'show-day-detail-tab-active' : ''} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => onChange(tab.id)} key={tab.id}>{tab.label}{counts[tab.id] !== undefined ? ` (${counts[tab.id]})` : ''}</button>)}</div>
}

function DetailRow({ icon, label, children }) {
  return <div className="show-detail-row"><span className="show-detail-row-label">{createElement(icon, { size: 15 })} {label}</span><div>{children}</div></div>
}

export function ShowDayDetailsCard({ detail }) {
  return (
    <section className="show-workspace-card show-details-card"><h2>Show Day Details</h2><div className="show-details-list"><DetailRow icon={CalendarDays} label="Date">{detail.dayDate || detail.date}</DetailRow><DetailRow icon={Clock3} label="Time">{detail.time}</DetailRow><DetailRow icon={Home} label="Property">{detail.title}</DetailRow><DetailRow icon={MapPin} label="Address">{detail.address}</DetailRow><DetailRow icon={UserRound} label="Host Agent"><span className="show-agent"><i>{detail.hostInitials || '—'}</i>{detail.hostAgent || 'Unassigned'}</span></DetailRow><DetailRow icon={Phone} label="Contact"><span className="show-contact-lines"><span>{detail.contactNumber || 'Add contact details'}</span><span><Mail size={13} /> {detail.email || 'Add contact email'}</span></span></DetailRow><DetailRow icon={Eye} label="Description"><p>{detail.description || 'Add a short property and visitor briefing.'}</p></DetailRow></div></section>
  )
}

export function ShowDaySummaryCard({ detail }) {
  const rows = [{ label: 'Registrations', value: detail.registrations, icon: UsersRound }, { label: 'Attendees', value: detail.attendees, icon: UsersRound }, { label: 'Confirmed', value: detail.confirmed, icon: CheckCircle2 }, { label: 'Attendance rate', value: detail.attendanceRate, icon: CheckCircle2 }]
  return <section className="show-workspace-card show-summary-card"><h2>Show Day Summary</h2><div>{rows.map(({ label, value, icon }) => <div className="show-summary-row" key={label}><span>{createElement(icon, { size: 16 })}</span><p><strong>{value}</strong><small>{label}</small></p></div>)}</div></section>
}

export function ShowDayChecklist({ detail, onChange }) {
  const checklist = detail?.checklist?.length ? detail.checklist : showDayChecklist
  const toggle = (item) => onChange?.(checklist.map((entry) => entry.label === item.label ? { ...entry, status: entry.status === 'Completed' ? 'Pending' : 'Completed' } : entry))
  return <section className="show-workspace-card show-checklist"><h2>Show Day Checklist</h2><div>{checklist.map((item) => <div key={item.label}><button type="button" onClick={() => toggle(item)} aria-pressed={item.status === 'Completed'}><Check size={15} /> {item.label}</button><small className={`show-check-status show-check-${item.status.toLowerCase()}`}>{item.status}</small></div>)}</div></section>
}

export function ShowDayLeadsCard({ detail, onView }) {
  return <section className="show-workspace-card show-leads-card"><h2>Interested Leads</h2><strong>{detail.interestedLeads}</strong><p>RSVPs marked high or medium interest</p><button className="wa-secondary-button" type="button" onClick={onView}>View Leads</button></section>
}

export function ShowDayPromotionCard({ detail }) {
  const readiness = detail.readiness || getMarketingEventReadiness(detail, 'showDays')
  const rsvpPath = detail.publicToken ? `/marketing/rsvp/${detail.publicToken}` : ''
  const canPromote = Boolean(rsvpPath && readiness.ready && readiness.public)
  const copyLink = () => { if (canPromote) void navigator.clipboard?.writeText(`${window.location.origin}${rsvpPath}`) }
  const emailPath = `/marketing?section=email&eventId=${encodeURIComponent(detail.id || '')}`
  return <section className="show-workspace-card show-promotion-card"><h2>Promote Show Day</h2><p>Share your show day and get more registrations.</p><p className={readiness.ready ? 'show-readiness-ready' : 'show-operations-error'}>{readiness.ready ? readiness.public ? 'RSVP is published and ready to share.' : 'Setup is complete. Set the event to Planning or Upcoming to publish RSVP.' : readiness.message}</p>{canPromote ? <Link className="show-share-whatsapp" to={rsvpPath}><MessageCircle size={15} /> Open RSVP page</Link> : <button className="show-share-whatsapp" type="button" disabled><MessageCircle size={15} /> RSVP available after publish checks</button>}<Link to={emailPath}><Mail size={15} /> Create email campaign</Link><button type="button" disabled={!canPromote} onClick={copyLink}><Copy size={15} /> Copy RSVP Link</button></section>
}

function ShowDayOverviewTab({ detail, onViewLeads, onChecklistChange }) {
  return <div className="show-detail-grid"><div className="show-detail-main"><ShowDayDetailsCard detail={detail} /><ShowDayChecklist detail={detail} onChange={onChecklistChange} /></div><aside className="show-detail-aside"><ShowDaySummaryCard detail={detail} /><ShowDayLeadsCard detail={detail} onView={onViewLeads} /><ShowDayPromotionCard detail={detail} /></aside></div>
}

function ShowDayPlaceholderTab({ tabId }) {
  const tab = showDayPlaceholderTabs[tabId]
  return <section className="show-workspace-card show-placeholder-tab"><span><Link2 size={23} /></span><h2>{tab.title}</h2><p>{tab.description}</p><div>{tab.fields.map((field) => <span key={field}><Check size={13} /> {field}</span>)}</div></section>
}

function ShowDayRegistrations({ detail, organisationId, attendeesOnly = false, onChanged }) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const refresh = useCallback(() => { if (!detail.publicToken) return; listMarketingEventRsvps(detail.id).then(setRows).catch((loadError) => setError(loadError.message || 'Could not load registrations.')) }, [detail.id, detail.publicToken])
  useEffect(() => { refresh() }, [refresh])
  const visible = attendeesOnly ? rows.filter((row) => row.checked_in_at) : rows
  const changed = async () => { refresh(); await onChanged?.() }
  const toggleCheckIn = async (row) => { await checkInMarketingEventRsvp(row.id, !row.checked_in_at); await changed() }
  const setInterest = async (row, value) => { await updateMarketingEventRsvpInterest(row.id, value); await changed() }
  const setOutcome = async (row, value) => { if (!value) return; await processMarketingEventConversion({ rsvp: row, event: detail, organisationId, outcome: value }); await changed() }
  if (!detail.publicToken) return <section className="show-workspace-card show-placeholder-tab"><h2>Save this event first</h2><p>Registration operations become available once this show day is stored in the shared event workspace.</p></section>
  return <section className="show-workspace-card show-operations-card"><div className="show-operations-heading"><div><h2>{attendeesOnly ? 'Checked-in attendees' : 'Registrations'}</h2><p>{visible.length} {attendeesOnly ? 'attendees' : 'registrations'} recorded</p></div></div>{error ? <p className="show-operations-error">{error}</p> : null}<div className="show-operations-list">{visible.length ? visible.map((row) => <article key={row.id}><div><strong>{row.full_name}</strong><span>{row.email} · {row.mobile} · {row.guest_count} guest{Number(row.guest_count) === 1 ? '' : 's'}</span></div><label>Interest<select value={row.interest_level || ''} onChange={(event) => { void setInterest(row, event.target.value) }}><option value="">Not set</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="not_interested">Not interested</option></select></label><label>Outcome<select value={row.conversion_outcome || ''} onChange={(event) => { void setOutcome(row, event.target.value) }}><option value="">Set outcome</option><option value="attended_interested">Interested</option><option value="attended_follow_up">Follow up</option><option value="no_show">No show</option><option value="cancelled">Cancelled</option><option value="not_a_fit">Not a fit</option></select></label><button className={row.checked_in_at ? 'wa-secondary-button' : 'wa-primary-button'} type="button" onClick={() => { void toggleCheckIn(row) }}>{row.checked_in_at ? 'Undo check-in' : 'Check in'}</button></article>) : <p className="marketing-event-empty">No {attendeesOnly ? 'attendees have checked in' : 'registrations yet'}.</p>}</div></section>
}

function useEventRsvps(detail) {
  const [rows, setRows] = useState([])
  useEffect(() => { if (!detail.publicToken) return; listMarketingEventRsvps(detail.id).then(setRows).catch(() => setRows([])) }, [detail.id, detail.publicToken])
  return rows
}

function ShowDayLeadsTab({ detail }) {
  const navigate = useNavigate()
  const rows = useEventRsvps(detail).filter((row) => ['high', 'medium'].includes(row.interest_level) || row.conversion_outcome === 'attended_interested')
  return <section className="show-workspace-card show-operations-card"><div className="show-operations-heading"><div><h2>Interested leads</h2><p>Qualified from RSVP interest and event outcomes.</p></div></div><div className="show-operations-list">{rows.length ? rows.map((row) => <article key={row.id}><div><strong>{row.full_name}</strong><span>{row.email} · {row.mobile} · {row.interest_level || 'Interested'}</span></div>{row.crm_lead_id ? <button className="wa-primary-button" type="button" onClick={() => navigate(`/pipeline/leads/${encodeURIComponent(row.crm_lead_id)}`)}>Open CRM lead</button> : <span className="wa-status">CRM handoff pending</span>}</article>) : <p className="marketing-event-empty">No interested leads have been identified yet.</p>}</div></section>
}

function ShowDayActivityTab({ detail }) {
  const rows = useEventRsvps(detail)
  const [operations, setOperations] = useState(null)
  const [error, setError] = useState('')
  const refresh = useCallback(() => { if (!detail.publicToken) return; getMarketingEventOperations(detail.id).then(setOperations).catch((loadError) => setError(loadError.message || 'Could not load delivery health.')) }, [detail.id, detail.publicToken])
  useEffect(() => { refresh() }, [refresh])
  const retry = async (kind, id) => { try { await retryMarketingEventOperation(kind, id); refresh() } catch (retryError) { setError(retryError.message || 'Could not requeue this operation.') } }
  const failures = [...(operations?.failedHandoffs || []).map((row) => ({ ...row, kind: 'handoff', label: 'CRM handoff', error: row.last_error, attempts: row.attempts })), ...(operations?.failedMessages || []).map((row) => ({ ...row, kind: 'message', label: `${row.message_type || 'Email'} delivery`, error: row.error_message, attempts: row.dispatch_attempts }))]
  return <section className="show-workspace-card show-operations-card"><div className="show-operations-heading"><div><h2>Event activity</h2><p>RSVP, check-in, CRM handoff and delivery history.</p></div></div>{error ? <p className="show-operations-error">{error}</p> : null}<div className="show-operations-list">{operations ? <article><div><strong>Operational health</strong><span>{operations.summary.queued_handoffs || 0} CRM handoffs queued · {operations.summary.queued_messages || 0} emails queued</span></div><span className="wa-status">{failures.length ? `${failures.length} needs attention` : 'Healthy'}</span></article> : null}{failures.map((row) => <article key={`${row.kind}:${row.id}`}><div><strong>{row.label} for {row.rsvp?.full_name || 'visitor'}</strong><span>{row.error || 'Delivery failed'} · {row.attempts || 0} attempts</span></div><button className="wa-secondary-button" type="button" onClick={() => { void retry(row.kind, row.id) }}>Retry</button></article>)}{rows.length ? rows.map((row) => <article key={row.id}><div><strong>{row.full_name}</strong><span>Registered {row.submitted_at ? new Date(row.submitted_at).toLocaleString('en-ZA') : 'recently'}{row.checked_in_at ? ` · Checked in ${new Date(row.checked_in_at).toLocaleString('en-ZA')}` : ''}{row.conversion_outcome ? ` · ${row.conversion_outcome.replaceAll('_', ' ')}` : ''}</span></div><span className="wa-status">{row.status}</span></article>) : <p className="marketing-event-empty">Activity will appear as visitors RSVP and check in.</p>}</div></section>
}

function ShowDayEditForm({ detail, onCancel, onSave }) {
  const [values, setValues] = useState(() => ({ title: detail.title || '', address: detail.address || '', startDate: detail.startsAt?.slice(0, 10) || '', startTime: detail.startsAt?.slice(11, 16) || '', endDate: detail.endsAt?.slice(0, 10) || '', endTime: detail.endsAt?.slice(11, 16) || '', status: detail.status || 'Draft', description: detail.description || '', listingId: detail.subjectId || '', listingLabel: detail.subjectLabel || detail.title || '', image: detail.image || '' }))
  const [error, setError] = useState('')
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }))
  const submit = async (event) => { event.preventDefault(); try { await onSave(values); onCancel() } catch (saveError) { setError(saveError.message || 'Could not update the show day.') } }
  return <section className="marketing-event-form" aria-label="Edit show day"><div><div><span>Event setup</span><h2>Edit show day</h2><p>Changes are shared with the RSVP and operations workspaces.</p></div></div><form onSubmit={submit}><label>Title<input required value={values.title} onChange={update('title')} /></label><label>Address<input required value={values.address} onChange={update('address')} /></label><label>Start date<input required type="date" value={values.startDate} onChange={update('startDate')} /></label><label>Start time<input required type="time" value={values.startTime} onChange={update('startTime')} /></label><label>End date<input type="date" value={values.endDate} onChange={update('endDate')} /></label><label>End time<input type="time" value={values.endTime} onChange={update('endTime')} /></label><label>Status<select value={values.status} onChange={update('status')}><option>Draft</option><option>Upcoming</option><option>Completed</option><option>Cancelled</option></select></label><label>Description<textarea value={values.description} onChange={update('description')} /></label>{error ? <p className="wa-error">{error}</p> : null}<footer><button className="wa-secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="wa-primary-button" type="submit">Save changes</button></footer></form></section>
}

export function ShowDayDetail({ onBack, showDayId }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const { organisation } = useOrganisation()
  const organisationId = organisation?.organisationId || organisation?.id || ''
  const { events, updateEvent, updateEventChecklist, refreshEvents } = useMarketingEvents('showDays', showDays, { organisationId })
  const detail = events.find((event) => event.id === showDayId) || showDayDetail
  const content = editing ? <ShowDayEditForm detail={detail} onCancel={() => setEditing(false)} onSave={(values) => updateEvent(detail.id, values)} /> : activeTab === 'overview' ? <ShowDayOverviewTab detail={detail} onViewLeads={() => setActiveTab('leads')} onChecklistChange={(checklist) => { void updateEventChecklist(detail.id, checklist) }} /> : activeTab === 'registrations' ? <ShowDayRegistrations detail={detail} organisationId={organisationId} onChanged={refreshEvents} /> : activeTab === 'attendees' ? <ShowDayRegistrations detail={detail} organisationId={organisationId} attendeesOnly onChanged={refreshEvents} /> : activeTab === 'leads' ? <ShowDayLeadsTab detail={detail} /> : activeTab === 'activity' ? <ShowDayActivityTab detail={detail} /> : <ShowDayPromotionCard detail={detail} />
  return <div className="wa-page show-days-page show-day-detail-page"><button className="wa-back-link show-mobile-back" type="button" onClick={onBack}><ArrowLeft size={15} /> Show Days</button><ShowDayHeader onBack={onBack} detail={detail} onEdit={() => setEditing(true)} /><ShowDayTabs activeTab={activeTab} onChange={setActiveTab} detail={detail} />{content}</div>
}
