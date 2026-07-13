import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  MessageSquareText,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  buildLeadAnalyticsCsvExport,
  getLeadAnalyticsDashboard,
} from '../services/leadAnalyticsService'

const pageShell = 'mx-auto flex w-full max-w-[1480px] flex-col gap-5'
const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getOrganisationId(workspaceContext = {}) {
  return normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0)}%`
}

function formatHours(value) {
  const number = Number(value || 0)
  if (!number) return '0h'
  return number < 24 ? `${number.toFixed(number % 1 ? 1 : 0)}h` : `${(number / 24).toFixed(1)}d`
}

function formatDays(value) {
  const number = Number(value || 0)
  if (!number) return '0d'
  return `${number.toFixed(number % 1 ? 1 : 0)}d`
}

function MetricCard({ label, value, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-500',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-rose-50 text-rose-600',
  }
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
        {Icon ? <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone] || tones.slate}`}><Icon size={17} /></span> : null}
      </div>
      <strong className="mt-3 block text-2xl font-semibold tracking-[-0.045em] text-slate-950">{value}</strong>
    </article>
  )
}

function SectionHeader({ eyebrow, title, copy, action }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
        {copy ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{copy}</p> : null}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ title, copy }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy}</p>
    </div>
  )
}

function downloadCsv(type, analytics) {
  const csv = buildLeadAnalyticsCsvExport(type, analytics)
  if (!csv) return
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `lead-${type}-analytics.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function ExportButtons({ analytics }) {
  return (
    <div className="flex flex-wrap gap-2">
      {['funnel', 'sources', 'agents', 'listings', 'seller_funnel', 'seller_sources', 'seller_agents', 'seller_branches', 'suggestions', 'recommendations', 'property_shares', 'communication_deliveries', 'leads'].map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => downloadCsv(type, analytics)}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download size={14} />
          {type}
        </button>
      ))}
    </div>
  )
}

function FunnelSection({ stages = [] }) {
  const max = Math.max(...stages.map((stage) => stage.volume), 1)
  return (
    <section className={`${panelClass} p-5`}>
      <SectionHeader
        eyebrow="Funnel"
        title="Enquiries to Registrations"
        copy="Explainable volume, conversion, drop-off, and average time signals from the existing lead engine."
      />
      <div className="mt-5 grid gap-3">
        {stages.map((stage) => (
          <article key={stage.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">{stage.label}</h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{formatNumber(stage.volume)} records</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(3, (stage.volume / max) * 100)}%` }} />
                </div>
              </div>
              <dl className="grid min-w-[320px] grid-cols-3 gap-2 text-right text-xs">
                <div>
                  <dt className="font-semibold uppercase tracking-[0.08em] text-slate-400">Conversion</dt>
                  <dd className="mt-1 font-semibold text-slate-800">{formatPercent(stage.conversionPercent)}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-[0.08em] text-slate-400">Drop-off</dt>
                  <dd className="mt-1 font-semibold text-slate-800">{formatPercent(stage.dropOffPercent)}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-[0.08em] text-slate-400">Avg time</dt>
                  <dd className="mt-1 font-semibold text-slate-800">{formatHours(stage.averageTimeInStageHours)}</dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function SellerFunnelSection({ stages = [] }) {
  const max = Math.max(...stages.map((stage) => stage.volume), 1)
  return (
    <div className="mt-5 grid gap-3">
      {stages.map((stage) => (
        <article key={stage.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-950">{stage.label}</h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{formatNumber(stage.volume)} sellers</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{formatNumber(stage.activeCount)} active here</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(3, (stage.volume / max) * 100)}%` }} />
              </div>
            </div>
            <dl className="grid min-w-[360px] grid-cols-4 gap-2 text-right text-xs">
              <div>
                <dt className="font-semibold uppercase tracking-[0.08em] text-slate-400">Conversion</dt>
                <dd className="mt-1 font-semibold text-slate-800">{formatPercent(stage.conversionPercent)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.08em] text-slate-400">Drop-off</dt>
                <dd className="mt-1 font-semibold text-slate-800">{formatPercent(stage.dropOffPercent)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.08em] text-slate-400">From prior</dt>
                <dd className="mt-1 font-semibold text-slate-800">{formatDays(stage.averageDaysFromPrevious)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.08em] text-slate-400">From lead</dt>
                <dd className="mt-1 font-semibold text-slate-800">{formatDays(stage.averageDaysFromLead)}</dd>
              </div>
            </dl>
          </div>
        </article>
      ))}
    </div>
  )
}

function DataTable({ columns = [], rows = [], emptyTitle = 'No data yet', emptyCopy = 'Records will appear here once lead activity is captured.' }) {
  if (!rows.length) return <EmptyState title={emptyTitle} copy={emptyCopy} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-400">
          <tr>
            {columns.map((column) => <th key={column.key} className="px-4 py-3 font-semibold">{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.source || row.agentId || row.listingId || index} className="hover:bg-slate-50/80">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrendList({ title, rows = [] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
            <span className="truncate font-medium text-slate-700">{row.label}</span>
            <span className="font-semibold text-slate-950">{formatNumber(row.count)}</span>
          </div>
        )) : <p className="text-sm text-slate-500">No demand signal yet.</p>}
      </div>
    </article>
  )
}

function AgentReportingPage() {
  const workspaceContext = useWorkspace()
  const organisationId = getOrganisationId(workspaceContext)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [search, setSearch] = useState('')

  const loadAnalytics = useCallback(async () => {
    if (!organisationId) {
      setAnalytics(null)
      setError('Select an agency workspace before loading lead analytics.')
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      setAnalytics(await getLeadAnalyticsDashboard({ organisationId }))
    } catch (loadError) {
      setAnalytics(null)
      setError(loadError?.message || 'Unable to load lead analytics.')
    } finally {
      setLoading(false)
    }
  }, [organisationId])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  const filteredSources = useMemo(() => {
    const keyword = search.toLowerCase()
    return (analytics?.sources || []).filter((row) => !keyword || row.source.toLowerCase().includes(keyword))
  }, [analytics?.sources, search])

  const filteredAgents = useMemo(() => {
    const keyword = search.toLowerCase()
    return (analytics?.agents || []).filter((row) => !keyword || row.agentName.toLowerCase().includes(keyword) || row.agentId.toLowerCase().includes(keyword))
  }, [analytics?.agents, search])

  const filteredListings = useMemo(() => {
    const keyword = search.toLowerCase()
    return (analytics?.listings || []).filter((row) => !keyword || row.title.toLowerCase().includes(keyword) || row.listingId.toLowerCase().includes(keyword))
  }, [analytics?.listings, search])

  const filteredSellerSources = useMemo(() => {
    const keyword = search.toLowerCase()
    return (analytics?.seller?.sources || []).filter((row) => !keyword || row.source.toLowerCase().includes(keyword))
  }, [analytics?.seller?.sources, search])

  const filteredSellerAgents = useMemo(() => {
    const keyword = search.toLowerCase()
    return (analytics?.seller?.agents || []).filter((row) => !keyword || row.agentName.toLowerCase().includes(keyword) || row.agentId.toLowerCase().includes(keyword))
  }, [analytics?.seller?.agents, search])

  const filteredSellerBranches = useMemo(() => {
    const keyword = search.toLowerCase()
    return (analytics?.seller?.branches || []).filter((row) => !keyword || row.branchName.toLowerCase().includes(keyword) || row.branchId.toLowerCase().includes(keyword))
  }, [analytics?.seller?.branches, search])

  return (
    <main className={pageShell}>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Management Reporting</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-slate-950">Lead Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Source, lead, requirement, match, viewing, offer, and transaction visibility without exports or spreadsheet work.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {analytics ? <ExportButtons analytics={analytics} /> : null}
          <button type="button" onClick={loadAnalytics} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </header>

      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Lead analytics could not be loaded" copy={error} /> : null}

      {analytics && !loading ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-10">
            <MetricCard label="Enquiries" value={formatNumber(analytics.overview.totalEnquiries)} icon={Search} tone="blue" />
            <MetricCard label="Leads" value={formatNumber(analytics.overview.totalLeads)} icon={Users} tone="blue" />
            <MetricCard label="Requirements" value={formatNumber(analytics.overview.totalRequirements)} icon={Target} tone="green" />
            <MetricCard label="Suggestions" value={formatNumber(analytics.overview.totalSuggestions)} icon={Target} tone="blue" />
            <MetricCard label="Recommendations" value={formatNumber(analytics.overview.totalRecommendations)} icon={MessageSquareText} tone="amber" />
            <MetricCard label="Property Shares" value={formatNumber(analytics.overview.totalPropertyShares)} icon={MessageSquareText} tone="green" />
            <MetricCard label="Matches" value={formatNumber(analytics.overview.totalMatches)} icon={TrendingUp} tone="green" />
            <MetricCard label="Viewings" value={formatNumber(analytics.overview.totalViewings)} icon={CalendarDays} tone="amber" />
            <MetricCard label="Offers" value={formatNumber(analytics.overview.totalOffers)} icon={BriefcaseBusiness} tone="amber" />
            <MetricCard label="Transactions" value={formatNumber(analytics.overview.totalTransactions)} icon={BarChart3} tone="green" />
          </section>

          <section className={`${panelClass} p-4`}>
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(5,minmax(130px,1fr))]">
              <label className="relative block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-300" placeholder="Search sources, agents, listings" />
              </label>
              <MetricCard label="Avg Response" value={formatHours(analytics.response.averageResponseHours)} icon={MessageSquareText} tone="blue" />
              <MetricCard label="Median Response" value={formatHours(analytics.response.medianResponseHours)} icon={MessageSquareText} tone="blue" />
              <MetricCard label="Overdue" value={formatNumber(analytics.response.overdueLeads)} icon={TrendingUp} tone="red" />
              <MetricCard label="Uncontacted" value={formatNumber(analytics.response.uncontactedLeads)} icon={Users} tone="amber" />
              <MetricCard label="Escalated" value={formatNumber(analytics.response.escalatedLeads)} icon={TrendingUp} tone="red" />
            </div>
          </section>

          <FunnelSection stages={analytics.funnel} />

          <section className={`${panelClass} overflow-hidden p-5`}>
            <SectionHeader
              eyebrow="Seller Funnel"
              title="Seller Journey Analytics"
              copy="Seller lead, mandate, and listing-live metrics derived from the existing seller journey service."
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Seller Leads" value={formatNumber(analytics.seller?.overview?.sellerLeads)} icon={Users} tone="blue" />
              <MetricCard label="Mandates Sent" value={formatNumber(analytics.seller?.overview?.mandatesSent)} icon={MessageSquareText} tone="blue" />
              <MetricCard label="Mandates Signed" value={formatNumber(analytics.seller?.overview?.mandatesSigned)} icon={CheckCircle2} tone="green" />
              <MetricCard label="Listings Live" value={formatNumber(analytics.seller?.overview?.listingsLive)} icon={TrendingUp} tone="green" />
              <MetricCard label="Avg Live Time" value={formatDays(analytics.seller?.overview?.averageDaysToListingLive)} icon={Clock3} tone="amber" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <MetricCard label="Ready For Listing" value={formatNumber(analytics.seller?.overview?.readyForListing)} icon={CheckCircle2} tone="green" />
              <MetricCard label="Blocked Listings" value={formatNumber(analytics.seller?.overview?.blockedListings)} icon={TrendingUp} tone="red" />
              <MetricCard label="Signature Wait" value={formatNumber(analytics.seller?.overview?.mandatesAwaitingSignature)} icon={MessageSquareText} tone="amber" />
              <MetricCard label="Awaiting Activation" value={formatNumber(analytics.seller?.overview?.listingsAwaitingActivation)} icon={BriefcaseBusiness} tone="amber" />
              <MetricCard label="Avg To Mandate" value={formatDays(analytics.seller?.overview?.averageDaysToMandate)} icon={Clock3} tone="blue" />
              <MetricCard label="Avg To Listing" value={formatDays(analytics.seller?.overview?.averageDaysToListing)} icon={Clock3} tone="blue" />
              <MetricCard label="Blocked Sellers" value={formatNumber(analytics.seller?.overview?.readinessDistribution?.blocked)} icon={TrendingUp} tone="red" />
            </div>
            <SellerFunnelSection stages={analytics.seller?.funnel || []} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Mandate Conversion" value={formatPercent(analytics.seller?.overview?.mandateConversionRate)} icon={TrendingUp} tone="green" />
              <MetricCard label="Listing Live Conversion" value={formatPercent(analytics.seller?.overview?.listingLiveConversionRate)} icon={TrendingUp} tone="green" />
              <MetricCard label="Listings Created" value={formatNumber(analytics.seller?.overview?.listingsCreated)} icon={BriefcaseBusiness} tone="blue" />
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <TrendList
                title="Most Common Seller Blockers"
                rows={analytics.seller?.readiness?.commonBlockers || []}
              />
              <TrendList
                title="Readiness Distribution"
                rows={Object.entries(analytics.seller?.readiness?.distribution || {}).map(([label, count]) => ({ label: label.replace(/_/g, ' '), count }))}
              />
            </div>
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-950">Seller Source Performance</h3>
                </div>
                <DataTable
                  rows={filteredSellerSources}
                  emptyTitle="No seller source data yet"
                  emptyCopy="Seller source metrics appear once seller leads are captured."
                  columns={[
                    { key: 'source', label: 'Source' },
                    { key: 'sellerLeads', label: 'Leads', render: (row) => formatNumber(row.sellerLeads) },
                    { key: 'mandatesSigned', label: 'Mandates Signed', render: (row) => formatNumber(row.mandatesSigned) },
                    { key: 'listingsLive', label: 'Listings Live', render: (row) => formatNumber(row.listingsLive) },
                    { key: 'listingLiveConversionPercent', label: 'Live %', render: (row) => formatPercent(row.listingLiveConversionPercent) },
                  ]}
                />
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-950">Seller Agent Performance</h3>
                </div>
                <DataTable
                  rows={filteredSellerAgents}
                  emptyTitle="No seller agent data yet"
                  emptyCopy="Seller ownership metrics appear once seller leads are assigned."
                  columns={[
                    { key: 'agentName', label: 'Agent' },
                    { key: 'sellerLeads', label: 'Leads', render: (row) => formatNumber(row.sellerLeads) },
                    { key: 'mandatesSigned', label: 'Mandates Signed', render: (row) => formatNumber(row.mandatesSigned) },
                    { key: 'listingsLive', label: 'Listings Live', render: (row) => formatNumber(row.listingsLive) },
                    { key: 'averageDaysToListingLive', label: 'Avg Live Time', render: (row) => formatDays(row.averageDaysToListingLive) },
                  ]}
                />
              </div>
            </div>
            {filteredSellerBranches.length ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-950">Seller Branch Performance</h3>
                </div>
                <DataTable
                  rows={filteredSellerBranches}
                  columns={[
                    { key: 'branchName', label: 'Branch' },
                    { key: 'sellerLeads', label: 'Leads', render: (row) => formatNumber(row.sellerLeads) },
                    { key: 'mandatesSigned', label: 'Mandates Signed', render: (row) => formatNumber(row.mandatesSigned) },
                    { key: 'listingsLive', label: 'Listings Live', render: (row) => formatNumber(row.listingsLive) },
                    { key: 'listingLiveConversionPercent', label: 'Live %', render: (row) => formatPercent(row.listingLiveConversionPercent) },
                  ]}
                />
              </div>
            ) : null}
          </section>

          <section className={`${panelClass} overflow-hidden p-5`}>
            <SectionHeader eyebrow="Sources" title="Source Performance" copy="Enquiries, created leads, qualified leads, viewings, offers, transactions, and registrations by source." />
            <div className="mt-5">
              <DataTable
                rows={filteredSources}
                columns={[
                  { key: 'source', label: 'Source' },
                  { key: 'enquiries', label: 'Enquiries', render: (row) => formatNumber(row.enquiries) },
                  { key: 'leads', label: 'Leads', render: (row) => formatNumber(row.leads) },
                  { key: 'qualified', label: 'Qualified', render: (row) => formatNumber(row.qualified) },
                  { key: 'viewings', label: 'Viewings', render: (row) => formatNumber(row.viewings) },
                  { key: 'offers', label: 'Offers', render: (row) => formatNumber(row.offers) },
                  { key: 'transactions', label: 'Transactions', render: (row) => formatNumber(row.transactions) },
                  { key: 'transactionConversionPercent', label: 'Lead to TX', render: (row) => formatPercent(row.transactionConversionPercent) },
                ]}
              />
            </div>
          </section>

          <section className={`${panelClass} overflow-hidden p-5`}>
            <SectionHeader eyebrow="Agents" title="Agent Performance" copy="Ownership, contact, response, viewing, offer, and transaction metrics from current lead records." />
            <div className="mt-5">
              <DataTable
                rows={filteredAgents}
                columns={[
                  { key: 'agentName', label: 'Agent' },
                  { key: 'leadsAssigned', label: 'Leads', render: (row) => formatNumber(row.leadsAssigned) },
                  { key: 'leadsContacted', label: 'Contacted', render: (row) => formatNumber(row.leadsContacted) },
                  { key: 'averageResponseHours', label: 'Avg Response', render: (row) => formatHours(row.averageResponseHours) },
                  { key: 'viewingsBooked', label: 'Viewings', render: (row) => formatNumber(row.viewingsBooked) },
                  { key: 'offersSubmitted', label: 'Offers', render: (row) => formatNumber(row.offersSubmitted) },
                  { key: 'transactionsCreated', label: 'Transactions', render: (row) => formatNumber(row.transactionsCreated) },
                  { key: 'conversionPercent', label: 'Conversion', render: (row) => formatPercent(row.conversionPercent) },
                ]}
              />
            </div>
          </section>

          <section className={`${panelClass} overflow-hidden p-5`}>
            <SectionHeader eyebrow="Listings" title="Listing Performance" copy="Every listing can be compared by original enquiries, matched leads, viewings, offers, and transactions." />
            <div className="mt-5">
              <DataTable
                rows={filteredListings}
                columns={[
                  { key: 'title', label: 'Listing' },
                  { key: 'enquiries', label: 'Enquiries', render: (row) => formatNumber(row.enquiries) },
                  { key: 'matches', label: 'Matches', render: (row) => formatNumber(row.matches) },
                  { key: 'viewings', label: 'Viewings', render: (row) => formatNumber(row.viewings) },
                  { key: 'offers', label: 'Offers', render: (row) => formatNumber(row.offers) },
                  { key: 'transactions', label: 'Transactions', render: (row) => formatNumber(row.transactions) },
                  { key: 'conversionPercent', label: 'Conversion', render: (row) => formatPercent(row.conversionPercent) },
                ]}
              />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className={`${panelClass} p-5`}>
              <SectionHeader eyebrow="Demand" title="Requirement Trends" copy="Market intelligence from structured lead requirements." />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <TrendList title="Most Requested Suburbs" rows={analytics.requirements.topSuburbs} />
                <TrendList title="Most Requested Areas" rows={analytics.requirements.topAreas} />
                <TrendList title="Property Types" rows={analytics.requirements.topPropertyTypes} />
                <TrendList title="Budget Bands" rows={analytics.requirements.budgetBands} />
                <TrendList title="Bedrooms" rows={analytics.requirements.bedroomDemand} />
                <TrendList title="Features" rows={analytics.requirements.topFeatures} />
              </div>
            </div>

            <div className={`${panelClass} p-5`}>
              <SectionHeader eyebrow="Communication" title="Touchpoint Analytics" copy="Manual communication logs and match outcomes. No messages are sent from reporting." />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Calls Logged" value={formatNumber(analytics.communication.call)} icon={MessageSquareText} tone="blue" />
                <MetricCard label="Emails Logged" value={formatNumber(analytics.communication.email)} icon={MessageSquareText} tone="blue" />
                <MetricCard label="WhatsApps Logged" value={formatNumber(analytics.communication.whatsapp)} icon={MessageSquareText} tone="green" />
                <MetricCard label="Meetings Logged" value={formatNumber(analytics.communication.meeting)} icon={CalendarDays} tone="amber" />
                <MetricCard label="Notes Logged" value={formatNumber(analytics.communication.note)} icon={MessageSquareText} tone="slate" />
                <MetricCard label="Touchpoints / TX" value={formatNumber(analytics.communication.averageTouchpointsBeforeTransaction)} icon={TrendingUp} tone="green" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Matches Created" value={formatNumber(analytics.communication.matchesCreated)} icon={Target} tone="green" />
                <MetricCard label="Matches Viewed" value={formatNumber(analytics.communication.matchesViewed)} icon={Target} tone="blue" />
                <MetricCard label="Matches Dismissed" value={formatNumber(analytics.communication.matchesDismissed)} icon={Target} tone="red" />
                <MetricCard label="Viewings Generated" value={formatNumber(analytics.communication.viewingsGenerated)} icon={CalendarDays} tone="amber" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Suggestions Generated" value={formatNumber(analytics.suggestions.generated)} icon={Target} tone="blue" />
                <MetricCard label="Suggestions Accepted" value={formatNumber(analytics.suggestions.accepted)} icon={Target} tone="green" />
                <MetricCard label="Suggestions Rejected" value={formatNumber(analytics.suggestions.rejected)} icon={Target} tone="red" />
                <MetricCard label="Suggestion to Viewing" value={formatPercent(analytics.suggestions.suggestionToViewingRate)} icon={CalendarDays} tone="amber" />
                <MetricCard label="Suggestion to Offer" value={formatPercent(analytics.suggestions.suggestionToOfferRate)} icon={BriefcaseBusiness} tone="amber" />
                <MetricCard label="Suggestion to TX" value={formatPercent(analytics.suggestions.suggestionToTransactionRate)} icon={TrendingUp} tone="green" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Properties Sent" value={formatNumber(analytics.propertyShares.propertiesSent)} icon={MessageSquareText} tone="green" />
                <MetricCard label="Emails Sent" value={formatNumber(analytics.propertyShares.emailsSent)} icon={MessageSquareText} tone="blue" />
                <MetricCard label="WhatsApps Sent" value={formatNumber(analytics.propertyShares.whatsAppsSent)} icon={MessageSquareText} tone="green" />
                <MetricCard label="Pending Sends" value={formatNumber(analytics.propertyShares.pendingSends)} icon={Clock3} tone="amber" />
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <SectionHeader eyebrow="Communication Performance" title="Delivery Performance" copy="Delivery attempts, provider acceptance, and failure signals from manually approved buyer communications." />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MetricCard label="Communications Sent" value={formatNumber(analytics.communicationPerformance?.communicationsSent)} icon={MessageSquareText} tone="blue" />
                  <MetricCard label="Delivered" value={formatNumber(analytics.communicationPerformance?.communicationsDelivered)} icon={CheckCircle2} tone="green" />
                  <MetricCard label="Failed" value={formatNumber(analytics.communicationPerformance?.communicationsFailed)} icon={MessageSquareText} tone="red" />
                  <MetricCard label="Delivery Rate" value={formatPercent(analytics.communicationPerformance?.deliveryRate)} icon={TrendingUp} tone="green" />
                  <MetricCard label="Failure Rate" value={formatPercent(analytics.communicationPerformance?.failureRate)} icon={TrendingUp} tone="red" />
                  <MetricCard label="Email Sends" value={formatNumber(analytics.communicationPerformance?.emailSends)} icon={MessageSquareText} tone="blue" />
                  <MetricCard label="WhatsApp Sends" value={formatNumber(analytics.communicationPerformance?.whatsappSends)} icon={MessageSquareText} tone="green" />
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-950">Agent Breakdown</h3>
                    <div className="mt-3 space-y-2">
                      {(analytics.communicationPerformance?.agentBreakdown || []).slice(0, 6).map((row) => (
                        <div key={row.agent} className="grid grid-cols-[minmax(0,1fr)_70px_70px] gap-3 text-sm">
                          <span className="truncate font-medium text-slate-700">{row.agent}</span>
                          <span className="text-right text-slate-500">{formatPercent(row.deliveryRate)}</span>
                          <span className="text-right text-slate-500">{formatPercent(row.failureRate)}</span>
                        </div>
                      ))}
                      {!(analytics.communicationPerformance?.agentBreakdown || []).length ? <p className="text-sm text-slate-500">No delivery attempts recorded yet.</p> : null}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-950">Organisation Breakdown</h3>
                    <div className="mt-3 space-y-2">
                      {(analytics.communicationPerformance?.organisationBreakdown || []).slice(0, 6).map((row) => (
                        <div key={row.branch} className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] gap-3 text-sm">
                          <span className="truncate font-medium text-slate-700">{row.branch}</span>
                          <span className="text-right text-slate-500">{formatNumber(row.sent)}</span>
                          <span className="text-right text-slate-500">{formatNumber(row.delivered)}</span>
                          <span className="text-right text-slate-500">{formatNumber(row.failed)}</span>
                        </div>
                      ))}
                      {!(analytics.communicationPerformance?.organisationBreakdown || []).length ? <p className="text-sm text-slate-500">No branch delivery data recorded yet.</p> : null}
                    </div>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-950">Communication Infrastructure</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {Object.values(analytics.communicationInfrastructure || {}).map((row) => (
                      <div key={row.channel} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.state === 'healthy' ? 'bg-emerald-50 text-emerald-700' : row.state === 'offline' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                            {normalizeText(row.state).replace(/\b\w/g, (letter) => letter.toUpperCase())}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Last Failure: {row.lastFailureAt ? new Date(row.lastFailureAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : 'None'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Recommendations Created" value={formatNumber(analytics.recommendations.created)} icon={MessageSquareText} tone="blue" />
                <MetricCard label="Recommendations Accepted" value={formatNumber(analytics.recommendations.accepted)} icon={MessageSquareText} tone="green" />
                <MetricCard label="Recommendations Completed" value={formatNumber(analytics.recommendations.completed)} icon={CheckCircle2} tone="green" />
                <MetricCard label="Recommendations Dismissed" value={formatNumber(analytics.recommendations.dismissed)} icon={MessageSquareText} tone="red" />
                <MetricCard label="Task Conversion" value={formatPercent(analytics.recommendations.taskConversionRate)} icon={Target} tone="amber" />
                <MetricCard label="Avg Completion" value={formatHours(analytics.recommendations.averageCompletionHours)} icon={Clock3} tone="blue" />
              </div>
            </div>
          </section>

          <section className={`${panelClass} p-5`}>
            <SectionHeader eyebrow="Lead Health" title="Pipeline Health" copy="Operational lead health from ownership, SLA, and activity recency fields." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <MetricCard label="New Leads" value={formatNumber(analytics.pipeline.newLeads)} icon={Users} tone="blue" />
              <MetricCard label="Assigned" value={formatNumber(analytics.pipeline.assignedLeads)} icon={Users} tone="green" />
              <MetricCard label="Unassigned" value={formatNumber(analytics.pipeline.unassignedLeads)} icon={Users} tone="amber" />
              <MetricCard label="Overdue" value={formatNumber(analytics.pipeline.overdueLeads)} icon={TrendingUp} tone="red" />
              <MetricCard label="Escalated" value={formatNumber(analytics.pipeline.escalatedLeads)} icon={TrendingUp} tone="red" />
              <MetricCard label="No Activity 7d" value={formatNumber(analytics.pipeline.noActivity7Days)} icon={MessageSquareText} tone="amber" />
              <MetricCard label="No Activity 30d" value={formatNumber(analytics.pipeline.noActivity30Days)} icon={MessageSquareText} tone="red" />
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}

export default AgentReportingPage
