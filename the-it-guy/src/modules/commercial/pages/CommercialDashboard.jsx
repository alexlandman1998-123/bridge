import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  Gauge,
  Handshake,
  Ruler,
  SearchCheck,
} from 'lucide-react'
import { formatCurrency, formatNumber } from '../commercialFormatters'
import CommercialActivityFeed from '../components/CommercialActivityFeed'
import CommercialActivitySnapshot from '../components/CommercialActivitySnapshot'
import CommercialAssetClassChart from '../components/CommercialAssetClassChart'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialExpiryTable from '../components/CommercialExpiryTable'
import CommercialKpiCard from '../components/CommercialKpiCard'
import CommercialLandlordLeaderboard from '../components/CommercialLandlordLeaderboard'
import CommercialLeaseExpiryChart from '../components/CommercialLeaseExpiryChart'
import CommercialOccupancyChart from '../components/CommercialOccupancyChart'
import CommercialPipelineSummary from '../components/CommercialPipelineSummary'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialPrincipalDashboardData } from '../services/commercialDashboardApi'

function CommercialDashboard() {
  const { data, loading, error } = useCommercialData(getCommercialPrincipalDashboardData, [])
  const summary = data?.summary || {}
  const charts = data?.charts || {}
  const intelligence = data?.intelligence || {}
  const watchlists = data?.watchlists || {}

  const kpis = [
    {
      label: 'Total GLA Under Management',
      value: loading ? '...' : formatNumber(summary.totalGla, 'm²'),
      context: 'Gross lettable area captured across the commercial portfolio.',
      trend: `${summary.totalGlaChange || 0}% MoM`,
      icon: Ruler,
      tone: 'blue',
    },
    {
      label: 'Available Space',
      value: loading ? '...' : formatNumber(summary.availableSpace, 'm²'),
      context: `${formatNumber(summary.vacancyRate)}% of tracked stock currently vacant.`,
      trend: summary.usesVacancyData ? 'Vacancy-level' : 'Property-level',
      icon: Building2,
      tone: 'amber',
    },
    {
      label: 'Deals In Negotiation',
      value: loading ? '...' : formatNumber(summary.dealsInNegotiation),
      context: Number(summary.activeNegotiationValue || 0) > 0 ? `${formatCurrency(summary.activeNegotiationValue)} active negotiation value.` : 'No active negotiation value currently tracked.',
      trend: 'Proposal to lease draft',
      icon: Handshake,
      tone: 'green',
    },
    {
      label: 'Active Requirements',
      value: loading ? '...' : formatNumber(summary.activeRequirements),
      context: 'Open tenant and investor demand in the pipeline.',
      trend: `${summary.activeRequirementsChange || 0}% MoM`,
      icon: SearchCheck,
      tone: 'indigo',
    },
    {
      label: 'Occupancy Rate',
      value: loading ? '...' : `${formatNumber(summary.occupancyRate)}%`,
      context: 'Occupied stock compared with total GLA under management.',
      trend: 'Portfolio health',
      icon: Gauge,
      tone: 'green',
    },
    {
      label: 'Lease Expiry Exposure',
      value: loading ? '...' : formatNumber(summary.leaseExpiryGla, 'm²'),
      context: `${formatNumber(summary.leaseExpiryCount)} leases expiring in the next 12 months.`,
      trend: '12-month risk',
      icon: CalendarClock,
      tone: 'rose',
    },
  ]

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-[#102b46] bg-[radial-gradient(circle_at_82%_18%,rgba(125,211,252,0.22),transparent_32%),linear-gradient(135deg,#071a2d_0%,#0f2d49_50%,#15536a_100%)] p-6 text-white shadow-[0_24px_58px_rgba(8,24,42,0.18)] md:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
          <div className="min-w-0">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/75">
              <Activity size={14} />
              Commercial command center
            </span>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-0.045em] md:text-4xl" style={{ color: '#ffffff' }}>
              Portfolio intelligence, vacancy exposure and deal momentum in one view.
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 md:text-base" style={{ color: 'rgba(255,255,255,0.76)' }}>
              Monitor landlord portfolios, active demand, space under negotiation, lease risk and commercial activity across the organisation.
            </p>
          </div>
          <div className="grid gap-3 rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Portfolio exposure</span>
              <AlertTriangle size={17} className="text-amber-200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-semibold tracking-[-0.045em]" style={{ color: '#ffffff' }}>{loading ? '...' : `${formatNumber(summary.vacancyRate)}%`}</p>
                <p className="text-xs leading-5" style={{ color: 'rgba(255,255,255,0.65)' }}>Vacancy exposure</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-[-0.045em]" style={{ color: '#ffffff' }}>{loading ? '...' : formatNumber(summary.leaseExpiryCount)}</p>
                <p className="text-xs leading-5" style={{ color: 'rgba(255,255,255,0.65)' }}>12-month expiries</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <CommercialEmptyState
          title="Commercial dashboard data could not be loaded"
          description={error}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((card) => (
          <CommercialKpiCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)_minmax(320px,0.8fr)]">
        <CommercialOccupancyChart data={charts.occupancyTrend || []} />
        <CommercialAssetClassChart data={charts.assetClassBreakdown || []} />
        <CommercialLeaseExpiryChart data={charts.leaseExpiryDistribution || []} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
        <CommercialLandlordLeaderboard rows={intelligence.topLandlords || []} />
        <div className="grid gap-4">
          <CommercialPipelineSummary
            title="Requirements Pipeline"
            subtitle="Active demand by requirement stage."
            stages={intelligence.requirementsPipeline || []}
            ctaTo="/commercial/requirements/pipeline"
            ctaLabel="Open"
          />
          <CommercialPipelineSummary
            title="Deals Pipeline"
            subtitle="Commercial leasing and sales progression."
            stages={intelligence.dealsPipeline || []}
            ctaTo="/commercial/deals/pipeline"
            ctaLabel="Open"
            showValue
          />
        </div>
        <CommercialActivitySnapshot items={intelligence.activitySnapshot || []} />
      </section>

      <CommercialExpiryTable rows={watchlists.leaseExpiries || []} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <CommercialActivityFeed items={data?.latestActivity || []} />
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Document & HOT Control</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Outstanding requests and Heads of Terms readiness.</p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{loading ? '...' : formatNumber(summary.documentRequests?.outstanding)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">Outstanding document requests</p>
              <p className="mt-1 text-xs text-slate-500">{formatNumber(summary.documentRequests?.overdue)} overdue</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{loading ? '...' : formatNumber(summary.headsOfTerms?.drafts)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">HOT drafts</p>
              <p className="mt-1 text-xs text-slate-500">{formatNumber(summary.headsOfTerms?.readyForLease)} ready for lease</p>
            </div>
          </div>
        </section>
      </section>
    </>
  )
}

export default CommercialDashboard
