import { createElement, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Download, MessageSquare, MoreHorizontal, Plus, Search, SlidersHorizontal, UserRound, Users } from 'lucide-react'
import './rental-listing-leads.css'

const text = (value) => String(value ?? '')
const time = (value) => Date.parse(value) || 0
const date = (value) => time(value) ? new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const contactedStages = new Set(['contacted', 'qualified', 'viewing_scheduled', 'viewing_completed', 'application_pending', 'application_received', 'screening_pending', 'screening_complete', 'landlord_approval_pending', 'lease_pending', 'placement_ready', 'lease_signed', 'tenancy_created'])
const PAGE_SIZE = 10

export default function RentalListingLeadsPanel({ snapshot, onNavigate, onAddLead }) {
  const [mountedAt] = useState(() => Date.now())
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [stage, setStage] = useState('all')
  const [source, setSource] = useState('all')
  const [activity, setActivity] = useState('all')
  const [period, setPeriod] = useState('all')
  const [page, setPage] = useState(1)
  const [menu, setMenu] = useState('')
  useEffect(() => {
    if (!menu) return
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && event.target.closest('.rental-listing-lead-menu')) return
      setMenu('')
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [menu])
  const rows = useMemo(() => (snapshot.leads || []).map((lead) => ({ ...lead,
    contactedAt: lead.raw?.lastContactedAt || lead.raw?.last_contacted_at,
    viewing: (snapshot.viewings || []).filter((viewing) => viewing.tenantLeadId === lead.id).sort((a, b) => time(b.startsAt) - time(a.startsAt))[0],
    application: (snapshot.applications || []).find((application) => application.leadId === lead.id),
  })).sort((a, b) => time(b.createdAt) - time(a.createdAt)), [snapshot])
  const filtered = rows.filter((lead) => {
    const cutoff = period === 'today' ? new Date(snapshot.refreshedAt || mountedAt).setHours(0, 0, 0, 0) : period === '7' ? (snapshot.refreshedAt || mountedAt) - 7 * 86400000 : period === '30' ? (snapshot.refreshedAt || mountedAt) - 30 * 86400000 : 0
    return (!search || `${lead.name} ${lead.email} ${lead.phone}`.toLowerCase().includes(search.toLowerCase())) &&
      (stage === 'all' || lead.stage === stage) && (source === 'all' || (lead.source || 'Manual') === source) &&
      (activity === 'all' || activity === 'viewing' && lead.viewing || activity === 'application' && lead.application) && (!cutoff || time(lead.createdAt) >= cutoff)
  })
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const activeFilters = [stage, source, activity, period].filter((value) => value !== 'all').length
  const navigateLead = (lead) => onNavigate(`/agent/rentals/pipeline/leads/${encodeURIComponent(lead.id)}`)
  const navigateApplication = (application) => onNavigate(`/agent/rentals/applications/${encodeURIComponent(application.id)}`)
  function change(setter, value) { setter(value); setPage(1); setMenu('') }
  function clearFilters() { setStage('all'); setSource('all'); setActivity('all'); setPeriod('all'); setPage(1) }
  function exportLeads() {
    const cell = (value) => `"${text(value).replace(/^[=+@-]/, (prefix) => `'${prefix}`).replaceAll('"', '""')}"`
    const csv = [['Lead', 'Email', 'Phone', 'Source', 'Status', 'Contacted', 'Viewing', 'Application', 'Date added'], ...filtered.map((lead) => [lead.name, lead.email, lead.phone, lead.source, lead.stageLabel, date(lead.contactedAt), date(lead.viewing?.startsAt), lead.application?.status, date(lead.createdAt)])].map((row) => row.map(cell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'rental-listing-leads.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const metrics = [
    { label: 'Total leads', value: snapshot.leadCount ?? '—', meta: 'All time', icon: Users },
    { label: 'New this week', value: snapshot.leadCount == null ? '—' : snapshot.newLeadCount, meta: 'Last 7 days', icon: UserRound },
    { label: 'Contacted', value: snapshot.issues.includes('Leads') ? '—' : rows.filter((lead) => lead.contactedAt || contactedStages.has(lead.stage)).length, meta: 'Tenant follow-up', icon: MessageSquare },
    { label: 'Viewings booked', value: snapshot.viewingCount ?? '—', meta: snapshot.viewingCount == null ? 'Viewing data unavailable' : `${snapshot.upcoming?.length || 0} upcoming`, icon: CalendarDays },
  ]
  return <section className="rental-listing-leads">
    <article className="rental-listing-leads-panel">
      <header><div><h2>Leads for this listing</h2><p>Tenant enquiries and leads linked to this property.</p></div><div className="rental-listing-leads-actions"><button type="button" data-rental-control="lead-filter" aria-expanded={filtersOpen} aria-controls="rental-listing-lead-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={14} />Filters{activeFilters ? ` (${activeFilters})` : ''}</button><button type="button" data-rental-control="lead-export" onClick={exportLeads} disabled={!filtered.length}><Download size={14} />Export</button><button type="button" className="ui-button-primary" onClick={onAddLead}><Plus size={14} />Add Tenant Lead</button></div></header>
      {snapshot.issues.includes('Leads') ? <p role="alert">Tenant leads could not be loaded. Refresh the overview to retry.</p> : null}
      <div className="rental-listing-lead-metrics" aria-label="Listing lead metrics">{metrics.map((metric) => <article key={metric.label}><div><span>{createElement(metric.icon, { size: 16, 'aria-hidden': true })}</span><p>{metric.label}</p></div><strong>{metric.value}</strong><p>{metric.meta}</p></article>)}</div>
      <div className="rental-listing-lead-search"><label><Search size={15} aria-hidden="true" /><input aria-label="Search listing leads" placeholder="Search lead, phone, or email" value={search} onChange={(event) => change(setSearch, event.target.value)} /></label><span aria-live="polite">{filtered.length} shown</span></div>
      {filtersOpen ? <div className="rental-listing-lead-filters" id="rental-listing-lead-filters"><label>Status<select value={stage} onChange={(event) => change(setStage, event.target.value)}><option value="all">All statuses</option>{[...new Map(rows.map((lead) => [lead.stage, lead.stageLabel])).entries()].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Source<select value={source} onChange={(event) => change(setSource, event.target.value)}><option value="all">All sources</option>{[...new Set(rows.map((lead) => lead.source || 'Manual'))].map((value) => <option key={value}>{value}</option>)}</select></label><label>Activity<select value={activity} onChange={(event) => change(setActivity, event.target.value)}><option value="all">All activity</option><option value="viewing">Has viewing</option><option value="application">Has application</option></select></label><label>Date<select value={period} onChange={(event) => change(setPeriod, event.target.value)}><option value="all">All dates</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>{activeFilters ? <button type="button" data-rental-control="lead-clear" onClick={clearFilters}>Clear filters</button> : null}</div> : null}
    </article>
    <article className="rental-listing-leads-panel rental-listing-leads-table-panel"><div className="rental-listing-leads-table"><table><caption>Leads linked to this property</caption><thead><tr>{['Lead', 'Source', 'Status', 'Contacted', 'Viewing', 'Application', 'Date added ↓', 'Actions'].map((title) => <th key={title}>{title}</th>)}</tr></thead><tbody>{visible.length ? visible.map((lead) => <tr key={lead.id}><td><button data-rental-control="lead-name" type="button" className="rental-listing-lead-name" onClick={() => navigateLead(lead)}><span className="rental-listing-lead-avatar">{text(lead.name).split(' ').slice(0, 2).map((part) => part[0]).join('')}</span><span><strong>{lead.name}</strong><small>{lead.phone || lead.email || 'Contact pending'}</small></span></button></td><td><span className="rental-listing-lead-source">{lead.source || 'Manual'}</span></td><td><span className="rental-listing-lead-status">{lead.stageLabel || lead.stage}</span></td><td>{date(lead.contactedAt)}</td><td>{date(lead.viewing?.startsAt)}{lead.viewing ? <small>{lead.viewing.outcome?.replaceAll('_', ' ') || lead.viewing.status || 'Scheduled'}</small> : null}</td><td>{lead.application ? <button data-rental-control="lead-application" type="button" className="rental-listing-lead-link" onClick={() => navigateApplication(lead.application)}>{lead.application.status.replaceAll('_', ' ')}</button> : '—'}</td><td>{date(lead.createdAt)}</td><td><div className="rental-listing-lead-menu"><button data-rental-control="lead-actions" type="button" aria-label={`Actions for ${lead.name}`} aria-expanded={menu.id === lead.id} onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect()
      setMenu(menu.id === lead.id ? '' : { id: lead.id, left: Math.max(8, bounds.right - 170), top: Math.min(bounds.bottom + 4, window.innerHeight - 100) })
    }}><MoreHorizontal size={16} /></button>{menu.id === lead.id ? <div style={{ left: menu.left, top: menu.top }}><button data-rental-control="lead-open" type="button" onClick={() => navigateLead(lead)}>Open tenant lead</button>{lead.application ? <button data-rental-control="lead-open-application" type="button" onClick={() => navigateApplication(lead.application)}>Open application</button> : null}</div> : null}</div></td></tr>) : <tr><td colSpan={8} className="rental-listing-leads-empty">{rows.length ? 'No leads match the current filters.' : 'Tenant enquiries for this listing will appear here as they come in.'}</td></tr>}</tbody></table></div><div className="rental-listing-leads-mobile">{visible.length ? visible.map((lead) => <article key={lead.id}><button data-rental-control="lead-name" type="button" className="rental-listing-lead-name" onClick={() => navigateLead(lead)}><span className="rental-listing-lead-avatar">{text(lead.name).split(' ').slice(0, 2).map((part) => part[0]).join('')}</span><span><strong>{lead.name}</strong><small>{lead.phone || lead.email || 'Contact pending'}</small></span></button><dl><dt>Source</dt><dd>{lead.source || 'Manual'}</dd><dt>Status</dt><dd>{lead.stageLabel || lead.stage}</dd><dt>Contacted</dt><dd>{date(lead.contactedAt)}</dd><dt>Viewing</dt><dd>{date(lead.viewing?.startsAt)}</dd><dt>Application</dt><dd>{lead.application ? <button type="button" className="rental-listing-lead-link" data-rental-control="lead-application" onClick={() => navigateApplication(lead.application)}>{lead.application.status.replaceAll('_', ' ')}</button> : '—'}</dd><dt>Date added</dt><dd>{date(lead.createdAt)}</dd></dl></article>) : <p className="rental-listing-leads-empty">{rows.length ? 'No leads match the current filters.' : 'No tenant enquiries yet.'}</p>}</div><footer><p>Showing {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} leads</p><div><button data-rental-control="lead-page" type="button" aria-label="Previous leads page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} /></button><span aria-current="page">{currentPage}</span><span>of {pages}</span><button data-rental-control="lead-page" type="button" aria-label="Next leads page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={15} /></button></div></footer></article>
  </section>
}
