import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Building2, CircleCheck, CircleDashed, CircleAlert, FileCheck2, FileText, HandCoins, MoreHorizontal, UsersRound } from 'lucide-react'
import BondDashboardHeader from './BondDashboardHeader'
import BondEmptyState from './BondEmptyState'
import BondPageShell from './BondPageShell'
import BondSectionCard from './BondSectionCard'
import OperationalHeatmap from '../analytics/OperationalHeatmap'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'
import { FINANCE_INTELLIGENCE_DISCLAIMER } from '../../services/financeIntelligenceService'
import { Link } from 'react-router-dom'

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

const KPI_PROGRESS_COLORS = {
  active_applications: '#315f8c',
  approval_rate: '#2f8a63',
  average_approval_time: '#8a6a2a',
  bond_value: '#315f8c',
  registration_conversion: '#2f6b4a',
  commission_pipeline: '#8b4f7e',
}

const KPI_TONE_CLASSES = {
  neutral: 'border-[#dbe5f0] bg-white',
  success: 'border-[#cde8d4] bg-[#fbfffc]',
  warning: 'border-[#efdcb8] bg-[#fffdf7]',
  danger: 'border-[#f0d1d8] bg-[#fff8f9]',
}

const ACTIVE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_docs', label: 'Awaiting Docs' },
  { key: 'ready_for_review', label: 'Ready For Review' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'bank_feedback', label: 'Bank Feedback' },
  { key: 'approved', label: 'Approved' },
]

function getBankVisual(bank = '') {
  return BANK_VISUALS[bank] || BANK_VISUALS.Others
}

export default function BondDashboard({
  user = {},
  workspaceId = '',
  service = bondCommandCenterService,
  initialState = null,
}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const [rangeKey] = useState('this_month')
  const [developmentId, setDevelopmentId] = useState('all')
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
      const snapshot = await service.getBondCommandCenterSnapshot(user, safeWorkspaceId, { rangeKey, developmentId })
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
  }, [developmentId, rangeKey, safeWorkspaceId, service, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard()
  }, [loadDashboard])

  function onCreateApplication() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event('itg:open-new-transaction'))
  }

  function onInvitePartner() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event('itg:open-invite-partner'))
  }

  function onExportReport() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event('itg:export-bond-dashboard-report'))
  }

  const snapshot = state.snapshot || {}
  const heroKpis = snapshot.heroKpis || []
  const headerSummary = snapshot.headerSummary || {}
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
  const recentBankActivity = snapshot.recentBankActivity || []
  const teamPerformance = snapshot.teamPerformance || []
  const connectedPartners = snapshot.connectedPartners || []
  const heatmapRows = snapshot.operationalHeatmap || []
  const developmentOptions = snapshot.developmentOptions || [{ id: 'all', value: 'all', label: 'All Developments' }]

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
      <BondDashboardHeader
        summaryText={state.loading ? 'Loading active applications, document queues, review-ready files, and bank responses.' : headerSummary.text}
        developmentControl={
          !state.loading && snapshot ? (
            <label className="block">
              <span className="sr-only">Development filter</span>
              <select
                value={developmentId}
                onChange={(event) => setDevelopmentId(event.target.value)}
                className="h-10 w-full rounded-[12px] border border-[#dbe5f0] bg-[#fbfdff] px-3 text-sm font-semibold text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
              >
                {developmentOptions.map((option) => (
                  <option key={option.id || option.value} value={option.value || option.id}>
                    {option.label || option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
        onCreate={onCreateApplication}
        onInvitePartner={onInvitePartner}
        onExportReport={onExportReport}
      />

      {state.loading ? (
        <BondEmptyState
          title="Loading bond command center…"
          description="We are pulling your operational intelligence now."
        />
      ) : null}

      {!state.loading && snapshot ? (
        <>
          {snapshot.totalApplications === 0 ? (
            <BondEmptyState
              title="All operational queues are clear."
              description="Your bond desk is running smoothly."
              compact
            />
          ) : (
            <>
              <KpiStrip items={heroKpis} />

              <ActiveApplicationsSection
                items={visibleActiveApplications}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
              />

              <section className="grid gap-6 xl:grid-cols-2">
                <BondSectionCard
                  eyebrow="Primary Analytics"
                  title="Bank Approval Breakdown"
                  description="Bank movement and outcome split in one operational view."
                  className="flex min-h-[470px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <BankApprovalPanel items={bankBreakdown} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Primary Analytics"
                  title="Bank Lead Times"
                  description="Average lead time by lender from submission to movement."
                  className="flex min-h-[470px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <BankLeadTimePanel items={bankLeadTimes} />
                </BondSectionCard>
              </section>

              <BondSectionCard
                eyebrow="Operational Flow"
                title="Pipeline Overview"
                description="Operational flow through core finance and approval stages."
                className="flex min-h-[310px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                headerClassName="gap-3"
                contentClassName="mt-6 min-h-0 flex-1"
              >
                <PipelineFlowPanel items={pipelineFlow} />
              </BondSectionCard>

              <section className="grid gap-6 xl:grid-cols-3">
                <BondSectionCard
                  eyebrow="Buyer Demographics"
                  title="Finance Mix"
                  description="Finance mix across the active book."
                  className="flex min-h-[340px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <SegmentedAnalyticsPanel items={buyerDemographics.bondVsCash} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Buyer Demographics"
                  title="Buyer Type Mix"
                  description="Individual, company and trust buyer distribution."
                  className="flex min-h-[340px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <DonutAnalyticsPanel items={buyerDemographics.clientType} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Buyer Demographics"
                  title="Bank Distribution"
                  description="Application volume and submitted movement by bank."
                  className="flex min-h-[340px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <BankDistributionPanel items={buyerDemographics.bankDistribution} />
                </BondSectionCard>
              </section>

              <BondSectionCard
                eyebrow="Application Heatmap"
                title="Operational Bottleneck Heatmap"
                description="Where files are slowing down across the finance workflow."
                className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                headerClassName="gap-3"
                contentClassName="mt-6 min-h-0 flex-1"
              >
                <OperationalHeatmapPanel rows={heatmapRows} />
              </BondSectionCard>

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
                  title="Files Needing Attention"
                  description="Highest-risk workflow files ranked by bottlenecks, predicted delays, and velocity."
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
                  description="Active files and operational quality by teammate."
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
                    <h2 className="mt-2 text-[1.1rem] font-semibold tracking-[-0.03em] text-[#142132]">
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
  const rows = Array.isArray(items) ? items.slice(0, 6) : []

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {rows.map((item) => (
        <ExecutiveKpiCard key={item.key} item={item} />
      ))}
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
  if (!safeRows.length) return <BondEmptyState compact title="No elevated risk files" description="Operational risk matrix is clear." />
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
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#142132]">{count}</p>
            <p className="mt-1 text-xs text-[#60758d]">{Math.round((count / total) * 100)}% of active book</p>
          </div>
        )
      })}
    </div>
  )
}

function ExecutiveKpiCard({ item = {} }) {
  const sparkline = Array.isArray(item.sparkline) ? item.sparkline : []
  const trend = normalizeText(item.trend)
  const comparison = normalizeText(item.comparison)
  const microContext = normalizeText(item.microContext) || [trend, comparison].filter(Boolean).join(' · ')
  const progressColor = KPI_PROGRESS_COLORS[item.key] || '#315f8c'
  const toneClass = KPI_TONE_CLASSES[item.tone] || KPI_TONE_CLASSES.neutral

  return (
    <article className={`min-h-[124px] rounded-[18px] border p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.032)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#778da4]">{item.label}</p>
        <TinySparkline values={sparkline} color={progressColor} />
      </div>
      <p className="mt-3 text-[1.85rem] font-semibold leading-none tracking-[-0.045em] text-[#142132]">{item.value}</p>
      <p className="mt-2 min-h-10 text-[0.8rem] font-semibold leading-5 text-[#60758d]">{microContext}</p>
      <p className="mt-1 text-[0.72rem] font-semibold text-[#8192a5]">{trend}</p>
    </article>
  )
}

function TinySparkline({ values = [], color = '#315f8c' }) {
  const rows = Array.isArray(values) && values.length ? values.slice(-6) : [18, 24, 22, 31, 38, 42]
  const normalized = rows.map((value) => Math.max(16, Math.min(100, normalizeNumber(value, 0))))

  return (
    <div className="flex h-8 w-16 shrink-0 items-end gap-1" aria-hidden="true">
      {normalized.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="w-1.5 rounded-full bg-[#dfe8f3]"
          style={{ height: `${Math.max(7, (value / 100) * 30)}px`, backgroundColor: index === normalized.length - 1 ? color : '#dfe8f3' }}
        />
      ))}
    </div>
  )
}

function ActiveApplicationsSection({ items = [], activeFilter = 'all', onFilterChange = () => {} }) {
  return (
    <BondSectionCard
      eyebrow="Active Work"
      title="Active Applications"
      description="Live operational movement across active bond files."
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
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((application, index) => (
            <ActiveApplicationCard key={`${application.id}-${index}`} application={application} />
          ))}
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

  function goTo(href) {
    if (!href || typeof window === 'undefined') return
    window.location.assign(href)
  }

  return (
    <article className="flex min-h-[300px] flex-col rounded-[18px] border border-[#dce7f2] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.035)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-[-0.02em] text-[#142132]">{application.buyerName || 'Unknown buyer'}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#536a83]">{application.propertyLabel || 'Property pending'}</p>
          <p className="mt-1 truncate text-xs text-[#71879d]">{application.developmentName || 'Location pending'}</p>
        </div>
        <button
          type="button"
          onClick={() => goTo(application.href)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe5f0] bg-[#fbfdff] text-[#4b6884] transition hover:border-[#b9ccde]"
          aria-label="Open application"
        >
          <MoreHorizontal size={17} />
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-[#60758d]">
        <ApplicationMeta icon={UsersRound} label="Agent" value={application.agentName || 'Partner not assigned'} />
        <ApplicationMeta icon={FileCheck2} label="Consultant" value={application.consultantName || 'Unassigned consultant'} />
        <ApplicationMeta icon={Building2} label="Bank" value={application.bankName || 'Bank not selected'} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] p-3">
        <MiniFileStat label={application.financeType || 'Bond'} value={application.bondValue || 'R 0'} />
        <MiniFileStat label="Confidence" value={`${application.transactionConfidence || 0}%`} />
        <MiniFileStat label="Risk" value={`${application.operationalRisk?.riskScore || 0}%`} />
      </div>

      <div className="mt-3 hidden rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] p-3 2xl:block">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8294a8]">Estimated approval confidence</p>
          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#31506a]">{application.approvalConfidence?.probabilityBand || 'Insufficient Data'}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#60758d]">
          {application.financeInsights?.insights?.[0] || application.financeInsights?.operationalWarnings?.[0] || 'Predictive workflow insights will strengthen as buyer and document data improves.'}
        </p>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{application.statusLabel || 'On Track'}</span>
          <span className="text-xs font-semibold text-[#6b8198]">{application.progressPercent || 0}%</span>
        </div>
        <div className="mt-4 grid grid-cols-6 gap-1.5">
          {(application.stageItems || []).map((stage) => (
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
      </div>

      <div className="mt-4 flex-1 rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] p-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8294a8]">Next action</p>
        <p className="mt-2 text-sm font-semibold leading-5 text-[#24384d]">{application.nextAction || 'No next action'}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => goTo(application.href)} className="h-9 rounded-[11px] bg-[#143250] px-2 text-xs font-semibold text-white transition hover:bg-[#173a5e]">
          Open File
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

function MiniFileStat({ label = '', value = '' }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#8294a8]">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-[#142132]">{value}</p>
    </div>
  )
}

function BankApprovalPanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const chartRows = rows.filter((item) => Number(item.total || 0) > 0)
  const total = chartRows.reduce((acc, item) => acc + Number(item.total || 0), 0) || 1
  const approvedTotal = rows.reduce((acc, item) => acc + Number(item.approved || 0), 0)
  const pendingTotal = rows.reduce((acc, item) => acc + Number(item.pending || 0), 0)
  const declinedTotal = rows.reduce((acc, item) => acc + Number(item.declined || 0), 0)
  const approvalRate = Math.round((approvedTotal / total) * 100)

  const conicSegments = chartRows.reduce((segments, item, index) => {
    const previousEnd = segments[index - 1]?.end || 0
    const share = Math.max(0, Number(item.total || 0)) / total
    const start = previousEnd
    const end = previousEnd + share * 360
    const visual = getBankVisual(item.bank)
    return [
      ...segments,
      {
        end,
        value: `${visual.color} ${start}deg ${end}deg`,
      },
    ]
  }, []).map((segment) => segment.value)
  const donutBackground = conicSegments.length ? `conic-gradient(${conicSegments.join(', ')}, #e5edf7 0deg)` : '#e5edf7'

  return (
    <div className="grid h-full gap-5 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-stretch">
      <div className="flex min-h-0 flex-col justify-between rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-5">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Outcome mix</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold leading-none tracking-[-0.05em] text-[#142132]">{total}</p>
              <p className="mt-2 text-sm font-semibold text-[#60758d]">applications across banks</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold leading-none text-[#142132]">{approvalRate}%</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">approved</p>
            </div>
          </div>
        </div>
        <div className="relative mx-auto my-6 h-40 w-40 shrink-0 rounded-full">
          <div
            className="h-full w-full rounded-full"
            style={{
              background: donutBackground,
            }}
          />
          <div className="absolute inset-7 rounded-full bg-white shadow-inner" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-3xl font-semibold text-[#142132]">{total}</p>
            <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Book</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <OutcomeMiniStat label="Approved" value={approvedTotal} tone="#2f8a63" />
          <OutcomeMiniStat label="Pending" value={pendingTotal} tone="#8a6a2a" />
          <OutcomeMiniStat label="Declined" value={declinedTotal} tone="#a83e4b" />
        </div>
      </div>
      <div className="grid content-start gap-2.5">
        {rows.map((row) => {
          const totalCount = Number(row.total || 0)
          const bookShare = (totalCount / total) * 100
          const visual = getBankVisual(row.bank)
          return (
            <article
              key={row.bank}
              className="rounded-[14px] border border-[#edf2f7] bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-bold"
                  style={{ backgroundColor: visual.soft, color: visual.color }}
                >
                  {visual.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-[#142132]">{row.bank}</p>
                    <p className="text-sm font-semibold text-[#142132]">{((row.approvalRate || 0)).toFixed(0)}%</p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#e7eef7]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(4, bookShare)}%`, backgroundColor: visual.color }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[#72889e]">
                    {row.approved} approved · {row.pending} pending · {row.declined} declined
                  </p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function OutcomeMiniStat({ label = '', value = 0, tone = '#315f8c' }) {
  return (
    <div className="rounded-[12px] border border-[#edf2f7] bg-white px-3 py-2 text-center">
      <p className="text-base font-semibold text-[#142132]">{value}</p>
      <p className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em]" style={{ color: tone }}>
        {label}
      </p>
    </div>
  )
}

function BankLeadTimePanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const safeRows = rows.filter((row) => Number(row.leadTimeDays || 0) > 0)
  const maxDays = Math.max(...safeRows.map((row) => Number(row.leadTimeDays || 0)), 1)
  const averageDays = safeRows.length
    ? Math.round(safeRows.reduce((sum, row) => sum + Number(row.leadTimeDays || 0), 0) / safeRows.length)
    : 0
  const fastest = safeRows[0]
  const slowest = safeRows[safeRows.length - 1]

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <LeadTimeStat label="Average" value={`${averageDays} days`} />
        <LeadTimeStat label="Fastest" value={fastest ? `${fastest.bank} · ${fastest.leadTimeDays}d` : 'Tracking'} />
        <LeadTimeStat label="Slowest" value={slowest ? `${slowest.bank} · ${slowest.leadTimeDays}d` : 'Tracking'} />
      </div>
      {safeRows.length ? (
        safeRows.map((row) => {
          const percent = Math.min(100, ((Number(row.leadTimeDays || 0) / maxDays) * 100) || 0)
          const visual = getBankVisual(row.bank)
          return (
            <article key={row.bank} className="rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-bold"
                    style={{ backgroundColor: visual.soft, color: visual.color }}
                  >
                    {visual.initials}
                  </span>
                  <p className="truncate text-sm font-semibold text-[#142132]">{row.bank}</p>
                </div>
                <p className="text-base font-semibold text-[#142132]">{row.leadTimeDays} days</p>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-[#e6eef8]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${percent}%`, backgroundColor: visual.color }}
                />
              </div>
            </article>
          )
        })
      ) : (
        <BondEmptyState
          compact
          title="No bank lead-time data"
          description="Lead-time movement will appear once bank submission activity is captured."
        />
      )}
    </div>
  )
}

function LeadTimeStat({ label = '', value = '' }) {
  return (
    <div className="rounded-[14px] border border-[#edf2f7] bg-white px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">{label}</p>
      <p className="mt-2 text-[0.9rem] font-semibold leading-5 text-[#142132]">{value}</p>
    </div>
  )
}

function PipelineFlowPanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const stageIcons = {
    lead: UsersRound,
    bond_app: FileCheck2,
    docs_collection: FileText,
    pre_approval: HandCoins,
    submitted: ArrowRight,
    bank_feedback: CircleAlert,
    approved: CircleCheck,
    registered: CircleDashed,
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-w-[1040px] items-stretch gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(118px, 1fr))` }}
      >
        {rows.map((row) => {
          const Icon = stageIcons[row.key] || CircleDashed
          const active = Number(row.count || 0) > 0
          return (
            <div key={row.key} className="relative">
              <div className={`min-h-[134px] rounded-[18px] border p-4 ${active ? 'border-[#c7dbef] bg-[#f7fbff]' : 'border-[#e7edf6] bg-white'}`}>
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#1f527e] shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                    <Icon size={17} className={active ? 'text-[#1f527e]' : 'text-[#7e95ac]'} />
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-[#2f8a63]' : 'bg-[#98a8bb]'}`}
                  />
                </div>
                <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">{row.label}</p>
                <p className="mt-2 text-[1.75rem] font-semibold leading-none text-[#142132]">{row.count}</p>
                <p className="mt-2 text-sm text-[#60758d]">{row.valueLabel}</p>
              </div>
              {rows.length > 1 && row.key !== rows[rows.length - 1]?.key ? (
                <ArrowRight
                  size={18}
                  className="absolute -right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white text-[#8fa8c2]"
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SegmentedAnalyticsPanel({ items = {} }) {
  const entries = Object.entries(items || {}).filter(([, value]) => Number(value || 0) > 0)
  const total = entries.reduce((acc, [, value]) => acc + Number(value || 0), 0) || 1
  const colors = ['#315f8c', '#8aa5bf', '#2f8a63', '#8b4f7e']

  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <div className="rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Finance profile</p>
            <p className="mt-3 text-4xl font-semibold leading-none tracking-[-0.05em] text-[#142132]">{total}</p>
          </div>
          <p className="max-w-[150px] text-right text-sm leading-5 text-[#60758d]">active files in this mix</p>
        </div>
        <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-[#e6eef8]">
          {entries.map(([key, value], index) => {
            const pct = (Number(value || 0) / total) * 100
            return (
              <span
                key={key}
                className="h-full"
                style={{ width: `${pct}%`, backgroundColor: colors[index % colors.length] }}
              />
            )
          })}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([key, value], index) => {
          const pct = (Number(value || 0) / total) * 100
          return (
            <div key={key} className="rounded-[14px] border border-[#edf2f7] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold capitalize text-[#142132]">{key.replaceAll('_', ' ')}</span>
                <span className="text-sm font-semibold text-[#142132]">{Math.round(pct)}%</span>
              </div>
              <p className="mt-1 text-xs text-[#60758d]">{value} active files</p>
              <div className="mt-3 h-2 rounded-full bg-[#e6eef8]">
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

function DonutAnalyticsPanel({ items = {} }) {
  const entries = Object.entries(items || {}).filter(([, value]) => Number(value || 0) > 0)
  const total = entries.reduce((acc, [, value]) => acc + Number(value || 0), 0) || 1
  const colors = ['#315f8c', '#2f6b4a', '#9b6b22', '#8b4f7e']
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
    <div className="grid h-full items-center gap-6 sm:grid-cols-[210px_1fr]">
      <div className="rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-5">
        <div className="relative mx-auto h-44 w-44 rounded-full">
          <div
            className="h-full w-full rounded-full"
            style={{ background: donutBackground }}
          />
          <div className="absolute inset-7 rounded-full bg-white shadow-inner" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-4xl font-semibold leading-none tracking-[-0.05em] text-[#142132]">{total}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">Buyers</p>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {entries.map(([key, value], index) => {
          const pct = (Number(value || 0) / total) * 100
          return (
            <div key={key} className="rounded-[14px] border border-[#edf2f7] bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="text-sm font-semibold capitalize text-[#142132]">{key.replaceAll('_', ' ')}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="h-2 flex-1 rounded-full bg-[#e6eef8]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: colors[index % colors.length] }}
                  />
                </div>
                <span className="text-sm font-semibold text-[#142132]">{Math.round(pct)}%</span>
              </div>
              <p className="mt-1 text-xs text-[#60758d]">{value} buyers</p>
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
    <div className="space-y-3">
      {rows.map((row) => {
        const visual = getBankVisual(row.bank)
        const width = Math.max(8, (Number(row.total || 0) / max) * 100)
        const share = Math.round((Number(row.total || 0) / total) * 100)
        return (
          <article key={row.bank} className="rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold"
                  style={{ backgroundColor: visual.soft, color: visual.color }}
                >
                  {visual.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#142132]">{row.bank}</p>
                  <p className="text-xs text-[#70879d]">{row.submitted} submitted • {row.approved} approved</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-[#142132]">{share}%</p>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-[#e6eef8]">
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
        <BondEmptyState compact title="No bank responses yet" description="Bank updates will appear here as files move." />
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
              <p className="text-xs text-[#71889e]">{member.activeFiles} active files</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#142132]">{member.approvalRate}%</p>
              <p className="text-xs text-[#71889e]">{member.avgTurnaround}d avg</p>
            </div>
          </article>
        ))
      ) : (
        <BondEmptyState compact title="No team load to show" description="Assign files to team leads to populate this leaderboard." />
      )}
    </div>
  )
}

function ConnectedPartnerCard({ partner = {} }) {
  const name = normalizeText(partner.name || 'Partner')
  return (
    <article className="min-w-[280px] rounded-[18px] border border-[#e0eaf5] bg-[#fbfdff] p-3">
      <div className="flex items-start gap-2">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#eaf1fa] text-xs font-semibold text-[#17324d]">
          {(normalizeText(partner.name || '').slice(0, 2) || 'P').toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#142132]">{name}</p>
          <p className="text-xs text-[#70879d]">{normalizeText(partner.type || 'Partner')}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="uppercase tracking-[0.08em] text-[#7c93aa]">Active</p>
          <p className="mt-1 font-semibold text-[#142132]">{normalizeNumber(partner.activeFiles)} files</p>
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
