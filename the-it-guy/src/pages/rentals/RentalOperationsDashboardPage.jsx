import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleDollarSign, ClipboardList, FileText, Home, KeyRound, Megaphone, ShieldCheck, ToolCase, UsersRound, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { MobileDashboardShell } from '../../components/dashboard/PremiumDashboard'
import { getRentalManagementDashboard, getRentalManagementDashboardBottomHalf } from '../../services/rentals/rentalOperationsDashboardRepository.js'
import { listPersistedRentalTenancies } from '../../services/rentals/rentalApplicationRepository.js'
import { listRentalProperties } from '../../services/rentals/rentalPropertyRepository.js'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'
import './RentalOperationsDashboardPage.css'

const DATE_OPTIONS = [
  { value: 'last_7_days', label: 'Last 7 Days', days: 7 },
  { value: 'last_30_days', label: 'Last 30 Days', days: 30 },
  { value: 'last_90_days', label: 'Last 90 Days', days: 90 },
]
const stageLabel = { new: 'New', screening: 'Screening', documents: 'Documents', references: 'References', decision: 'Decision' }
const applicationNextAction = {
  new: 'Review the newly submitted application.',
  screening: 'Complete the applicant screening checks.',
  documents: 'Collect and verify the required documents.',
  references: 'Complete the reference checks.',
  decision: 'Record the application decision.',
}

function asNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0 }
function formatCount(value) { return asNumber(value).toLocaleString() }
function formatPercent(value) { return value === null || value === undefined ? '—' : `${asNumber(value).toFixed(1)}%` }
function formatRent(value) {
  const amount = asNumber(value)
  if (amount >= 1000000) return `R ${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`
  if (amount >= 1000) return `R ${(amount / 1000).toFixed(amount >= 100000 ? 0 : 1)}k`
  return `R ${amount.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}
function rangeDays(value) { return DATE_OPTIONS.find((option) => option.value === value)?.days || 30 }
function relativeDate(value) {
  if (!value) return 'Recently'
  const diff = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
  return diff === 0 ? 'Today' : `${diff}d ago`
}
function renewalDueDate(tenancy = {}) { const terms = tenancy.lease?.terms_json || {}; const start = tenancy.intendedOccupationDate || terms.intended_occupation_date; const months = Number(terms.lease_term_months || 0); if (!start || !Number.isFinite(months) || months <= 0) return null; const due = new Date(`${start}T00:00:00`); due.setMonth(due.getMonth() + months); return Number.isNaN(due.getTime()) ? null : due }
function shortDate(value) { return value ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(value) : 'Not captured' }

function OverviewCard({ title, subtitle, href, children }) {
  return <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2><p className="mt-1 text-sm text-[#667085]">{subtitle}</p></div><Link to={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1769d1]">View all <ArrowRight size={14} /></Link></div><div className="mt-5">{children}</div></section>
}

function RentalDistributionCard({ title, subtitle, centre, centreLabel, segments, footer, href, action, loading }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, asNumber(segment.value)), 0)
  let offset = 0
  const rings = segments.map((segment) => {
    const share = total > 0 ? Math.max(0, asNumber(segment.value)) / total * 100 : 0
    const ring = { ...segment, share, offset }
    offset += share
    return ring
  })
  return <article className="rental-distribution-card">
    <header><h2>{title}</h2><p>{subtitle}</p></header>
    <div className="rental-distribution-body">
      <div className="rental-distribution-chart" role="img" aria-label={loading ? `${title}: loading` : `${title}: ${segments.map((segment) => `${segment.label} ${formatCount(segment.value)}`).join(', ')}`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="48" fill="none" stroke="#edf2f6" strokeWidth="12" />
          {!loading && rings.map((ring) => ring.share > 0 ? <circle key={ring.label} cx="60" cy="60" r="48" fill="none" stroke={ring.colour} strokeWidth="12" pathLength="100" strokeDasharray={`${ring.share} ${100 - ring.share}`} strokeDashoffset={-ring.offset} transform="rotate(-90 60 60)" /> : null)}
        </svg>
        <div><strong>{centre}</strong><span>{centreLabel}</span></div>
      </div>
      <dl>{segments.map((segment) => <div key={segment.label}><dt><i style={{ background: segment.colour }} />{segment.label}</dt><dd>{loading ? '—' : formatCount(segment.value)}</dd></div>)}{!loading && total === 0 ? <p>No data in this scope yet.</p> : null}</dl>
    </div>
    <footer><span>{loading ? 'Loading rental data…' : footer}</span><Link to={href}>{action}<ArrowRight size={14} /></Link></footer>
  </article>
}

function ActiveApplicationCard({ application = {} }) {
  const stage = application.stage || 'new'
  const stageName = stageLabel[stage] || 'Review'
  const isScreening = stage === 'screening'
  const status = application.status === 'under_review' ? 'Under review' : 'Awaiting initial review'

  return (
    <Link
      to={`/agent/rentals/applications/${application.id}`}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#dce6f2] bg-white shadow-[0_7px_18px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:border-[#9bc4f4] hover:shadow-[0_14px_28px_rgba(15,23,42,0.10)]"
    >
      <div className="relative h-24 overflow-hidden bg-[linear-gradient(135deg,#123d6b_0%,#1f70b7_58%,#8fc6ed_100%)] p-4">
        <div className="absolute -right-7 -top-8 h-28 w-28 rounded-full border-[18px] border-white/10" />
        <div className="relative flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[13px] border border-white/20 bg-white/15 text-white backdrop-blur"><ClipboardList size={19} /></span>
          <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.06em] ${isScreening ? 'border-[#d4efdf] bg-[#effaf3] text-[#187847]' : 'border-white/25 bg-white/15 text-white'}`}>{stageName}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div>
          <p className="truncate text-[1rem] font-semibold text-[#1c3148]">{application.property_name || 'Property pending'}</p>
          <p className="mt-1 truncate text-sm font-medium text-[#637990]">{application.unit_label || 'Unit pending'} · Received {relativeDate(application.submitted_at || application.created_at)}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[12px] border border-[#e2eaf4] bg-[#f9fbfe] px-3 py-2.5">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-[#7b8ca2]">Monthly rent</p>
            <p className="mt-1 text-base font-semibold text-[#142132]">{formatRent(application.monthly_rent)}</p>
          </div>
          <div className="rounded-[12px] border border-[#e2eaf4] bg-[#f9fbfe] px-3 py-2.5">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-[#7b8ca2]">Status</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#35546c]">{status}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-[#dfeaf5] bg-white px-3 py-2.5">
          <div className="min-w-0"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-[#7b8ca2]">Next action</p><p className="mt-1 truncate text-sm font-semibold text-[#35546c]">{applicationNextAction[stage] || 'Review the application details.'}</p></div>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf5ff] text-[#1769d1] transition group-hover:bg-[#1769d1] group-hover:text-white"><ArrowRight size={15} /></span>
        </div>
      </div>
    </Link>
  )
}

export default function RentalOperationsDashboardPage() {
  const workspace = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const [dataScope, setDataScope] = useState('company')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('all')
  const [dateRange, setDateRange] = useState('last_30_days')
  const [snapshot, setSnapshot] = useState(null)
  const [bottomSnapshot, setBottomSnapshot] = useState(null)
  const [renewalData, setRenewalData] = useState({ tenancies: [], properties: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const workspaceOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'All Branches' }]
    if (rentalScope.branchId) options.push({ value: rentalScope.branchId, label: 'My Branch' })
    return options
  }, [rentalScope.branchId])

  const load = useCallback(async () => {
    if (!rentalScope.organisationId) { setLoading(false); setSnapshot(null); return }
    try {
      setLoading(true); setError('')
      const params = { organisationId: rentalScope.organisationId, branchId: selectedWorkspaceId === 'all' ? null : selectedWorkspaceId, scope: dataScope, rangeDays: rangeDays(dateRange) }
      const propertyOptions = { organisationId: rentalScope.organisationId, branchId: selectedWorkspaceId === 'all' ? '' : selectedWorkspaceId, status: 'active', limit: 100 }
      const [dashboard, bottom, tenancies, properties] = await Promise.all([getRentalManagementDashboard(params), getRentalManagementDashboardBottomHalf(params), listPersistedRentalTenancies(rentalScope.organisationId), listRentalProperties(propertyOptions)])
      setSnapshot(dashboard); setBottomSnapshot(bottom)
      setRenewalData({ tenancies, properties })
    } catch (cause) { setError(cause?.message || 'Unable to load the Rentals dashboard.') } finally { setLoading(false) }
  }, [dataScope, dateRange, rentalScope.organisationId, selectedWorkspaceId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-controls', { detail: {
      visible: true, dataScope, selectedWorkspaceId, dateRange,
      dataScopeOptions: [{ value: 'company', label: 'Company' }, { value: 'agent', label: 'Agent' }],
      workspaceOptions, dateOptions: DATE_OPTIONS.map(({ value, label }) => ({ value, label })),
    } }))
    return () => window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-controls', { detail: null }))
  }, [dataScope, dateRange, selectedWorkspaceId, workspaceOptions])
  useEffect(() => {
    const onFilterChange = (event) => {
      const { key, value } = event.detail || {}
      if (key === 'dataScope') setDataScope(value === 'agent' ? 'agent' : 'company')
      if (key === 'selectedWorkspaceId') setSelectedWorkspaceId(String(value || 'all'))
      if (key === 'dateRange') setDateRange(DATE_OPTIONS.some((option) => option.value === value) ? value : 'last_30_days')
    }
    window.addEventListener('itg:principal-dashboard-header-filter-change', onFilterChange)
    return () => window.removeEventListener('itg:principal-dashboard-header-filter-change', onFilterChange)
  }, [])

  const metrics = snapshot?.metrics || {}; const occupancy = snapshot?.occupancy || {}; const applications = snapshot?.applications || []
  const portfolio = bottomSnapshot?.portfolio_health || {}; const vacancy = bottomSnapshot?.vacancy_letting || {}; const renewals = bottomSnapshot?.renewals || {}; const collections = bottomSnapshot?.collections || {}; const maintenance = bottomSnapshot?.maintenance || {}; const recentActivity = bottomSnapshot?.recent_activity || []
  const upcomingRenewals = useMemo(() => { const propertyById = new Map((renewalData.properties || []).map((property) => [property.id, property])); const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 90); return (renewalData.tenancies || []).map((tenancy) => ({ tenancy, dueDate: renewalDueDate(tenancy), property: propertyById.get(tenancy.propertyId) })).filter(({ tenancy, dueDate, property }) => tenancy.status === 'active' && property && dueDate && dueDate >= new Date() && dueDate <= cutoff).sort((left, right) => left.dueDate - right.dueDate) }, [renewalData])
  const kpis = [
    { key: 'applications', icon: ClipboardList, label: 'Active Applications', value: formatCount(metrics.active_applications), tone: 'blue', trend: null, trendLabel: 'Current review queue' },
    { key: 'mandates', icon: FileText, label: 'Active Mandates', value: formatCount(metrics.active_mandates), tone: 'green', trend: null, trendLabel: 'Current rental listings' },
    { key: 'occupancy', icon: Home, label: 'Occupancy Rate', value: formatPercent(metrics.occupancy_rate), tone: 'orange', trend: null, trendLabel: 'Managed rentable units' },
    { key: 'rent', icon: CircleDollarSign, label: 'Monthly Rent Roll', value: formatRent(metrics.monthly_rent_roll), tone: 'purple', trend: null, trendLabel: 'Current contractual rent' },
    { key: 'leads', icon: UsersRound, label: 'New Leads', value: formatCount(metrics.new_leads), tone: 'slate', trend: null, trendLabel: `Received in the last ${rangeDays(dateRange)} days` },
  ]

  return <main className="mx-auto w-full max-w-[1600px] py-2"><MobileDashboardShell>
    {error ? <section className="rounded-2xl border border-[#f7c9c9] bg-[#fff5f5] p-4 text-sm text-[#b42318]">{error}</section> : null}
    {!rentalScope.organisationId ? <section className="rounded-2xl border border-[#f4d7a9] bg-[#fffaf0] p-4 text-sm text-[#7a4b05]">Choose an agency workspace to load the Rentals dashboard.</section> : null}
    <section className="rental-summary-cards" aria-label="Rental summary">
      {kpis.map(({ key, icon: Icon, label, value, tone, trendLabel }) => <Link key={key} to={key === 'applications' ? '/agent/rentals/applications' : key === 'mandates' ? '/agent/rentals/listings' : key === 'leads' ? '/agent/rentals/pipeline/leads' : '/agent/rentals/portfolio/properties'} className={`rental-summary-card rental-summary-card--${tone}`}>
        <div className="rental-summary-heading">{createElement(Icon, { size: 19 })}<span>{label}</span></div>
        <strong>{loading ? '—' : value}</strong>
        <p>{trendLabel}</p>
        <span className="rental-summary-rule" aria-hidden="true" />
      </Link>)}
    </section>
    <section className="rental-insight-row" aria-label="Occupancy and lease renewals">
      <RentalDistributionCard title="Occupancy rate" subtitle="Your managed rental portfolio, at a glance." centre={loading ? '—' : asNumber(occupancy.total_units) > 0 ? formatPercent(occupancy.occupancy_rate) : '—'} centreLabel="Occupied" loading={loading} segments={[
        { label: 'Occupied units', value: occupancy.occupied_units, colour: '#16894f' },
        { label: 'Vacant units', value: occupancy.vacant_units, colour: '#efb45b' },
      ]} footer={`${formatCount(occupancy.total_units)} managed units · Active, confirmed management mandates`} href="/agent/rentals/portfolio/properties" action="View portfolio" />
      <RentalDistributionCard title="Lease renewals" subtitle="Upcoming lease expiries over the next 90 days." centre={loading ? '—' : formatCount(['next_30', 'days_31_60', 'days_61_90'].reduce((sum, key) => sum + asNumber(renewals.buckets?.[key]?.expiring), 0))} centreLabel="Leases ending" loading={loading} segments={[
        { label: 'Within 30 days', value: renewals.buckets?.next_30?.expiring, colour: '#5d8df2' },
        { label: '31–60 days', value: renewals.buckets?.days_31_60?.expiring, colour: '#8b70db' },
        { label: '61–90 days', value: renewals.buckets?.days_61_90?.expiring, colour: '#4bb79c' },
      ]} footer={`${formatCount(renewals.requires_action)} leases require renewal action`} href="/agent/rentals/portfolio/properties" action="View leases" />
    </section>
    <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">Active Applications</h2>
          <p className="mt-1 text-sm text-[#667085]">Open an application to review screening, documents and the decision.</p>
        </div>
        <Link to="/agent/rentals/applications" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1769d1]">View all <ArrowRight size={14} /></Link>
      </div>
      {loading ? <p className="py-10 text-sm text-[#667085]">Loading applications…</p> : applications.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] p-8 text-center text-sm text-[#667085]">No active rental applications in this scope.</div> : (
        <div className="rental-application-row mt-5" role="region" aria-label="Active rental applications" tabIndex={0}>
          {applications.map((application) => <ActiveApplicationCard key={application.id} application={application} />)}
        </div>
      )}
    </section>
    <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-[1.02rem] font-semibold text-[#101828]">Upcoming Renewals</h2><p className="mt-1 text-sm text-[#667085]">Active leases ending in the next 90 days.</p></div><Link to="/agent/rentals/portfolio/properties" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1769d1]">View stock <ArrowRight size={14} /></Link></div>{loading ? <p className="py-8 text-sm text-[#667085]">Loading renewals…</p> : upcomingRenewals.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] p-6 text-center text-sm text-[#667085]">No active leases are due to renew in the next 90 days.</div> : <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-1">{upcomingRenewals.map(({ tenancy, dueDate, property }) => <Link key={tenancy.id} to={`/agent/rentals/tenancies/${tenancy.id}`} className="min-w-[250px] snap-start rounded-[16px] border border-[#e3eaf2] bg-[#fbfdff] p-4 transition hover:border-[#9bc4f4]"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-semibold text-[#203247]">{property.name}</p><span className="shrink-0 rounded-full border border-[#f6dfb6] bg-[#fff8ea] px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-[#8a5207]">Renewal</span></div><p className="mt-1 truncate text-xs text-[#667085]">{property.address?.city || property.address?.line1 || 'Property address pending'}</p><div className="mt-4 rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2"><p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Lease ends</p><p className="mt-1 text-sm font-semibold text-[#142132]">{shortDate(dueDate)}</p></div><p className="mt-3 text-xs font-medium text-[#607387]">Open tenancy workflow to start the renewal.</p></Link>)}</div>}</section>
    <OverviewCard title="Portfolio Health" subtitle="Overall rental portfolio snapshot." href="/agent/rentals/portfolio/properties"><div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.55fr)_minmax(220px,0.48fr)] xl:items-center"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['Managed Units', portfolio.managed_units, Home], ['Occupied Units', portfolio.occupied_units, KeyRound], ['Vacant Units', portfolio.vacant_units, Megaphone], ['Becoming Available', portfolio.becoming_available_30_days, ClipboardList], ['Monthly Rent Roll', formatRent(portfolio.monthly_rent_roll), CircleDollarSign]].map(([label, value, Icon]) => <div key={label} className="rounded-xl bg-[#f8fafc] p-3">{createElement(Icon, { size: 16, className: 'text-[#52657a]' })}<p className="mt-3 text-xl font-semibold text-[#101828]">{typeof value === 'string' ? value : formatCount(value)}</p><p className="mt-1 text-xs text-[#667085]">{label}{label === 'Becoming Available' ? ' (30 days)' : ''}</p></div>)}</div><div className="border-t border-[#e7edf4] pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"><p className="text-sm font-semibold text-[#344054]">This Month</p><div className="mt-3 space-y-3 text-sm text-[#52657a]"><p><b className="text-[#101828]">+{formatCount(portfolio.units_occupied_this_month)}</b> units occupied this month</p><p><b className="text-[#101828]">{formatCount(portfolio.new_vacancies_this_month)}</b> new vacancies</p><p><b className="text-[#101828]">{formatCount(portfolio.leases_commenced_this_month)}</b> leases commenced</p></div></div><div className="flex items-center gap-4 border-t border-[#e7edf4] pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#18a765 ${asNumber(portfolio.occupancy_rate)}%, #f2a63b 0)` }}><div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-white text-center"><div><p className="text-lg font-semibold text-[#101828]">{formatPercent(portfolio.occupancy_rate)}</p><p className="text-[0.65rem] text-[#667085]">Occupied</p></div></div></div><div className="text-xs text-[#52657a]"><p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#18a765]" />Occupied {formatPercent(portfolio.occupancy_rate)}</p><p className="mt-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#f2a63b]" />Vacant {formatPercent(100 - asNumber(portfolio.occupancy_rate))}</p></div></div></div></OverviewCard>
    <section className="grid gap-4 xl:grid-cols-2"><OverviewCard title="Vacancy & Letting Performance" subtitle="How well we are letting vacant stock." href="/agent/rentals/vacancies"><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[#e7edf4] p-3"><p className="text-sm font-semibold text-[#344054]">Vacancy Pipeline</p><div className="mt-4 space-y-3">{[['Vacant', vacancy.vacant, '#2f80ed'], ['Marketing', vacancy.marketing, '#18a765'], ['Applications', vacancy.applications, '#f2a63b'], ['Approved', vacancy.approved, '#7657d8'], ['Awaiting Lease', vacancy.awaiting_lease, '#5d8df2']].map(([label, value, colour]) => <div key={label}><div className="flex justify-between text-xs"><span className="text-[#52657a]">{label}</span><b className="text-[#101828]">{formatCount(value)}</b></div><div className="mt-1.5 h-1.5 rounded-full bg-[#edf1f5]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, asNumber(value) * 10)}%`, background: colour }} /></div></div>)}</div></div><div className="rounded-xl border border-[#e7edf4] p-3"><p className="text-sm font-semibold text-[#344054]">Letting Performance</p><dl className="mt-3 divide-y divide-[#edf1f5] text-xs">{[['Avg days vacant', vacancy.average_days_vacant === null || vacancy.average_days_vacant === undefined ? '—' : `${vacancy.average_days_vacant} days`], ['Avg days to first application', vacancy.average_days_to_first_application === null || vacancy.average_days_to_first_application === undefined ? '—' : `${vacancy.average_days_to_first_application} days`], ['Applications per vacancy', vacancy.applications_per_vacancy ?? '—'], ['Let this month', formatCount(vacancy.let_this_month)], ['Avg achieved rent', vacancy.average_achieved_rent_percent === null || vacancy.average_achieved_rent_percent === undefined ? '—' : `${vacancy.average_achieved_rent_percent}% of asking`]].map(([label, value]) => <div key={label} className="flex justify-between gap-2 py-2.5"><dt className="text-[#667085]">{label}</dt><dd className="text-right font-semibold text-[#101828]">{value}</dd></div>)}</dl></div></div></OverviewCard><OverviewCard title="Lease & Renewal Overview" subtitle="Leases expiring and renewals status." href="/agent/rentals/portfolio/properties"><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-[#667085]"><tr><th className="px-2 py-2 font-medium"> </th><th className="px-2 py-2 font-medium">Next 30</th><th className="px-2 py-2 font-medium">31–60</th><th className="px-2 py-2 font-medium">61–90</th></tr></thead><tbody className="divide-y divide-[#edf1f5]">{[['Leases expiring', 'expiring'], ['Renewal offered', 'offered'], ['Renewal accepted', 'accepted'], ['Vacating', 'vacating']].map(([label, key]) => <tr key={key}><th className="px-2 py-2.5 font-medium text-[#52657a]">{label}</th><td className="px-2 py-2.5 font-semibold">{formatCount(renewals.buckets?.next_30?.[key])}</td><td className="px-2 py-2.5 font-semibold">{formatCount(renewals.buckets?.days_31_60?.[key])}</td><td className="px-2 py-2.5 font-semibold">{formatCount(renewals.buckets?.days_61_90?.[key])}</td></tr>)}</tbody></table></div><Link to="/agent/rentals/portfolio/properties" className="mt-4 flex items-center justify-between rounded-xl border border-[#f6dfb6] bg-[#fff8ea] px-3 py-2.5 text-xs font-semibold text-[#8a5207]"><span>{formatCount(renewals.requires_action)} leases require renewal action</span><ArrowRight size={15} /></Link></OverviewCard></section>
    <section className="grid gap-4 xl:grid-cols-3"><OverviewCard title="Collections Snapshot" subtitle="Current rent collection overview." href="/agent/rentals/financial-reconciliation"><div className="rounded-xl bg-[#f8fafc] p-4"><p className="text-xs text-[#667085]">Monthly Rent Roll</p><p className="mt-1 text-2xl font-semibold text-[#101828]">{formatRent(collections.monthly_rent_roll)}</p><div className="mt-4 border-t border-[#e5ebf2] pt-4"><p className="text-sm font-semibold text-[#344054]">Collection details unavailable</p><p className="mt-1 text-xs leading-5 text-[#667085]">Payment imports are matched for review but are not yet posted to a rental collections ledger.</p></div></div></OverviewCard><OverviewCard title="Maintenance Overview" subtitle="Property maintenance at a glance." href="/agent/rentals/maintenance"><div className="space-y-2">{[['Open maintenance requests', maintenance.open, ToolCase, '/agent/rentals/maintenance'], ['In progress', maintenance.in_progress, Wrench, '/agent/rentals/maintenance'], ['Completed this month', maintenance.completed_this_month, CheckCircle2, '/agent/rentals/maintenance']].map(([label, value, Icon, href]) => <Link key={label} to={href} className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-[#f8fafc]"><span className="flex items-center gap-3 text-sm text-[#52657a]">{createElement(Icon, { size: 16, className: 'text-[#52657a]' })}{label}</span><b className="text-sm text-[#101828]">{formatCount(value)}</b></Link>)}</div><Link to="/agent/rentals/maintenance" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1769d1]">View all maintenance requests <ArrowRight size={14} /></Link></OverviewCard><OverviewCard title="Recent Activity" subtitle="Latest updates across your rental portfolio." href="/agent/rentals/tenancies">{recentActivity.length === 0 ? <p className="rounded-xl border border-dashed border-[#d3ddea] p-5 text-center text-sm text-[#667085]">No recent rental activity.</p> : <div className="divide-y divide-[#edf1f5]">{recentActivity.slice(0, 6).map((item, index) => <Link key={`${item.kind}-${index}`} to={item.href || '/agent/rentals/tenancies'} className="flex gap-3 py-3 first:pt-0"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf5ff] text-[#1769d1]">{createElement(item.kind.includes('maintenance') ? Wrench : item.kind === 'notice' ? ShieldCheck : FileText, { size: 14 })}</span><div className="min-w-0"><div className="flex gap-2"><p className="text-xs font-semibold text-[#203247]">{item.title}</p><span className="text-xs text-[#7b8ca2]">{relativeDate(item.occurred_at)}</span></div><p className="mt-1 truncate text-xs text-[#667085]">{item.subtitle}</p></div></Link>)}</div>}<Link to="/agent/rentals/tenancies" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1769d1]">View all <ArrowRight size={14} /></Link></OverviewCard></section>
  </MobileDashboardShell></main>
}
