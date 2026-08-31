import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleDollarSign, ClipboardList, FileText, Home, KeyRound, Megaphone, ShieldCheck, ToolCase, UsersRound, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { DashboardKpiCard, MobileDashboardShell } from '../../components/dashboard/PremiumDashboard'
import { getRentalManagementDashboard, getRentalManagementDashboardBottomHalf } from '../../services/rentals/rentalOperationsDashboardRepository.js'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const DATE_OPTIONS = [
  { value: 'last_7_days', label: 'Last 7 Days', days: 7 },
  { value: 'last_30_days', label: 'Last 30 Days', days: 30 },
  { value: 'last_90_days', label: 'Last 90 Days', days: 90 },
]
const stages = ['new', 'screening', 'documents', 'references', 'decision']
const stageLabel = { new: 'New', screening: 'Screening', documents: 'Documents', references: 'References', decision: 'Decision' }

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

function OverviewCard({ title, subtitle, href, children }) {
  return <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2><p className="mt-1 text-sm text-[#667085]">{subtitle}</p></div><Link to={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1769d1]">View all <ArrowRight size={14} /></Link></div><div className="mt-5">{children}</div></section>
}

export default function RentalOperationsDashboardPage() {
  const workspace = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const [dataScope, setDataScope] = useState('company')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('all')
  const [dateRange, setDateRange] = useState('last_30_days')
  const [snapshot, setSnapshot] = useState(null)
  const [bottomSnapshot, setBottomSnapshot] = useState(null)
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
      const [dashboard, bottom] = await Promise.all([getRentalManagementDashboard(params), getRentalManagementDashboardBottomHalf(params)])
      setSnapshot(dashboard); setBottomSnapshot(bottom)
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
  const leadDelta = asNumber(metrics.new_leads) - asNumber(metrics.new_leads_previous_period)
  const kpis = [
    { key: 'applications', icon: ClipboardList, label: 'Active Applications', value: formatCount(metrics.active_applications), tone: 'blue', trend: null, trendLabel: 'Current review queue' },
    { key: 'mandates', icon: FileText, label: 'Active Mandates', value: formatCount(metrics.active_mandates), tone: 'green', trend: null, trendLabel: 'Under management' },
    { key: 'occupancy', icon: Home, label: 'Occupancy Rate', value: formatPercent(metrics.occupancy_rate), tone: 'orange', trend: null, trendLabel: 'Managed rentable units' },
    { key: 'rent', icon: CircleDollarSign, label: 'Monthly Rent Roll', value: formatRent(metrics.monthly_rent_roll), tone: 'purple', trend: null, trendLabel: 'Current contractual rent' },
    { key: 'leads', icon: UsersRound, label: 'New Leads', value: formatCount(metrics.new_leads), tone: 'slate', trend: leadDelta, trendLabel: `vs previous ${rangeDays(dateRange)} days` },
  ]

  return <main className="mx-auto w-full max-w-[1600px] px-3 py-2 sm:px-5 lg:px-7"><MobileDashboardShell>
    {error ? <section className="rounded-2xl border border-[#f7c9c9] bg-[#fff5f5] p-4 text-sm text-[#b42318]">{error}</section> : null}
    {!rentalScope.organisationId ? <section className="rounded-2xl border border-[#f4d7a9] bg-[#fffaf0] p-4 text-sm text-[#7a4b05]">Choose an agency workspace to load the Rentals dashboard.</section> : null}
    <section className="-mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-5">{kpis.map((item) => <Link key={item.key} to={item.key === 'applications' ? '/agent/rentals/applications' : item.key === 'mandates' ? '/agent/rentals/portfolio/properties' : item.key === 'occupancy' ? '/agent/rentals/tenancies' : item.key === 'rent' ? '/agent/rentals/tenancies' : '/agent/rentals/pipeline/leads'} className="contents"><DashboardKpiCard {...item} /></Link>)}</section>
    <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#fff4e5] text-[#df7b14]"><Home size={17} /></span><div><h2 className="text-[1.02rem] font-semibold text-[#101828]">Occupancy Rate</h2><p className="text-sm text-[#667085]">Current overall portfolio occupancy.</p></div></div><p className="mt-5 text-3xl font-semibold tabular-nums text-[#16894f]">{loading ? '—' : formatPercent(occupancy.occupancy_rate)}</p></div><dl className="min-w-[230px] rounded-xl border border-[#e3eaf2] bg-[#fbfdff] px-4 py-3 text-sm"><div className="flex justify-between gap-6 py-1"><dt className="text-[#667085]">Occupied units</dt><dd className="font-semibold">{formatCount(occupancy.occupied_units)}</dd></div><div className="flex justify-between gap-6 py-1"><dt className="text-[#667085]">Vacant units</dt><dd className="font-semibold">{formatCount(occupancy.vacant_units)}</dd></div><div className="flex justify-between gap-6 py-1"><dt className="text-[#667085]">Total managed units</dt><dd className="font-semibold">{formatCount(occupancy.total_units)}</dd></div></dl></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-[#eaf0f5]"><div className="h-full rounded-full bg-[#16894f] transition-[width]" style={{ width: `${Math.max(0, Math.min(100, asNumber(occupancy.occupancy_rate)))}%` }} /></div><p className="mt-2 text-xs text-[#667085]">Based on units under an active, confirmed management mandate.</p></section>
    <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[1.02rem] font-semibold text-[#101828]">Active Applications</h2><p className="mt-1 text-sm text-[#667085]">Track rental applications and their progress.</p></div><Link to="/agent/rentals/applications" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1769d1]">View all <ArrowRight size={14} /></Link></div>{loading ? <p className="py-10 text-sm text-[#667085]">Loading applications…</p> : applications.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] p-8 text-center text-sm text-[#667085]">No active rental applications in this scope.</div> : <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-1">{applications.map((application) => <Link key={application.id} to="/agent/rentals/applications" className="min-w-[250px] snap-start rounded-2xl border border-[#e3eaf2] bg-[#fff] p-4 transition hover:border-[#9bc4f4]"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[#edf5ff] px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-[#1769d1]">{stageLabel[application.stage] || 'Review'}</span><span className="text-xs text-[#7b8ca2]">{relativeDate(application.submitted_at || application.created_at)}</span></div><div className="mt-4 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f1f5f9] text-xs font-bold text-[#475569]">RA</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#203247]">Rental application</p><p className="truncate text-xs text-[#667085]">{application.unit_label || 'Unit pending'} · {application.property_name || 'Property pending'}</p></div></div><p className="mt-3 text-sm font-semibold text-[#344054]">{formatRent(application.monthly_rent)} / month</p><div className="mt-4 flex items-center gap-1.5">{stages.map((stage, index) => <span key={stage} className={`h-2.5 flex-1 rounded-full ${stages.indexOf(application.stage) >= index ? 'bg-[#2f80ed]' : 'bg-[#e1e9f2]'}`} />)}</div><div className="mt-2 flex justify-between text-[0.6rem] text-[#7b8ca2]"><span>New</span><span>Screening</span><span>Decision</span></div></Link>)}</div>}</section>
    <OverviewCard title="Portfolio Health" subtitle="Overall rental portfolio snapshot." href="/agent/rentals/portfolio/properties"><div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.55fr)_minmax(220px,0.48fr)] xl:items-center"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['Managed Units', portfolio.managed_units, Home], ['Occupied Units', portfolio.occupied_units, KeyRound], ['Vacant Units', portfolio.vacant_units, Megaphone], ['Becoming Available', portfolio.becoming_available_30_days, ClipboardList], ['Monthly Rent Roll', formatRent(portfolio.monthly_rent_roll), CircleDollarSign]].map(([label, value, Icon]) => <div key={label} className="rounded-xl bg-[#f8fafc] p-3">{createElement(Icon, { size: 16, className: 'text-[#52657a]' })}<p className="mt-3 text-xl font-semibold text-[#101828]">{typeof value === 'string' ? value : formatCount(value)}</p><p className="mt-1 text-xs text-[#667085]">{label}{label === 'Becoming Available' ? ' (30 days)' : ''}</p></div>)}</div><div className="border-t border-[#e7edf4] pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"><p className="text-sm font-semibold text-[#344054]">This Month</p><div className="mt-3 space-y-3 text-sm text-[#52657a]"><p><b className="text-[#101828]">+{formatCount(portfolio.units_occupied_this_month)}</b> units occupied this month</p><p><b className="text-[#101828]">{formatCount(portfolio.new_vacancies_this_month)}</b> new vacancies</p><p><b className="text-[#101828]">{formatCount(portfolio.leases_commenced_this_month)}</b> leases commenced</p></div></div><div className="flex items-center gap-4 border-t border-[#e7edf4] pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#18a765 ${asNumber(portfolio.occupancy_rate)}%, #f2a63b 0)` }}><div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-white text-center"><div><p className="text-lg font-semibold text-[#101828]">{formatPercent(portfolio.occupancy_rate)}</p><p className="text-[0.65rem] text-[#667085]">Occupied</p></div></div></div><div className="text-xs text-[#52657a]"><p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#18a765]" />Occupied {formatPercent(portfolio.occupancy_rate)}</p><p className="mt-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#f2a63b]" />Vacant {formatPercent(100 - asNumber(portfolio.occupancy_rate))}</p></div></div></div></OverviewCard>
    <section className="grid gap-4 xl:grid-cols-2"><OverviewCard title="Vacancy & Letting Performance" subtitle="How well we are letting vacant stock." href="/agent/rentals/vacancies"><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[#e7edf4] p-3"><p className="text-sm font-semibold text-[#344054]">Vacancy Pipeline</p><div className="mt-4 space-y-3">{[['Vacant', vacancy.vacant, '#2f80ed'], ['Marketing', vacancy.marketing, '#18a765'], ['Applications', vacancy.applications, '#f2a63b'], ['Approved', vacancy.approved, '#7657d8'], ['Awaiting Lease', vacancy.awaiting_lease, '#5d8df2']].map(([label, value, colour]) => <div key={label}><div className="flex justify-between text-xs"><span className="text-[#52657a]">{label}</span><b className="text-[#101828]">{formatCount(value)}</b></div><div className="mt-1.5 h-1.5 rounded-full bg-[#edf1f5]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, asNumber(value) * 10)}%`, background: colour }} /></div></div>)}</div></div><div className="rounded-xl border border-[#e7edf4] p-3"><p className="text-sm font-semibold text-[#344054]">Letting Performance</p><dl className="mt-3 divide-y divide-[#edf1f5] text-xs">{[['Avg days vacant', vacancy.average_days_vacant === null || vacancy.average_days_vacant === undefined ? '—' : `${vacancy.average_days_vacant} days`], ['Avg days to first application', vacancy.average_days_to_first_application === null || vacancy.average_days_to_first_application === undefined ? '—' : `${vacancy.average_days_to_first_application} days`], ['Applications per vacancy', vacancy.applications_per_vacancy ?? '—'], ['Let this month', formatCount(vacancy.let_this_month)], ['Avg achieved rent', vacancy.average_achieved_rent_percent === null || vacancy.average_achieved_rent_percent === undefined ? '—' : `${vacancy.average_achieved_rent_percent}% of asking`]].map(([label, value]) => <div key={label} className="flex justify-between gap-2 py-2.5"><dt className="text-[#667085]">{label}</dt><dd className="text-right font-semibold text-[#101828]">{value}</dd></div>)}</dl></div></div></OverviewCard><OverviewCard title="Lease & Renewal Overview" subtitle="Leases expiring and renewals status." href="/agent/rentals/tenancies"><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-[#667085]"><tr><th className="px-2 py-2 font-medium"> </th><th className="px-2 py-2 font-medium">Next 30</th><th className="px-2 py-2 font-medium">31–60</th><th className="px-2 py-2 font-medium">61–90</th></tr></thead><tbody className="divide-y divide-[#edf1f5]">{[['Leases expiring', 'expiring'], ['Renewal offered', 'offered'], ['Renewal accepted', 'accepted'], ['Vacating', 'vacating']].map(([label, key]) => <tr key={key}><th className="px-2 py-2.5 font-medium text-[#52657a]">{label}</th><td className="px-2 py-2.5 font-semibold">{formatCount(renewals.buckets?.next_30?.[key])}</td><td className="px-2 py-2.5 font-semibold">{formatCount(renewals.buckets?.days_31_60?.[key])}</td><td className="px-2 py-2.5 font-semibold">{formatCount(renewals.buckets?.days_61_90?.[key])}</td></tr>)}</tbody></table></div><Link to="/agent/rentals/tenancies" className="mt-4 flex items-center justify-between rounded-xl border border-[#f6dfb6] bg-[#fff8ea] px-3 py-2.5 text-xs font-semibold text-[#8a5207]"><span>{formatCount(renewals.requires_action)} leases require renewal action</span><ArrowRight size={15} /></Link></OverviewCard></section>
    <section className="grid gap-4 xl:grid-cols-3"><OverviewCard title="Collections Snapshot" subtitle="Current rent collection overview." href="/agent/rentals/financial-reconciliation"><div className="rounded-xl bg-[#f8fafc] p-4"><p className="text-xs text-[#667085]">Monthly Rent Roll</p><p className="mt-1 text-2xl font-semibold text-[#101828]">{formatRent(collections.monthly_rent_roll)}</p><div className="mt-4 border-t border-[#e5ebf2] pt-4"><p className="text-sm font-semibold text-[#344054]">Collection details unavailable</p><p className="mt-1 text-xs leading-5 text-[#667085]">Payment imports are matched for review but are not yet posted to a rental collections ledger.</p></div></div></OverviewCard><OverviewCard title="Maintenance Overview" subtitle="Property maintenance at a glance." href="/agent/rentals/maintenance"><div className="space-y-2">{[['Open maintenance requests', maintenance.open, ToolCase, '/agent/rentals/maintenance'], ['In progress', maintenance.in_progress, Wrench, '/agent/rentals/maintenance'], ['Completed this month', maintenance.completed_this_month, CheckCircle2, '/agent/rentals/maintenance']].map(([label, value, Icon, href]) => <Link key={label} to={href} className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-[#f8fafc]"><span className="flex items-center gap-3 text-sm text-[#52657a]">{createElement(Icon, { size: 16, className: 'text-[#52657a]' })}{label}</span><b className="text-sm text-[#101828]">{formatCount(value)}</b></Link>)}</div><Link to="/agent/rentals/maintenance" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1769d1]">View all maintenance requests <ArrowRight size={14} /></Link></OverviewCard><OverviewCard title="Recent Activity" subtitle="Latest updates across your rental portfolio." href="/agent/rentals/tenancies">{recentActivity.length === 0 ? <p className="rounded-xl border border-dashed border-[#d3ddea] p-5 text-center text-sm text-[#667085]">No recent rental activity.</p> : <div className="divide-y divide-[#edf1f5]">{recentActivity.slice(0, 6).map((item, index) => <Link key={`${item.kind}-${index}`} to={item.href || '/agent/rentals/tenancies'} className="flex gap-3 py-3 first:pt-0"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf5ff] text-[#1769d1]">{createElement(item.kind.includes('maintenance') ? Wrench : item.kind === 'notice' ? ShieldCheck : FileText, { size: 14 })}</span><div className="min-w-0"><div className="flex gap-2"><p className="text-xs font-semibold text-[#203247]">{item.title}</p><span className="text-xs text-[#7b8ca2]">{relativeDate(item.occurred_at)}</span></div><p className="mt-1 truncate text-xs text-[#667085]">{item.subtitle}</p></div></Link>)}</div>}<Link to="/agent/rentals/tenancies" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1769d1]">View all <ArrowRight size={14} /></Link></OverviewCard></section>
  </MobileDashboardShell></main>
}
