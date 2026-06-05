import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  LineChart,
  MapPinned,
  ShieldAlert,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(normalizeNumber(value))
}

function formatPercent(value) {
  return `${normalizeNumber(value)}%`
}

function statusTone(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('high') || normalized.includes('danger')) return 'border-[#efcfd7] bg-[#fff4f6] text-[#9b3347]'
  if (normalized.includes('medium') || normalized.includes('warning')) return 'border-[#efdcb8] bg-[#fff8ec] text-[#8f5e14]'
  return 'border-[#cde8d4] bg-[#f0fbf5] text-[#216b4d]'
}

function getStageCount(funnel = {}, key = '') {
  const row = (funnel?.stages || []).find((stage) => stage.key === key)
  return normalizeNumber(row?.count)
}

function getAlert(alerts = [], keys = []) {
  const safeKeys = Array.isArray(keys) ? keys : [keys]
  return alerts.find((alert) => safeKeys.includes(alert.key)) || null
}

function SectionCard({ eyebrow = '', title = '', description = '', action = null, children, className = '' }) {
  return (
    <section className={`rounded-[18px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.032)] ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#74879b]">{eyebrow}</p> : null}
          <h2 className="mt-1 text-[1rem] font-semibold text-[#142132]">{title}</h2>
          {description ? <p className="mt-1 text-[0.82rem] leading-5 text-[#64788f]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function BondHqCommandCentre({ snapshot = {} }) {
  const hq = snapshot.hqCommandCentre || {}
  const regions = hq.regionalPerformance || []

  return (
    <div className="space-y-4">
      <HqKpiGrid items={hq.nationalSnapshot || []} />
      <HqExecutiveAlerts alerts={hq.alerts || []} funnel={hq.pipelineFunnel} />
      <HqPipelineFlow funnel={hq.pipelineFunnel} />
      <HqRegionalPerformance rows={regions} />
      <HqLowerInsightGrid
        leaderboard={hq.branchLeaderboard || {}}
        partners={hq.partnerPerformance || []}
        revenue={hq.revenue || {}}
      />
    </div>
  )
}

export function HqKpiGrid({ items = [] }) {
  const icons = [UsersRound, FileCheck2, Gauge, Clock3, BarChart3]
  const rows = items.filter((item) => item?.key !== 'projected_commission').slice(0, 5)
  if (!rows.length) {
    return <HqEmptyState title="No national snapshot yet" description="Not enough data." />
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {rows.map((item, index) => {
        const Icon = icons[index] || BarChart3
        return (
          <article key={item.key || item.label} className="flex min-h-[148px] flex-col justify-between rounded-[18px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#eef5ff] text-[#24518a]">
                <Icon size={18} />
              </span>
              <p className="mt-4 text-[0.8rem] font-semibold leading-4 text-[#60758d]">{item.label}</p>
              <p className="mt-2 text-[1.55rem] font-semibold leading-none text-[#101828]">{item.value || 'Not enough data'}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[0.68rem] font-medium text-[#74879b]">{item.helper || 'Not enough data'}</p>
              <span className="shrink-0 rounded-full border border-[#d9e7d9] bg-[#f3fbf4] px-2 py-0.5 text-[0.62rem] font-semibold text-[#25714f]">{item.trend || 'Tracking'}</span>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export function HqExecutiveAlerts({ alerts = [], funnel = {} }) {
  const alertRows = [
    {
      key: 'unassigned',
      label: 'Unassigned',
      href: '/bond/applications?filter=unassigned',
      icon: UsersRound,
      value: normalizeNumber(getAlert(alerts, 'unassigned')?.value),
    },
    {
      key: 'awaiting_otp',
      label: 'Awaiting OTP',
      href: '/bond/pipeline?view=all',
      icon: Clock3,
      value: normalizeNumber(getAlert(alerts, 'awaiting_otp')?.value, getStageCount(funnel, 'awaiting_otp')),
    },
    {
      key: 'missing_docs',
      label: 'Missing Docs',
      href: '/bond/pipeline?view=awaiting-docs',
      icon: FileText,
      value: normalizeNumber(getAlert(alerts, 'missing_docs')?.value),
    },
    {
      key: 'sla',
      label: 'SLA Breaches',
      href: '/bond/reports?view=sla-breaches',
      icon: ShieldAlert,
      value: normalizeNumber(getAlert(alerts, ['sla', 'sla_breaches'])?.value),
    },
    {
      key: 'branches',
      label: 'High Risk Branches',
      href: '/bond/organisation?view=branches&risk=high',
      icon: AlertTriangle,
      value: normalizeNumber(getAlert(alerts, ['branches', 'high_risk_branches'])?.value),
    },
  ]

  return (
    <section className="relative overflow-hidden rounded-[18px] border border-[#cfddea] bg-white p-4 shadow-[0_14px_32px_rgba(15,35,57,0.055)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#17324d] via-[#35698b] to-[#d8a34d]" />
      <span className="pointer-events-none absolute right-[-54px] top-[-74px] h-36 w-36 rounded-full bg-[#eef5ff]" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#5f7d99]">Risk Monitor</p>
          <h2 className="mt-1 text-[1rem] font-semibold text-[#142132]">Executive Alerts</h2>
        </div>
        <Link to="/bond/reports?view=executive-risk" className="relative inline-flex items-center gap-2 rounded-full border border-[#d4e1ed] bg-[#f8fbff] px-3 py-1.5 text-[0.82rem] font-semibold text-[#17324d] transition hover:border-[#b8ccde] hover:bg-white">
          View risk report <ArrowRight size={15} />
        </Link>
      </div>
      <div className="relative mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {alertRows.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.key} to={item.href} className="group flex min-h-[76px] items-center justify-between gap-3 rounded-[14px] border border-[#dfe8f1] bg-[#fbfdff] px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-[#bdd0e1] hover:bg-white hover:shadow-[0_12px_24px_rgba(15,35,57,0.055)]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-[#fff6e6] text-[#a36612] ring-1 ring-[#f1d8a8]">
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-lg font-semibold text-[#142132]">{formatNumber(item.value)}</strong>
                  <span className="block truncate text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#60758d]">{item.label}</span>
                </span>
              </span>
              <span className="shrink-0 text-[0.68rem] font-semibold text-[#24518a] transition group-hover:translate-x-0.5">View</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

const PIPELINE_STAGE_CONFIG = [
  { key: 'intake_received', label: 'Intake Received', icon: FileText },
  { key: 'awaiting_otp', label: 'Awaiting OTP', icon: Clock3 },
  { key: 'otp_ready', label: 'OTP Ready', icon: CheckCircle2 },
  { key: 'application_in_progress', label: 'In Progress', icon: LineChart },
  { key: 'ready_for_review', label: 'Ready for Review', icon: FileCheck2 },
  { key: 'submitted_to_banks', label: 'Submitted to Banks', icon: Landmark },
  { key: 'bank_feedback', label: 'Bank Feedback', icon: Gauge },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'registered', label: 'Registered', icon: Building2 },
]

export function HqPipelineFlow({ funnel = {} }) {
  const stagesByKey = new Map((funnel?.stages || []).map((stage) => [stage.key, stage]))
  const stageRows = PIPELINE_STAGE_CONFIG.map((config) => {
    const stage = stagesByKey.get(config.key) || {}
    return {
      ...config,
      ...stage,
      count: normalizeNumber(stage.count),
      conversionRate: normalizeNumber(stage.conversionRate),
      dropOff: normalizeNumber(stage.dropOff),
      href: stage.href || '/bond/pipeline',
    }
  })
  const intakeCount = Math.max(getStageCount(funnel, 'intake_received'), 1)
  const registeredCount = getStageCount(funnel, 'registered')
  const overallConversion = registeredCount ? Math.round((registeredCount / intakeCount) * 100) : 0
  const maxCount = Math.max(...stageRows.map((stage) => stage.count), 1)
  const highestStage = [...stageRows].sort((left, right) => right.count - left.count)[0]

  return (
    <SectionCard
      eyebrow="National Pipeline"
      title="National Pipeline Flow"
      description="Progressive movement from intake through registration, with conversion and drop-off pressure visible at each step."
      action={<Link to="/bond/pipeline" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View pipeline</Link>}
    >
      <div className="overflow-x-auto pb-2">
        <ol className="grid min-w-[1180px] grid-cols-9 gap-3">
          {stageRows.map((stage, index) => {
          const Icon = stage.icon
          return (
            <li key={stage.key} className="relative">
              {index < stageRows.length - 1 ? (
                <span className="pointer-events-none absolute left-[calc(50%+28px)] top-8 z-0 h-px w-[calc(100%-24px)] bg-gradient-to-r from-[#c9d9e8] to-[#e4edf5]" />
              ) : null}
              <Link to={stage.href} className="group relative z-10 flex min-h-[188px] flex-col rounded-[18px] border border-[#dce8f2] bg-white p-3.5 shadow-[0_10px_24px_rgba(15,35,57,0.035)] transition hover:-translate-y-0.5 hover:border-[#bcd0e1] hover:shadow-[0_16px_30px_rgba(15,35,57,0.065)]">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#dbe8f4] bg-[#f4f8fd] text-[#24518a] shadow-sm">
                  <Icon size={20} />
                </span>
                <span className="mt-4 min-h-[40px] text-sm font-semibold leading-5 text-[#17324d]">{stage.label}</span>
                <span className="mt-2 text-3xl font-semibold leading-none text-[#101828]">{formatNumber(stage.count)}</span>
                <span className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf3f8]">
                  <span className="block h-full rounded-full bg-[#24518a]" style={{ width: `${Math.max(4, Math.min(100, (stage.count / maxCount) * 100))}%` }} />
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 text-[0.68rem] font-semibold">
                  <span className="rounded-full bg-[#eef7f1] px-2 py-1 text-[#25714f]">{formatPercent(stage.conversionRate)}</span>
                  <span className="rounded-full bg-[#fff6e6] px-2 py-1 text-[#9b640f]">drop {formatPercent(stage.dropOff)}</span>
                </span>
              </Link>
            </li>
          )
        })}
        </ol>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[16px] border border-[#dbe5f0] bg-[#fbfdff] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#74879b]">Overall Conversion</p>
          <p className="mt-1 text-lg font-semibold text-[#142132]">{formatPercent(overallConversion)}</p>
        </div>
        <div className="rounded-[16px] border border-[#efdcb8] bg-[#fffaf0] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8f5e14]">Biggest Bottleneck</p>
          <p className="mt-1 truncate text-lg font-semibold text-[#142132]">{funnel?.bottleneckStage || 'Not enough data'}</p>
        </div>
        <div className="rounded-[16px] border border-[#dbe5f0] bg-[#fbfdff] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#74879b]">Highest Volume Stage</p>
          <p className="mt-1 truncate text-lg font-semibold text-[#142132]">{highestStage?.label || 'Not enough data'}</p>
        </div>
      </div>
    </SectionCard>
  )
}

export function HqRegionalPerformance({ rows = [] }) {
  const totalActive = rows.reduce((total, row) => total + normalizeNumber(row.activeApplications), 0)
  const totalSubmitted = rows.reduce((total, row) => total + normalizeNumber(row.submitted), 0)
  const averageApproval = rows.length ? Math.round(rows.reduce((total, row) => total + normalizeNumber(row.approvalRate), 0) / rows.length) : 0
  const fastestRegion = [...rows].filter((row) => normalizeNumber(row.avgApprovalTime)).sort((left, right) => normalizeNumber(left.avgApprovalTime) - normalizeNumber(right.avgApprovalTime))[0]
  const maxActive = Math.max(...rows.map((row) => normalizeNumber(row.activeApplications)), 1)
  const maxSubmitted = Math.max(...rows.map((row) => normalizeNumber(row.submitted)), 1)

  return (
    <SectionCard
      eyebrow="Regional Performance"
      title="Regional Performance"
      description="Regional operating shape across volume, submission velocity, approval quality, and risk."
      action={<Link to="/bond/organisation?view=branches" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View regions</Link>}
    >
      {!rows.length ? (
        <HqRegionalEmptyState />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <RegionalSummaryTile label="Active Book" value={formatNumber(totalActive)} helper={`${formatNumber(totalSubmitted)} submitted`} />
            <RegionalSummaryTile label="Average Approval" value={formatPercent(averageApproval)} helper="Across visible regions" />
            <RegionalSummaryTile label="Fastest Region" value={fastestRegion?.region || 'Not enough data'} helper={fastestRegion ? `${formatNumber(fastestRegion.avgApprovalTime)}d average time` : 'No turnaround yet'} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.slice(0, 6).map((row) => {
              const active = normalizeNumber(row.activeApplications)
              const submitted = normalizeNumber(row.submitted)
              const approval = normalizeNumber(row.approvalRate)
              return (
                <Link key={row.key || row.region} to={row.href || '/bond/organisation?view=branches'} className="rounded-[18px] border border-[#dce8f2] bg-[#fbfdff] p-4 transition hover:-translate-y-0.5 hover:border-[#bcd0e1] hover:bg-white hover:shadow-[0_14px_28px_rgba(15,35,57,0.055)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-[#17324d]">{row.region}</p>
                      <p className="mt-1 text-xs font-medium text-[#71869d]">{row.pipelineValueLabel || 'Pipeline value pending'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(row.riskLevel)}`}>{row.riskLevel || 'Tracking'}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <RegionalMiniMetric label="Active" value={formatNumber(active)} />
                    <RegionalMiniMetric label="Submitted" value={formatNumber(submitted)} />
                    <RegionalMiniMetric label="Approval" value={formatPercent(approval)} />
                  </div>
                  <div className="mt-4 space-y-2">
                    <RegionalBar label="Volume" value={active} max={maxActive} color="#24518a" />
                    <RegionalBar label="Submitted" value={submitted} max={maxSubmitted} color="#2f7d55" />
                    <RegionalBar label="Approval" value={approval} max={100} color="#b7791f" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function RegionalSummaryTile({ label = '', value = '', helper = '' }) {
  return (
    <div className="rounded-[18px] border border-[#dce8f2] bg-white p-4 shadow-[0_10px_24px_rgba(15,35,57,0.032)]">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#74879b]">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold text-[#142132]">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-[#71869d]">{helper}</p>
    </div>
  )
}

function RegionalMiniMetric({ label = '', value = '' }) {
  return (
    <div className="rounded-[13px] bg-white px-3 py-2 ring-1 ring-[#e2ebf4]">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#74879b]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#142132]">{value}</p>
    </div>
  )
}

function RegionalBar({ label = '', value = 0, max = 1, color = '#24518a' }) {
  const width = Math.max(4, Math.min(100, (normalizeNumber(value) / Math.max(normalizeNumber(max), 1)) * 100))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-[0.68rem] font-semibold text-[#71869d]">
        <span>{label}</span>
        <span>{label === 'Approval' ? formatPercent(value) : formatNumber(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#edf3f8]">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function HqRegionalEmptyState() {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr]">
      <div className="rounded-[18px] border border-dashed border-[#d5e2ef] bg-[#fbfdff] p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#eef5ff] text-[#24518a]">
          <MapPinned size={20} />
        </span>
        <h3 className="mt-4 text-base font-semibold text-[#17324d]">No regional data yet</h3>
        <p className="mt-1 text-sm leading-6 text-[#71869d]">Once applications are assigned to regions, this area becomes a regional scorecard with volume, approval, turnaround, and risk.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {['Volume Mix', 'Approval Quality', 'Turnaround Pressure', 'Pipeline Value'].map((label) => (
          <div key={label} className="rounded-[16px] border border-[#e2ebf4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#74879b]">{label}</p>
            <div className="mt-4 h-2 rounded-full bg-[#edf3f8]" />
            <div className="mt-2 h-2 w-2/3 rounded-full bg-[#edf3f8]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CompactBranchRow({ branch, attention = false }) {
  return (
    <Link to={branch.href || '/bond/organisation?view=branches'} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e2ebf4] bg-[#fbfdff] px-3 py-3 transition hover:border-[#c6d8e8]">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#17324d]">{branch.branch}</span>
        <span className="mt-0.5 block truncate text-xs text-[#71869d]">{branch.region} · {formatNumber(branch.activeApplications)} active</span>
      </span>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(attention ? branch.riskLevel : 'Low')}`}>
        {attention ? branch.riskLevel : formatPercent(branch.approvalRate)}
      </span>
    </Link>
  )
}

function CompactPartnerRow({ partner }) {
  return (
    <Link to={partner.href || '/bond/partners'} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e2ebf4] bg-[#fbfdff] px-3 py-3 transition hover:border-[#c6d8e8]">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#17324d]">{partner.partner}</span>
        <span className="mt-0.5 block truncate text-xs text-[#71869d]">{partner.sourceType} · {formatNumber(partner.applicationsReferred)} referred</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-[#204b84]">{formatPercent(partner.conversionRate)}</span>
    </Link>
  )
}

function RevenueOverview({ revenue = {} }) {
  const metrics = [
    ['Projected', revenue.projectedCommissionLabel],
    ['Confirmed', revenue.commissionConfirmedLabel],
    ['This Month', revenue.revenueThisMonthLabel],
    ['90-Day', revenue.forecast90Day],
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {metrics.map(([label, value]) => (
        <div key={label} className="rounded-[14px] border border-[#e2ebf4] bg-[#fbfdff] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#74879b]">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#17324d]">{value || 'Not enough data'}</p>
        </div>
      ))}
    </div>
  )
}

export function HqLowerInsightGrid({ leaderboard = {}, partners = [], revenue = {} }) {
  const topBranches = leaderboard.topBranches || []
  const attentionBranches = leaderboard.attentionBranches || []
  const topPartners = partners.slice(0, 4)

  return (
    <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      <SectionCard
        eyebrow="Branch Leaderboard"
        title="Top Performing Branches"
        description="Best operating branches by approval, volume and revenue."
        action={<Link to="/bond/organisation?view=branches" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View all</Link>}
      >
        <div className="grid gap-2.5">
          {topBranches.length ? topBranches.slice(0, 4).map((branch) => <CompactBranchRow key={branch.key} branch={branch} />) : <HqEmptyState title="No top branch data" description="Not enough data." />}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Branch Risk"
        title="Branches Requiring Attention"
        description="Branches with SLA pressure, missing docs or weak approvals."
        action={<Link to="/bond/organisation?view=branches&risk=high" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View all</Link>}
      >
        <div className="grid gap-2.5">
          {attentionBranches.length ? attentionBranches.slice(0, 4).map((branch) => <CompactBranchRow key={branch.key} branch={branch} attention />) : <HqEmptyState title="No branch risks" description="Not enough data." icon={ShieldAlert} />}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Partner Performance"
        title="Top Partner Performance"
        description="Highest-value referral channels and partner sources."
        action={<Link to="/bond/partners" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View all</Link>}
      >
        <div className="grid gap-2.5">
          {topPartners.length ? topPartners.map((partner) => <CompactPartnerRow key={partner.key} partner={partner} />) : <HqEmptyState title="No partner data" description="Not enough data." icon={Landmark} />}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Revenue"
        title="Revenue Overview"
        description="Projected, confirmed and forecast commission at a glance."
        action={<Link to="/bond/revenue" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View report</Link>}
      >
        <RevenueOverview revenue={revenue} />
      </SectionCard>
    </section>
  )
}

export function HqEmptyState({ title = 'Not enough data', description = 'Not enough data.', icon = BarChart3 }) {
  const EmptyStateIcon = icon
  return (
    <div className="flex min-h-[92px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#d5e2ef] bg-[#fbfdff] px-4 py-5 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#eef5ff] text-[#24518a]">
        <EmptyStateIcon size={17} />
      </span>
      <p className="mt-2 text-sm font-semibold text-[#17324d]">{title}</p>
      <p className="mt-0.5 text-xs text-[#71869d]">{description}</p>
    </div>
  )
}
