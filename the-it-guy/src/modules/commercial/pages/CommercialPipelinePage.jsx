import {
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  FileBarChart2,
  LineChart,
  Radar,
  TrendingUp,
  Warehouse,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialPipelineSummary from '../components/CommercialPipelineSummary'
import { formatCurrency, formatNumber } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialPipelineData } from '../services/commercialPipelineApi'

const CARD_CLASS = 'rounded-[24px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]'

function MetricTile({ label, value, detail, icon: Icon }) {
  return (
    <article className={`${CARD_CLASS} flex min-h-[168px] flex-col justify-between p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium text-[#60758d]">{label}</p>
          <p className="mt-5 text-[40px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eef5fb] text-[#2d6ecf]">
          <Icon size={20} />
        </span>
      </div>
      <p className="text-[13px] font-normal text-[#7b899a]">{detail}</p>
    </article>
  )
}

function PipelineActionLink({ to, label, description, icon: Icon, primary = false }) {
  return (
    <Link
      to={to}
      className={[
        'flex items-start gap-3 rounded-[20px] border p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.06)]',
        primary
          ? 'border-[#cfe0ef] bg-[#f4f8fc] text-[#102236]'
          : 'border-[#e6edf4] bg-white text-[#102236]',
      ].join(' ')}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white text-[#1f6dd5] shadow-sm">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-[-0.02em] text-[#102236]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#6b7c91]">{description}</span>
      </span>
    </Link>
  )
}

function PipelineSkeleton() {
  return (
    <div className="grid gap-6 pb-10">
      <div className={`${CARD_CLASS} p-6`}>
        <div className="h-3 w-32 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 h-10 w-72 animate-pulse rounded-2xl bg-slate-200" />
        <div className="mt-3 h-4 w-[34rem] max-w-full animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className={`${CARD_CLASS} h-[168px] animate-pulse bg-slate-50`} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={`${CARD_CLASS} h-[360px] animate-pulse bg-slate-50`} />
        <div className={`${CARD_CLASS} h-[360px] animate-pulse bg-slate-50`} />
      </div>
    </div>
  )
}

function CommercialPipelinePage() {
  const { data, loading, error } = useCommercialData(getCommercialPipelineData, [])

  if (loading) return <PipelineSkeleton />

  if (error) {
    return (
      <div className="space-y-6 pb-10">
        <section className={`${CARD_CLASS} p-6`}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial pipeline</p>
          <h1 className="mt-3 text-[46px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">Pipeline</h1>
          <p className="mt-3 max-w-3xl text-[20px] font-medium text-[#526276]">A central workspace for commercial demand, deals, and follow-up.</p>
        </section>
        <CommercialEmptyState title="Commercial pipeline data could not be loaded" description={error} />
      </div>
    )
  }

  const summary = data?.summary || {}
  const intelligence = data?.intelligence || {}
  const financialSummary = data?.financialSummary || {}

  const requirementsPipeline = intelligence.requirementsPipeline || []
  const dealsPipeline = intelligence.dealsPipeline || []
  const listingPipeline = intelligence.listingPipeline || []

  const metrics = [
    { label: 'Pipeline Value', value: formatCurrency(financialSummary.pipelineValue || summary.pipelineValue || 0), detail: 'Live commercial value in motion', icon: LineChart },
    { label: 'Active Requirements', value: formatNumber(summary.activeRequirements || 0), detail: 'Live demand and tenant interest', icon: ClipboardList },
    { label: 'Active Deals', value: formatNumber(summary.activeDeals || 0), detail: 'Open leasing and sales opportunities', icon: TrendingUp },
    { label: 'Viewings', value: formatNumber(summary.viewings?.upcoming || 0), detail: 'Scheduled commercial inspections', icon: CalendarDays },
    { label: 'Active Listings', value: formatNumber(summary.activeListings || 0), detail: 'Stock being worked by the team', icon: Warehouse },
  ]

  return (
    <div className="space-y-8 pb-10">
      <section className={`${CARD_CLASS} p-6`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial pipeline</p>
            <h1 className="mt-3 text-[46px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">Pipeline</h1>
            <p className="mt-3 max-w-3xl text-[20px] font-medium text-[#526276]">Track commercial demand, deal movement, and follow-up work in one place.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/commercial/requirements/pipeline" className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#0e335f] px-[18px] text-sm font-medium text-white shadow-[0_10px_24px_rgba(14,51,95,0.18)] transition hover:bg-[#0b294e]">
              Requirements
              <ArrowUpRight size={15} />
            </Link>
            <Link to="/commercial/deals/pipeline" className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#dce6f0] bg-white px-[18px] text-sm font-medium text-[#0f2748] shadow-sm transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
              Deals
              <ArrowUpRight size={15} />
            </Link>
            <Link to="/commercial/viewings" className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#dce6f0] bg-white px-[18px] text-sm font-medium text-[#0f2748] shadow-sm transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
              Viewings
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricTile key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <CommercialPipelineSummary
          title="Requirements Pipeline"
          subtitle="Commercial demand moving through qualification and matching."
          stages={requirementsPipeline}
          ctaTo="/commercial/requirements/pipeline"
          ctaLabel="Open requirements"
          showValue
        />

        <CommercialPipelineSummary
          title="Deals Pipeline"
          subtitle="Leasing and sales opportunities progressing through negotiation."
          stages={dealsPipeline}
          ctaTo="/commercial/deals/pipeline"
          ctaLabel="Open deals"
          showValue
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <CommercialPipelineSummary
          title="Stock Pipeline"
          subtitle="Listings moving from draft to market-ready and active."
          stages={listingPipeline}
          ctaTo="/commercial/listings"
          ctaLabel="Open listings"
          showValue
        />

        <article className={`${CARD_CLASS} p-6`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Entry points</p>
              <h2 className="mt-2 text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">Workflow shortcuts</h2>
            </div>
            <Link to="/commercial/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
              Reports
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            <PipelineActionLink
              to="/commercial/leads"
              label="Leads"
              description="Open the commercial lead and requirement workspace."
              icon={ClipboardList}
              primary
            />
            <PipelineActionLink
              to="/commercial/canvassing"
              label="Canvassing"
              description="Track outbound prospecting and follow-up."
              icon={Radar}
            />
            <PipelineActionLink
              to="/commercial/deals"
              label="Deals"
              description="Review active leasing and sales opportunities."
              icon={TrendingUp}
            />
            <PipelineActionLink
              to="/commercial/leasing"
              label="Leasing"
              description="Track heads of terms, leases, and occupier movement."
              icon={Warehouse}
            />
            <PipelineActionLink
              to="/commercial/viewings"
              label="Viewings"
              description="Manage scheduled inspections and follow-up."
              icon={CalendarDays}
            />
            <PipelineActionLink
              to="/commercial/reports"
              label="Reports"
              description="Open commercial reporting and performance views."
              icon={FileBarChart2}
            />
          </div>
        </article>
      </section>
    </div>
  )
}

export default CommercialPipelinePage
