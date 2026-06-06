import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
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

function getStageSourceCount(funnel = {}, stageKey = '', sourceKey = '') {
  const row = (funnel?.stages || []).find((stage) => stage.key === stageKey)
  return normalizeNumber(row?.sourceBreakdown?.[sourceKey])
}

function getAlert(alerts = [], keys = []) {
  const safeKeys = Array.isArray(keys) ? keys : [keys]
  return alerts.find((alert) => safeKeys.includes(alert.key)) || null
}

function SectionCard({ eyebrow = '', title = '', description = '', action = null, children, className = '' }) {
  return (
    <section className={`rounded-[18px] border border-[#dbe5f0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.032)] ${className}`}>
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
    <div className="space-y-6">
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
  const primary = rows[0]
  const secondaryRows = rows.slice(1)
  const PrimaryIcon = icons[0] || BarChart3

  return (
    <section className="rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.04)]">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_2fr]">
        <article className="relative overflow-hidden rounded-[20px] border border-[#d7e4ef] bg-[linear-gradient(135deg,#f8fbff_0%,#eef5fb_100%)] p-5">
          <span className="pointer-events-none absolute right-[-42px] top-[-52px] h-32 w-32 rounded-full bg-white/65" />
          <div className="relative">
            <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-white text-[#24518a] shadow-sm ring-1 ring-[#dbe7f2]">
              <PrimaryIcon size={19} />
            </span>
            <p className="mt-5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#60758d]">{primary.label}</p>
            <p className="mt-2 text-4xl font-semibold leading-none text-[#101828]">{primary.value || 'Not enough data'}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#d9e7d9] bg-white px-3 py-1 text-xs font-semibold text-[#25714f]">{primary.trend || 'Tracking'}</span>
              <span className="min-w-0 text-xs font-medium text-[#71869d]">{primary.helper || 'Not enough data'}</span>
            </div>
          </div>
        </article>

        <div className="grid overflow-hidden rounded-[20px] border border-[#dbe5f0] bg-[#fbfdff] sm:grid-cols-2 xl:grid-cols-4">
          {secondaryRows.map((item, index) => {
            const Icon = icons[index + 1] || BarChart3
            return (
              <article key={item.key || item.label} className="min-h-[136px] border-[#e1ebf4] p-4 sm:border-l xl:first:border-l-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-[#eef5ff] text-[#24518a]">
                    <Icon size={17} />
                  </span>
                  <span className="rounded-full border border-[#d9e7d9] bg-white px-2 py-0.5 text-[0.62rem] font-semibold text-[#25714f]">{item.trend || 'Tracking'}</span>
                </div>
                <p className="mt-4 text-[0.78rem] font-semibold leading-4 text-[#60758d]">{item.label}</p>
                <p className="mt-2 truncate text-2xl font-semibold leading-none text-[#101828]">{item.value || 'Not enough data'}</p>
                <p className="mt-3 truncate text-[0.68rem] font-medium text-[#74879b]">{item.helper || 'Not enough data'}</p>
              </article>
            )
          })}
        </div>
      </div>
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
      value: normalizeNumber(getAlert(alerts, 'awaiting_otp')?.value, getStageSourceCount(funnel, 'intake', 'awaiting_otp')),
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
  const riskTotal = alertRows.reduce((total, item) => total + item.value, 0)

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-[#cfddea] bg-white p-5 shadow-[0_14px_32px_rgba(15,35,57,0.055)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#17324d] via-[#35698b] to-[#d8a34d]" />
      <span className="pointer-events-none absolute right-[-54px] top-[-74px] h-36 w-36 rounded-full bg-[#eef5ff]" />
      <div className="relative grid gap-5 xl:grid-cols-[0.8fr_1.8fr] xl:items-center">
        <div className="relative">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#5f7d99]">Risk Monitor</p>
          <h2 className="mt-1 text-[1rem] font-semibold text-[#142132]">Executive Alerts</h2>
          <p className="mt-2 text-sm leading-6 text-[#64788f]">Open items that need operational attention before they slow the application book.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-semibold leading-none text-[#142132]">{formatNumber(riskTotal)}</span>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#74879b]">active risk signals</span>
          </div>
          <Link to="/bond/reports?view=executive-risk" className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#d4e1ed] bg-[#f8fbff] px-3 py-1.5 text-[0.82rem] font-semibold text-[#17324d] transition hover:border-[#b8ccde] hover:bg-white">
            View risk report <ArrowRight size={15} />
          </Link>
        </div>

        <div className="grid overflow-hidden rounded-[18px] border border-[#dfe8f1] bg-[#fbfdff] sm:grid-cols-2 lg:grid-cols-5">
          {alertRows.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.key} to={item.href} className="group min-h-[96px] border-[#e1ebf4] px-4 py-3 transition hover:bg-white sm:border-l lg:first:border-l-0">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-[#fff6e6] text-[#a36612] ring-1 ring-[#f1d8a8]">
                    <Icon size={15} />
                  </span>
                  <span className="text-[0.68rem] font-semibold text-[#24518a] transition group-hover:translate-x-0.5">View</span>
                </span>
                <strong className="mt-3 block text-2xl font-semibold leading-none text-[#142132]">{formatNumber(item.value)}</strong>
                <span className="mt-2 block truncate text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#60758d]">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const PIPELINE_STAGE_CONFIG = [
  { key: 'intake', label: 'Intake', icon: FileText },
  { key: 'application_prep', label: 'Application Prep', icon: LineChart },
  { key: 'review_submit', label: 'Review & Submit', icon: FileCheck2 },
  { key: 'bank_decision', label: 'Bank Decision', icon: Landmark },
  { key: 'registration', label: 'Registration', icon: Building2 },
]

export function HqPipelineFlow({ funnel = {} }) {
  const configByKey = new Map(PIPELINE_STAGE_CONFIG.map((stage) => [stage.key, stage]))
  const stagesByKey = new Map((funnel?.stages || []).map((stage) => [stage.key, stage]))
  const sourceStages = (funnel?.stages || []).length ? funnel.stages : PIPELINE_STAGE_CONFIG
  const stageRows = sourceStages.map((sourceStage) => {
    const config = configByKey.get(sourceStage.key) || {}
    const stage = stagesByKey.get(sourceStage.key) || sourceStage || {}
    return {
      ...config,
      ...stage,
      label: stage.label || config.label || 'Pipeline Stage',
      icon: config.icon || BarChart3,
      count: normalizeNumber(stage.count),
      conversionRate: normalizeNumber(stage.conversionRate),
      dropOff: normalizeNumber(stage.dropOff),
      href: stage.href || '/bond/pipeline',
    }
  })
  const intakeCount = Math.max(getStageCount(funnel, 'intake'), 1)
  const registeredCount = getStageCount(funnel, 'registration')
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
        <ol className="grid min-w-[760px] grid-cols-5 gap-3">
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

const PARTNER_PIE_COLORS = ['#24518a', '#2f7d55', '#d8a34d', '#8b5cf6', '#dc6b4a']

function PartnerPieChart({ partners = [] }) {
  const rows = partners
    .filter((partner) => normalizeNumber(partner.applicationsReferred) > 0)
    .slice(0, 5)
  const total = rows.reduce((sum, partner) => sum + normalizeNumber(partner.applicationsReferred), 0)

  if (!rows.length || !total) {
    return <HqEmptyState title="No partner data" description="Not enough data." icon={Landmark} />
  }

  const gradientParts = rows.reduce((accumulator, partner, index) => {
    const start = accumulator.cursor
    const share = (normalizeNumber(partner.applicationsReferred) / total) * 100
    const end = start + share
    return {
      cursor: end,
      parts: [...accumulator.parts, `${PARTNER_PIE_COLORS[index % PARTNER_PIE_COLORS.length]} ${start}% ${end}%`],
    }
  }, { cursor: 0, parts: [] })
  const gradient = gradientParts.parts.join(', ')
  const leadPartner = rows[0]
  const leadShare = Math.round((normalizeNumber(leadPartner.applicationsReferred) / total) * 100)

  return (
    <div className="min-h-[360px] rounded-[20px] border border-[#dce8f2] bg-[linear-gradient(145deg,#fbfdff_0%,#f3f7fb_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="grid gap-4 xl:grid-cols-[164px_minmax(0,1fr)] xl:items-start">
        <div className="rounded-[18px] border border-[#e1ebf4] bg-white px-4 py-4 text-center shadow-[0_12px_24px_rgba(15,35,57,0.04)]">
          <div className="relative mx-auto flex h-[148px] w-[148px] items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(219,229,240,0.95)]" style={{ background: `conic-gradient(${gradient})` }}>
            <div className="flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_8px_20px_rgba(15,35,57,0.08)]">
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#74879b]">Referrals</span>
              <strong className="mt-0.5 text-2xl font-semibold leading-none text-[#142132]">{formatNumber(total)}</strong>
            </div>
          </div>
          <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#74879b]">Top source share</p>
          <p className="mt-1 text-lg font-semibold leading-none text-[#17324d]">{formatPercent(leadShare)}</p>
        </div>

        <div className="min-w-0">
          <Link to={leadPartner.href || '/bond/partners'} className="group block rounded-[18px] border border-[#d6e3ef] bg-white px-4 py-3.5 shadow-[0_10px_22px_rgba(15,35,57,0.035)] transition hover:-translate-y-0.5 hover:border-[#bdd0e1]">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#17324d]">{leadPartner.partner}</span>
                <span className="mt-1 block truncate text-xs font-medium text-[#71869d]">{leadPartner.sourceType} · {formatPercent(leadPartner.conversionRate)} conversion</span>
              </span>
              <span className="shrink-0 rounded-full border border-[#d9e7d9] bg-[#f3fbf4] px-2.5 py-1 text-xs font-semibold text-[#25714f]">
                Lead
              </span>
            </div>
          </Link>

          <div className="mt-3 space-y-2">
            {rows.map((partner, index) => {
              const share = Math.round((normalizeNumber(partner.applicationsReferred) / total) * 100)
              return (
                <Link key={partner.key} to={partner.href || '/bond/partners'} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3 rounded-[14px] border border-transparent px-2.5 py-2 transition hover:border-[#dce8f2] hover:bg-white">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PARTNER_PIE_COLORS[index % PARTNER_PIE_COLORS.length] }} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-[#17324d]">{partner.partner}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#e6eef6]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, share)}%`, backgroundColor: PARTNER_PIE_COLORS[index % PARTNER_PIE_COLORS.length] }} />
                      </span>
                    </span>
                  </span>
                  <span className="text-right text-xs font-semibold text-[#60758d]">{share}%</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[14px] border border-[#e1ebf4] bg-white px-3 py-2.5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[#74879b]">Partners</p>
          <p className="mt-1 text-sm font-semibold text-[#17324d]">{formatNumber(rows.length)}</p>
        </div>
        <div className="rounded-[14px] border border-[#e1ebf4] bg-white px-3 py-2.5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[#74879b]">Leader</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#17324d]">{leadPartner.partner}</p>
        </div>
        <Link to="/bond/partners" className="inline-flex min-h-[54px] items-center justify-between gap-3 rounded-[14px] border border-[#d6e3ef] bg-white px-3 py-2.5 text-sm font-semibold text-[#204b84] transition hover:border-[#bdd0e1] hover:bg-[#fbfdff]">
          Partner view
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}

function RevenueProgressRow({ label = '', valueLabel = '', value = 0, max = 1, color = '#24518a' }) {
  const width = max ? Math.max(4, Math.min(100, (normalizeNumber(value) / Math.max(normalizeNumber(max), 1)) * 100)) : 0
  return (
    <div className="rounded-[14px] border border-[#e2ebf4] bg-[#fbfdff] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#74879b]">{label}</span>
        <span className="truncate text-sm font-semibold text-[#17324d]">{valueLabel || 'Not enough data'}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf3f8]">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function RevenueOverview({ revenue = {} }) {
  const projected = normalizeNumber(revenue.projectedCommission)
  const confirmed = normalizeNumber(revenue.commissionConfirmed)
  const thisMonth = normalizeNumber(revenue.revenueThisMonth)
  const confirmedPercent = projected ? Math.round((confirmed / projected) * 100) : 0
  const thisMonthPercent = projected ? Math.round((thisMonth / projected) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="rounded-[16px] border border-[#dbe5f0] bg-[#fbfdff] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#74879b]">Projected</p>
            <p className="mt-1 truncate text-2xl font-semibold leading-none text-[#142132]">{revenue.projectedCommissionLabel || 'Not enough data'}</p>
          </div>
          <span className="shrink-0 rounded-full border border-[#d9e7d9] bg-[#f3fbf4] px-2.5 py-1 text-xs font-semibold text-[#25714f]">{formatPercent(confirmedPercent)} secured</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[12px] bg-white px-3 py-2 ring-1 ring-[#e2ebf4]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#74879b]">Confirmed</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#17324d]">{revenue.commissionConfirmedLabel || 'Not enough data'}</p>
          </div>
          <div className="rounded-[12px] bg-white px-3 py-2 ring-1 ring-[#e2ebf4]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#74879b]">90-Day Forecast</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#17324d]">{revenue.forecast90Day || 'Not enough data'}</p>
          </div>
        </div>
      </div>
      <RevenueProgressRow label="Confirmed" valueLabel={revenue.commissionConfirmedLabel} value={confirmed} max={projected} color="#2f7d55" />
      <RevenueProgressRow label="This Month" valueLabel={revenue.revenueThisMonthLabel} value={thisMonth} max={projected} color="#d8a34d" />
      <p className="text-[0.68rem] font-medium text-[#71869d]">{formatPercent(thisMonthPercent)} of projected commission is represented by this month’s movement.</p>
    </div>
  )
}

export function HqLowerInsightGrid({ leaderboard = {}, partners = [], revenue = {} }) {
  const topBranches = leaderboard.topBranches || []
  const attentionBranches = leaderboard.attentionBranches || []
  const topPartners = partners.slice(0, 4)

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <SectionCard
        eyebrow="Partner Performance"
        title="Top Partner Performance"
        description="Highest-value referral channels and partner sources."
        action={<Link to="/bond/partners" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View all</Link>}
      >
        <PartnerPieChart partners={topPartners} />
      </SectionCard>

      <SectionCard
        eyebrow="Revenue"
        title="Revenue Overview"
        description="Projected, confirmed and forecast commission at a glance."
        action={<Link to="/bond/revenue" className="shrink-0 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View report</Link>}
      >
        <RevenueOverview revenue={revenue} />
      </SectionCard>

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
