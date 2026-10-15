import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Download, MessageSquare, MoreVertical, Plus, Search, SlidersHorizontal, UserRound, Users } from 'lucide-react'
import LeadSourceLogo from '../../components/mobile-shell/LeadSourceLogo'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import './rental-listing-leads.css'

const text = (value) => String(value ?? '')
const time = (value) => Date.parse(value) || 0
const date = (value) => time(value) ? new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const contactedStages = new Set(['contacted', 'qualified', 'viewing_scheduled', 'viewing_completed', 'application_pending', 'application_received', 'screening_pending', 'screening_complete', 'landlord_approval_pending', 'lease_pending', 'placement_ready', 'lease_signed', 'tenancy_created'])
const PAGE_SIZE = 10
const initials = (name) => text(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

function addedDate(value) {
  if (!time(value)) return 'Date pending'
  const parsed = new Date(value)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime()
  const clock = parsed.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
  if (day === today) return `Today ${clock}`
  if (day === today - 86400000) return `Yesterday ${clock}`
  if (day === today + 86400000) return `Tomorrow ${clock}`
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: parsed.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export default function RentalListingLeadsPanel({ snapshot, onNavigate, onAddLead }) {
  const [mountedAt] = useState(() => Date.now())
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [stage, setStage] = useState('all')
  const [source, setSource] = useState('all')
  const [activity, setActivity] = useState('all')
  const [period, setPeriod] = useState('all')
  const [page, setPage] = useState(1)
  const [menu, setMenu] = useState(null)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector('button')?.focus()
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && (menuRef.current?.contains(event.target) || event.target.closest('[data-rental-control="lead-actions"]'))) return
      setMenu(null)
      if (event.type === 'keydown') menu.trigger?.focus()
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
  const navigateLead = (lead, tab = '') => {
    setMenu(null)
    onNavigate(`/agent/rentals/pipeline/leads/${encodeURIComponent(lead.id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`)
  }
  const navigateApplication = (lead) => {
    setMenu(null)
    if (lead.application) onNavigate(`/agent/rentals/applications/${encodeURIComponent(lead.application.id)}`)
    else navigateLead(lead, 'Application')
  }
  function change(setter, value) { setter(value); setPage(1); setMenu(null) }
  function clearFilters() { setStage('all'); setSource('all'); setActivity('all'); setPeriod('all'); setPage(1); setMenu(null) }
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
  function leadActions(lead) {
    return <div className="rental-listing-lead-actions">
      <button data-rental-control="lead-contact" type="button" aria-label={`Contact ${lead.name}`} title="Contact lead" onClick={() => navigateLead(lead, 'Activity')}><MessageSquare size={15} /></button>
      <button data-rental-control="lead-actions" type="button" aria-label={`Lead actions for ${lead.name}`} title="Actions" aria-haspopup="menu" aria-expanded={menu?.id === lead.id} onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenu(menu?.id === lead.id ? null : { id: lead.id, trigger: event.currentTarget, left: Math.max(8, bounds.right - 176), top: Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - 128)) })
      }}><MoreVertical size={15} /></button>
    </div>
  }
  function leadName(lead) {
    return <button data-rental-control="lead-name" type="button" className="rental-listing-lead-name" onClick={() => navigateLead(lead)}>
      <span className="rental-listing-lead-avatar" aria-hidden="true">{initials(lead.name)}</span>
      <span><strong>{lead.name}</strong><small>{lead.phone || lead.email || 'Contact pending'}</small></span>
    </button>
  }
  const menuLead = rows.find((lead) => lead.id === menu?.id)
  return <section className="rental-listing-leads">
    <article className="rental-listing-leads-panel">
      <header><h2>Leads for this listing</h2><div className="rental-listing-leads-actions"><Button size="sm" variant="secondary" aria-expanded={filtersOpen} aria-controls="rental-listing-lead-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={14} />Filters{activeFilters ? ` (${activeFilters})` : ''}</Button><Button size="sm" variant="secondary" onClick={exportLeads} disabled={!filtered.length}><Download size={14} />Export</Button><Button size="sm" aria-label="Add Tenant Lead" onClick={onAddLead}><Plus size={14} /><span className="sm:hidden">Add Lead</span><span className="hidden sm:inline">Add Tenant Lead</span></Button></div></header>
      {snapshot.issues.includes('Leads') ? <p role="alert">Tenant leads could not be loaded. Refresh the overview to retry.</p> : null}
      <div className="rental-listing-lead-metrics" aria-label="Listing lead metrics">{metrics.map((metric) => <article key={metric.label}><div><span>{createElement(metric.icon, { size: 16, 'aria-hidden': true })}</span><p>{metric.label}</p></div><strong>{metric.value}</strong><p>{metric.meta}</p></article>)}</div>
      <div className="rental-listing-lead-search"><label><Search size={15} aria-hidden="true" /><Field className="pl-9" aria-label="Search listing leads" placeholder="Search lead, phone, or email" value={search} onChange={(event) => change(setSearch, event.target.value)} /></label><span aria-live="polite">{filtered.length} shown</span></div>
      {filtersOpen ? <div className="rental-listing-lead-filters" id="rental-listing-lead-filters"><label>Status<Field as="select" value={stage} onChange={(event) => change(setStage, event.target.value)}><option value="all">All statuses</option>{[...new Map(rows.map((lead) => [lead.stage, lead.stageLabel])).entries()].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Field></label><label>Source<Field as="select" value={source} onChange={(event) => change(setSource, event.target.value)}><option value="all">All sources</option>{[...new Set(rows.map((lead) => lead.source || 'Manual'))].map((value) => <option key={value}>{value}</option>)}</Field></label><label>Activity<Field as="select" value={activity} onChange={(event) => change(setActivity, event.target.value)}><option value="all">All activity</option><option value="viewing">Has viewing</option><option value="application">Has application</option></Field></label><label>Date<Field as="select" value={period} onChange={(event) => change(setPeriod, event.target.value)}><option value="all">All dates</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Field></label>{activeFilters ? <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}</div> : null}
    </article>
    <article className="rental-listing-leads-panel rental-listing-leads-table-panel">
      {rows.length ? <>
        <div className="rental-listing-leads-table">
          <table>
            <caption>Leads linked to this property</caption>
            <thead><tr>{['Lead', 'Source', 'Status', 'Date added ↓', 'Actions'].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
            <tbody>{visible.length ? visible.map((lead) => <tr key={lead.id}>
              <td>{leadName(lead)}</td>
              <td><LeadSourceLogo source={lead.source || 'Manual'} className="rental-listing-lead-source" /></td>
              <td><span className="rental-listing-lead-status">{lead.stageLabel || lead.stage}</span></td>
              <td className="rental-listing-lead-added">{addedDate(lead.createdAt)}</td>
              <td>{leadActions(lead)}</td>
            </tr>) : <tr><td colSpan={5} className="rental-listing-leads-empty"><span role="status">No leads match the current filters.</span></td></tr>}</tbody>
          </table>
        </div>
        <div className="rental-listing-leads-mobile">
          {visible.length ? visible.map((lead) => <article key={lead.id}>
            <header>{leadName(lead)}{leadActions(lead)}</header>
            <dl>
              <div><dt>Source</dt><dd><LeadSourceLogo source={lead.source || 'Manual'} className="rental-listing-lead-source" /></dd></div>
              <div><dt>Status</dt><dd>{lead.stageLabel || lead.stage}</dd></div>
              <div><dt>Date added</dt><dd>{addedDate(lead.createdAt)}</dd></div>
            </dl>
          </article>) : <p role="status" className="rental-listing-leads-empty">No leads match the current filters.</p>}
        </div>
        <footer>
          <p>Showing {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} leads</p>
          <div>
            <button data-rental-control="lead-page" type="button" aria-label="Previous leads page" disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1); setMenu(null) }}><ChevronLeft size={15} /></button>
            <span aria-current="page">{currentPage}</span><span>of {pages}</span>
            <button data-rental-control="lead-page" type="button" aria-label="Next leads page" disabled={currentPage >= pages} onClick={() => { setPage(currentPage + 1); setMenu(null) }}><ChevronRight size={15} /></button>
          </div>
        </footer>
      </> : <div className="rental-listing-leads-empty">
        <span className="rental-listing-leads-empty-icon"><Users size={20} /></span>
        <h3>No leads yet</h3>
        <p>Tenant enquiries for this listing will appear here as they come in.</p>
      </div>}
    </article>
    {menuLead ? createPortal(<div ref={menuRef} className="rental-listing-lead-menu" role="menu" aria-label={`Lead actions for ${menuLead.name}`} style={{ left: menu.left, top: menu.top }}>
      <button type="button" role="menuitem" onClick={() => navigateLead(menuLead)}>Open tenant lead</button>
      <button type="button" role="menuitem" onClick={() => navigateLead(menuLead, 'Appointments')}>View viewings</button>
      <button type="button" role="menuitem" onClick={() => navigateApplication(menuLead)}>{menuLead.application ? 'Open application' : 'Application details'}</button>
    </div>, document.body) : null}
  </section>
}
