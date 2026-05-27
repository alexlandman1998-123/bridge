import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CircleCheck, CircleDashed, CircleAlert, FileText, HandCoins, UsersRound } from 'lucide-react'
import BondDashboardHeader from './BondDashboardHeader'
import BondEmptyState from './BondEmptyState'
import BondPageShell from './BondPageShell'
import BondReportingScopeBanner from './BondReportingScopeBanner'
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
        heroKpis={heroKpis}
      />

      <BondReportingScopeBanner reportingScope={state.reportingScope} />

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
              <section className="grid gap-4 xl:grid-cols-[1.35fr_0.78fr_0.95fr]">
                <BondSectionCard
                  eyebrow="Primary Analytics"
                  title="Bank Approval Breakdown"
                  description="Bank movement and outcome split in one operational view."
                  className="flex h-[360px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                  headerClassName="gap-2"
                  contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
                >
                  <BankApprovalPanel items={bankBreakdown} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Primary Analytics"
                  title="Bank Lead Times"
                  description="Average lead time by lender from submission to movement."
                  className="flex h-[360px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                  headerClassName="gap-2"
                  contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
                >
                  <BankLeadTimePanel items={bankLeadTimes} />
                </BondSectionCard>
                <BondSectionCard
                  eyebrow="Primary Analytics"
                  title="Pipeline Overview"
                  description="Operational flow through core finance and registration stages."
                  className="flex h-[360px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                  headerClassName="gap-2"
                  contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
                >
                  <PipelineFlowPanel items={pipelineFlow} />
                </BondSectionCard>
              </section>

              <section className="grid gap-4 xl:grid-cols-4">
                <BondSectionCard
                  eyebrow="Secondary Insights"
                  title="Buyer Demographics"
                  description="Live profile mix across active demand."
                  action={
                    <Link
                      to="/applications"
                      className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]"
                    >
                      View all
                    </Link>
                  }
                  className="flex h-[300px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                  headerClassName="gap-2"
                  contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
                >
                  <BuyerDemographicsPanel stats={buyerDemographics} />
                </BondSectionCard>

                <BondSectionCard
                  eyebrow="Secondary Insights"
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
                  className="flex h-[300px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                  headerClassName="gap-2"
                  contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
                >
                  <OperationalRiskPanel items={operationalRisk} />
                </BondSectionCard>

                <BondSectionCard
                  eyebrow="Secondary Insights"
                  title="Recent Bank Activity"
                  description="Latest bank responses and document actions."
                  action={
                    <Link to="/banks?view=submissions" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
                      Open bank feed
                    </Link>
                  }
                  className="flex h-[300px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                  headerClassName="gap-2"
                  contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
                >
                  <BankActivityFeedPanel rows={recentBankActivity} />
                </BondSectionCard>

                <BondSectionCard
                  eyebrow="Secondary Insights"
                  title="Team Performance"
                  description="Active files and operational quality by teammate."
                  action={
                    <Link to="/teams" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
                      Team view
                    </Link>
                  }
                  className="flex h-[300px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                  headerClassName="gap-2"
                  contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
                >
                  <TeamPerformancePanel rows={teamPerformance} />
                </BondSectionCard>
              </section>

              <BondSectionCard
                eyebrow="Performance Snapshot"
                title="Executive signal strip"
                description="Velocity, conversion and book strength in one quick view."
                className="flex h-[220px] flex-col overflow-hidden rounded-[22px] p-4 sm:p-4"
                headerClassName="gap-2"
                contentClassName="mt-4 min-h-0 flex-1 overflow-hidden"
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {snapshot.performanceSnapshot?.length ? (
                    snapshot.performanceSnapshot.map((item) => (
                      <MiniMetricCard key={item.key} item={item} />
                    ))
                  ) : (
                    <BondEmptyState
                      compact
                      title="No performance data yet"
                      description="Performance cards will populate as deals move through stages."
                    />
                  )}
                </div>
              </BondSectionCard>

              <section className="rounded-[22px] border border-[#dbe5f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.03)]">
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

function BankApprovalPanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const chartRows = rows.filter((item) => Number(item.total || 0) > 0)
  const total = chartRows.reduce((acc, item) => acc + Number(item.total || 0), 0) || 1

  const bankColors = [
    '#4f7da6',
    '#2f6b4a',
    '#835a1a',
    '#8b4f7e',
    '#4d6ca8',
    '#8f9298',
  ]

  const conicSegments = chartRows.reduce((segments, item, index) => {
    const previousEnd = segments[index - 1]?.end || 0
    const share = Math.max(0, Number(item.total || 0)) / total
    const start = previousEnd
    const end = previousEnd + share * 360
    return [
      ...segments,
      {
        end,
        value: `${bankColors[index % bankColors.length]} ${start}deg ${end}deg`,
      },
    ]
  }, []).map((segment) => segment.value)

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[124px_1fr] xl:items-center">
      <div className="relative mx-auto h-24 w-24 shrink-0 rounded-full">
        <div
          className="h-full w-full rounded-full"
          style={{
            background: `conic-gradient(${conicSegments.join(', ')}, #e5edf7 0deg)`,
          }}
        />
        <div className="absolute inset-3 rounded-full bg-white" />
      </div>
      <div className="grid min-h-0 gap-1.5 overflow-y-auto pr-1">
        {rows.map((row) => {
          const totalCount = Number(row.total || 0)
          return (
            <article
              key={row.bank}
              className="grid grid-cols-[minmax(0,1fr)_repeat(4,48px)] items-center gap-2 rounded-[12px] border border-[#edf2f7] bg-[#fbfdff] px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#142132]">{row.bank}</p>
                <p className="text-[0.68rem] text-[#72889e]">
                  {((row.approvalRate || 0)).toFixed(0)}% approval
                </p>
              </div>
              <div>
                <p className="text-[0.58rem] uppercase tracking-[0.08em] text-[#7f94aa]">Appr.</p>
                <p className="text-xs font-semibold text-[#142132]">{row.approved}</p>
              </div>
              <div>
                <p className="text-[0.58rem] uppercase tracking-[0.08em] text-[#7f94aa]">Pend.</p>
                <p className="text-xs font-semibold text-[#142132]">{row.pending}</p>
              </div>
              <div>
                <p className="text-[0.58rem] uppercase tracking-[0.08em] text-[#7f94aa]">Decl.</p>
                <p className="text-xs font-semibold text-[#142132]">{row.declined}</p>
              </div>
              <div>
                <p className="text-[0.58rem] uppercase tracking-[0.08em] text-[#7f94aa]">Book</p>
                <p className="text-xs font-semibold text-[#142132]">{((totalCount / total) * 100).toFixed(0)}%</p>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function BankLeadTimePanel({ items = [] }) {
  const rows = Array.isArray(items) ? items : []
  const safeRows = rows.filter((row) => Number(row.leadTimeDays || 0) > 0)
  const maxDays = Math.max(...safeRows.map((row) => Number(row.leadTimeDays || 0)), 1)

  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
      {safeRows.length ? (
        safeRows.map((row) => {
          const percent = Math.min(100, ((Number(row.leadTimeDays || 0) / maxDays) * 100) || 0)
          const tone = Number(row.leadTimeDays || 0) <= 5 ? 'bg-[#2f8a63]' : Number(row.leadTimeDays || 0) <= 8 ? 'bg-[#9e5f17]' : 'bg-[#a93c4c]'
          return (
            <article key={row.bank} className="rounded-[12px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#142132]">{row.bank}</p>
                <p className="text-sm font-semibold text-[#142132]">{row.leadTimeDays} days</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#e6eef8]">
                <span className={`block h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
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
    <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden">
      <div className="grid h-full auto-cols-[102px] grid-flow-col items-start gap-2">
        {rows.map((row) => {
          const Icon = stageIcons[row.key] || CircleDashed
          const active = Number(row.count || 0) > 0
          return (
            <div key={row.key} className="relative">
              <div className={`h-[128px] rounded-[14px] border p-2.5 ${active ? 'border-[#c7dbef] bg-[#f7fbff]' : 'border-[#e7edf6] bg-white'}`}>
                <div className="flex items-center justify-between">
                  <Icon size={15} className={active ? 'text-[#1f527e]' : 'text-[#7e95ac]'} />
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-[#2f8a63]' : 'bg-[#98a8bb]'}`}
                  />
                </div>
                <p className="mt-2 text-[0.67rem] font-semibold uppercase tracking-[0.09em] text-[#7d93aa]">{row.label}</p>
                <p className="mt-2 text-lg font-semibold text-[#142132]">{row.count}</p>
                <p className="mt-1 text-[0.68rem] text-[#60758d]">{row.valueLabel}</p>
              </div>
              {rows.length > 1 ? (
                <ArrowRight
                  size={14}
                  className="absolute -right-1 top-1/2 -translate-y-1/2 text-[#a9bed3]"
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BuyerDemographicsPanel({ stats = {} }) {
  const {
    bondVsCash = { bond: 0, cash: 0 },
    clientType = { individual: 0, company: 0, trust: 0 },
    dealType = { investment: 0, residential: 0 },
  } = stats

  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
      <MiniDonutRow label="Bond vs Cash" items={bondVsCash} />
      <MiniDonutRow label="Individual vs Company vs Trust" items={clientType} />
      <MiniDonutRow label="Investor vs Residential" items={dealType} />
    </div>
  )
}

function MiniDonutRow({ label = '', items = {} }) {
  const entries = Object.entries(items || {}).filter(([, value]) => Number(value || 0) > 0)
  const total = entries.reduce((acc, [, value]) => acc + Number(value || 0), 0) || 1

  return (
    <article className="rounded-[12px] border border-[#edf2f7] bg-[#fbfdff] p-2.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#71889f]">{label}</p>
      <div className="mt-2 space-y-1.5">
        {entries.map(([key, value]) => {
          const pct = (Number(value || 0) / total) * 100
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-[#60758b]">
                <span className="font-semibold capitalize">{key.replaceAll('_', ' ')}</span>
                <span>{Math.round(pct)}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#e6eef8]">
                <span className="block h-full rounded-full bg-[#3b6a97]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </article>
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

function MiniMetricCard({ item = {} }) {
  const sparkline = Array.isArray(item.sparkline) ? item.sparkline : []
  return (
    <article className="min-w-0 rounded-[14px] border border-[#e6edf4] bg-[#fbfdff] p-3">
      <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b90a5]">{item.label}</p>
      <p className="mt-2 truncate text-lg font-semibold text-[#142132]">{item.value}</p>
      <p className="mt-2 text-xs text-[#60758d]">{item.trendLabel || item.comparison}</p>
      <div className="mt-2 flex h-6 items-end gap-1">
        {sparkline.length ? (
          sparkline.slice(0, 12).map((point, index) => (
            <span
              key={`${item.key}-${index}`}
              className="w-1 rounded-full bg-gradient-to-t from-[#2f5f95] to-[#8ab5d9]"
              style={{ height: `${Math.max(6, Math.min(100, Number(point) || 0))}%` }}
            />
          ))
        ) : (
          <>
            <span className="h-2 w-1 rounded-full bg-[#8aa8c4]" />
            <span className="h-3 w-1 rounded-full bg-[#8aa8c4]" />
            <span className="h-4 w-1 rounded-full bg-[#8aa8c4]" />
          </>
        )}
      </div>
    </article>
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
