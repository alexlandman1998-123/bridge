import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Banknote, Building2, ChevronDown, CircleCheck, CircleDashed, CircleAlert, Clock3, FileCheck2, FileText, HandCoins, ShieldAlert, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppointmentDashboardSection from '../appointments/dashboard/AppointmentDashboardSection'
import BondEmptyState from './BondEmptyState'
import BondHqCommandCentre from './BondHqCommandCentre'
import BondPageShell from './BondPageShell'
import BondSectionCard from './BondSectionCard'
import OperationalHeatmap from '../analytics/OperationalHeatmap'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'
import { FINANCE_INTELLIGENCE_DISCLAIMER } from '../../services/financeIntelligenceService'
import { Link, useLocation } from 'react-router-dom'
import { MOCK_DATA_ENABLED } from '../../lib/mockData'
import OrganisationAvatar from '../organisation/OrganisationAvatar'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const BANK_VISUALS = {
  FNB: { initials: 'FN', color: '#2f8a63', soft: '#e8f4ee' },
  ABSA: { initials: 'AB', color: '#a83e4b', soft: '#faecef' },
  'Standard Bank': { initials: 'SB', color: '#315f8c', soft: '#e8f0f8' },
  Nedbank: { initials: 'NB', color: '#23794f', soft: '#e8f4ee' },
  Investec: { initials: 'IN', color: '#273447', soft: '#edf1f5' },
  Others: { initials: 'OT', color: '#8a94a3', soft: '#f1f4f7' },
}

const KPI_VISUALS = {
  active_applications: { icon: UsersRound, tone: 'bg-[#eef4ff] text-[#315adf]' },
  approval_rate: { icon: CircleCheck, tone: 'bg-[#ecfdf3] text-[#16894f]' },
  average_approval_time: { icon: Clock3, tone: 'bg-[#fff7e8] text-[#b7791f]' },
  bond_value: { icon: Banknote, tone: 'bg-[#edf5ff] text-[#1769d1]' },
  commission_pipeline: { icon: HandCoins, tone: 'bg-[#f3efff] text-[#7657d8]' },
}

const ACTIVE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_docs', label: 'Awaiting Docs' },
  { key: 'ready_for_review', label: 'Ready For Review' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'bank_feedback', label: 'Bank Feedback' },
  { key: 'approved', label: 'Approved' },
]

const DEFAULT_RANGE_KEY = 'last_30_days'
const DEFAULT_RANGE_LABEL = 'Last 30 Days'
const MOCK_APPLICATION_QUERY_KEYS = ['mockApplications', 'mockData', 'demoApplications']
const MOCK_APPLICATION_TRUE_VALUES = new Set(['1', 'true', 'yes', 'applications', 'bond'])

function getBankVisual(bank = '') {
  return BANK_VISUALS[bank] || BANK_VISUALS.Others
}

function isHqDashboard(reportingScope = {}) {
  const dashboardMode = normalizeText(reportingScope?.dashboardMode)
  const scopeLevel = normalizeText(reportingScope?.scopeLevel)
  return dashboardMode === 'owner_director' || dashboardMode === 'hq_manager' || scopeLevel === 'workspace_hq'
}

function shouldPreviewMockApplications(search = '') {
  const params = new URLSearchParams(search || '')
  const requested = MOCK_APPLICATION_QUERY_KEYS.some((key) => {
    const value = normalizeText(params.get(key)).toLowerCase()
    return MOCK_APPLICATION_TRUE_VALUES.has(value)
  })

  return requested && (MOCK_DATA_ENABLED || import.meta.env.DEV)
}

export default function BondDashboard({
  user = {},
  workspaceId = '',
  service = bondCommandCenterService,
  initialState = null,
}) {
  const navigate = useNavigate()
  const safeWorkspaceId = normalizeText(workspaceId)
  const location = useLocation()
  const [rangeKey] = useState(DEFAULT_RANGE_KEY)
  const developmentId = 'all'
  const mockApplicationsPreview = shouldPreviewMockApplications(location.search)
  const [state, setState] = useState(
    initialState || {
      loading: true,
      error: '',
      snapshot: null,
      reportingScope: null,
    },
  )
  const [activeFilter, setActiveFilter] = useState('all')

  const loadDashboard = useCallback(async () => {
    if (!safeWorkspaceId) {
      setState({
        loading: false,
        error: 'missing_workspace_context',
        snapshot: null,
        reportingScope: null,
      })
      return
    }

    setState((previous) => ({ ...previous, loading: true, error: '' }))

    try {
      const snapshot = await service.getBondCommandCenterSnapshot(user, safeWorkspaceId, {
        rangeKey,
        developmentId,
        includeDemoRows: mockApplicationsPreview ? true : undefined,
      })
      setState({
        loading: false,
        error: '',
        snapshot,
        reportingScope: snapshot.reportingScope || null,
      })
    } catch (error) {
      setState({
        loading: false,
        error: String(error?.message || 'dashboard_load_failed'),
        snapshot: null,
        reportingScope: null,
      })
    }
  }, [developmentId, mockApplicationsPreview, rangeKey, safeWorkspaceId, service, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard()
  }, [loadDashboard])

  const snapshot = state.snapshot || {}
  const heroKpis = snapshot.heroKpis || []
  const visibleActiveApplications = useMemo(
    () => {
      const activeApplications = Array.isArray(snapshot.activeApplications) ? snapshot.activeApplications : []
      return activeApplications.filter((application) => activeFilter === 'all' || application.filterKeys?.includes(activeFilter))
    },
    [snapshot.activeApplications, activeFilter],
  )
  const bankBreakdown = snapshot.bankBreakdown || []
  const bankLeadTimes = snapshot.bankLeadTimes || []
  const pipelineFlow = snapshot.pipelineFlow || []
  const buyerDemographics = snapshot.buyerDemographics || {}
  const approvalConfidenceDistribution = snapshot.approvalConfidenceDistribution || []
  const readinessFunnel = snapshot.readinessFunnel || []
  const bankEfficiency = snapshot.bankEfficiency || []
  const buyerQualityDistribution = snapshot.buyerQualityDistribution || {}
  const operationalRiskMatrix = snapshot.operationalRiskMatrix || []
  const operationalRisk = snapshot.operationalRisk || []
  const operationalDiagnostics = snapshot.operationalDiagnostics || null
  const recentBankActivity = snapshot.recentBankActivity || []
  const teamPerformance = snapshot.teamPerformance || []
  const connectedPartners = snapshot.connectedPartners || []
  const heatmapRows = snapshot.operationalHeatmap || []
  const shouldRenderHqDashboard = isHqDashboard(state.reportingScope)
  const organisationSnapshot = buildOrganisationSnapshot(snapshot, state.reportingScope)

  if (!safeWorkspaceId) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load your Bond workspace context.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please switch workspace or try again.</p>
      </section>
    )
  }

  if (!state.loading && state.error) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load your Bond workspace context.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please switch workspace or try again.</p>
      </section>
    )
  }

  return (
    <BondPageShell className="space-y-4">
      {state.loading ? (
        <BondEmptyState
          title="Loading bond command center…"
          description="We are pulling your operational intelligence now."
        />
      ) : null}

      {!state.loading && snapshot ? (
        <>
          {mockApplicationsPreview ? (
            <section className="rounded-[18px] border border-[#d7e4f1] bg-[#f8fbff] px-4 py-3 text-sm text-[#31516f] shadow-[0_10px_24px_rgba(15,35,57,0.035)]">
              <span className="font-semibold text-[#17324d]">Preview data enabled.</span> Showing generated mock bond applications for layout review only. No database records are created.
            </section>
          ) : null}
          {shouldRenderHqDashboard ? (
            <BondHqCommandCentre snapshot={snapshot} />
          ) : snapshot.totalApplications === 0 ? (
            <BondEmptyState
              title="All operational queues are clear."
              description="Your bond desk is running smoothly."
              compact
            />
          ) : (
            <>
              <KpiStrip items={heroKpis} />

              <AppointmentDashboardSection
                module="bond"
                organisationId={safeWorkspaceId}
                userId={normalizeText(user?.profile?.id || user?.id || user?.userId)}
                userEmail={normalizeText(user?.profile?.email || user?.email)}
                canManage
                onViewCalendar={() => navigate('/bond/calendar')}
                onOpenCalendar={() => navigate('/bond/calendar')}
                onManageAppointment={() => navigate('/bond/calendar')}
                onOpenAppointment={() => navigate('/bond/calendar')}
                onScheduleAppointment={() => navigate('/bond/calendar')}
                refreshKey={safeWorkspaceId}
              />

              <ActiveApplicationsSection
                items={visibleActiveApplications}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
              />

              {organisationSnapshot ? <OrganisationSnapshotCard snapshot={organisationSnapshot} /> : null}

              <section className="grid gap-6 xl:grid-cols-2">
                <BondSectionCard
                  eyebrow="Primary Analytics"
                  title="Bank Approval Breakdown"
                  description="Real-time view of approvals across all banks."
                  action={<AnalyticsRangeButton label={DEFAULT_RANGE_LABEL} />}
                  className="flex min-h-[500px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <BankApprovalPanel items={bankBreakdown} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Primary Analytics"
                  title="Bank Lead Times"
                  description="Average lead time by lender from submission to movement."
                  action={<AnalyticsRangeButton label={DEFAULT_RANGE_LABEL} />}
                  className="flex min-h-[500px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <BankLeadTimePanel items={bankLeadTimes} />
                </BondSectionCard>
              </section>

              <PipelineOverview items={pipelineFlow} leadTimes={bankLeadTimes} />

              <section className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <BondSectionCard
                  eyebrow="Buyer Demographics"
                  title="Buyer Type Mix"
                  description="Individual, company and trust buyer distribution across the active book."
                  className="flex min-h-[300px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-5 min-h-0 flex-1"
                >
                  <DonutAnalyticsPanel items={buyerDemographics.clientType} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Buyer Demographics"
                  title="Bank Distribution"
                  description="Application volume and submitted movement by bank."
                  className="flex min-h-[300px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-5 min-h-0 flex-1"
                >
                  <BankDistributionPanel items={buyerDemographics.bankDistribution} />
                </BondSectionCard>
              </section>

              <BondSectionCard
                eyebrow="Application Heatmap"
                title="Operational Bottleneck Heatmap"
                description="Where applications are slowing down across the finance workflow."
                className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                headerClassName="gap-3"
                contentClassName="mt-6 min-h-0 flex-1"
              >
                <OperationalHeatmapPanel rows={heatmapRows} />
              </BondSectionCard>

              {operationalDiagnostics ? (
                <BondSectionCard
                  eyebrow="Diagnostic Console"
                  title="Operational Diagnostics"
                  description="Evidence and ownership gaps from application arrival through grant submission."
                  className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <OperationalDiagnosticsPanel diagnostics={operationalDiagnostics} />
                </BondSectionCard>
              ) : null}

              <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <BondSectionCard
                  eyebrow="Predictive Intelligence"
                  title="Approval Confidence Distribution"
                  description="Estimated confidence bands based on readiness, documents, and workflow signals. Not a bank decision."
                  className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <ApprovalConfidencePanel items={approvalConfidenceDistribution} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Readiness Funnel"
                  title="Buyer Finance Readiness Funnel"
                  description="Conversion from lead to readiness, application, documents, submission, approval, and registration."
                  className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <ReadinessFunnelPanel items={readinessFunnel} />
                </BondSectionCard>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <BondSectionCard
                  eyebrow="Bank Intelligence"
                  title="Bank Efficiency Layer"
                  description="Estimated response quality by lender based on volume, timing, and outcome movement."
                  className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <BankEfficiencyPanel rows={bankEfficiency} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Attention Matrix"
                  title="Applications Needing Attention"
                  description="Highest-risk applications ranked by bottlenecks, predicted delays, and velocity."
                  className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <OperationalRiskMatrix rows={operationalRiskMatrix} />
                </BondSectionCard>
              </section>

              <BondSectionCard
                eyebrow="Buyer Quality Distribution"
                title="Readiness Quality Mix"
                description="Portfolio quality distribution using buyer readiness ranges, deposit strength and captured affordability signals."
                className="flex min-h-[250px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                headerClassName="gap-3"
                contentClassName="mt-6 min-h-0 flex-1"
              >
                <BuyerQualityPanel distribution={buyerQualityDistribution} />
              </BondSectionCard>

              <section className="grid gap-6 xl:grid-cols-2">
                <BondSectionCard
                  eyebrow="Secondary Operations"
                  title="Recent Bank Activity"
                  description="Latest bank responses and document actions."
                  action={
                    <Link to="/banks?view=submissions" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
                      Open bank feed
                    </Link>
                  }
                  className="flex min-h-[340px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <BankActivityFeedPanel rows={recentBankActivity} />
                </BondSectionCard>

                <BondSectionCard
                  eyebrow="Secondary Operations"
                  title="Team Performance"
                  description="Active applications and operational quality by teammate."
                  action={
                    <Link to="/teams" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
                      Team view
                    </Link>
                  }
                  className="flex min-h-[340px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <TeamPerformancePanel rows={teamPerformance} />
                </BondSectionCard>
              </section>

              <section className="rounded-[24px] border border-[#dbe5f0] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.03)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#748aa0]">Connected Partners</p>
                    <h2 className="mt-2 text-[1.1rem] font-semibold tracking-normal text-[#142132]">
                      Connected Partners
                    </h2>
                  </div>
                  <Link to="/partners" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
                    Open network
                  </Link>
                </div>
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {connectedPartners.length ? (
                    connectedPartners.map((partner) => <ConnectedPartnerCard key={partner.key} partner={partner} />)
                  ) : (
                    <BondEmptyState
                      compact
                      title="No connected partners yet."
                      description="Invite trusted organisations to build shared liquidity."
                    />
                  )}
                </div>
              </section>

              <BondSectionCard
                eyebrow="Secondary Operations"
                title="Operational Risk"
                description="Immediate risks to cycle-time and quality."
                action={
                  <Link
                    to="/bond/pipeline?view=stalled"
                    className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]"
                  >
                    View all
                  </Link>
                }
                className="flex min-h-[300px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                headerClassName="gap-3"
                contentClassName="mt-6 min-h-0 flex-1"
              >
                <OperationalRiskPanel items={operationalRisk} />
              </BondSectionCard>

              <p className="rounded-[18px] border border-[#dbe5f0] bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-[#60758d]">
                {FINANCE_INTELLIGENCE_DISCLAIMER}
              </p>
            </>
          )}
        </>
      ) : null}
    </BondPageShell>
  )
}

function KpiStrip({ items = [] }) {
  const rows = Array.isArray(items)
    ? items.filter((item) => item?.key !== 'registration_conversion').slice(0, 5)
    : []

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {rows.map((item) => (
        <ExecutiveKpiCard key={item.key} item={item} />
      ))}
    </section>
  )
}

function getHeroKpiValue(items = [], key = '') {
  const item = (Array.isArray(items) ? items : []).find((row) => row?.key === key)
  return normalizeText(item?.value) || '0'
}

function buildOrganisationSnapshot(snapshot = {}, reportingScope = {}) {
  const scopeLevel = normalizeText(reportingScope?.scopeLevel)
  if (!scopeLevel || scopeLevel === 'assigned') return null
  const teamRows = Array.isArray(snapshot.teamPerformance) ? snapshot.teamPerformance : []
  const pipelineRows = Array.isArray(snapshot.pipelineFlow) ? snapshot.pipelineFlow : []
  const pressure = [...pipelineRows].sort((left, right) => normalizeNumber(right.count) - normalizeNumber(left.count))[0]
  const scopeLabel = scopeLevel === 'workspace_hq'
    ? 'National command'
    : scopeLevel === 'region'
      ? 'Regional command'
      : 'Branch command'

  return {
    scopeLabel,
    consultants: teamRows.length,
    activeFiles: normalizeNumber(snapshot.totalApplications),
    approvalRate: getHeroKpiValue(snapshot.heroKpis, 'approval_rate'),
    pressureLabel: pressure?.label || 'Pipeline clear',
    pressureDetail: pressure?.count ? `${pressure.count} active files` : 'No elevated pressure',
  }
}

function OrganisationSnapshotCard({ snapshot = {} }) {
  const metrics = [
    { label: 'Visible Scope', value: snapshot.scopeLabel, icon: Building2 },
    { label: 'Consultants', value: snapshot.consultants, icon: UsersRound },
    { label: 'Active Files', value: snapshot.activeFiles, icon: FileText },
    { label: 'Approval Rate', value: snapshot.approvalRate, icon: CircleCheck },
  ]

  return (
    <section className="rounded-[24px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.03)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#748aa0]">Organisation Snapshot</p>
          <h2 className="mt-2 text-[1.05rem] font-semibold tracking-normal text-[#142132]">Network operating health</h2>
        </div>
        <Link to="/bond/organisation" className="inline-flex items-center gap-2 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
          View Organisation <ArrowRight size={15} />
        </Link>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <article key={metric.label} className="rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef5ff] text-[#24518a]">
                  <Icon size={17} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#142132]">{metric.value}</p>
                  <p className="mt-0.5 text-xs font-medium text-[#60758d]">{metric.label}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      <div className="mt-4 rounded-[18px] border border-[#f1dfbf] bg-[#fffaf0] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b7791f]">Highest pressure</p>
        <p className="mt-1 text-sm font-semibold text-[#142132]">{snapshot.pressureLabel}</p>
        <p className="mt-1 text-sm text-[#60758d]">{snapshot.pressureDetail}</p>
      </div>
    </section>
  )
}

function ApprovalConfidencePanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const total = rows.reduce((sum, item) => sum + normalizeNumber(item.count), 0) || 1
  return (
    <div className="space-y-3">
      {rows.map((item) => {
        const pct = Math.round((normalizeNumber(item.count) / total) * 100)
        return (
          <article key={item.key} className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color || '#315f8c' }} />
                <p className="text-sm font-semibold text-[#142132]">{item.label}</p>
              </div>
              <strong className="text-sm text-[#142132]">{pct}%</strong>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[#e6eef8]">
              <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: item.color || '#315f8c' }} />
            </div>
            <p className="mt-2 text-xs text-[#60758d]">{item.count} applications</p>
          </article>
        )
      })}
    </div>
  )
}

function ReadinessFunnelPanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const max = Math.max(...rows.map((item) => normalizeNumber(item.count)), 1)
  return (
    <div className="space-y-2">
      {rows.map((item) => {
        const width = Math.max(8, (normalizeNumber(item.count) / max) * 100)
        return (
          <div key={item.key} className="grid grid-cols-[140px_minmax(0,1fr)_70px] items-center gap-3 rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
            <p className="text-xs font-semibold text-[#31506a]">{item.label}</p>
            <div className="h-8 rounded-[10px] bg-[#e8f0f8]">
              <span className="flex h-full items-center justify-end rounded-[10px] bg-[#315f8c] pr-2 text-xs font-semibold text-white" style={{ width: `${width}%` }}>
                {item.count}
              </span>
            </div>
            <p className="text-right text-xs font-semibold text-[#60758d]">{item.conversionRate}%</p>
          </div>
        )
      })}
    </div>
  )
}

function BankEfficiencyPanel({ rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 8) : []
  if (!safeRows.length) return <BondEmptyState compact title="No bank intelligence yet" description="Bank efficiency appears once submissions move through finance workflow." />
  return (
    <div className="space-y-2 overflow-y-auto pr-1">
      {safeRows.map((row) => (
        <article key={row.bank} className="rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#142132]">{row.bank}</p>
            <span className="rounded-full border border-[#dbe5f0] bg-white px-2 py-1 text-xs font-semibold text-[#31506a]">{row.responsiveness}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#60758d]">
            <span>{row.submissionVolume} submissions</span>
            <span>{row.approvalRate}% movement</span>
            <span>{row.averageApprovalDays}d avg</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function OperationalRiskMatrix({ rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!safeRows.length) return <BondEmptyState compact title="No elevated risk applications" description="Operational risk matrix is clear." />
  return (
    <div className="space-y-2 overflow-y-auto pr-1">
      {safeRows.map((row) => (
        <article key={row.transactionId || `${row.buyerName}-${row.propertyLabel}`} className="rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#142132]">{row.buyerName}</p>
              <p className="mt-1 truncate text-xs text-[#60758d]">{row.propertyLabel}</p>
            </div>
            <span className="rounded-full bg-[#fff4ed] px-2 py-1 text-xs font-semibold text-[#9a4d13]">{row.riskScore}% risk</span>
          </div>
          <p className="mt-2 text-xs text-[#60758d]">{row.bottleneck} · {row.predictedDelay}</p>
        </article>
      ))}
    </div>
  )
}

function BuyerQualityPanel({ distribution = {} }) {
  const items = [
    ['high', 'High readiness'],
    ['moderate', 'Moderate readiness'],
    ['atRisk', 'At risk'],
    ['incomplete', 'Incomplete'],
  ]
  const total = items.reduce((sum, [key]) => sum + normalizeNumber(distribution[key]), 0) || 1
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([key, label]) => {
        const count = normalizeNumber(distribution[key])
        return (
          <div key={key} className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-normal text-[#142132]">{count}</p>
            <p className="mt-1 text-xs text-[#60758d]">{Math.round((count / total) * 100)}% of active book</p>
          </div>
        )
      })}
    </div>
  )
}

function ExecutiveKpiCard({ item = {} }) {
  const trend = normalizeText(item.trend)
  const comparison = normalizeText(item.comparison)
  const label = getKpiDisplayLabel(item)
  const helper = getKpiHelperText(item, trend, comparison)
  const visual = KPI_VISUALS[item.key] || KPI_VISUALS.active_applications
  const Icon = visual.icon

  return (
    <article className="flex h-full min-h-[142px] flex-col justify-between rounded-2xl border border-[#dbe5f0] bg-white p-[18px] shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${visual.tone}`}>
        <Icon size={18} aria-hidden="true" />
      </div>
      <div>
        <p className="truncate text-[13px] font-medium leading-5 text-[#52657a]">{label}</p>
        <p className="mt-1.5 text-[1.55rem] font-semibold leading-none tracking-normal text-[#101828] tabular-nums">{item.value}</p>
      </div>
      <p className="min-h-4 text-[0.72rem] font-medium leading-4 text-[#8a9aac]">{helper}</p>
    </article>
  )
}

function getKpiDisplayLabel(item = {}) {
  if (item.key === 'bond_value') return 'Pipeline Value'
  return normalizeText(item.label)
}

function getKpiHelperText(item = {}, trend = '', comparison = '') {
  if (item.key === 'active_applications') {
    return normalizeText(item.microContext).replace('ready for review', 'ready')
  }
  if (item.key === 'bond_value') {
    return [trend, comparison].filter(Boolean).join(' ')
  }
  if (item.key === 'commission_pipeline') {
    return trend || normalizeText(item.microContext)
  }
  return normalizeText(item.microContext) || [trend, comparison].filter(Boolean).join(' · ')
}

function ActiveApplicationsSection({ items = [], activeFilter = 'all', onFilterChange = () => {} }) {
  return (
    <BondSectionCard
      eyebrow="Active Work"
      title="Active Applications"
      description="Live operational movement across active bond applications."
      action={
        <Link to="/bond/pipeline" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
          View all applications
        </Link>
      }
      className="rounded-[22px] p-4 sm:p-5"
      headerClassName="gap-4"
      contentClassName="mt-5"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ACTIVE_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onFilterChange(filter.key)}
            className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${
              activeFilter === filter.key
                ? 'border-[#143250] bg-[#143250] text-white'
                : 'border-[#dbe5f0] bg-[#fbfdff] text-[#536a83] hover:border-[#b8ccdf]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {items.length ? (
        <div className="-mx-1 mt-4 overflow-x-auto overflow-y-hidden px-1 pb-2 [scrollbar-width:thin]">
          <div className="flex min-w-full snap-x snap-mandatory gap-4">
            {items.map((application, index) => (
              <ActiveApplicationCard key={`${application.id}-${index}`} application={application} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <BondEmptyState
            compact
            title="No active bond applications"
            description="Accepted and assigned bond applications will appear here once they move into processing."
            action={<Link to="/bond/pipeline?view=new" className="text-sm font-semibold text-[#204b84]">View New Applications</Link>}
          />
        </div>
      )}
    </BondSectionCard>
  )
}

function ActiveApplicationCard({ application = {} }) {
  const toneClass = {
    success: 'border-[#cde8d4] bg-[#f7fcf8] text-[#2a7352]',
    warning: 'border-[#efdcb8] bg-[#fff9ef] text-[#8f5e14]',
    danger: 'border-[#f0d1d8] bg-[#fff8f9] text-[#9b3347]',
  }[application.statusTone] || 'border-[#dbe5f0] bg-[#f7fbff] text-[#315f8c]'
  const progressPercent = Math.max(0, Math.min(100, normalizeNumber(application.progressPercent, 0)))
  const stages = Array.isArray(application.stageItems) ? application.stageItems : []

  function goTo(href) {
    if (!href || typeof window === 'undefined') return
    window.location.assign(href)
  }

  return (
    <article className="group flex w-[88vw] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] border border-[#dce7f2] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)] transition duration-200 ease-out hover:-translate-y-px hover:border-[#c5d6e8] hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)] sm:w-[390px]">
      <div className="border-b border-[#dbe6f2] bg-[linear-gradient(135deg,#f3f7fb_0%,#eef4fa_100%)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[0.78rem] font-semibold text-[#58718b]">{application.developmentName || 'Location pending'}</p>
            <p className="mt-1 truncate text-base font-semibold tracking-normal text-[#142132]">{application.buyerName || 'Unknown buyer'}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
            {application.statusLabel || 'On Track'}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <section className="flex min-h-[56px] items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[1.02rem] font-semibold tracking-normal text-[#142132]">{application.propertyLabel || 'Property pending'}</p>
            <p className="mt-1 truncate text-xs text-[#71879d]">
              {[application.financeType || 'Bond', application.bankName || 'Bank not selected'].filter(Boolean).join(' • ')}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full border border-[#d6e1ee] bg-white px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#5b7189]">
            {application.financeType || 'Bond'}
          </span>
        </section>

        <section className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2.5">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Bond Value</p>
            <p className="mt-1 truncate text-[0.86rem] font-semibold text-[#22374d]">{application.bondValue || 'R 0'}</p>
          </div>
          <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2.5">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Risk</p>
            <p className="mt-1 truncate text-[0.86rem] font-semibold text-[#22374d]">{application.operationalRisk?.riskScore || 0}%</p>
          </div>
        </section>

        <section className="mt-3 grid gap-2 text-xs text-[#60758d]">
          <ApplicationMeta icon={UsersRound} label="Agent" value={application.agentName || 'Partner not assigned'} />
          <ApplicationMeta icon={FileCheck2} label="Consultant" value={application.consultantName || 'Unassigned consultant'} />
        </section>

        <section className="mt-4 rounded-[13px] border border-[#e1e9f3] bg-[#fafcfe] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8fa6]">{application.currentStage || 'Bond App'}</span>
            <strong className="text-[0.95rem] font-semibold text-[#162334]">{progressPercent}%</strong>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[#dfe7f1]" aria-hidden>
            <span
              className="block h-full rounded-full bg-[linear-gradient(90deg,#143250_0%,#315f8c_100%)] transition-all duration-300 ease-out"
              style={{ width: `${Math.max(progressPercent > 0 ? 6 : 0, progressPercent)}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {stages.map((stage) => (
              <div key={stage.key} className="min-w-0">
                <span
                  className={`mx-auto block h-2.5 w-2.5 rounded-full ${
                    stage.state === 'complete'
                      ? 'bg-[#2f8a63]'
                      : stage.state === 'active'
                        ? 'bg-[#143250] ring-4 ring-[#e7eef7]'
                        : 'bg-[#cbd8e6]'
                  }`}
                />
                <p className={`mt-2 truncate text-center text-[0.62rem] font-semibold ${stage.state === 'active' ? 'text-[#143250]' : 'text-[#8a9aad]'}`}>
                  {stage.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 flex-1 rounded-[13px] border border-[#e2eaf4] bg-white px-3 py-2.5">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Next Required Action</p>
          <p className="mt-1 line-clamp-2 text-[0.84rem] font-medium leading-5 text-[#35546c]">{application.nextAction || 'No next action'}</p>
        </section>

        <footer className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => goTo(application.href)} className="h-9 rounded-[11px] bg-[#143250] px-2 text-xs font-semibold text-white transition hover:bg-[#173a5e]">
            Open Application
          </button>
          <button
            type="button"
            disabled={!application.requestDocsHref}
            onClick={() => goTo(application.requestDocsHref)}
            className="h-9 rounded-[11px] border border-[#d5e1ed] bg-white px-2 text-xs font-semibold text-[#24384d] transition hover:border-[#b8ccdf] disabled:cursor-not-allowed disabled:bg-[#f2f5f8] disabled:text-[#99a8b8]"
          >
            Request Docs
          </button>
          <button type="button" onClick={() => goTo(application.reviewHref)} className="h-9 rounded-[11px] border border-[#d5e1ed] bg-white px-2 text-xs font-semibold text-[#24384d] transition hover:border-[#b8ccdf]">
            Review
          </button>
        </footer>
      </div>
    </article>
  )
}

function ApplicationMeta({ icon, label = '', value = '' }) {
  const IconComponent = icon

  return (
    <div className="flex items-center gap-2">
      <IconComponent size={14} className="shrink-0 text-[#86a0ba]" />
      <span className="shrink-0 text-[#8798aa]">{label}</span>
      <span className="min-w-0 truncate font-semibold text-[#31475d]">{value}</span>
    </div>
  )
}

function AnalyticsRangeButton({ label = DEFAULT_RANGE_LABEL }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#d9e4ef] bg-white px-3.5 text-sm font-semibold text-[#24384d] shadow-[0_6px_16px_rgba(15,23,42,0.035)] transition hover:border-[#bfd0e1] hover:bg-[#fbfdff]"
    >
      {label}
      <ChevronDown size={15} strokeWidth={2.1} className="text-[#7d8fa3]" />
    </button>
  )
}

function BankAvatar({ bank = '', size = 'md' }) {
  const visual = getBankVisual(bank)
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[0.58rem]' : 'h-9 w-9 text-[0.68rem]'

  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full font-bold`}
      style={{ backgroundColor: visual.soft, color: visual.color }}
    >
      {visual.initials}
    </span>
  )
}

function AnalyticsMetricTile({ label = '', value = '', helper = '', children = null, className = '' }) {
  return (
    <section className={`min-h-[110px] rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4 ${className}`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#73869c]">{label}</p>
      {children || (
        <>
          <p className="mt-3 text-[2.2rem] font-semibold leading-none text-[#142132]">{value}</p>
          {helper ? <p className="mt-2 text-sm font-medium text-[#64788f]">{helper}</p> : null}
        </>
      )}
    </section>
  )
}

function AnalyticsFooterLink({ to = '/bond/reports', children }) {
  return (
    <footer className="mt-auto flex justify-end pt-4">
      <Link
        to={to}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a] transition hover:text-[#143250]"
      >
        {children}
        <ArrowRight size={15} strokeWidth={2.1} />
      </Link>
    </footer>
  )
}

function BankApprovalPanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const total = rows.reduce((acc, item) => acc + Number(item.total || 0), 0)
  const approvedTotal = rows.reduce((acc, item) => acc + Number(item.approved || 0), 0)
  const pendingTotal = rows.reduce((acc, item) => acc + Number(item.pending || 0), 0)
  const declinedTotal = rows.reduce((acc, item) => acc + Number(item.declined || 0), 0)
  const approvalRate = total ? Math.round((approvedTotal / total) * 100) : 0
  const maxTotal = Math.max(...rows.map((item) => Number(item.total || 0)), 1)
  const radialBackground = `conic-gradient(#2f8a63 0deg ${approvalRate * 3.6}deg, #e8eef5 ${approvalRate * 3.6}deg 360deg)`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-4 md:grid-cols-2">
        <AnalyticsMetricTile label="Application Summary">
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[76px_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="text-[2.2rem] font-semibold leading-none text-[#142132]">{total}</p>
              <p className="mt-2 text-[0.8rem] font-medium leading-4 text-[#64788f]">Total Applications</p>
            </div>
            <div className="space-y-2">
              <OutcomeCountRow label="Approved" value={approvedTotal} color="#2f8a63" />
              <OutcomeCountRow label="Pending" value={pendingTotal} color="#d68a00" />
              <OutcomeCountRow label="Declined" value={declinedTotal} color="#b44755" />
            </div>
          </div>
        </AnalyticsMetricTile>
        <AnalyticsMetricTile label="Approval Rate" className="flex flex-col">
          <div className="flex flex-1 items-center justify-center gap-4">
            <div className="relative h-20 w-20 shrink-0 rounded-full" style={{ background: radialBackground }}>
              <div className="absolute inset-2.5 rounded-full bg-white" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="text-[1.45rem] font-semibold leading-none text-[#142132]">{approvalRate}%</p>
                <p className="mt-1 text-[0.78rem] font-medium text-[#64788f]">Approved</p>
              </div>
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="text-sm font-semibold text-[#142132]">Current approval mix</p>
              <p className="mt-1 text-sm leading-5 text-[#64788f]">vs last month</p>
              <p className="mt-2 text-lg font-semibold leading-none text-[#142132]">—</p>
            </div>
          </div>
        </AnalyticsMetricTile>
      </div>

      <section className="mt-4 overflow-x-auto rounded-[18px] border border-[#e1e9f2] bg-white p-3">
        <div className="min-w-[470px]">
          <div className="grid grid-cols-[minmax(130px,1fr)_minmax(110px,1.25fr)_64px_82px] items-center gap-4 px-1 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#78899c]">
            <span>By Bank</span>
            <span />
            <span className="text-right">Pending</span>
            <span className="text-right">Approval Rate</span>
          </div>
          <div className="space-y-1.5">
            {rows.map((row) => {
              const totalCount = Number(row.total || 0)
              const bookShare = totalCount ? Math.max(10, (totalCount / maxTotal) * 100) : 0
              const visual = getBankVisual(row.bank)
              return (
                <div
                  key={row.bank}
                  className="grid min-h-[34px] grid-cols-[minmax(130px,1fr)_minmax(110px,1.25fr)_64px_82px] items-center gap-4 rounded-[12px] px-1 py-1 transition hover:bg-[#f7fafc]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <BankAvatar bank={row.bank} size="sm" />
                    <p className="truncate text-sm font-semibold text-[#142132]">{row.bank}</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#e9eff6]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${bookShare}%`, backgroundColor: visual.color }}
                    />
                  </div>
                  <p className="text-right text-sm font-semibold text-[#142132]">{row.pending}</p>
                  <p className="text-right text-sm font-semibold text-[#142132]">{((row.approvalRate || 0)).toFixed(0)}%</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <AnalyticsFooterLink to="/bond/reports?view=bank-approvals">View full approval report</AnalyticsFooterLink>
    </div>
  )
}

function OutcomeCountRow({ label = '', value = 0, color = '#315f8c' }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-2 text-[0.8rem]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate font-medium text-[#42566c]">
          {label}
        </span>
      </div>
      <span className="text-right font-semibold text-[#142132]">{value}</span>
    </div>
  )
}

function formatDaysMetric(value, { compact = false } = {}) {
  const numericValue = Number(value || 0)
  const rounded = Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(1)
  if (compact) return `${rounded}d`
  return `${rounded} ${numericValue === 1 ? 'day' : 'days'}`
}

function LeadTimeMetric({ label = '', value = '', helper = '' }) {
  return (
    <AnalyticsMetricTile label={label}>
      <p className="mt-3 text-[1.35rem] font-semibold leading-none text-[#142132]">{value}</p>
      {helper ? <p className="mt-2 text-sm font-semibold text-[#2f8a63]">{helper}</p> : null}
    </AnalyticsMetricTile>
  )
}

function BankLeadTimePanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const safeRows = rows.filter((row) => Number(row.leadTimeDays || 0) > 0)
  const averageDays = safeRows.length
    ? safeRows.reduce((sum, row) => sum + Number(row.leadTimeDays || 0), 0) / safeRows.length
    : 0
  const fastest = safeRows.reduce((current, row) => {
    if (!current) return row
    return Number(row.leadTimeDays || 0) < Number(current.leadTimeDays || 0) ? row : current
  }, null)
  const slowest = safeRows.reduce((current, row) => {
    if (!current) return row
    return Number(row.leadTimeDays || 0) > Number(current.leadTimeDays || 0) ? row : current
  }, null)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-4 md:grid-cols-3">
        <LeadTimeMetric label="Average" value={safeRows.length ? formatDaysMetric(averageDays) : 'Tracking'} />
        <LeadTimeMetric label="Fastest" value={fastest ? formatDaysMetric(fastest.leadTimeDays) : 'Tracking'} helper={fastest?.bank || ''} />
        <LeadTimeMetric label="Slowest" value={slowest ? formatDaysMetric(slowest.leadTimeDays) : 'Tracking'} helper={slowest?.bank || ''} />
      </div>

      <section className="mt-4 overflow-x-auto rounded-[18px] border border-[#e1e9f2] bg-white p-3">
        <p className="min-w-[470px] px-1 pb-2 text-sm font-semibold text-[#142132]">Lead Time by Bank</p>
        {safeRows.length ? (
          <div className="min-w-[470px] space-y-2.5">
            {safeRows.map((row, index) => {
              const visual = getBankVisual(row.bank)
              const barWidth = Math.min(96, 82 + (index % 4) * 4)
              return (
                <div
                  key={row.bank}
                  className="grid min-h-[34px] grid-cols-[minmax(130px,0.78fr)_minmax(130px,1fr)_70px] items-center gap-4 rounded-[12px] px-1 py-1 transition hover:bg-[#f7fafc]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <BankAvatar bank={row.bank} size="sm" />
                    <p className="truncate text-sm font-semibold text-[#142132]">{row.bank}</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#e9eff6]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${barWidth}%`, backgroundColor: visual.color }}
                    />
                  </div>
                  <p className="text-right text-sm font-semibold text-[#142132]">{formatDaysMetric(row.leadTimeDays)}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <BondEmptyState
            compact
            title="No bank lead-time data"
            description="Lead-time movement will appear once bank submission activity is captured."
          />
        )}
      </section>

      <AnalyticsFooterLink to="/bond/reports?view=bank-lead-times">View full lead time report</AnalyticsFooterLink>
    </div>
  )
}

const PIPELINE_STAGE_META = {
  lead: { icon: UsersRound, state: 'idle', meta: (count) => `${count} applications`, tone: '#6f86a0' },
  bond_app: { icon: FileCheck2, state: 'idle', meta: (count) => `${count} applications`, tone: '#6f86a0' },
  docs_collection: { icon: FileText, state: 'bottleneck', meta: (count) => `${count} waiting`, tone: '#d97706' },
  pre_approval: { icon: HandCoins, state: 'active', meta: (count) => `${count} submitted`, tone: '#2368b3' },
  submitted: { icon: ArrowRight, state: 'idle', meta: (count) => `${count} applications`, tone: '#6f86a0' },
  bank_feedback: { icon: CircleAlert, state: 'active', meta: (count) => `${count} in progress`, tone: '#2368b3' },
  approved: { icon: CircleCheck, state: 'completed', meta: (count) => `${count} approved`, tone: '#20814f' },
  registered: { icon: CircleDashed, state: 'idle', meta: (count) => `${count} applications`, tone: '#6f86a0' },
}

function PipelineOverview({ items = [], leadTimes = [] }) {
  const rows = Array.isArray(items) ? items : []
  const activeFiles = rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const approvedCount = rows.find((row) => row.key === 'approved')?.count || 0
  const approvalRate = activeFiles ? Math.round((Number(approvedCount || 0) / activeFiles) * 100) : 0
  const bottleneck = rows.reduce((current, row) => {
    if (!current) return row
    return Number(row.count || 0) > Number(current.count || 0) ? row : current
  }, null)
  const averageLeadDays = calculateAverageLeadDays(leadTimes)

  return (
    <section className="overflow-hidden rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.03)]">
      <PipelineHeader />
      <PipelineKpiStrip
        activeFiles={activeFiles}
        approvalRate={approvalRate}
        bottleneck={bottleneck}
        averageLeadDays={averageLeadDays}
      />
      <PipelineTimeline rows={rows} bottleneckKey={bottleneck?.key || ''} />
      <PipelineInsightFooter bottleneck={bottleneck} />
    </section>
  )
}

function PipelineHeader() {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Operational Flow</p>
        <h2 className="mt-2 text-[1.45rem] font-semibold leading-tight text-[#0f172a]">Pipeline Overview</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748b]">
          Operational flow through core finance and approval stages.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
        <AnalyticsRangeButton label={DEFAULT_RANGE_LABEL} />
        <span className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-[#d9efe4] bg-[#edfdf4] px-3.5 text-sm font-semibold text-[#237a4d]">
          <span className="h-2 w-2 rounded-full bg-[#22a15d]" />
          Live Pipeline
        </span>
      </div>
    </div>
  )
}

function PipelineKpiStrip({ activeFiles = 0, approvalRate = 0, bottleneck = null, averageLeadDays = 0 }) {
  const bottleneckLabel = bottleneck?.label || 'Monitoring'
  const bottleneckCount = Number(bottleneck?.count || 0)

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-4">
      <PipelineKpiCard icon={FileCheck2} value={activeFiles} label="Active Files" helper="vs last month ↑ 12%" tone="blue" />
      <PipelineKpiCard icon={CircleCheck} value={`${approvalRate}%`} label="Approval Rate" helper="vs last month —" tone="green" />
      <PipelineKpiCard
        icon={CircleAlert}
        eyebrow="Bottleneck Stage"
        value={bottleneckLabel}
        label={`${bottleneckCount} files waiting`}
        tone="amber"
        emphasized
      />
      <PipelineKpiCard
        icon={Clock3}
        value={averageLeadDays ? formatDaysMetric(averageLeadDays) : 'Tracking'}
        label="Average Processing Time"
        helper={averageLeadDays ? 'vs last month ↓ 8%' : ''}
        tone="violet"
      />
    </div>
  )
}

function PipelineKpiCard({ icon, eyebrow = '', value = '', label = '', helper = '', tone = 'blue', emphasized = false }) {
  const Icon = icon
  const tones = {
    blue: 'bg-[#edf5ff] text-[#1f65a9]',
    green: 'bg-[#eaf8ef] text-[#1f8a50]',
    amber: 'bg-[#fff7e8] text-[#d97706]',
    violet: 'bg-[#f3efff] text-[#7657d8]',
  }
  const cardClass = emphasized
    ? 'border-[rgba(251,191,36,0.18)] bg-[rgba(251,191,36,0.06)]'
    : 'border-[rgba(15,23,42,0.06)] bg-white'

  return (
    <article className={`min-h-[104px] rounded-[18px] border p-4 ${cardClass}`}>
      <div className="flex items-center gap-3.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tones[tone] || tones.blue}`}>
          <Icon size={19} strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1.5 text-[0.66rem] font-semibold text-[#64748b]">{eyebrow}</p> : null}
          <p className={`${emphasized ? 'text-[1.05rem]' : 'text-[1.55rem]'} font-semibold leading-none text-[#0f172a]`}>{value}</p>
          <p className={`${emphasized ? 'mt-2 text-[0.82rem] font-semibold text-[#d97706]' : 'mt-1.5 text-sm text-[#64748b]'}`}>{label}</p>
        </div>
      </div>
      {helper ? <p className="mt-4 text-[0.82rem] text-[#64748b]">{helper}</p> : null}
    </article>
  )
}

function PipelineTimeline({ rows = [], bottleneckKey = '' }) {
  const safeRows = rows.length ? rows : []

  return (
    <>
      <div className="mt-7 hidden overflow-x-auto pb-2 md:block">
        <div className="relative min-w-[1040px] pt-1">
          <TimelineLine rows={safeRows} bottleneckKey={bottleneckKey} />
          <div
            className="relative z-10 grid items-start gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.max(safeRows.length, 1)}, minmax(108px, 1fr))` }}
          >
            {safeRows.map((row) => (
              <PipelineStageNode key={row.key} row={row} bottleneckKey={bottleneckKey} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-4 md:hidden">
        {safeRows.map((row) => (
          <PipelineStageNode key={row.key} row={row} bottleneckKey={bottleneckKey} mobile />
        ))}
      </div>
    </>
  )
}

function TimelineLine({ rows = [], bottleneckKey = '' }) {
  const count = Math.max(rows.length, 1)

  return (
    <div className="pointer-events-none absolute left-10 right-10 top-[32px] z-0 h-[3px] rounded-full bg-[#e2e8f0]">
      {rows.slice(0, -1).map((row, index) => {
        const nextRow = rows[index + 1]
        const state = getPipelineStageState(row, bottleneckKey)
        const nextState = getPipelineStageState(nextRow, bottleneckKey)
        if (state === 'idle' && nextState === 'idle') return null
        const color = state === 'bottleneck' || nextState === 'bottleneck'
          ? '#f59e0b'
          : state === 'completed' || nextState === 'completed'
            ? '#22a15d'
            : '#2f73c5'
        return (
          <span
            key={`${row.key}-${nextRow.key}`}
            className="absolute top-0 h-full rounded-full"
            style={{
              left: `${((index + 0.5) / count) * 100}%`,
              width: `${100 / count}%`,
              backgroundColor: color,
            }}
          />
        )
      })}
    </div>
  )
}

function PipelineStageNode({ row = {}, bottleneckKey = '', mobile = false }) {
  const meta = PIPELINE_STAGE_META[row.key] || { icon: CircleDashed, state: 'idle', meta: (count) => row.valueLabel || `${count} applications`, tone: '#6f86a0' }
  const Icon = meta.icon
  const count = Number(row.count || 0)
  const state = getPipelineStageState(row, bottleneckKey)
  const isIdle = state === 'idle'
  const stateClasses = {
    bottleneck: 'border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.03)] shadow-[0_8px_20px_rgba(251,191,36,0.08)]',
    active: 'border-[rgba(37,99,235,0.18)] bg-[#f7fbff] shadow-[0_8px_20px_rgba(37,99,235,0.06)]',
    completed: 'border-[rgba(34,197,94,0.18)] bg-[#fbfffd]',
    idle: 'border-[rgba(15,23,42,0.06)] bg-white opacity-75',
  }
  const iconClasses = {
    bottleneck: 'border-[#fed7aa] bg-[#fff7ed] text-[#d97706]',
    active: 'border-[#cfe2f7] bg-[#eef6ff] text-[#2368b3]',
    completed: 'border-[#cdeed9] bg-[#eefbf3] text-[#20814f]',
    idle: 'border-[#dfe7f0] bg-[#f8fafc] text-[#7f90a3]',
  }
  const metaText = meta.meta(count)

  return (
    <article className={`${mobile ? 'grid grid-cols-[48px_minmax(0,1fr)] gap-4' : 'flex flex-col items-center'} group`}>
      <span className={`${iconClasses[state]} relative z-20 flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition duration-200 group-hover:-translate-y-0.5`}>
        <Icon size={18} strokeWidth={2.1} />
      </span>
      <div
        className={`${mobile ? 'min-h-[132px]' : 'mt-5 min-h-[150px] w-full'} ${stateClasses[state]} rounded-[18px] border px-3 py-4 text-center transition duration-200 group-hover:-translate-y-1 group-hover:opacity-100 group-hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]`}
      >
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#27425e]">{row.label}</p>
        <p className="mt-5 text-[2.25rem] font-semibold leading-none text-[#0f172a]">{count}</p>
        <p className={`mt-4 text-[0.82rem] ${isIdle ? 'text-[#64748b]' : 'font-medium'}`} style={{ color: isIdle ? undefined : meta.tone }}>
          {metaText}
        </p>
      </div>
    </article>
  )
}

function getPipelineStageState(row = {}, bottleneckKey = '') {
  if (row.key === bottleneckKey && Number(row.count || 0) > 0) return 'bottleneck'
  const meta = PIPELINE_STAGE_META[row.key]
  if (meta?.state === 'completed') return 'completed'
  if (Number(row.count || 0) > 0) return meta?.state === 'bottleneck' ? 'bottleneck' : 'active'
  return meta?.state === 'completed' ? 'completed' : 'idle'
}

function PipelineInsightFooter({ bottleneck = null }) {
  const label = bottleneck?.label || 'pipeline movement'
  const count = Number(bottleneck?.count || 0)

  return (
    <footer className="mt-7 flex flex-col gap-4 rounded-[20px] border border-[rgba(15,23,42,0.05)] bg-[rgba(249,250,251,0.8)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fff7ed] text-[#d97706]">
          <CircleAlert size={21} strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0f172a]">Operational insight</p>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">
            Highest pressure currently sits in {label} with {count} pending files.
          </p>
        </div>
      </div>
      <Link to="/bond/reports?view=pipeline" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#24518a] transition hover:text-[#143250]">
        View pipeline report
        <ArrowRight size={16} strokeWidth={2.1} />
      </Link>
    </footer>
  )
}

function calculateAverageLeadDays(leadTimes = []) {
  const rows = Array.isArray(leadTimes) ? leadTimes.filter((row) => Number(row.leadTimeDays || 0) > 0) : []
  if (!rows.length) return 0
  return rows.reduce((sum, row) => sum + Number(row.leadTimeDays || 0), 0) / rows.length
}

function DonutAnalyticsPanel({ items = {} }) {
  const entries = Object.entries(items || {}).filter(([, value]) => Number(value || 0) > 0)
  const total = entries.reduce((acc, [, value]) => acc + Number(value || 0), 0) || 1
  const colors = ['#245d8f', '#2f7a55', '#a87520', '#7f4f86']
  const conicSegments = entries.reduce((segments, [, value], index) => {
    const previousEnd = segments[index - 1]?.end || 0
    const share = Math.max(0, Number(value || 0)) / total
    const start = previousEnd
    const end = previousEnd + share * 360
    return [
      ...segments,
      { end, value: `${colors[index % colors.length]} ${start}deg ${end}deg` },
    ]
  }, []).map((segment) => segment.value)
  const donutBackground = conicSegments.length ? `conic-gradient(${conicSegments.join(', ')}, #e5edf7 0deg)` : '#e5edf7'

  return (
    <div className="grid h-full items-center gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div className="rounded-[18px] border border-[#e4edf6] bg-[linear-gradient(180deg,#fbfdff_0%,#f6f9fc_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <div className="relative mx-auto h-40 w-40 rounded-full">
          <div
            className="h-full w-full rounded-full shadow-[0_14px_30px_rgba(22,48,74,0.12)]"
            style={{ background: donutBackground }}
          />
          <div className="absolute inset-6 rounded-full bg-white shadow-[inset_0_0_18px_rgba(15,23,42,0.08)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-3xl font-semibold leading-none tracking-normal text-[#142132]">{total}</p>
            <p className="mt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Buyers</p>
          </div>
        </div>
      </div>
      <div className="grid gap-2.5">
        {entries.map(([key, value], index) => {
          const pct = (Number(value || 0) / total) * 100
          return (
            <div key={key} className="rounded-[14px] border border-[#e4edf6] bg-white px-3.5 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span className="truncate text-sm font-semibold capitalize text-[#142132]">{key.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#60758d]">{value} buyers</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[#142132]">{Math.round(pct)}%</span>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-[#e8eef6]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: colors[index % colors.length] }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BankDistributionPanel({ items = [] }) {
  const rows = Array.isArray(items) ? items.filter((item) => Number(item.total || 0) > 0) : []
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0) || 1
  const max = Math.max(...rows.map((row) => Number(row.total || 0)), 1)

  if (!rows.length) {
    return (
      <BondEmptyState
        compact
        title="No bank distribution yet"
        description="Bank allocation appears once applications are assigned to lenders."
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => {
        const visual = getBankVisual(row.bank)
        const width = Math.max(8, (Number(row.total || 0) / max) * 100)
        const share = Math.round((Number(row.total || 0) / total) * 100)
        return (
          <article key={row.bank} className="rounded-[16px] border border-[#e4edf6] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfe_100%)] p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-bold ring-1 ring-white"
                  style={{ backgroundColor: visual.soft, color: visual.color }}
                >
                  {visual.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#142132]">{row.bank}</p>
                  <p className="mt-0.5 text-xs text-[#70879d]">{row.submitted} submitted - {row.approved} approved</p>
                </div>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-[#142132]">{share}%</p>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-[#e7eef7]">
              <span className="block h-full rounded-full" style={{ width: `${width}%`, backgroundColor: visual.color }} />
            </div>
          </article>
        )
      })}
    </div>
  )
}

function OperationalHeatmapPanel({ rows = [] }) {
  return (
    <OperationalHeatmap
      rows={rows}
      rowHeader="Bank"
      emptyTitle="No bottleneck heatmap data"
      emptyDescription="Stage concentration will appear once applications move through the pipeline."
    />
  )
}

function formatDiagnosticLabel(value = '') {
  const labels = {
    awaiting_grant: 'Awaiting Grant',
    grant_received: 'Grant Received',
    grant_signed: 'Grant Signed',
    ready_for_instruction: 'Ready for Instruction',
    application_arrived: 'Application Arrived',
    submitted_to_banks: 'Submitted to Banks',
    bank_review: 'Bank Review',
    quote_received: 'Quote Received',
    quote_accepted: 'Quote Accepted',
    bond_approved: 'Bond Approved',
    grant_submitted: 'Grant Submitted',
    instruction_sent: 'Instruction Sent',
    missing_transaction_id: 'Missing Transaction ID',
    legacy_stage_only: 'Legacy Stage Only',
    stale_legacy_finance_status: 'Stale Legacy Finance Status',
    missing_bond_workspace_assignment: 'Missing Bond Workspace',
    missing_primary_consultant: 'Missing Primary Consultant',
    missing_processor_assignment: 'Missing Processor Assignment',
    missing_grant_document: 'Missing Grant Document',
    missing_signed_grant_document: 'Missing Signed Grant',
    missing_grant_submission_evidence: 'Missing Grant Submission Evidence',
    missing_instruction_evidence: 'Missing Instruction Evidence',
  }
  const normalized = normalizeText(value)
  if (!normalized) return 'Tracking'
  return labels[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getDiagnosticTone(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'critical') return 'border-[#f2c9cf] bg-[#fff6f7] text-[#a24053]'
  if (normalized === 'warning') return 'border-[#efd9b4] bg-[#fff9ef] text-[#94620f]'
  if (normalized === 'info') return 'border-[#cfe1f4] bg-[#f4f9ff] text-[#24518a]'
  return 'border-[#cde8d4] bg-[#f7fcf8] text-[#2a7352]'
}

function buildDiagnosticIssueRows(issues = []) {
  const issueMap = new Map()
  for (const issue of Array.isArray(issues) ? issues : []) {
    const code = issue?.code || 'unknown_issue'
    const existing = issueMap.get(code) || {
      code,
      label: formatDiagnosticLabel(code),
      severity: issue?.severity || 'warning',
      count: 0,
      recommendation: issue?.recommendation || '',
      actionLabel: issue?.actionLabel || 'Review issue',
      actionHref: issue?.queueHref || issue?.actionHref || '',
      ownerRole: issue?.ownerRole || 'Operations',
    }
    existing.count += 1
    if (issue?.severity === 'critical') existing.severity = 'critical'
    else if (issue?.severity === 'warning' && existing.severity !== 'critical') existing.severity = 'warning'
    if (!existing.recommendation && issue?.recommendation) existing.recommendation = issue.recommendation
    if (!existing.actionHref && (issue?.queueHref || issue?.actionHref)) existing.actionHref = issue.queueHref || issue.actionHref
    if (!existing.actionLabel && issue?.actionLabel) existing.actionLabel = issue.actionLabel
    issueMap.set(code, existing)
  }

  const severityRank = { critical: 3, warning: 2, info: 1 }
  return [...issueMap.values()]
    .sort((left, right) => (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0) || right.count - left.count)
    .slice(0, 5)
}

function OperationalDiagnosticsPanel({ diagnostics = {} }) {
  const totals = diagnostics?.totals || {}
  const issues = Array.isArray(diagnostics?.issues) ? diagnostics.issues : []
  const remediationRows = Array.isArray(diagnostics?.remediationPlan) ? diagnostics.remediationPlan : []
  const issueRows = (remediationRows.length ? remediationRows : buildDiagnosticIssueRows(issues))
    .map((issue) => ({
      ...issue,
      label: issue.label || formatDiagnosticLabel(issue.code),
      actionLabel: issue.actionLabel || 'Review issue',
      actionHref: issue.actionHref || issue.queueHref || '',
      ownerRole: issue.ownerRole || 'Operations',
    }))
    .slice(0, 5)
  const actionQueues = Array.isArray(diagnostics?.actionQueues) ? diagnostics.actionQueues.filter((row) => normalizeNumber(row.count) > 0) : []
  const stageCoverage = Array.isArray(diagnostics?.stageCoverage) ? diagnostics.stageCoverage.filter((row) => normalizeNumber(row.count) > 0).slice(0, 8) : []
  const status = diagnostics?.status || 'healthy'

  if (!normalizeNumber(totals.rows) && !issues.length) {
    return <BondEmptyState compact title="No diagnostic rows yet" description="Diagnostics will appear once bond applications enter the operational pipeline." />
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
      <section className="flex min-h-[260px] flex-col rounded-[18px] border border-[#dbe5f0] bg-[#fbfdff] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#73869c]">Diagnostic Status</p>
            <p className="mt-2 text-2xl font-semibold tracking-normal text-[#142132]">{formatDiagnosticLabel(status)}</p>
            <p className="mt-2 text-sm leading-5 text-[#60758d]">{normalizeNumber(totals.rows)} rows checked across the bond workflow.</p>
          </div>
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${getDiagnosticTone(status)}`}>
            <ShieldAlert size={18} />
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <DiagnosticMetric label="Critical Issues" value={totals.criticalIssues} tone="critical" />
          <DiagnosticMetric label="Warning Issues" value={totals.warningIssues} tone="warning" />
          <DiagnosticMetric label="Healthy Rows" value={totals.healthyRows} tone="healthy" />
        </div>
      </section>

      <section className="min-h-[260px] rounded-[18px] border border-[#dbe5f0] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#73869c]">Top Gaps</p>
            <p className="mt-1 text-sm text-[#60758d]">Highest evidence and ownership exceptions.</p>
          </div>
          <span className="rounded-full border border-[#dbe5f0] bg-[#fbfdff] px-2.5 py-1 text-xs font-semibold text-[#31506a]">
            {normalizeNumber(totals.issues)} total
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          {issueRows.length ? issueRows.map((issue) => (
            <article key={issue.code} className={`rounded-[14px] border px-3 py-3 ${getDiagnosticTone(issue.severity)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#142132]">{issue.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#60758d]">{issue.recommendation || 'Review the application evidence and ownership fields.'}</p>
                  <p className="mt-2 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#73869c]">{issue.ownerRole}</p>
                </div>
                <strong className="shrink-0 text-sm tabular-nums">{issue.count}</strong>
              </div>
              {issue.actionHref ? (
                <Link to={issue.actionHref} className="mt-3 inline-flex h-8 items-center rounded-[10px] bg-white px-3 text-xs font-semibold text-[#17324d] ring-1 ring-[#dbe5f0] transition hover:bg-[#f8fbff]">
                  {issue.actionLabel}
                </Link>
              ) : null}
            </article>
          )) : (
            <BondEmptyState compact title="No diagnostic gaps" description="Evidence and ownership checks are currently clear." />
          )}
        </div>
      </section>

      <section className="rounded-[18px] border border-[#dbe5f0] bg-white p-4 xl:col-span-2">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#73869c]">Grant Queues</p>
            <div className="mt-3 grid gap-2">
              {actionQueues.length ? actionQueues.map((queue) => (
                <Link key={`${queue.queueKey}-${queue.stage}`} to={queue.href || '/bond/applications'} className="grid grid-cols-[minmax(0,1fr)_54px] items-center gap-3 rounded-[13px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2 transition hover:border-[#c7d8e8] hover:bg-white">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#142132]">{formatDiagnosticLabel(queue.queueKey)}</p>
                    <p className="mt-0.5 truncate text-xs text-[#60758d]">{queue.actionLabel || formatDiagnosticLabel(queue.stage)}</p>
                  </div>
                  <strong className="text-right text-sm tabular-nums text-[#142132]">{normalizeNumber(queue.count)}</strong>
                </Link>
              )) : (
                <p className="rounded-[13px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2 text-sm text-[#60758d]">No grant queues waiting.</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#73869c]">Stage Coverage</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {stageCoverage.length ? stageCoverage.map((stage) => (
                <span key={stage.key} className="inline-flex items-center gap-2 rounded-full border border-[#dbe5f0] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#31506a]">
                  {formatDiagnosticLabel(stage.key)}
                  <strong className="tabular-nums text-[#142132]">{normalizeNumber(stage.count)}</strong>
                </span>
              )) : (
                <p className="rounded-[13px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2 text-sm text-[#60758d]">No stage coverage yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function DiagnosticMetric({ label = '', value = 0, tone = 'healthy' }) {
  return (
    <div className={`rounded-[14px] border px-3 py-3 ${getDiagnosticTone(tone)}`}>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#73869c]">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none tracking-normal text-[#142132]">{normalizeNumber(value)}</p>
    </div>
  )
}

function OperationalRiskPanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const toneClassByKey = {
    urgent: 'bg-[#fff5f5] border-[#f0d8db] text-[#8f3747]',
    critical: 'bg-[#fff5f7] border-[#f0cfda] text-[#a24053]',
    watch: 'bg-[#fff9ef] border-[#efd7b5] text-[#8f5e14]',
    healthy: 'bg-[#f7fcf8] border-[#d4e8d8] text-[#2a7352]',
  }

  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
      {rows.length ? (
        rows.map((item, index) => (
          <article
            key={`${item.key || index}`}
            className={`rounded-[12px] border px-3 py-2 ${toneClassByKey[item.severity] || toneClassByKey.urgent}`}
          >
            <p className="text-sm font-semibold text-[#142132]">{item.metric}</p>
            <p className="text-xs text-[#60758d]">{item.description}</p>
            <p className="mt-1 text-sm font-semibold">{item.value}</p>
          </article>
        ))
      ) : (
        <BondEmptyState compact title="No immediate operational risk" description="No risk thresholds are currently being breached." />
      )}
    </div>
  )
}

function BankActivityFeedPanel({ rows = [] }) {
  const feed = Array.isArray(rows) ? rows : []
  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
      {feed.length ? (
        feed.map((row, index) => (
          <article
            key={`${row.transactionId || row.key || index}`}
            className="rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dce7f4] bg-white text-[#4f759f]">
                  {row.bank?.charAt(0) || 'B'}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#142132]">{row.bank}</p>
                  <p className="text-sm text-[#60758d]">{row.action}</p>
                </div>
              </div>
              <span className="mt-0.5 text-xs text-[#60758d]">{row.timeLabel}</span>
            </div>
            <p className="mt-2 text-xs text-[#7f93a8]">{row.statusLabel}</p>
          </article>
        ))
      ) : (
        <BondEmptyState compact title="No bank responses yet" description="Bank updates will appear here as applications move." />
      )}
    </div>
  )
}

function TeamPerformancePanel({ rows = [] }) {
  const members = Array.isArray(rows) ? rows : []
  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
      {members.length ? (
        members.map((member) => (
          <article
            key={member.key}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[12px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7edf6] text-xs font-semibold text-[#17324d]">
              {member.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#142132]">{member.name}</p>
              <p className="text-xs text-[#71889e]">{member.activeFiles} active applications</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#142132]">{member.approvalRate}%</p>
              <p className="text-xs text-[#71889e]">{member.avgTurnaround}d avg</p>
            </div>
          </article>
        ))
      ) : (
        <BondEmptyState compact title="No team load to show" description="Assign applications to team leads to populate this leaderboard." />
      )}
    </div>
  )
}

function ConnectedPartnerCard({ partner = {} }) {
  const name = normalizeText(partner.name || 'Partner')
  return (
    <article className="min-w-[280px] rounded-[18px] border border-[#e0eaf5] bg-[#fbfdff] p-3">
      <div className="flex items-start gap-2">
        <OrganisationAvatar organisation={partner} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#142132]">{name}</p>
          <p className="text-xs text-[#70879d]">{normalizeText(partner.type || 'Partner')}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="uppercase tracking-[0.08em] text-[#7c93aa]">Active</p>
          <p className="mt-1 font-semibold text-[#142132]">{normalizeNumber(partner.activeFiles)} applications</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.08em] text-[#7c93aa]">Conv.</p>
          <p className="mt-1 font-semibold text-[#142132]">{normalizeNumber(partner.conversionRate)}%</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.08em] text-[#7c93aa]">Reg.</p>
          <p className="mt-1 font-semibold text-[#142132]">{normalizeNumber(partner.avgRegistrationDays)}d</p>
        </div>
      </div>
    </article>
  )
}
