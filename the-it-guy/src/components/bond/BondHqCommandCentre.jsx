import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  Clock3,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  Layers3,
  LineChart,
  ShieldAlert,
  TrendingUp,
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

function findMetric(items = [], keys = [], fallbackIndex = 0) {
  const safeKeys = Array.isArray(keys) ? keys : [keys]
  return items.find((item) => safeKeys.includes(item?.key)) || items[fallbackIndex] || {}
}

function getAlert(alerts = [], keys = []) {
  const safeKeys = Array.isArray(keys) ? keys : [keys]
  return alerts.find((alert) => safeKeys.includes(alert.key)) || null
}

function getStageCount(funnel = {}, key = '') {
  const row = (funnel?.stages || []).find((stage) => stage.key === key)
  return normalizeNumber(row?.count)
}

function getStageSourceCount(funnel = {}, stageKey = '', sourceKey = '') {
  const row = (funnel?.stages || []).find((stage) => stage.key === stageKey)
  return normalizeNumber(row?.sourceBreakdown?.[sourceKey])
}

function getNumericFromLabel(value = '') {
  const numeric = String(value || '').replace(/[^\d.-]/g, '')
  return normalizeNumber(numeric)
}

function getRiskClass(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('high') || normalized.includes('danger')) return 'text-[#b42318]'
  if (normalized.includes('medium') || normalized.includes('watch') || normalized.includes('warning')) return 'text-[#b7791f]'
  return 'text-[#177245]'
}

function getKpiValueClass(key = '') {
  if (key.includes('time')) return 'text-[#142132]'
  if (key.includes('approval')) return 'text-[#142132]'
  return 'text-[#101828]'
}

function Sparkline({ values = [], color = '#2563eb' }) {
  const safeValues = values.length ? values.map((value) => normalizeNumber(value)) : [18, 22, 20, 28, 31, 29, 36, 44, 38, 34, 37, 41]
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)
  const points = safeValues.map((value, index) => {
    const x = (index / Math.max(safeValues.length - 1, 1)) * 100
    const y = 34 - ((value - min) / range) * 28
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 100 40" aria-hidden="true" className="h-12 w-full overflow-visible">
      <polyline fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" />
    </svg>
  )
}

function Donut({ segments = [], sizeClass = 'h-40 w-40', center = null }) {
  const total = segments.reduce((sum, segment) => sum + normalizeNumber(segment.value), 0)
  if (!total) {
    return (
      <div className={`${sizeClass} rounded-full bg-[#eef3f8]`} />
    )
  }
  const gradient = segments.reduce((accumulator, segment) => {
    const start = accumulator.cursor
    const share = (normalizeNumber(segment.value) / total) * 100
    const end = start + share
    accumulator.parts.push(`${segment.color} ${start}% ${end}%`)
    accumulator.cursor = end
    return accumulator
  }, { cursor: 0, parts: [] }).parts.join(', ')

  return (
    <div className={`relative flex ${sizeClass} items-center justify-center rounded-full`} style={{ background: `conic-gradient(${gradient})` }}>
      <div className="flex h-[58%] w-[58%] flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        {center}
      </div>
    </div>
  )
}

function HqCard({ children, className = '' }) {
  return (
    <section className={`rounded-[16px] bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.045)] ring-1 ring-[#e4edf5] ${className}`}>
      {children}
    </section>
  )
}

function SectionTitle({ children, action = null }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-[22px] font-bold tracking-[-0.01em] text-[#142132]">{children}</h2>
      {action}
    </div>
  )
}

function CardLabel({ children }) {
  return (
    <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#71869d]">{children}</p>
  )
}

function DataTable({ columns = [], rows = [], emptyLabel = 'Not enough data.' }) {
  if (!rows.length) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[16px] bg-[#f8fbfe] text-sm font-medium text-[#64748b]">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`border-b border-[#e6eef6] pb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#71869d] ${column.align === 'right' ? 'text-right' : ''}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.key || row.region || row.branch || row.partner || rowIndex}>
              {columns.map((column) => (
                <td key={column.key} className={`border-b border-[#edf3f8] py-3 text-sm font-medium text-[#17324d] last:border-b-0 ${column.align === 'right' ? 'text-right' : ''}`}>
                  {typeof column.render === 'function' ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function BondHqCommandCentre({ snapshot = {} }) {
  const hq = snapshot.hqCommandCentre || {}

  return (
    <div className="mx-auto max-w-[1600px] px-0 pb-8">
      <div className="grid grid-cols-12 gap-6">
        <NationalCommandCentre items={hq.nationalSnapshot || []} />
        <OperationalHealth alerts={hq.alerts || []} funnel={hq.pipelineFunnel} />
        <NationalPipelineFlow funnel={hq.pipelineFunnel} />
        <PerformanceLayer
          regions={hq.regionalPerformance || []}
          leaderboard={hq.branchLeaderboard || {}}
        />
        <PartnerIntelligence partners={hq.partnerPerformance || []} />
        <RevenueIntelligence revenue={hq.revenue || {}} />
      </div>
    </div>
  )
}

export function HqKpiGrid({ items = [] }) {
  return <NationalCommandCentre items={items} />
}

function NationalCommandCentre({ items = [] }) {
  const active = findMetric(items, ['active_applications', 'active_book'], 0)
  const approval = findMetric(items, ['approval_rate'], 2)
  const pipeline = findMetric(items, ['pipeline_value', 'bond_value'], 4)
  const approvalTime = findMetric(items, ['average_approval_time', 'avg_approval_time'], 3)
  const kpis = [
    { ...active, label: 'Active Book', icon: Layers3, color: '#2563eb' },
    { ...approval, label: 'Approval Rate', icon: Gauge, color: '#2f9e62' },
    { ...pipeline, label: 'Pipeline Value', icon: Banknote, color: '#7c5ce5' },
    { ...approvalTime, label: 'Avg Approval Time', icon: Clock3, color: '#f59e0b' },
  ]

  return (
    <section className="col-span-12 mt-0">
      <SectionTitle>National Command Centre</SectionTitle>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon
          return (
            <HqCard key={item.key || item.label} className="flex min-h-[230px] flex-col">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#f2f6fb] text-[#17324d]">
                  <Icon size={20} />
                </span>
              </div>
              <CardLabel>{item.label}</CardLabel>
              <p className={`mt-2 text-[42px] font-bold leading-none tracking-[-0.03em] ${getKpiValueClass(item.key)}`}>{item.value || '0'}</p>
              <p className="mt-3 text-sm font-semibold text-[#177245]">{item.trend || 'Tracking'} <span className="font-medium text-[#64748b]">vs last month</span></p>
              <div className="mt-auto pt-6">
                <Sparkline values={item.sparkline} color={item.color} />
              </div>
            </HqCard>
          )
        })}
      </div>
    </section>
  )
}

export function HqExecutiveAlerts({ alerts = [], funnel = {} }) {
  return <OperationalHealth alerts={alerts} funnel={funnel} />
}

function OperationalHealth({ alerts = [], funnel = {} }) {
  const missingDocs = normalizeNumber(getAlert(alerts, 'missing_docs')?.value)
  const awaitingOtp = normalizeNumber(getAlert(alerts, 'awaiting_otp')?.value, getStageSourceCount(funnel, 'intake', 'awaiting_otp'))
  const unassigned = normalizeNumber(getAlert(alerts, 'unassigned')?.value)
  const slaBreaches = normalizeNumber(getAlert(alerts, ['sla', 'sla_breaches'])?.value)
  const pressure = missingDocs + awaitingOtp + unassigned + slaBreaches
  const healthScore = Math.max(0, Math.min(100, 100 - (pressure * 4)))
  const healthLabel = healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'Stable' : 'Needs Attention'
  const healthColor = healthScore >= 80 ? '#2f9e62' : healthScore >= 60 ? '#d8a34d' : '#e34b5f'
  const metrics = [
    { label: 'Missing Docs', value: missingDocs, icon: FileText, helper: 'Needs attention', color: '#f59e0b' },
    { label: 'Awaiting OTP', value: awaitingOtp, icon: Clock3, helper: 'Monitor', color: '#2563eb' },
    { label: 'Unassigned', value: unassigned, icon: UsersRound, helper: 'Monitor', color: '#7c5ce5' },
    { label: 'SLA Breaches', value: slaBreaches, icon: ShieldAlert, helper: 'High priority', color: '#e34b5f' },
  ]

  return (
    <section className="col-span-12 mt-8">
      <SectionTitle
        action={(
          <Link to="/bond/reports?view=executive-risk" className="inline-flex items-center gap-2 rounded-[12px] bg-[#f5f8fc] px-4 py-2 text-sm font-semibold text-[#17324d] transition hover:bg-[#edf3f8]">
            View All Issues <ArrowRight size={16} />
          </Link>
        )}
      >
        Operational Health
      </SectionTitle>
      <HqCard>
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)_160px] lg:items-center">
          <div className="flex items-center gap-5">
            <Donut
              segments={[
                { label: 'Health', value: healthScore, color: healthColor },
                { label: 'Remaining', value: 100 - healthScore, color: '#e8eef5' },
              ]}
              sizeClass="h-36 w-36"
              center={(
                <>
                  <strong className="text-3xl font-bold leading-none text-[#142132]">{formatPercent(healthScore)}</strong>
                  <span className="mt-1 text-xs font-semibold text-[#64748b]">{healthLabel}</span>
                </>
              )}
            />
            <div className="min-w-0">
              <CardLabel>Health Score</CardLabel>
              <p className="mt-2 text-xl font-bold text-[#142132]">{healthLabel}</p>
              <p className="mt-2 text-sm leading-6 text-[#64748b]">National operations are running with {formatNumber(pressure)} active pressure signals.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon
              return (
                <Link key={metric.label} to="/bond/reports?view=executive-risk" className="group min-h-[112px] rounded-[16px] bg-[#f8fbfe] p-4 transition hover:bg-[#f1f6fb]">
                  <Icon size={23} color={metric.color} />
                  <p className="mt-3 text-[28px] font-bold leading-none text-[#142132]">{formatNumber(metric.value)}</p>
                  <p className="mt-2 text-sm font-semibold text-[#17324d]">{metric.label}</p>
                  <p className="mt-1 text-xs font-medium text-[#64748b]">{metric.helper}</p>
                </Link>
              )
            })}
          </div>

          <Link to="/bond/reports?view=executive-risk" className="hidden min-h-[112px] items-center justify-center rounded-[16px] bg-[#07183f] px-5 text-center text-sm font-bold text-white shadow-[0_16px_30px_rgba(7,24,63,0.18)] transition hover:bg-[#102a63] lg:flex">
            View All Issues
          </Link>
        </div>
      </HqCard>
    </section>
  )
}

const PIPELINE_STAGE_CONFIG = [
  { key: 'intake', label: 'Intake', icon: FileText, color: '#2563eb' },
  { key: 'application_prep', label: 'Application Prep', icon: LineChart, color: '#2f9e62' },
  { key: 'review_submit', label: 'Review & Submit', icon: FileCheck2, color: '#7c5ce5' },
  { key: 'bank_decision', label: 'Bank Decision', icon: Landmark, color: '#f59e0b' },
  { key: 'registration', label: 'Registration', icon: Building2, color: '#0f766e' },
]

export function HqPipelineFlow({ funnel = {} }) {
  return <NationalPipelineFlow funnel={funnel} />
}

function NationalPipelineFlow({ funnel = {} }) {
  const configByKey = new Map(PIPELINE_STAGE_CONFIG.map((stage) => [stage.key, stage]))
  const stagesByKey = new Map((funnel?.stages || []).map((stage) => [stage.key, stage]))
  const stageRows = PIPELINE_STAGE_CONFIG.map((config) => {
    const stage = stagesByKey.get(config.key) || {}
    return {
      ...config,
      ...stage,
      label: stage.label || config.label,
      icon: config.icon,
      color: config.color,
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
    <section className="col-span-12 mt-8">
      <SectionTitle action={<Link to="/bond/pipeline" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View pipeline</Link>}>National Pipeline Flow</SectionTitle>
      <HqCard>
        <div className="overflow-x-auto pb-1">
          <ol className="grid min-w-[920px] grid-cols-5 gap-6">
            {stageRows.map((stage, index) => {
              const Icon = stage.icon
              return (
                <li key={stage.key} className="relative">
                  {index < stageRows.length - 1 ? (
                    <span className="pointer-events-none absolute left-[calc(50%+30px)] top-16 h-px w-[calc(100%-28px)] bg-[#dbe6f0]" />
                  ) : null}
                  <Link to={stage.href} className="relative z-10 flex min-h-[180px] flex-col rounded-[16px] bg-[#f8fbfe] p-6 transition hover:-translate-y-0.5 hover:bg-[#f2f7fc]">
                    <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-white text-[#17324d] shadow-sm">
                      <Icon size={22} color={stage.color} />
                    </span>
                    <p className="mt-5 text-base font-bold text-[#17324d]">{stage.label}</p>
                    <p className="mt-3 text-[38px] font-bold leading-none tracking-[-0.03em] text-[#101828]">{formatNumber(stage.count)}</p>
                    <div className="mt-auto pt-5">
                      <div className="h-2 overflow-hidden rounded-full bg-[#e6eef6]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, (stage.count / maxCount) * 100))}%`, backgroundColor: stage.color }} />
                      </div>
                      <p className="mt-3 text-sm font-semibold" style={{ color: stage.color }}>{formatPercent(stage.conversionRate)} conversion</p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryBlock label="Overall Conversion" value={formatPercent(overallConversion)} />
          <SummaryBlock label="Biggest Bottleneck" value={funnel?.bottleneckStage || 'Not enough data'} tone="warning" />
          <SummaryBlock label="Highest Volume Stage" value={highestStage?.label || 'Not enough data'} tone="info" />
        </div>
      </HqCard>
    </section>
  )
}

function SummaryBlock({ label = '', value = '', tone = 'default' }) {
  const toneClass = tone === 'warning' ? 'text-[#9b640f]' : tone === 'info' ? 'text-[#204b84]' : 'text-[#142132]'
  return (
    <div className="rounded-[16px] bg-[#f8fbfe] p-5">
      <CardLabel>{label}</CardLabel>
      <p className={`mt-2 truncate text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

export function HqRegionalPerformance({ rows = [] }) {
  return <PerformanceLayer regions={rows} leaderboard={{}} />
}

function PerformanceLayer({ regions = [], leaderboard = {} }) {
  const branchRows = leaderboard.topBranches || []
  const regionalColumns = [
    { key: 'region', label: 'Region' },
    { key: 'activeApplications', label: 'Active Book', align: 'right', render: (row) => formatNumber(row.activeApplications) },
    { key: 'approvalRate', label: 'Approval %', align: 'right', render: (row) => formatPercent(row.approvalRate) },
    { key: 'pipelineValueLabel', label: 'Pipeline Value', align: 'right', render: (row) => row.pipelineValueLabel || 'Pending' },
    { key: 'riskLevel', label: 'Risk', align: 'right', render: (row) => <span className={`font-bold ${getRiskClass(row.riskLevel)}`}>{row.riskLevel || 'Tracking'}</span> },
  ]
  const branchColumns = [
    { key: 'branch', label: 'Branch' },
    { key: 'activeApplications', label: 'Applications', align: 'right', render: (row) => formatNumber(row.activeApplications) },
    { key: 'approvalRate', label: 'Approval %', align: 'right', render: (row) => formatPercent(row.approvalRate) },
    { key: 'projectedCommissionLabel', label: 'Revenue', align: 'right', render: (row) => row.projectedCommissionLabel || row.pipelineValueLabel || 'Pending' },
  ]

  return (
    <section className="col-span-12 mt-8">
      <SectionTitle>Performance Layer</SectionTitle>
      <div className="grid gap-6 xl:grid-cols-2">
        <HqCard className="min-h-[430px]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <CardLabel>Regional Performance</CardLabel>
              <p className="mt-1 text-sm text-[#64748b]">Regional book quality and pipeline pressure.</p>
            </div>
            <Link to="/bond/organisation?view=regions" className="text-sm font-semibold text-[#204b84]">View regions</Link>
          </div>
          <DataTable columns={regionalColumns} rows={regions.slice(0, 6)} emptyLabel="Regional data will appear once applications are assigned." />
        </HqCard>

        <HqCard className="min-h-[430px]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <CardLabel>Top Performing Branches</CardLabel>
              <p className="mt-1 text-sm text-[#64748b]">Highest-performing operating branches.</p>
            </div>
            <Link to="/bond/organisation?view=branches" className="text-sm font-semibold text-[#204b84]">View all</Link>
          </div>
          <DataTable columns={branchColumns} rows={branchRows.slice(0, 6)} emptyLabel="Branch performance data is not available yet." />
        </HqCard>
      </div>
    </section>
  )
}

function PartnerIntelligence({ partners = [] }) {
  const topPartners = partners.slice(0, 6)
  const highRisk = partners.filter((partner) => normalizeNumber(partner.conversionRate) < 30).length
  const mediumRisk = partners.filter((partner) => normalizeNumber(partner.conversionRate) >= 30 && normalizeNumber(partner.conversionRate) < 50).length
  const healthy = partners.filter((partner) => normalizeNumber(partner.conversionRate) >= 50).length
  const riskSegments = [
    { label: 'Healthy', value: healthy, color: '#2f9e62' },
    { label: 'Medium Risk', value: mediumRisk, color: '#f59e0b' },
    { label: 'High Risk', value: highRisk, color: '#e34b5f' },
  ]
  const columns = [
    { key: 'partner', label: 'Partner' },
    { key: 'applicationsReferred', label: 'Applications', align: 'right', render: (row) => formatNumber(row.applicationsReferred) },
    { key: 'conversionRate', label: 'Conversion', align: 'right', render: (row) => formatPercent(row.conversionRate) },
    { key: 'pipelineValueLabel', label: 'Pipeline Value', align: 'right', render: (row) => row.pipelineValueLabel || 'Pending' },
  ]

  return (
    <section className="col-span-12 mt-8">
      <SectionTitle>Partner Intelligence</SectionTitle>
      <div className="grid gap-6 xl:grid-cols-2">
        <HqCard className="min-h-[410px]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <CardLabel>Top Partner Performance</CardLabel>
              <p className="mt-1 text-sm text-[#64748b]">Partner channels driving application volume.</p>
            </div>
            <Link to="/bond/partners" className="text-sm font-semibold text-[#204b84]">View all</Link>
          </div>
          <DataTable columns={columns} rows={topPartners} emptyLabel="Partner performance data is not available yet." />
        </HqCard>

        <HqCard className="min-h-[410px]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <CardLabel>Partner Risk Overview</CardLabel>
              <p className="mt-1 text-sm text-[#64748b]">Conversion health across partner sources.</p>
            </div>
            <Link to="/bond/partners?view=risk" className="text-sm font-semibold text-[#204b84]">View all</Link>
          </div>
          <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
            <Donut
              segments={riskSegments}
              sizeClass="h-48 w-48"
              center={(
                <>
                  <strong className="text-3xl font-bold text-[#142132]">{formatNumber(partners.length)}</strong>
                  <span className="text-xs font-semibold text-[#64748b]">Partners</span>
                </>
              )}
            />
            <div className="space-y-3">
              {riskSegments.map((segment) => (
                <div key={segment.label} className="flex items-center justify-between gap-4 rounded-[14px] bg-[#f8fbfe] px-4 py-3">
                  <span className="flex items-center gap-3 text-sm font-semibold text-[#17324d]">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                    {segment.label}
                  </span>
                  <span className="text-sm font-bold text-[#142132]">{formatNumber(segment.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <QuickAction to="/bond/partners">View Partner Network</QuickAction>
            <QuickAction to="/bond/partners?view=growth">Partner Growth</QuickAction>
            <QuickAction to="/bond/partners?view=risk">Partner Risk</QuickAction>
          </div>
        </HqCard>
      </div>
    </section>
  )
}

function QuickAction({ to = '#', children }) {
  return (
    <Link to={to} className="inline-flex min-h-12 items-center justify-center rounded-[14px] bg-[#f5f8fc] px-4 text-sm font-bold text-[#17324d] transition hover:bg-[#edf3f8]">
      {children}
    </Link>
  )
}

export function HqLowerInsightGrid({ leaderboard = {}, partners = [], revenue = {} }) {
  return (
    <>
      <PerformanceLayer regions={[]} leaderboard={leaderboard} />
      <PartnerIntelligence partners={partners} />
      <RevenueIntelligence revenue={revenue} />
    </>
  )
}

function RevenueIntelligence({ revenue = {} }) {
  const projected = getNumericFromLabel(revenue.projectedCommissionLabel || revenue.projectedCommission)
  const confirmed = getNumericFromLabel(revenue.commissionConfirmedLabel || revenue.commissionConfirmed)
  const forecast = getNumericFromLabel(revenue.forecast90Day)
  const confirmedPercent = projected ? Math.round((confirmed / projected) * 100) : 0
  const commissionSegments = [
    { label: 'Bank Commission', value: confirmed || 1, valueLabel: revenue.commissionConfirmedLabel || 'Pending', color: '#24518a' },
    { label: 'Partner Commission', value: Math.max(projected - confirmed, 0), valueLabel: projected ? `R ${formatNumber(Math.max(projected - confirmed, 0))}` : 'Pending', color: '#8b5cf6' },
    { label: 'Other Income', value: Math.max(forecast - projected, 0), valueLabel: forecast ? `R ${formatNumber(Math.max(forecast - projected, 0))}` : 'Pending', color: '#2f9e62' },
  ]

  return (
    <section className="col-span-12 mt-8">
      <SectionTitle action={<Link to="/bond/revenue" className="text-sm font-semibold text-[#204b84]">View full report</Link>}>Revenue Intelligence</SectionTitle>
      <div className="grid gap-6 xl:grid-cols-3">
        <HqCard className="min-h-[360px]">
          <CardLabel>Revenue Projection</CardLabel>
          <p className="mt-4 text-[40px] font-bold leading-none tracking-[-0.03em] text-[#101828]">{revenue.projectedCommissionLabel || 'Pending'}</p>
          <p className="mt-3 text-sm font-semibold text-[#177245]">{formatPercent(confirmedPercent)} secured</p>
          <div className="mt-8 grid gap-4">
            <RevenueStat label="Confirmed" value={revenue.commissionConfirmedLabel || 'Pending'} />
            <RevenueStat label="90-Day Forecast" value={revenue.forecast90Day || 'Pending'} />
          </div>
        </HqCard>

        <HqCard className="min-h-[360px]">
          <CardLabel>Commission Breakdown</CardLabel>
          <div className="mt-6 grid gap-6 md:grid-cols-[170px_minmax(0,1fr)] md:items-center xl:grid-cols-1 2xl:grid-cols-[170px_minmax(0,1fr)]">
            <Donut
              segments={commissionSegments}
              sizeClass="h-40 w-40"
              center={(
                <>
                  <strong className="text-xl font-bold text-[#142132]">{revenue.commissionConfirmedLabel || 'Pending'}</strong>
                  <span className="text-xs font-semibold text-[#64748b]">Confirmed</span>
                </>
              )}
            />
            <div className="space-y-3">
              {commissionSegments.map((segment) => (
                <div key={segment.label} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#17324d]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                    <span className="truncate">{segment.label}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-[#142132]">{segment.valueLabel}</span>
                </div>
              ))}
            </div>
          </div>
        </HqCard>

        <HqCard className="min-h-[360px]">
          <div className="flex items-start justify-between gap-4">
            <CardLabel>Revenue Trend</CardLabel>
            <Link to="/bond/revenue?view=trend" className="text-sm font-semibold text-[#204b84]">View trend</Link>
          </div>
          <div className="mt-8">
            <Sparkline values={[8, 10, 9, 14, 16, 18, 24, 27, 32, 36, 42, 51]} color="#2563eb" />
          </div>
          <div className="mt-8 grid grid-cols-4 gap-3 text-sm font-semibold text-[#64748b]">
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
          </div>
          <div className="mt-8 flex items-center gap-3 text-[#177245]">
            <TrendingUp size={18} />
            <span className="text-sm font-bold">Revenue momentum improving over 90 days</span>
          </div>
        </HqCard>
      </div>
    </section>
  )
}

function RevenueStat({ label = '', value = '' }) {
  return (
    <div className="rounded-[16px] bg-[#f8fbfe] p-4">
      <CardLabel>{label}</CardLabel>
      <p className="mt-2 text-xl font-bold text-[#142132]">{value}</p>
    </div>
  )
}

export function HqEmptyState({ title = 'Not enough data', description = 'Not enough data.' }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[16px] bg-[#f8fbfe] p-6 text-center">
      <AlertTriangle size={22} className="text-[#d8a34d]" />
      <p className="mt-3 text-sm font-bold text-[#17324d]">{title}</p>
      <p className="mt-1 text-sm text-[#64748b]">{description}</p>
    </div>
  )
}
