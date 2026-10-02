import { createElement, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Building2, FileSignature, KeyRound, Loader2, Search, UserRound, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { MobileDashboardShell } from '../../components/dashboard/PremiumDashboard'
import { listPersistedRentalTenancies } from '../../services/rentals/rentalApplicationRepository.js'
import { listRentalProperties } from '../../services/rentals/rentalPropertyRepository.js'
import { listRentalUnits } from '../../services/rentals/rentalUnitRepository.js'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'
import { TENANCY_STAGES, tenancyRegisterRow } from '../../services/rentals/rentalTenancyRegisterModel'
import './RentalTenanciesPage.css'

async function loadRegisterPages(loadPage) {
  const records = []
  for (let offset = 0; ; offset += 100) {
    const batch = await loadPage(offset)
    records.push(...batch)
    if (batch.length < 100) return records
  }
}

const PAGE_SIZE = 15
const date = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not captured'
const money = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? `R ${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : 'Not captured'
const tabs = [['current', 'Current tenancies'], ['preparing', 'Lease & move-in'], ['active', 'Active'], ['ending', 'Move-out'], ['closed', 'Completed']]
const matches = (row, filter) => filter === 'current' ? row.stage !== 5 : filter === 'preparing' ? row.stage < 3 : filter === 'active' ? row.stage === 3 : filter === 'ending' ? row.stage === 4 : row.stage === 5

export default function RentalTenanciesPage() {
  const workspace = useWorkspace()
  const { organisationId, branchId } = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const scopeKey = `${organisationId}:${branchId || ''}`
  const [result, setResult] = useState({ key: '', rows: [], error: '' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('current')
  const [page, setPage] = useState(1)
  useEffect(() => {
    if (!organisationId) return undefined
    let alive = true
    Promise.all([
      loadRegisterPages((offset) => listPersistedRentalTenancies(organisationId, { offset })),
      loadRegisterPages((offset) => listRentalProperties({ organisationId, branchId, status: 'all', limit: 100, offset })),
      loadRegisterPages((offset) => listRentalUnits({ organisationId, branchId, limit: 100, offset })),
    ]).then(([tenancies, properties, units]) => {
      if (!alive) return
      const propertyMap = new Map(properties.map((item) => [item.id, item]))
      const unitMap = new Map(units.map((item) => [item.id, item]))
      const scoped = branchId ? tenancies.filter((item) => propertyMap.has(item.propertyId)) : tenancies
      setResult({ key: scopeKey, rows: scoped.map((item) => tenancyRegisterRow(item, propertyMap.get(item.propertyId), unitMap.get(item.unitId))), error: '' })
    }).catch((cause) => { if (alive) setResult({ key: scopeKey, rows: [], error: cause?.message || 'Unable to load tenancies.' }) })
    return () => { alive = false }
  }, [organisationId, branchId, scopeKey])
  const loading = Boolean(organisationId && result.key !== scopeKey)
  const rows = result.key === scopeKey ? result.rows : []
  const error = result.key === scopeKey ? result.error : ''
  const visible = rows.filter((row) => matches(row, filter) && [row.tenantName, row.landlordName, row.propertyName, row.unitLabel, row.location, row.status, TENANCY_STAGES[row.stage]].join(' ').toLowerCase().includes(query.toLowerCase()))
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PAGE_SIZE
  const changeFilter = (value) => { setFilter(value); setPage(1) }
  const stats = [['Current tenancies', 'current', Building2], ['Lease & move-in', 'preparing', FileSignature], ['Active tenancies', 'active', KeyRound], ['Moving out', 'ending', UsersRound]]
  return <main className="mx-auto w-full max-w-[1600px] py-2"><MobileDashboardShell>
    <header className="rental-tenancy-header"><div><h1>Tenancies</h1><p>Track each rental agreement from lease preparation to move-out.</p></div><Link to="/agent/rentals/applications">Review applications <ArrowUpRight size={16} /></Link></header>
    <section className="rental-tenancy-stats" aria-label="Tenancy summary">{stats.map(([label, key, Icon]) => <button key={key} type="button" onClick={() => changeFilter(key)} aria-pressed={filter === key}><span>{createElement(Icon, { size: 19 })}{label}</span><strong>{loading || error ? '—' : rows.filter((row) => matches(row, key)).length}</strong></button>)}</section>
    <section className="rental-tenancy-register">
      <nav className="rental-tenancy-tabs" aria-label="Tenancy stages">{tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => changeFilter(key)}>{label}<span>{rows.filter((row) => matches(row, key)).length}</span></button>)}</nav>
      <label className="rental-tenancy-search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search property, tenant or landlord" aria-label="Search tenancies" /></label>
      {error ? <p role="alert" className="rental-tenancy-empty">{error}</p> : loading ? <p className="rental-tenancy-empty"><Loader2 size={18} className="animate-spin" />Loading tenancies…</p> : !organisationId ? <p className="rental-tenancy-empty">Choose an organisation to view tenancies.</p> : !visible.length ? <div className="rental-tenancy-empty"><p>{rows.length ? 'No tenancies match this view.' : 'No tenancies yet. Approved applications can be converted into a tenancy.'}</p></div> : <div className="rental-tenancy-cards">{visible.slice(start, start + PAGE_SIZE).map((row) => <Link key={row.id} to={`/agent/rentals/tenancies/${row.id}`} className="rental-tenancy-card" aria-label={`Open tenancy for ${row.tenantName} at ${row.propertyName}`}>
        <div className="rental-tenancy-card-heading"><span className="rental-tenancy-card-icon"><Building2 size={23} aria-hidden="true" /></span><span className="rental-tenancy-card-status">{TENANCY_STAGES[row.stage]}</span></div>
        <div className="rental-tenancy-card-property"><h2>{row.propertyName}</h2><p>{row.unitLabel} · {row.location}</p></div>
        <dl className="rental-tenancy-parties"><div><dt><UserRound size={14} aria-hidden="true" />Tenant</dt><dd>{row.tenantName}</dd></div><div><dt><UsersRound size={14} aria-hidden="true" />Landlord</dt><dd>{row.landlordName}</dd></div></dl>
        <div className="rental-tenancy-card-progress"><div><strong>Tenancy progress</strong><span>Stage {row.stage + 1} of {TENANCY_STAGES.length}</span></div><div className="rental-tenancy-progress-track" role="progressbar" aria-label={`Tenancy progress for ${row.tenantName}`} aria-valuemin={0} aria-valuemax={TENANCY_STAGES.length - 1} aria-valuenow={row.stage} aria-valuetext={TENANCY_STAGES[row.stage]}><span style={{ width: `${row.stage / (TENANCY_STAGES.length - 1) * 100}%` }} /></div><div className="rental-tenancy-progress-endpoints"><span>Preparation</span><span>Closed</span></div><p>{row.action}</p></div>
        <div className="rental-tenancy-card-footer"><div><strong>{money(row.monthlyRent)}<small> / month</small></strong><p>{date(row.startDate)} → {date(row.endDate)}</p></div><span>Open tenancy <ArrowUpRight size={15} aria-hidden="true" /></span></div>
      </Link>)}</div>}

      {!loading && !error && visible.length > 0 ? <footer className="rental-tenancy-pagination"><span>Showing {start + 1}–{Math.min(start + PAGE_SIZE, visible.length)} of {visible.length}</span><div><button type="button" data-rental-control="tenancy-pagination" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" data-rental-control="tenancy-pagination" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer> : null}
    </section>
  </MobileDashboardShell></main>
}
