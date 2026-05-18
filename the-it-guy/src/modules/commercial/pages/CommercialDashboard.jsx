import {
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardList,
  FileSignature,
  FileText,
  Handshake,
  Layers3,
  Ruler,
  Users,
} from 'lucide-react'
import { DEAL_STAGES, REQUIREMENT_STAGES } from '../commercialCrudConfig'
import { formatNumber } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialPipelinePreview from '../components/CommercialPipelinePreview'
import CommercialStatCard from '../components/CommercialStatCard'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialDashboardData } from '../services/commercialApi'

function PortfolioMetric({ label, value, description }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <p className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  )
}

function PriorityCard({ label, rows = [], getTitle, emptyText }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{label}</h2>
      <div className="mt-4 grid gap-3">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <p className="text-sm font-semibold text-[#102236]">{getTitle(row)}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{row.stage || row.status || 'active'}</p>
          </div>
        )) : (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-500">{emptyText}</p>
        )}
      </div>
    </section>
  )
}

function SummaryWidget({ title, icon: Icon, metrics = [], children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
        </div>
        {Icon ? <Icon size={20} className="text-slate-400" /> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <p className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{metric.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{metric.label}</p>
          </div>
        ))}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  )
}

function CommercialDashboard() {
  const { data, loading, error } = useCommercialData(getCommercialDashboardData, [])
  const summary = data?.summary || {}
  const priority = summary.priority || {}
  const documentSummary = summary.documents || {}
  const hotSummary = summary.headsOfTerms || {}
  const KPI_CARDS = [
    { label: 'Active Requirements', value: loading ? '...' : formatNumber(summary.activeRequirements), supportingText: 'Tenant and investor briefs connected to commercial records.', icon: ClipboardList, tone: 'blue' },
    { label: 'Available Space', value: loading ? '...' : formatNumber(summary.availableSpace, 'm²'), supportingText: 'Available commercial property stock.', icon: Building2, tone: 'green' },
    { label: 'Deals in Negotiation', value: loading ? '...' : formatNumber(summary.dealsInNegotiation), supportingText: 'Commercial transactions in proposal or lease draft stages.', icon: Handshake, tone: 'amber' },
    { label: 'Lease Expiries', value: loading ? '...' : formatNumber(summary.leaseExpiries), supportingText: 'Upcoming expiries in the next 180 days.', icon: CalendarClock, tone: 'slate' },
    { label: 'Occupancy Pipeline', value: loading ? '...' : `${formatNumber(summary.occupancyPipeline)}%`, supportingText: 'GLA occupancy signal calculated from available space.', icon: ChartNoAxesCombined, tone: 'green' },
    { label: 'GLA Tracked', value: loading ? '...' : formatNumber(summary.glaTracked, 'm²'), supportingText: 'Gross lettable area tracked in commercial properties.', icon: Ruler, tone: 'blue' },
  ]

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-[#102b46] bg-[linear-gradient(135deg,#081d31_0%,#102f4d_52%,#175b73_100%)] p-6 text-white shadow-[0_24px_58px_rgba(8,24,42,0.18)] md:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-end">
          <div className="min-w-0">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/75">
              <Layers3 size={14} />
              Commercial Module
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em] md:text-4xl">Commercial Workspace</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-white/78 md:text-base">
              Manage commercial tenants, landlords, requirements, deals, leases, and portfolio activity from one place.
            </p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Workspace status</p>
            <p className="mt-2 text-lg font-semibold">Shell ready</p>
            <p className="mt-1 text-sm leading-6 text-white/70">
              Placeholder values are contained in the commercial module and can be connected to data later.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {KPI_CARDS.map((card) => (
          <CommercialStatCard key={card.label} {...card} />
        ))}
      </section>

      {error ? (
        <CommercialEmptyState
          title="Commercial dashboard data could not be loaded"
          description={error}
        />
      ) : null}

      <CommercialPipelinePreview
        title="Requirements Pipeline Preview"
        subtitle="Counts by commercial requirement stage."
        columns={REQUIREMENT_STAGES}
        stageCounts={summary.requirementStageCounts || {}}
        ctaLabel="Open requirements pipeline"
        ctaTo="/commercial/requirements/pipeline"
        emptyTitle="No requirements"
        emptyDescription="New commercial requirements will appear here once intake is connected."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <PriorityCard
          label="Requirements Needing Follow-up"
          rows={priority.requirementsNeedingFollowUp || []}
          getTitle={(row) => row.requirement_name || 'Commercial requirement'}
          emptyText="No early-stage requirements need follow-up."
        />
        <PriorityCard
          label="Deals Closing Soon"
          rows={priority.dealsClosingSoon || []}
          getTitle={(row) => row.deal_name || 'Commercial deal'}
          emptyText="No commercial deals are expected to close soon."
        />
        <PriorityCard
          label="Negotiation Focus"
          rows={priority.negotiationItems || []}
          getTitle={(row) => row.requirement_name || row.deal_name || 'Commercial record'}
          emptyText="No requirements or deals are currently in negotiation."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SummaryWidget
          title="Document Requests"
          icon={FileText}
          metrics={[
            { label: 'Outstanding', value: loading ? '...' : formatNumber(documentSummary.outstandingDocumentRequests) },
            { label: 'Overdue', value: loading ? '...' : formatNumber(documentSummary.overdueDocumentRequests) },
            { label: 'Recent uploads', value: loading ? '...' : formatNumber(documentSummary.recentlyUploadedDocuments?.length) },
          ]}
        >
          {(documentSummary.recentlyUploadedDocuments || []).length ? (
            <div className="grid gap-2">
              {documentSummary.recentlyUploadedDocuments.map((document) => (
                <div key={document.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
                  <p className="text-sm font-semibold text-[#102236]">{document.document_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{document.category || 'commercial document'} · {document.status}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-500">No commercial documents uploaded recently.</p>
          )}
        </SummaryWidget>

        <SummaryWidget
          title="Heads of Terms"
          icon={FileSignature}
          metrics={[
            { label: 'Drafts', value: loading ? '...' : formatNumber(hotSummary.drafts) },
            { label: 'Sent for review', value: loading ? '...' : formatNumber(hotSummary.sentForReview) },
            { label: 'Ready for lease', value: loading ? '...' : formatNumber(hotSummary.readyForLease) },
          ]}
        >
          <p className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-500">
            HOT capture appears on commercial deal detail views and prepares future PDF generation.
          </p>
        </SummaryWidget>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Landlord / Portfolio Overview</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Future portfolio visibility across landlords, properties, availability, and vacancy exposure.</p>
            </div>
            <Users size={20} className="text-slate-400" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PortfolioMetric label="Landlords tracked" value={loading ? '...' : formatNumber(data?.landlords?.length)} description="Owner and portfolio contacts." />
            <PortfolioMetric label="Properties tracked" value={loading ? '...' : formatNumber(data?.properties?.length)} description="Commercial stock records." />
            <PortfolioMetric label="Available units" value={loading ? '...' : formatNumber(data?.properties?.filter((property) => Number(property.available_space_m2 || 0) > 0).length)} description="Vacant or soon-available spaces." />
            <PortfolioMetric label="Vacancy exposure" value={loading ? '...' : `${formatNumber(summary.glaTracked > 0 ? (summary.availableSpace / summary.glaTracked) * 100 : 0)}%`} description="Available space compared to tracked GLA." />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Lease Expiry Watchlist</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Future renewal, expiry, and tenant-retention reminders.</p>
          <div className="mt-5">
            <CommercialEmptyState
              title="No lease expiries tracked yet."
              description="Lease renewal and expiry reminders will appear here once lease records are connected."
            />
          </div>
        </section>
      </section>

      <CommercialPipelinePreview
        title="Deals Pipeline Preview"
        subtitle="Counts by commercial leasing and sales deal stage."
        columns={DEAL_STAGES}
        stageCounts={summary.dealStageCounts || {}}
        ctaLabel="Open deals pipeline"
        ctaTo="/commercial/deals/pipeline"
        emptyTitle="No deals in this stage"
        emptyDescription="Commercial deal cards will appear here when the deal workflow is connected."
      />
    </>
  )
}

export default CommercialDashboard
