import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  FileText,
  Handshake,
  LineChart,
  Loader2,
  ShieldAlert,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react'
import { createElement } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatNumber } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialPrincipalDashboardData } from '../services/commercialDashboardApi'

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const KPI_TONES = {
  blue: {
    icon: 'bg-sky-50 text-sky-600',
    trend: 'text-emerald-600',
  },
  green: {
    icon: 'bg-emerald-50 text-emerald-600',
    trend: 'text-emerald-600',
  },
  amber: {
    icon: 'bg-orange-50 text-orange-600',
    trend: 'text-emerald-600',
  },
  purple: {
    icon: 'bg-violet-50 text-violet-600',
    trend: 'text-emerald-600',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-600',
    trend: 'text-rose-600',
  },
}

const REQUIREMENT_STAGE_GROUPS = [
  { label: 'New', keys: ['new_requirement'], tone: 'bg-blue-500' },
  { label: 'Shortlist', keys: ['shortlisting', 'viewing'], tone: 'bg-violet-500' },
  { label: 'Proposal', keys: ['proposal'], tone: 'bg-orange-400' },
  { label: 'Negotiation', keys: ['negotiation'], tone: 'bg-emerald-500' },
  { label: 'On Hold / Lease Stage', keys: ['lease_stage'], tone: 'bg-slate-400' },
]

const DEAL_STAGE_GROUPS = [
  { label: 'New / Requirement', keys: ['requirement'], tone: 'bg-blue-500' },
  { label: 'Under Offer / Shortlist', keys: ['shortlist'], tone: 'bg-violet-500' },
  { label: 'Due Diligence / Proposal', keys: ['proposal'], tone: 'bg-orange-400' },
  { label: 'Negotiation / HOT', keys: ['heads_of_terms'], tone: 'bg-emerald-500' },
  { label: 'Closing / Lease Draft', keys: ['lease_draft', 'signed'], tone: 'bg-slate-400' },
]

const QUICK_ACCESS_LINKS = [
  { label: 'Vacancies', to: '/commercial/vacancies', icon: DoorOpen },
  { label: 'Requirements', to: '/commercial/requirements', icon: Users },
  { label: 'Deals', to: '/commercial/deals/leasing', icon: Handshake },
  { label: 'Leases', to: '/commercial/leases', icon: Building2 },
  { label: 'Landlords', to: '/commercial/landlords', icon: Warehouse },
  { label: 'Reports', to: '/commercial/reports', icon: LineChart },
  { label: 'Documents', to: '/commercial/documents', icon: FileText },
]

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function formatArea(value) {
  return formatNumber(toNumber(value), 'm²')
}

function formatPercent(value, maximumFractionDigits = 1) {
  const parsed = toNumber(value)
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits }).format(parsed)
}

function formatMoney(value) {
  return toNumber(value) > 0 ? formatCurrency(value) : 'R0'
}

function percent(part, total) {
  const parsedTotal = toNumber(total)
  if (!parsedTotal) return 0
  return Math.max(0, Math.min(100, (toNumber(part) / parsedTotal) * 100))
}

function summariseStageGroups(stages = [], groups = []) {
  const counts = new Map(stages.map((stage) => [stage.key, toNumber(stage.count)]))

  return groups.map((group) => ({
    ...group,
    count: group.keys.reduce((total, key) => total + toNumber(counts.get(key)), 0),
  }))
}

function buildLeaseExpiryBuckets({ leases = [], properties = [], totalGla = 0 }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const buckets = [
    { label: '0 - 3 Months', min: 0, max: 3, gla: 0, leases: 0 },
    { label: '3 - 6 Months', min: 3, max: 6, gla: 0, leases: 0 },
    { label: '6 - 12 Months', min: 6, max: 12, gla: 0, leases: 0 },
  ]

  leases.forEach((lease) => {
    if (['archived', 'terminated'].includes(normalize(lease.status))) return
    const end = lease.lease_end_date ? new Date(lease.lease_end_date) : null
    if (!end || Number.isNaN(end.getTime()) || end < today) return
    const monthsRemaining = ((end.getFullYear() - today.getFullYear()) * 12) + (end.getMonth() - today.getMonth())
    const bucket = buckets.find((item) => monthsRemaining >= item.min && monthsRemaining < item.max)
    if (!bucket) return
    bucket.leases += 1
    bucket.gla += toNumber(propertiesById.get(lease.property_id)?.gla_m2)
  })

  const total = buckets.reduce(
    (acc, bucket) => ({
      label: 'Total',
      gla: acc.gla + bucket.gla,
      leases: acc.leases + bucket.leases,
    }),
    { label: 'Total', gla: 0, leases: 0 },
  )

  return [...buckets, total].map((bucket) => ({
    ...bucket,
    share: percent(bucket.gla, totalGla),
  }))
}

function buildBrokerLeaderboard(deals = []) {
  const rows = new Map()

  deals.forEach((deal) => {
    if (['archived', 'closed_lost'].includes(normalize(deal.status))) return
    const brokerName = deal.assigned_broker_name || deal.broker_name || deal.agent_name || (deal.assigned_broker ? 'Assigned broker' : 'Unassigned broker')
    const current = rows.get(brokerName) || { name: brokerName, value: 0, deals: 0 }
    current.value += toNumber(deal.deal_value)
    current.deals += 1
    rows.set(brokerName, current)
  })

  return Array.from(rows.values())
    .sort((a, b) => b.value - a.value || b.deals - a.deals)
    .slice(0, 3)
}

function relativeTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Recently'
  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.max(1, Math.round(diffMs / 36e5))
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short' }).format(date)
}

function DashboardHeader({ organisationName }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="min-w-0 lg:max-w-[430px]">
        <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#102236]">Commercial Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">Portfolio oversight across vacancies, requirements, deals and lease risk.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
        <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] shadow-sm">
          <Users size={16} className="text-slate-500" />
          <span className="max-w-[140px] truncate xl:max-w-[170px]">{organisationName || 'All Organisations'}</span>
          <ChevronDown size={16} className="text-slate-400" />
        </div>
        <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] shadow-sm">
          <CalendarDays size={16} className="text-blue-600" />
          <span>This Month</span>
          <ChevronDown size={16} className="text-slate-400" />
        </div>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-600" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-[#102236] shadow-sm" aria-label="Profile menu">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#102236] text-xs font-semibold text-white">AL</span>
          <ChevronDown size={16} className="text-slate-400" />
        </button>
      </div>
    </header>
  )
}

function KpiCard({ icon, label, value, detail, tone = 'blue', loading = false }) {
  const styles = KPI_TONES[tone] || KPI_TONES.blue

  return (
    <article className={`${CARD_CLASS} flex min-h-[132px] items-center gap-4 p-4`}>
      <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
        {loading ? <Loader2 size={22} className="animate-spin" /> : createElement(icon, { size: 22 })}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{loading ? '...' : value}</p>
        <p className={`mt-2 text-xs font-semibold ${styles.trend}`}>{loading ? 'Loading portfolio data' : detail}</p>
      </div>
    </article>
  )
}

function PortfolioOccupancyCard({ summary, vacancies = [], loading }) {
  const totalGla = toNumber(summary.totalGla)
  const underOfferSpace = vacancies
    .filter((vacancy) => ['reserved', 'under_negotiation'].includes(normalize(vacancy.status)))
    .reduce((total, vacancy) => total + toNumber(vacancy.available_area_m2), 0)
  const vacantSpace = Math.max(0, toNumber(summary.availableSpace) - underOfferSpace)
  const occupiedSpace = Math.max(0, totalGla - vacantSpace - underOfferSpace)
  const occupiedPercent = percent(occupiedSpace, totalGla)
  const vacantPercent = percent(vacantSpace, totalGla)
  const underOfferPercent = percent(underOfferSpace, totalGla)
  const vacantStop = occupiedPercent + vacantPercent
  const underOfferStop = vacantStop + underOfferPercent
  const donutBackground = totalGla
    ? `conic-gradient(#2f64b7 0 ${occupiedPercent}%, #93c5fd ${occupiedPercent}% ${vacantStop}%, #94a3b8 ${vacantStop}% ${underOfferStop}%, #e2e8f0 ${underOfferStop}% 100%)`
    : 'conic-gradient(#e2e8f0 0 100%)'

  const segments = [
    { label: 'Occupied', value: occupiedSpace, share: occupiedPercent, color: 'bg-blue-600' },
    { label: 'Vacant', value: vacantSpace, share: vacantPercent, color: 'bg-sky-300' },
    { label: 'Under Offer', value: underOfferSpace, share: underOfferPercent, color: 'bg-slate-400' },
  ]

  return (
    <section className={`${CARD_CLASS} p-5 lg:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Portfolio Occupancy</h2>
          <p className="mt-1 text-sm text-slate-500">Tracked stock, vacancy exposure and space under negotiation.</p>
        </div>
        <span className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">By GLA</span>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[260px_minmax(0,1fr)] md:items-center">
        <div className="relative mx-auto h-56 w-56 rounded-full p-6" style={{ background: donutBackground }}>
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
            <p className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{loading ? '...' : formatArea(totalGla)}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Total GLA</p>
          </div>
        </div>
        <div className="grid gap-3">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${segment.color}`} />
                <span className="text-sm font-semibold text-[#102236]">{segment.label}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[#102236]">{loading ? '...' : formatArea(segment.value)}</p>
                <p className="text-xs text-slate-500">{loading ? '' : `${formatPercent(segment.share)}%`}</p>
              </div>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-sm font-semibold text-slate-500">Occupancy rate</span>
            <span className="text-xl font-semibold tracking-[-0.035em] text-[#102236]">{loading ? '...' : `${formatPercent(summary.occupancyRate)}%`}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function PipelineSummaryCard({ title, rows, to, loading }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const max = Math.max(1, ...rows.map((row) => row.count))

  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">Compact stage summary.</p>
        </div>
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
          View all
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[150px_minmax(0,1fr)_36px] items-center gap-3">
            <span className="truncate text-sm font-medium text-[#102236]">{row.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${loading ? 18 : Math.max(8, (row.count / max) * 100)}%` }} />
            </div>
            <span className="text-right text-sm font-semibold text-[#102236]">{loading ? '...' : row.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm font-semibold text-slate-500">Total</span>
        <span className="text-base font-semibold text-[#102236]">{loading ? '...' : total}</span>
      </div>
    </section>
  )
}

function LeaseExpiryWatchCard({ rows, loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Lease Expiry Watch</h2>
          <p className="mt-1 text-sm text-slate-500">Next 12 months.</p>
        </div>
        <Link to="/commercial/lease-expiry-watch" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View all</Link>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            <tr>
              <th className="px-3 py-3">Period</th>
              <th className="px-3 py-3 text-right">GLA</th>
              <th className="px-3 py-3 text-right">%</th>
              <th className="px-3 py-3 text-right">Leases</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.label} className={row.label === 'Total' ? 'font-semibold text-[#102236]' : 'text-slate-600'}>
                <td className="px-3 py-3">{row.label}</td>
                <td className="px-3 py-3 text-right">{loading ? '...' : formatArea(row.gla)}</td>
                <td className="px-3 py-3 text-right">{loading ? '...' : `${formatPercent(row.share)}%`}</td>
                <td className="px-3 py-3 text-right">{loading ? '...' : row.leases}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RecentActivityCard({ items = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Recent Activity</h2>
          <p className="mt-1 text-sm text-slate-500">Commercial portfolio updates.</p>
        </div>
        <Link to="/commercial/activity" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View all</Link>
      </div>
      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : items.length ? (
          items.slice(0, 5).map((item) => (
            <div key={item.id || `${item.title}-${item.timestamp}`} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <ClipboardList size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#102236]">{item.body ? `${item.title}: ${item.body}` : item.title}</p>
                <p className="text-xs text-slate-500">{relativeTime(item.timestamp)}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No recent commercial activity yet.</p>
        )}
      </div>
    </section>
  )
}

function TopBrokersCard({ rows = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Top Brokers</h2>
          <p className="mt-1 text-sm text-slate-500">Ranked by active pipeline value.</p>
        </div>
        <Link to="/commercial/broker-performance" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View full leaderboard</Link>
      </div>
      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : rows.length ? (
          rows.map((row, index) => (
            <div key={row.name} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-[#102236]">{index + 1}</span>
                <span className="truncate text-sm font-semibold text-[#102236]">{row.name}</span>
              </div>
              <span className="text-sm font-semibold text-[#102236]">{formatMoney(row.value)}</span>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No broker pipeline value tracked yet.</p>
        )}
      </div>
    </section>
  )
}

function QuickAccessStrip() {
  return (
    <section className={`${CARD_CLASS} p-4`}>
      <h2 className="px-1 text-sm font-semibold tracking-[-0.025em] text-[#102236]">Quick Access</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {QUICK_ACCESS_LINKS.map(({ label, to, icon }) => (
          <Link
            key={label}
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm font-semibold text-[#102236] transition hover:border-blue-100 hover:bg-blue-50/70 hover:text-blue-700"
          >
            {createElement(icon, { size: 17, className: 'text-slate-500 transition group-hover:text-blue-600' })}
            {label}
          </Link>
        ))}
      </div>
    </section>
  )
}

function CommercialDashboard() {
  const { data, loading, error } = useCommercialData(getCommercialPrincipalDashboardData, [])
  const summary = data?.summary || {}
  const intelligence = data?.intelligence || {}
  const requirementRows = summariseStageGroups(intelligence.requirementsPipeline || [], REQUIREMENT_STAGE_GROUPS)
  const dealRows = summariseStageGroups(intelligence.dealsPipeline || [], DEAL_STAGE_GROUPS)
  const expiryRows = buildLeaseExpiryBuckets({
    leases: data?.leases || [],
    properties: data?.properties || [],
    totalGla: summary.totalGla,
  })
  const brokerRows = buildBrokerLeaderboard(data?.deals || [])

  const kpis = [
    {
      label: 'Active Requirements',
      value: formatNumber(summary.activeRequirements),
      detail: `${formatPercent(summary.activeRequirementsChange || 0, 0)}% vs last month`,
      icon: Users,
      tone: 'purple',
    },
    {
      label: 'Available Space',
      value: formatArea(summary.availableSpace),
      detail: `${formatPercent(summary.vacancyRate)}% vacancy exposure`,
      icon: Building2,
      tone: 'blue',
    },
    {
      label: 'Deals In Negotiation',
      value: formatNumber(summary.dealsInNegotiation),
      detail: `${formatMoney(summary.activeNegotiationValue)} pipeline value`,
      icon: Handshake,
      tone: 'amber',
    },
    {
      label: 'Occupancy Rate',
      value: `${formatPercent(summary.occupancyRate)}%`,
      detail: `${formatPercent(summary.vacancyRate)}% vacant`,
      icon: TrendingUp,
      tone: 'green',
    },
    {
      label: 'Lease Expiry Exposure',
      value: summary.leaseExpiryGla ? formatArea(summary.leaseExpiryGla) : formatNumber(summary.leaseExpiryCount),
      detail: `${formatNumber(summary.leaseExpiryCount)} leases next 12 months`,
      icon: ShieldAlert,
      tone: 'rose',
    },
  ]

  return (
    <div className="space-y-5">
      <DashboardHeader organisationName={data?.organisation?.name} />

      {error ? (
        <CommercialEmptyState
          title="Commercial dashboard data could not be loaded"
          description={error}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((card) => (
          <KpiCard key={card.label} {...card} loading={loading} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(340px,0.85fr)]">
        <div className="grid gap-4">
          <PortfolioOccupancyCard summary={summary} vacancies={data?.vacancies || []} loading={loading} />
          <div className="grid gap-4 lg:grid-cols-2">
            <PipelineSummaryCard
              title="Requirements Pipeline"
              rows={requirementRows}
              to="/commercial/requirements/pipeline"
              loading={loading}
            />
            <PipelineSummaryCard
              title="Deals Pipeline"
              rows={dealRows}
              to="/commercial/deals/pipeline"
              loading={loading}
            />
          </div>
        </div>

        <div className="grid content-start gap-4">
          <LeaseExpiryWatchCard rows={expiryRows} loading={loading} />
          <RecentActivityCard items={data?.latestActivity || []} loading={loading} />
          <TopBrokersCard rows={brokerRows} loading={loading} />
        </div>
      </section>

      <QuickAccessStrip />
    </div>
  )
}

export default CommercialDashboard
