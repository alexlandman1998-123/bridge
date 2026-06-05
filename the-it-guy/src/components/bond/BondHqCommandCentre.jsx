import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  LineChart,
  MapPinned,
  ShieldAlert,
  UsersRound,
  WalletCards,
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
    <section className={`rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.035)] ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#74879b]">{eyebrow}</p> : null}
          <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.03em] text-[#142132]">{title}</h2>
          {description ? <p className="mt-1.5 text-sm leading-5 text-[#64788f]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export default function BondHqCommandCentre({ snapshot = {} }) {
  const hq = snapshot.hqCommandCentre || {}
  const regions = hq.regionalPerformance || []

  return (
    <div className="space-y-6">
      <HqPageHeader regions={regions} />
      <HqKpiGrid items={hq.nationalSnapshot || []} />
      <HqExecutiveAlerts alerts={hq.alerts || []} funnel={hq.pipelineFunnel} />
      <section className="grid gap-4 xl:grid-cols-2">
        <HqPipelineFlow funnel={hq.pipelineFunnel} />
        <HqRegionalPerformance rows={regions} />
      </section>
      <HqLowerInsightGrid
        leaderboard={hq.branchLeaderboard || {}}
        partners={hq.partnerPerformance || []}
        revenue={hq.revenue || {}}
      />
    </div>
  )
}

export function HqPageHeader({ regions = [] }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#101828] md:text-4xl">National Bond Command Centre</h1>
        <p className="mt-2 text-sm leading-6 text-[#64788f] md:text-base">
          Executive view of national bond performance, pipeline, revenue and risk.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select aria-label="Dashboard period" className="h-11 rounded-[14px] border border-[#d7e2ee] bg-white px-3 text-sm font-semibold text-[#20364c] shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
          <option>Last 30 Days</option>
          <option>This Month</option>
          <option>Quarter to Date</option>
        </select>
        <select aria-label="Region filter" className="h-11 rounded-[14px] border border-[#d7e2ee] bg-white px-3 text-sm font-semibold text-[#20364c] shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
          <option>All Regions</option>
          {regions.map((region) => <option key={region.key}>{region.region}</option>)}
        </select>
        <Link to="/bond/reports?export=executive" className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#17324d] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(23,50,77,0.16)]">
          <Download size={16} />
          Export report
        </Link>
      </div>
    </header>
  )
}

export function HqKpiGrid({ items = [] }) {
  const icons = [UsersRound, FileCheck2, Gauge, Clock3, BarChart3, WalletCards]
  const rows = items.slice(0, 6)
  if (!rows.length) {
    return <HqEmptyState title="No national snapshot yet" description="Not enough data." />
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {rows.map((item, index) => {
        const Icon = icons[index] || BarChart3
        return (
          <article key={item.key || item.label} className="flex min-h-[164px] flex-col justify-between rounded-[20px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.035)]">
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#eef5ff] text-[#24518a]">
                <Icon size={19} />
              </span>
              <p className="mt-4 text-sm font-medium text-[#60758d]">{item.label}</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.045em] text-[#101828]">{item.value || 'Not enough data'}</p>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs font-medium text-[#74879b]">{item.helper || 'Not enough data'}</p>
              <span className="shrink-0 rounded-full border border-[#d9e7d9] bg-[#f3fbf4] px-2.5 py-1 text-[0.68rem] font-semibold text-[#25714f]">{item.trend || 'Tracking'}</span>
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
    <section className="rounded-[22px] border border-[#efcfd7] bg-[#fff7f8] p-5 shadow-[0_12px_28px_rgba(155,51,71,0.045)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#9b3347]">Risk Monitor</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#142132]">Executive Alerts</h2>
        </div>
        <Link to="/bond/reports?view=executive-risk" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8f2f45] hover:text-[#6f1f32]">
          View risk report <ArrowRight size={15} />
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {alertRows.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.key} to={item.href} className="flex min-h-[86px] items-center justify-between gap-3 rounded-[16px] border border-[#f1d5dc] bg-white/78 px-4 py-3 transition hover:border-[#e6bcc7]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-[#fff0f3] text-[#9b3347]">
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-xl font-semibold tracking-[-0.04em] text-[#142132]">{formatNumber(item.value)}</strong>
                  <span className="block truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#8f5360]">{item.label}</span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[#8f2f45]">View</span>
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
  const intakeCount = Math.max(getStageCount(funnel, 'intake_received'), 1)
  const registeredCount = getStageCount(funnel, 'registered')
  const overallConversion = registeredCount ? Math.round((registeredCount / intakeCount) * 100) : 0

  return (
    <SectionCard
      eyebrow="National Pipeline"
      title="National Pipeline Flow"
      description="Compact movement from intake through registration."
      action={<Link to="/bond/pipeline" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View pipeline</Link>}
      className="h-full"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {PIPELINE_STAGE_CONFIG.map((config) => {
          const stage = stagesByKey.get(config.key) || {}
          const Icon = config.icon
          return (
            <Link key={config.key} to={stage.href || '/bond/pipeline'} className="rounded-[16px] border border-[#e2ebf4] bg-[#fbfdff] p-3 transition hover:border-[#c6d8e8]">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#eef5ff] text-[#24518a]">
                  <Icon size={17} />
                </span>
                <span className="text-xs font-semibold text-[#60758d]">{formatPercent(stage.conversionRate)}</span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-5 text-[#17324d]">{config.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-[#101828]">{formatNumber(stage.count)}</p>
            </Link>
          )
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[16px] border border-[#dbe5f0] bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#74879b]">Overall Conversion</p>
          <p className="mt-1 text-lg font-semibold text-[#142132]">{formatPercent(overallConversion)}</p>
        </div>
        <div className="rounded-[16px] border border-[#efdcb8] bg-[#fffaf0] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8f5e14]">Biggest Bottleneck</p>
          <p className="mt-1 truncate text-lg font-semibold text-[#142132]">{funnel?.bottleneckStage || 'Not enough data'}</p>
        </div>
      </div>
    </SectionCard>
  )
}

export function HqRegionalPerformance({ rows = [] }) {
  return (
    <SectionCard
      eyebrow="Regional Performance"
      title="Regional Performance"
      description="Compare the national book across visible regions."
      action={<Link to="/bond/organisation?view=branches" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View regions</Link>}
      className="h-full"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-[0.1em] text-[#72869b]">
            <tr>
              {['Region', 'Active', 'Submitted', 'Approval Rate', 'Avg Time', 'Pipeline Value', 'Commission', 'Risk'].map((heading) => (
                <th key={heading} className="border-b border-[#e2ebf4] px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[#edf2f7] last:border-0">
                <td className="px-3 py-3.5"><Link to={row.href || '/bond/organisation?view=branches'} className="font-semibold text-[#17324d]">{row.region}</Link></td>
                <td className="px-3 py-3.5">{formatNumber(row.activeApplications)}</td>
                <td className="px-3 py-3.5">{formatNumber(row.submitted)}</td>
                <td className="px-3 py-3.5">{formatPercent(row.approvalRate)}</td>
                <td className="px-3 py-3.5">{formatNumber(row.avgApprovalTime)}d</td>
                <td className="px-3 py-3.5 font-semibold">{row.pipelineValueLabel}</td>
                <td className="px-3 py-3.5 font-semibold">{row.projectedCommissionLabel}</td>
                <td className="px-3 py-3.5"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(row.riskLevel)}`}>{row.riskLevel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <HqEmptyState title="No regional data yet" description="Not enough data." icon={MapPinned} /> : null}
      </div>
    </SectionCard>
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
