import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CircleCheck, CircleDashed, CircleAlert, FileText, HandCoins, UsersRound } from 'lucide-react'
import BondDashboardHeader from './BondDashboardHeader'
import BondEmptyState from './BondEmptyState'
import BondPageShell from './BondPageShell'
import BondSectionCard from './BondSectionCard'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'
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
  bond_value_in_progress: '#315f8c',
  registration_conversion: '#2f6b4a',
  commission_pipeline: '#8b4f7e',
}

function getBankVisual(bank = '') {
  return BANK_VISUALS[bank] || BANK_VISUALS.Others
}

function getSparklineProgress(sparkline = []) {
  const values = Array.isArray(sparkline)
    ? sparkline.map((point) => normalizeNumber(point, 0)).filter((point) => point > 0)
    : []
  if (!values.length) return 18

  const latest = values[values.length - 1]
  const max = Math.max(...values, 1)
  const percent = latest <= 100 ? latest : (latest / max) * 100
  return Math.max(18, Math.min(100, Math.round(percent)))
}

export default function BondDashboard({
  user = {},
  workspaceId = '',
  service = bondCommandCenterService,
  initialState = null,
}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const [rangeKey] = useState('this_month')
  const [state, setState] = useState(
    initialState || {
      loading: true,
      error: '',
      snapshot: null,
      reportingScope: null,
    },
  )

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
      const snapshot = await service.getBondCommandCenterSnapshot(user, safeWorkspaceId, { rangeKey })
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
  }, [rangeKey, safeWorkspaceId, service, user])

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
  const bankBreakdown = snapshot.bankBreakdown || []
  const bankLeadTimes = snapshot.bankLeadTimes || []
  const pipelineFlow = snapshot.pipelineFlow || []
  const buyerDemographics = snapshot.buyerDemographics || {}
  const operationalRisk = snapshot.operationalRisk || []
  const recentBankActivity = snapshot.recentBankActivity || []
  const teamPerformance = snapshot.teamPerformance || []
  const connectedPartners = snapshot.connectedPartners || []
  const heroSummary = snapshot.heroSummary || {}
  const heatmapRows = snapshot.operationalHeatmap || []
  const displayName = normalizeText(snapshot?.userDisplayName)
  const safeUserDisplayName = displayName && displayName.toLowerCase() !== 'undefined' ? displayName : 'there'

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
    <BondPageShell>
      <BondDashboardHeader
        userDisplayName={safeUserDisplayName}
        applicationsMovedText={
          state.loading ? 'Loading this week’s movement' : `${heroSummary.applicationsMoved || 0} applications moved`
        }
        velocityText={state.loading ? 'calculating' : heroSummary.approvalVelocity || 'up 0%'}
        focusChips={snapshot?.roleFocus?.focusChips || []}
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
                description="A full-width view of how applications are moving from lead capture to registration."
                className="flex min-h-[310px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                headerClassName="gap-3"
                contentClassName="mt-6 min-h-0 flex-1"
              >
                <PipelineFlowPanel items={pipelineFlow} />
              </BondSectionCard>

              <section className="grid gap-6 xl:grid-cols-2">
                <BondSectionCard
                  eyebrow="Buyer Demographics"
                  title="Bond vs Cash"
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
              </section>

              <BondSectionCard
                eyebrow="Application Heatmap"
                title="Operational Bottleneck Heatmap"
                description="Stage congestion and risk concentration by bank."
                className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                headerClassName="gap-3"
                contentClassName="mt-6 min-h-0 flex-1"
              >
                <OperationalHeatmapPanel rows={heatmapRows} />
              </BondSectionCard>

              <section className="grid gap-6 xl:grid-cols-3">
                <BondSectionCard
                  eyebrow="Secondary Operations"
                  title="Operational Risk"
                  description="Immediate risks to cycle-time and quality."
                  action={
                    <Link
                      to="/applications?queue=overdue_applications"
                      className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]"
                    >
                      View all
                    </Link>
                  }
                  className="flex min-h-[340px] flex-col overflow-hidden rounded-[24px] p-6 sm:p-6"
                  headerClassName="gap-3"
                  contentClassName="mt-6 min-h-0 flex-1"
                >
                  <OperationalRiskPanel items={operationalRisk} />
                </BondSectionCard>

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

function ExecutiveKpiCard({ item = {} }) {
  const sparkline = Array.isArray(item.sparkline) ? item.sparkline : []
  const trend = normalizeText(item.trend)
  const comparison = normalizeText(item.comparison)
  const progress = getSparklineProgress(sparkline)
  const progressColor = KPI_PROGRESS_COLORS[item.key] || '#315f8c'

  return (
    <article className="min-h-[136px] rounded-[20px] border border-[#dbe5f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#778da4]">{item.label}</p>
      <p className="mt-4 text-[1.6rem] font-semibold leading-none tracking-[-0.04em] text-[#142132]">{item.value}</p>
      <p className="mt-3 min-h-5 text-[0.82rem] font-semibold leading-5 text-[#60758d]">
        {trend}
        {trend && comparison ? ' · ' : ''}
        {comparison}
      </p>
      <div className="mt-4 h-2 rounded-full bg-[#e7eef7]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${progress}%`, backgroundColor: progressColor }}
        />
      </div>
    </article>
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
    docs_collection: FileText,
    pre_approval: HandCoins,
    submitted: ArrowRight,
    bank_feedback: CircleAlert,
    approved: CircleCheck,
    grant_signed: CircleDashed,
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid min-w-[840px] grid-cols-6 items-stretch gap-3">
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

function OperationalHeatmapPanel({ rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : []
  const columns = safeRows[0]?.stages?.map((stage) => stage.label) || []

  if (!safeRows.length) {
    return (
      <BondEmptyState
        compact
        title="No bottleneck heatmap data"
        description="Stage concentration will appear once applications move through the pipeline."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `180px repeat(${columns.length}, minmax(94px, 1fr))` }}
        >
          <div />
          {columns.map((column) => (
            <p key={column} className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">
              {column}
            </p>
          ))}
          {safeRows.map((row) => (
            <div key={row.key} className="contents">
              <div className="flex items-center rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#142132]">{row.label}</p>
                  <p className="mt-1 text-xs text-[#60758d]">{row.total} active files</p>
                </div>
              </div>
              {row.stages.map((stage) => {
                const intensity = Math.min(1, Math.max(0, Number(stage.intensity || 0)))
                const background = `rgba(49, 95, 140, ${0.08 + intensity * 0.62})`
                const textColor = intensity > 0.55 ? '#ffffff' : '#142132'
                return (
                  <div
                    key={`${row.key}-${stage.key}`}
                    className="flex min-h-[58px] flex-col items-center justify-center rounded-[14px] border border-[#edf2f7]"
                    style={{ background, color: textColor }}
                  >
                    <p className="text-lg font-semibold">{stage.count}</p>
                    <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] opacity-80">
                      {stage.riskCount} risk
                    </p>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
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
