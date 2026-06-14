import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Handshake,
  LineChart,
  ListChecks,
  Loader2,
  ShieldAlert,
  TrendingUp,
  Users,
  WalletCards,
  Warehouse,
} from 'lucide-react'
import { createElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppointmentDashboardSection from '../../../components/appointments/dashboard/AppointmentDashboardSection'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'
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
  { label: 'New', keys: ['new'], tone: 'bg-blue-500' },
  { label: 'Qualified', keys: ['qualified'], tone: 'bg-violet-500' },
  { label: 'Matching / Viewing', keys: ['matching', 'viewing_scheduled'], tone: 'bg-orange-400' },
  { label: 'Negotiating', keys: ['negotiating'], tone: 'bg-emerald-500' },
  { label: 'HOT / Won / Lost', keys: ['hot', 'won', 'lost'], tone: 'bg-slate-400' },
]

const DEAL_STAGE_GROUPS = [
  { label: 'New / Qualified', keys: ['new', 'qualified'], tone: 'bg-blue-500' },
  { label: 'Negotiation', keys: ['negotiation'], tone: 'bg-orange-400' },
  { label: 'HOT', keys: ['hot_draft', 'hot_sent', 'hot_accepted'], tone: 'bg-emerald-500' },
  { label: 'Lease Pending', keys: ['lease_pending'], tone: 'bg-violet-500' },
  { label: 'Converted / Lost', keys: ['converted', 'lost'], tone: 'bg-slate-400' },
]

const LISTING_STAGE_GROUPS = [
  { label: 'Draft', keys: ['draft'], tone: 'bg-slate-400' },
  { label: 'Review / Approved', keys: ['internal_review', 'approved'], tone: 'bg-blue-500' },
  { label: 'Published', keys: ['published'], tone: 'bg-emerald-500' },
  { label: 'Under Offer', keys: ['under_offer'], tone: 'bg-orange-400' },
  { label: 'Closed / Expired', keys: ['closed', 'withdrawn', 'expired', 'archived'], tone: 'bg-violet-500' },
]

const QUICK_ACCESS_LINKS = [
  { label: 'Principal', to: '/commercial/principal', icon: TrendingUp },
  { label: 'Companies', to: '/commercial/companies', icon: Building2 },
  { label: 'Contacts', to: '/commercial/contacts', icon: Users },
  { label: 'Vacancies', to: '/commercial/vacancies', icon: DoorOpen },
  { label: 'Viewings', to: '/commercial/viewings', icon: CalendarDays },
  { label: 'Listings', to: '/commercial/listings', icon: ClipboardList },
  { label: 'Requirements', to: '/commercial/requirements', icon: Users },
  { label: 'Deals', to: '/commercial/deals/leasing', icon: Handshake },
  { label: 'Leases', to: '/commercial/leases', icon: Building2 },
  { label: 'Landlords', to: '/commercial/landlords', icon: Warehouse },
  { label: 'Reports', to: '/commercial/reports', icon: LineChart },
]

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function isActiveStatus(row) {
  return !['archived', 'inactive', 'closed_lost', 'expired', 'terminated', 'cancelled'].includes(normalize(row?.status || 'active'))
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

function brokerNameFor(id, brokerMap = new Map()) {
  const key = String(id || '').trim()
  if (!key) return 'Unassigned'
  return brokerMap.get(key) || 'Assigned broker'
}

function buildWorkflowScrollerItems(data = {}, brokerMap = new Map()) {
  const tenantsById = new Map((data.tenants || []).map((tenant) => [tenant.id, tenant]))
  const propertiesById = new Map((data.properties || []).map((property) => [property.id, property]))
  const dealsById = new Map((data.deals || []).map((deal) => [deal.id, deal]))
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiryHorizon = new Date(now)
  expiryHorizon.setMonth(expiryHorizon.getMonth() + 6)

  const activeRequirements = (data.requirements || [])
    .filter((row) => isActiveStatus(row) && !['won', 'lost'].includes(normalizeCommercialLifecycleStage('requirements', row.stage, 'new')))
    .slice(0, 4)
    .map((row) => ({
      id: `requirement-${row.id}`,
      type: 'Active Requirements',
      to: '/commercial/requirements',
      client: tenantsById.get(row.tenant_id)?.name || row.requirement_name || 'Client requirement',
      property: row.property_type ? titleize(row.property_type) : 'Requirement',
      stage: titleize(normalizeCommercialLifecycleStage('requirements', row.stage, 'new')),
      broker: brokerNameFor(row.assigned_broker || row.broker_id, brokerMap),
      value: `${formatArea(row.min_size_m2)} - ${formatArea(row.max_size_m2)}`,
      lastActivity: relativeTime(row.updated_at || row.created_at),
      nextAction: normalizeCommercialLifecycleStage('requirements', row.stage, 'new') === 'new' ? 'Qualify demand' : 'Move requirement forward',
    }))

  const activeDeals = (data.deals || [])
    .filter((row) => isActiveStatus(row) && !['converted', 'lost'].includes(normalizeCommercialLifecycleStage('deals', row.stage, 'new')))
    .slice(0, 4)
    .map((row) => ({
      id: `deal-${row.id}`,
      type: 'Active Deals',
      to: '/commercial/deals/leasing',
      client: tenantsById.get(row.tenant_id)?.name || row.deal_name || 'Commercial client',
      property: propertiesById.get(row.property_id)?.property_name || 'Property pending',
      stage: titleize(normalizeCommercialLifecycleStage('deals', row.stage, 'new')),
      broker: brokerNameFor(row.assigned_broker || row.broker_id, brokerMap),
      value: formatMoney(row.deal_value),
      lastActivity: relativeTime(row.updated_at || row.created_at),
      nextAction: normalizeCommercialLifecycleStage('deals', row.stage, 'new').startsWith('hot_') ? 'Progress HOT' : 'Progress deal',
    }))

  const hotsInProgress = (data.headsOfTerms || [])
    .filter((row) => ['draft', 'sent', 'under_review', 'accepted'].includes(normalizeCommercialLifecycleStage('headsOfTerms', row.status, 'draft')))
    .slice(0, 4)
    .map((row) => {
      const deal = dealsById.get(row.deal_id)
      return {
        id: `hot-${row.id}`,
        type: 'HOTs in progress',
        to: '/commercial/heads-of-terms',
        client: tenantsById.get(row.tenant_id || deal?.tenant_id)?.name || 'Tenant pending',
        property: propertiesById.get(row.property_id || deal?.property_id)?.property_name || row.premises_description || 'Premises pending',
        stage: titleize(normalizeCommercialLifecycleStage('headsOfTerms', row.status, 'draft')),
        broker: brokerNameFor(row.broker_id || deal?.assigned_broker || deal?.broker_id, brokerMap),
        value: formatMoney(row.monthly_rental),
        lastActivity: relativeTime(row.updated_at || row.created_at),
        nextAction: 'Resolve terms',
      }
    })

  const signedHots = (data.headsOfTerms || [])
    .filter((row) => ['signed', 'ready_for_lease'].includes(normalize(row.status)))
    .slice(0, 4)
    .map((row) => {
      const deal = dealsById.get(row.deal_id)
      return {
        id: `signed-hot-${row.id}`,
        type: 'Signed HOTs awaiting lease',
        to: '/commercial/heads-of-terms',
        client: tenantsById.get(row.tenant_id || deal?.tenant_id)?.name || 'Tenant pending',
        property: propertiesById.get(row.property_id || deal?.property_id)?.property_name || row.premises_description || 'Premises pending',
        stage: titleize(row.status),
        broker: brokerNameFor(row.broker_id || deal?.assigned_broker || deal?.broker_id, brokerMap),
        value: formatMoney(row.monthly_rental),
        lastActivity: relativeTime(row.updated_at || row.created_at),
        nextAction: 'Prepare lease',
      }
    })

  const activeLeases = (data.leases || [])
    .filter((row) => isActiveStatus(row))
    .slice(0, 4)
    .map((row) => {
      const deal = dealsById.get(row.deal_id)
      return {
        id: `lease-${row.id}`,
        type: 'Active Leases',
        to: '/commercial/leases',
        client: tenantsById.get(row.tenant_id || deal?.tenant_id)?.name || 'Tenant pending',
        property: propertiesById.get(row.property_id || deal?.property_id)?.property_name || 'Property pending',
        stage: titleize(row.status),
        broker: brokerNameFor(row.broker_id || deal?.assigned_broker || deal?.broker_id, brokerMap),
        value: formatMoney(row.monthly_rental),
        lastActivity: relativeTime(row.updated_at || row.created_at),
        nextAction: 'Monitor lease',
      }
    })

  const upcomingExpiries = (data.leases || [])
    .filter((row) => {
      const end = row.lease_end_date ? new Date(row.lease_end_date) : null
      return end && !Number.isNaN(end.getTime()) && end >= now && end <= expiryHorizon
    })
    .slice(0, 4)
    .map((row) => {
      const deal = dealsById.get(row.deal_id)
      return {
        id: `expiry-${row.id}`,
        type: 'Upcoming Lease Expiries',
        to: '/commercial/lease-expiry-watch',
        client: tenantsById.get(row.tenant_id || deal?.tenant_id)?.name || 'Tenant pending',
        property: propertiesById.get(row.property_id || deal?.property_id)?.property_name || 'Property pending',
        stage: 'Expiry watch',
        broker: brokerNameFor(row.broker_id || deal?.assigned_broker || deal?.broker_id, brokerMap),
        value: formatMoney(row.monthly_rental),
        lastActivity: formatDate(row.lease_end_date),
        nextAction: 'Start renewal conversation',
      }
    })

  return [...activeRequirements, ...activeDeals, ...hotsInProgress, ...signedHots, ...activeLeases, ...upcomingExpiries].slice(0, 18)
}

function buildRecentListingItems(data = {}, brokerMap = new Map(), qualityMap = new Map()) {
  const propertiesById = new Map((data.properties || []).map((property) => [property.id, property]))
  const landlordsById = new Map((data.landlords || []).map((landlord) => [landlord.id, landlord]))
  return (data.listings || [])
    .slice()
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))
    .slice(0, 12)
    .map((listing) => ({
      id: listing.id,
      to: `/commercial/listings/${listing.id}`,
      title: listing.title || 'Commercial listing',
      property: propertiesById.get(listing.property_id)?.property_name || 'Property pending',
      landlord: landlordsById.get(listing.landlord_id)?.name || 'Landlord pending',
      category: titleize(listing.listing_category),
      status: titleize(listing.listing_status),
      broker: brokerNameFor(listing.broker_id, brokerMap),
      value: listing.pricing ? formatMoney(listing.pricing) : formatArea(listing.metadata_json?.gla || listing.metadata_json?.warehouse_size || listing.metadata_json?.land_size || listing.metadata_json?.farm_size),
      updated: relativeTime(listing.updated_at || listing.created_at),
      featured: Boolean(listing.featured),
      quality: qualityMap.get(listing.id),
    }))
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
    <header className="flex justify-end">
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
    .filter((vacancy) => ['reserved', 'under_negotiation', 'under_offer', 'hot_in_progress'].includes(normalize(vacancy.status)))
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

function ConversionMetricsCard({ metrics = {}, loading }) {
  const rows = [
    ['Requirement to Deal', metrics.requirementToDeal],
    ['Deal to HOT', metrics.dealToHot],
    ['HOT to Signed', metrics.hotToSigned],
    ['Signed to Lease', metrics.signedToLease],
    ['Lease to Active', metrics.leaseToActive],
  ]

  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Conversion Metrics</h2>
          <p className="mt-1 text-sm text-slate-500">Requirement through active lease progression.</p>
        </div>
        <Link to="/commercial/reports" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Reports</Link>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map(([label, metric]) => {
          const percentage = metric?.percentage || 0
          return (
            <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#102236]">{label}</span>
                <span className="text-sm font-semibold text-[#102236]">{loading ? '...' : `${percentage}%`}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${loading ? 18 : Math.max(percentage, percentage ? 8 : 0)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{loading ? 'Loading' : `${formatNumber(metric?.to || 0)} of ${formatNumber(metric?.from || 0)}`}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PlatformIntegrationCard({ transactions = [], financialSummary = {}, tasks = [], notifications = [], renewalRisk = [], loading }) {
  const featuredTransactions = transactions.slice(0, 4)
  const riskCount = renewalRisk.filter((row) => ['critical', 'high', 'medium'].includes(normalize(row.risk))).length

  return (
    <section id="transactions" className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Recent Transactions</h2>
          <p className="mt-1 text-sm text-slate-500">Live commercial transaction flow, close visibility, and renewal watch from the persisted transaction engine.</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {loading ? 'Loading' : `${formatNumber(transactions.length)} transactions`}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Pipeline Value', formatMoney(financialSummary.pipelineValue), 'Current commercial transaction value', Handshake],
          ['Expected Commission', formatMoney(financialSummary.expectedCommission), 'Expected and pending commission', WalletCards],
          ['Active Lease Value', formatMoney(financialSummary.activeLeaseValue), 'Value currently held in active leases', Building2],
          ['Renewal Risk', formatNumber(riskCount), 'Leases needing renewal attention', CalendarDays],
        ].map(([label, value, detail, icon]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{loading ? '...' : value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
              </div>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                {createElement(icon, { size: 16 })}
              </span>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="grid gap-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)
          ) : featuredTransactions.length ? featuredTransactions.map((transaction) => (
            <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#102236]">{transaction.title}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{transaction.property?.property_name || 'Property pending'} · {transaction.brokerName}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{transaction.status}</span>
              </div>
            </Link>
          )) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No commercial transactions have been assembled yet.</p>
          )}
        </div>
        <div className="grid gap-2">
          {[
            ['Open Platform Tasks', tasks.length, ListChecks],
            ['Notification Candidates', notifications.length, Bell],
            ['Renewal Watch Items', renewalRisk.length, CalendarDays],
          ].map(([label, value, icon]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  {createElement(icon, { size: 16 })}
                </span>
                <span className="text-sm font-semibold text-[#102236]">{label}</span>
              </div>
              <span className="text-sm font-semibold text-[#102236]">{loading ? '...' : formatNumber(value)}</span>
            </div>
          ))}
        </div>
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

function UpcomingViewingsCard({ rows = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Upcoming Viewings</h2>
          <p className="mt-1 text-sm text-slate-500">Next broker inspections.</p>
        </div>
        <Link to="/commercial/viewings" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View all</Link>
      </div>
      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)
        ) : rows.length ? rows.map((row) => (
          <Link key={row.id} to={row.to || '/commercial/viewings'} className="block rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3 transition hover:border-blue-200 hover:bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#102236]">{row.property}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{row.company} · {row.broker}</p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{titleize(row.status)}</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(row.date)} · {row.time || '-'}</p>
          </Link>
        )) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No upcoming viewings scheduled.</p>
        )}
      </div>
    </section>
  )
}

function DocumentComplianceCard({ compliance = {}, loading }) {
  const riskRows = compliance.riskRows || []
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Document Compliance</h2>
          <p className="mt-1 text-sm text-slate-500">Outstanding requests, reviews, rejected files, and expiring documents.</p>
        </div>
        <Link to="/commercial/documents" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Document centre</Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {[
          ['Outstanding', compliance.outstanding || 0, 'text-amber-700 bg-amber-50'],
          ['Overdue', compliance.overdue || 0, 'text-rose-700 bg-rose-50'],
          ['Under Review', compliance.underReview || 0, 'text-violet-700 bg-violet-50'],
          ['Expiring', compliance.expiring || 0, 'text-orange-700 bg-orange-50'],
        ].map(([label, value, tone]) => (
          <div key={label} className={`rounded-xl px-3 py-2 ${tone}`}>
            <strong className="block text-base">{loading ? '...' : formatNumber(value)}</strong>
            {label}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />)
        ) : riskRows.length ? riskRows.slice(0, 4).map((row) => (
          <div key={`${row.type}-${row.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#102236]">{row.name}</p>
              <p className="text-xs text-slate-500">{row.label} · {row.completionPercent}% complete</p>
            </div>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">{row.outstanding}</span>
          </div>
        )) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No document compliance exceptions right now.</p>
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
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Broker Performance</h2>
          <p className="mt-1 text-sm text-slate-500">Leaderboard ranked by active pipeline value.</p>
        </div>
        <Link to="/commercial/brokers/performance" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View full leaderboard</Link>
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

function RecentCompaniesCard({ rows = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Recent Companies</h2>
          <p className="mt-1 text-sm text-slate-500">Latest commercial CRM accounts created or updated.</p>
        </div>
        <Link to="/commercial/companies" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Open CRM</Link>
      </div>
      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />)
        ) : rows.length ? rows.map((row) => (
          <Link key={row.id} to={`/commercial/companies/${row.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-[#fbfcfe] px-3 py-3 transition hover:border-blue-200 hover:bg-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#102236]">{row.company_name || row.name}</p>
              <p className="truncate text-xs text-slate-500">{[titleize(row.company_type), row.industry].filter(Boolean).join(' · ') || 'Commercial company'}</p>
            </div>
            <span className="text-xs font-semibold text-slate-400">{formatDate(row.updated_at || row.created_at)}</span>
          </Link>
        )) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No companies captured yet.</p>
        )}
      </div>
    </section>
  )
}

function TopClientsCard({ rows = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Top Clients</h2>
          <p className="mt-1 text-sm text-slate-500">Companies with the most active linked opportunities.</p>
        </div>
        <Link to="/commercial/companies" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View companies</Link>
      </div>
      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />)
        ) : rows.length ? rows.map((row) => (
          <Link key={row.id} to={`/commercial/companies/${row.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-[#fbfcfe] px-3 py-3 transition hover:border-blue-200 hover:bg-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#102236]">{row.company_name || row.name}</p>
              <p className="truncate text-xs text-slate-500">{titleize(row.company_type) || 'Commercial company'}</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{row.requirements + row.deals + row.transactions} linked</span>
          </Link>
        )) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No linked client activity yet.</p>
        )}
      </div>
    </section>
  )
}

function InventorySummaryCard({ summary = {}, loading }) {
  const tiles = [
    ['Properties', formatNumber(summary.properties || 0), 'Tracked commercial assets'],
    ['Vacancies', formatNumber(summary.vacancies || 0), 'Open stock items'],
    ['Listings', formatNumber(summary.listings || 0), 'Live market opportunities'],
    ['Available Space', formatArea(summary.availableSpace || 0), 'Current vacant space'],
    ['Occupied Space', formatArea(summary.occupiedSpace || 0), 'Space currently occupied'],
    ['Occupancy %', `${formatPercent(summary.occupancyRate || 0)}%`, 'Portfolio occupancy rate'],
  ]

  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Inventory Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">Supply-side stock, space, and occupancy at a glance.</p>
        </div>
        <Link to="/commercial/properties" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Open stock</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map(([label, value, detail]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{loading ? '...' : value}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TopPerformingAssetsCard({ groups = {}, loading }) {
  const sections = [
    ['Most Viewed', groups.mostViewed || []],
    ['Most Active', groups.mostActive || []],
    ['Most Leased', groups.mostLeased || []],
    ['Most In Demand', groups.mostInDemand || []],
  ]

  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Top Performing Assets</h2>
          <p className="mt-1 text-sm text-slate-500">Buildings attracting the most operational attention and demand.</p>
        </div>
        <Link to="/commercial/properties" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View assets</Link>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {sections.map(([label, rows]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
            <div className="mt-3 space-y-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />)
              ) : rows.length ? rows.slice(0, 3).map((row) => (
                <Link key={`${label}-${row.id}`} to={`/commercial/properties/${row.propertyId}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3 py-3 transition hover:border-blue-200 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#102236]">{row.title}</p>
                    <p className="truncate text-xs text-slate-500">{row.location}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {label === 'Most Viewed' ? formatNumber(row.viewed) : label === 'Most Active' ? formatNumber(row.active) : label === 'Most Leased' ? formatNumber(row.leased) : formatNumber(row.demand)}
                  </span>
                </Link>
              )) : (
                <p className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500">No asset signals yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function priorityClass(priority) {
  const value = normalize(priority)
  if (value === 'high') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (value === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function riskClass(risk) {
  const value = normalize(risk)
  if (value === 'critical') return 'bg-rose-50 text-rose-700'
  if (value === 'high') return 'bg-orange-50 text-orange-700'
  if (value === 'medium') return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

function NextBestActionsCard({ actions = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Next Best Actions</h2>
          <p className="mt-1 text-sm text-slate-500">Deterministic prompts from live commercial records.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)
        ) : actions.length ? actions.slice(0, 4).map((action) => (
          <Link key={action.id} to={action.to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
            <div className="flex items-start justify-between gap-3">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(action.priority)}`}>{action.priority}</span>
              <ArrowUpRight size={15} className="text-slate-400" />
            </div>
            <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-[#102236]">{action.title}</h3>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{action.reason}</p>
            <p className="mt-3 truncate text-xs font-semibold text-blue-600">{action.cta}</p>
          </Link>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 md:col-span-2 xl:col-span-4">No urgent next-best actions right now.</p>
        )}
      </div>
    </section>
  )
}

function ManagementAlertsCard({ alerts = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Management Alerts</h2>
          <p className="mt-1 text-sm text-slate-500">Stale vacancies, aging requirements, stalled transactions, overload, and lease expiry risk.</p>
        </div>
        <Link to="/commercial/principal" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Principal view</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)
        ) : alerts.length ? alerts.slice(0, 4).map((alert) => (
          <Link key={alert.id} to={alert.to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
            <div className="flex items-start justify-between gap-3">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(alert.priority)}`}>{alert.priority}</span>
              <ArrowUpRight size={15} className="text-slate-400" />
            </div>
            <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-[#102236]">{alert.title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">{alert.type} · {alert.detail}</p>
          </Link>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 md:col-span-2 xl:col-span-4">No management alerts right now.</p>
        )}
      </div>
    </section>
  )
}

function PortalAdoptionCard({ adoption = {}, loading }) {
  const roles = Object.entries(adoption.roleCounts || {})
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Portal Adoption</h2>
          <p className="mt-1 text-sm text-slate-500">External collaboration activity across invited commercial clients.</p>
        </div>
        <Link to="/commercial/principal" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Manage access</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)
        ) : [
          ['Active Users', adoption.activeUsers || 0],
          ['Active Links', adoption.activeAccess || 0],
          ['Pending Invites', adoption.pendingInvitations || 0],
          ['Recent Uploads', adoption.recentUploads?.length || 0],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{formatNumber(value)}</p>
          </article>
        ))}
      </div>
      {!loading && roles.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {roles.map(([role, count]) => (
            <span key={role} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
              {titleize(role)} · {formatNumber(count)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function VacancyRiskWatchCard({ risk = {}, loading }) {
  const rows = risk.rows || []
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Vacancy Risk Watch</h2>
          <p className="mt-1 text-sm text-slate-500">Lease expiry exposure by urgency.</p>
        </div>
        <Link to="/commercial/lease-expiry-watch" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View all</Link>
      </div>
      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />)
        ) : rows.length ? rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-3">
            <span className={`rounded-xl px-2.5 py-1 text-xs font-semibold ${riskClass(row.riskLevel)}`}>{row.riskLevel}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#102236]">{row.label}</p>
              <p className="text-xs text-slate-500">{formatNumber(row.leases)} leases · {formatArea(row.glaAtRisk)}</p>
            </div>
            <span className="text-right text-sm font-semibold text-[#102236]">{formatMoney(row.rentalExposure)}</span>
          </div>
        )) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No lease expiry risk inside 180 days.</p>
        )}
      </div>
    </section>
  )
}

function RequirementMatchHighlightsCard({ matches = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Requirement Match Highlights</h2>
          <p className="mt-1 text-sm text-slate-500">Top requirement-to-vacancy fit scores.</p>
        </div>
        <Link to="/commercial/requirements/pipeline" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Pipeline</Link>
      </div>
      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />)
        ) : matches.length ? matches.slice(0, 5).map((match) => (
          <div key={match.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#102236]">{match.vacancyName}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{match.propertyName} · {match.area}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{match.matchPercentage}% Match</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{formatArea(match.availableGla)}</span>
              <span>{formatMoney(match.rental)}</span>
              <span>{match.brokerName}</span>
              <Link to="/commercial/deals/leasing" className="font-semibold text-blue-600">Create Deal</Link>
            </div>
          </div>
        )) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No vacancy matches available yet.</p>
        )}
      </div>
    </section>
  )
}

function ListingQualityAlertsCard({ rows = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Listing Quality Alerts</h2>
          <p className="mt-1 text-sm text-slate-500">Listings missing portal-grade data.</p>
        </div>
        <Link to="/commercial/listings" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Improve listings</Link>
      </div>
      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)
        ) : rows.length ? rows.slice(0, 5).map((row) => (
          <Link key={row.listingId} to={row.to} className="block rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3 transition hover:border-blue-200 hover:bg-white">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-[#102236]">{row.title}</p>
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{row.score}%</span>
            </div>
            <p className="mt-2 truncate text-xs text-slate-500">Missing: {row.missing.join(', ') || 'No critical gaps'}</p>
          </Link>
        )) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Listing quality is in good shape.</p>
        )}
      </div>
    </section>
  )
}

function TransactionScroller({ items = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Commercial Workflow</h2>
          <p className="mt-1 text-sm text-slate-500">Active requirements, deals, HOTs, leases, and expiry work by broker.</p>
        </div>
        <Link to="/commercial/brokers/assignments" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Assignments</Link>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-44 w-[310px] shrink-0 animate-pulse rounded-2xl bg-slate-100" />)
        ) : items.length ? items.map((item) => (
          <Link key={item.id} to={item.to} className="w-[310px] shrink-0 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-[#cfe0ef] hover:bg-white hover:shadow-[0_14px_28px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-[#eef5fb] px-3 py-1 text-[11px] font-semibold text-[#123b61]">{item.type}</span>
              <ArrowUpRight size={16} className="text-slate-400" />
            </div>
            <h3 className="mt-3 truncate text-sm font-semibold text-[#102236]">{item.client}</h3>
            <p className="mt-1 truncate text-xs text-slate-500">{item.property}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block text-[#102236]">{item.stage}</strong>Stage</span>
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block truncate text-[#102236]">{item.broker}</strong>Broker</span>
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block text-[#102236]">{item.value}</strong>Value / GLA</span>
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block text-[#102236]">{item.lastActivity}</strong>Activity</span>
            </div>
            <p className="mt-3 truncate text-xs font-semibold text-emerald-600">{item.nextAction}</p>
          </Link>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No active commercial workflow items yet.</p>
        )}
      </div>
    </section>
  )
}

function RecentListingsScroller({ items = [], loading }) {
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.035em] text-[#102236]">Recent Listings</h2>
          <p className="mt-1 text-sm text-slate-500">Market-facing stock by category, status, and broker.</p>
        </div>
        <Link to="/commercial/listings" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View listings</Link>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-40 w-[290px] shrink-0 animate-pulse rounded-2xl bg-slate-100" />)
        ) : items.length ? items.map((item) => (
          <Link key={item.id} to={item.to} className="w-[290px] shrink-0 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-[#cfe0ef] hover:bg-white hover:shadow-[0_14px_28px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-[#eef5fb] px-3 py-1 text-[11px] font-semibold text-[#123b61]">{item.category}</span>
              {item.featured ? <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">Featured</span> : null}
            </div>
            <h3 className="mt-3 truncate text-sm font-semibold text-[#102236]">{item.title}</h3>
            <p className="mt-1 truncate text-xs text-slate-500">{item.property}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block text-[#102236]">{Number.isFinite(item.quality) ? `${item.quality}%` : item.status}</strong>{Number.isFinite(item.quality) ? 'Quality' : 'Status'}</span>
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block truncate text-[#102236]">{item.broker}</strong>Broker</span>
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block text-[#102236]">{item.value}</strong>Value / GLA</span>
              <span className="rounded-xl bg-white px-3 py-2 text-slate-500"><strong className="block text-[#102236]">{item.updated}</strong>Updated</span>
            </div>
          </Link>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No commercial listings yet.</p>
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
  const navigate = useNavigate()
  const { data, loading, error, organisationId } = useCommercialData(getCommercialPrincipalDashboardData, [])
  const summary = data?.summary || {}
  const intelligence = data?.intelligence || {}
  const brokerMap = new Map((data?.brokers || []).map((broker) => [String(broker.userId || broker.id), broker.name]))
  const requirementRows = summariseStageGroups(intelligence.requirementsPipeline || [], REQUIREMENT_STAGE_GROUPS)
  const dealRows = summariseStageGroups(intelligence.dealsPipeline || [], DEAL_STAGE_GROUPS)
  const listingRows = summariseStageGroups(intelligence.listingPipeline || [], LISTING_STAGE_GROUPS)
  const expiryRows = buildLeaseExpiryBuckets({
    leases: data?.leases || [],
    properties: data?.properties || [],
    totalGla: summary.totalGla,
  })
  const brokerRows = (intelligence.brokerLeaderboard || []).slice(0, 5)
  const scrollerItems = buildWorkflowScrollerItems(data || {}, brokerMap)
  const qualityMap = new Map((intelligence.listingQualityScores || []).map((row) => [row.listingId, row.score]))
  const recentListings = buildRecentListingItems(data || {}, brokerMap, qualityMap)
  const isFreshCommercialWorkspace = !loading && !error &&
    !toNumber(summary.activeListings) &&
    !toNumber(summary.activeRequirements) &&
    !toNumber(summary.activeCompanies) &&
    !(data?.deals || []).length &&
    !(data?.leases || []).length &&
    !(data?.vacancies || []).length &&
    !(data?.commercialTransactions || []).length

  const kpis = [
    {
      label: 'Active Listings',
      value: formatNumber(summary.activeListings),
      detail: `${formatNumber(summary.unassignedListings || 0)} unassigned`,
      icon: ClipboardList,
      tone: 'blue',
    },
    {
      label: 'Active Requirements',
      value: formatNumber(summary.activeRequirements),
      detail: `${formatNumber(summary.unassignedRequirements || 0)} unassigned`,
      icon: Users,
      tone: 'purple',
    },
    {
      label: 'Active Companies',
      value: formatNumber(summary.activeCompanies || 0),
      detail: 'Commercial CRM accounts',
      icon: Building2,
      tone: 'blue',
    },
    {
      label: 'Active Contacts',
      value: formatNumber(summary.activeContacts || 0),
      detail: 'Decision makers and roleplayers',
      icon: Users,
      tone: 'green',
    },
    {
      label: 'Available Space',
      value: formatArea(summary.availableSpace),
      detail: `${formatArea(summary.occupiedSpace)} occupied`,
      icon: Building2,
      tone: 'amber',
    },
    {
      label: 'Deals in Negotiation',
      value: formatNumber(summary.dealsInNegotiation),
      detail: formatMoney(summary.activeNegotiationValue),
      icon: Handshake,
      tone: 'green',
    },
    {
      label: 'Active Transactions',
      value: formatNumber(summary.activeTransactions || 0),
      detail: 'Open commercial closings',
      icon: Handshake,
      tone: 'blue',
    },
    {
      label: 'Transactions Closed',
      value: formatNumber(summary.transactionsClosedThisMonth || 0),
      detail: 'Closed this month',
      icon: ListChecks,
      tone: 'green',
    },
    {
      label: 'Transaction Value',
      value: formatMoney(summary.transactionValue || 0),
      detail: 'Open transaction pipeline',
      icon: WalletCards,
      tone: 'purple',
    },
    {
      label: 'Viewings This Month',
      value: formatNumber(summary.viewings?.thisMonth || 0),
      detail: `${formatNumber(summary.viewings?.upcoming || 0)} upcoming`,
      icon: CalendarDays,
      tone: 'blue',
    },
    {
      label: 'Viewings Completed',
      value: formatNumber(summary.viewings?.completed || 0),
      detail: 'Completed commercial inspections',
      icon: ListChecks,
      tone: 'green',
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
      tone: summary.leaseExpiryCount ? 'rose' : 'green',
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

      {isFreshCommercialWorkspace ? (
        <CommercialEmptyState
          title="No Commercial Listings Yet"
          description="Create your first commercial listing or mandate to get started."
          primaryActionLabel="Create Listing"
          onPrimaryAction={() => navigate('/commercial/listings')}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((card) => (
          <KpiCard key={card.label} {...card} loading={loading} />
        ))}
      </section>

      <AppointmentDashboardSection
        module="commercial"
        organisationId={organisationId}
        includeAll
        onViewCalendar={() => navigate('/commercial/viewings')}
        onOpenCalendar={() => navigate('/commercial/viewings')}
        onManageAppointment={() => navigate('/commercial/viewings')}
        onOpenAppointment={() => navigate('/commercial/viewings')}
        onScheduleAppointment={() => navigate('/commercial/viewings')}
      />

      <PlatformIntegrationCard
        transactions={data?.commercialTransactions || []}
        financialSummary={data?.financialSummary || summary.financialSummary || {}}
        tasks={intelligence.platformTasks || []}
        notifications={intelligence.platformNotifications || []}
        renewalRisk={intelligence.renewalRisk || data?.watchlists?.renewalRisk || []}
        loading={loading}
      />

      <TransactionScroller items={scrollerItems} loading={loading} />
      <NextBestActionsCard actions={intelligence.nextBestActions || []} loading={loading} />
      <ManagementAlertsCard alerts={intelligence.managementAlerts || []} loading={loading} />
      <PortalAdoptionCard adoption={intelligence.portalAdoption || data?.portalAdoption || {}} loading={loading} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(340px,0.85fr)]">
        <div className="grid gap-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <InventorySummaryCard summary={intelligence.inventorySummary || {}} loading={loading} />
            <TopPerformingAssetsCard groups={intelligence.topPerformingAssets || {}} loading={loading} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <VacancyRiskWatchCard risk={intelligence.vacancyRisk || {}} loading={loading} />
            <RequirementMatchHighlightsCard matches={intelligence.requirementMatches || []} loading={loading} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ListingQualityAlertsCard rows={intelligence.listingsNeedingAttention || []} loading={loading} />
            <TopBrokersCard rows={brokerRows.map((row) => ({ ...row, value: row.pipelineValue }))} loading={loading} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <RecentCompaniesCard rows={intelligence.recentCompanies || []} loading={loading} />
            <TopClientsCard rows={intelligence.topClients || []} loading={loading} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <PipelineSummaryCard title="Listing Pipeline" rows={listingRows} to="/commercial/listings" loading={loading} />
            <PipelineSummaryCard title="Requirements Pipeline" rows={requirementRows} to="/commercial/requirements/pipeline" loading={loading} />
            <PipelineSummaryCard title="Deals Pipeline" rows={dealRows} to="/commercial/deals/pipeline" loading={loading} />
          </div>
          <RecentListingsScroller items={recentListings} loading={loading} />
        </div>

        <div className="grid content-start gap-4">
          <PortfolioOccupancyCard summary={summary} vacancies={data?.vacancies || []} loading={loading} />
          <ConversionMetricsCard metrics={summary.conversionMetrics || {}} loading={loading} />
          <DocumentComplianceCard compliance={summary.documentCompliance || {}} loading={loading} />
          <UpcomingViewingsCard rows={intelligence.upcomingViewings || []} loading={loading} />
          <RecentActivityCard items={data?.latestActivity || []} loading={loading} />
          <LeaseExpiryWatchCard rows={expiryRows} loading={loading} />
        </div>
      </section>

      <QuickAccessStrip />
    </div>
  )
}

export default CommercialDashboard
