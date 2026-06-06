import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  Landmark,
  Layers3,
  LineChart,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UsersRound,
} from 'lucide-react'
import { createElement } from 'react'
import { Link } from 'react-router-dom'
import NetworkIntelligencePanel from './NetworkIntelligencePanel'

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

function formatCompactMoney(value, fallback = 'Pending') {
  if (value === null || value === undefined || value === '') return fallback
  const amount = normalizeNumber(value, 0)
  if (!amount) return fallback
  if (amount >= 1000000) return `R${Math.round((amount / 1000000) * 10) / 10}m`
  if (amount >= 1000) return `R${Math.round(amount / 1000)}k`
  return `R${formatNumber(amount)}`
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

function getInitials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'HQ'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
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

function formatTrendLabel(value = '') {
  const trend = String(value || 'Tracking').trim()
  return trend.toLowerCase().includes('last month') ? trend : `${trend} vs last month`
}

function MicroTrend({ values = [], color = '#2563eb' }) {
  const safeValues = (values.length ? values : [18, 22, 20, 28, 31, 29, 36, 44]).slice(-8).map((value) => normalizeNumber(value))
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)

  return (
    <div className="flex h-9 items-end gap-1.5" aria-hidden="true">
      {safeValues.map((value, index) => {
        const height = 8 + ((value - min) / range) * 22
        return (
          <span
            key={`${value}-${index}`}
            className="flex-1 rounded-full"
            style={{ height: `${height}px`, backgroundColor: index === safeValues.length - 1 ? color : '#dbe6f0' }}
          />
        )
      })}
    </div>
  )
}

const KPI_TONES = {
  green: {
    accent: '#18a058',
    icon: 'bg-[#edfdf4] text-[#149650] ring-[#d8f5e3]',
    status: 'text-[#149650]',
    dot: '#2ebd69',
    panel: 'bg-[linear-gradient(180deg,rgba(232,250,240,0.78)_0%,rgba(247,253,250,0.96)_100%)] ring-[#d6f2e1]',
    wash: 'bg-[radial-gradient(circle_at_12%_18%,rgba(34,197,94,0.12),transparent_36%),linear-gradient(180deg,#ffffff_0%,#f8fffb_100%)]',
    line: '#78d89a',
    fill: 'rgba(34,197,94,0.14)',
  },
  blue: {
    accent: '#3b8edb',
    icon: 'bg-[#eef7ff] text-[#2b76b9] ring-[#d9eafa]',
    status: 'text-[#f79009]',
    dot: '#3b8edb',
    panel: 'bg-[linear-gradient(180deg,rgba(239,247,255,0.72)_0%,rgba(250,253,255,0.96)_100%)] ring-[#dbe9f7]',
    wash: 'bg-[radial-gradient(circle_at_12%_18%,rgba(59,142,219,0.09),transparent_34%),linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]',
    line: '#80b9f2',
    fill: 'rgba(59,142,219,0.13)',
  },
  purple: {
    accent: '#8257e6',
    icon: 'bg-[#f3efff] text-[#7654dc] ring-[#e4dbff]',
    status: 'text-[#7c3aed]',
    dot: '#8257e6',
    panel: 'bg-[linear-gradient(180deg,rgba(245,240,255,0.72)_0%,rgba(253,251,255,0.96)_100%)] ring-[#e7ddff]',
    wash: 'bg-[radial-gradient(circle_at_12%_18%,rgba(130,87,230,0.1),transparent_34%),linear-gradient(180deg,#ffffff_0%,#fdfbff_100%)]',
    line: '#aa92f3',
    fill: 'rgba(130,87,230,0.14)',
  },
  orange: {
    accent: '#f97316',
    icon: 'bg-[#fff5ed] text-[#f97316] ring-[#fde3cf]',
    status: 'text-[#f97316]',
    dot: '#3b8edb',
    panel: 'bg-[linear-gradient(180deg,rgba(239,247,255,0.72)_0%,rgba(250,253,255,0.96)_100%)] ring-[#dbe9f7]',
    wash: 'bg-[radial-gradient(circle_at_12%_18%,rgba(249,115,22,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#fffdfb_100%)]',
    line: '#80b9f2',
    fill: 'rgba(59,142,219,0.13)',
  },
}

const hqKpis = [
  {
    label: 'Applications',
    value: '90',
    status: '+5.9% vs last month',
    detail: '90 active applications',
    tone: 'green',
    featured: true,
    icon: Layers3,
    sparkline: [14, 16, 15, 24, 28, 23, 24, 26, 42, 39, 35, 48],
    statusIcon: TrendingUp,
  },
  {
    label: 'Approval Rate',
    value: '3%',
    status: 'Needs attention',
    detail: '3 approved • 87 pending',
    tone: 'blue',
    icon: Gauge,
    sparkline: [18, 19, 18, 23, 22, 24, 23, 26, 25, 27, 26, 29],
    statusIcon: AlertTriangle,
  },
  {
    label: 'Pipeline Value',
    value: 'R199.8k',
    status: 'Active finance pipeline',
    detail: 'Across 90 applications',
    tone: 'purple',
    icon: Banknote,
    sparkline: [12, 14, 13, 22, 25, 24, 29, 40, 43, 42, 39, 52],
  },
  {
    label: 'Revenue Forecast',
    value: 'R22.96m',
    status: '+R7.65m vs last month',
    detail: 'Forward revenue view',
    tone: 'green',
    icon: LineChart,
    sparkline: [20, 28, 26, 31, 33, 37, 36, 45, 43, 48, 60, 55],
    statusIcon: TrendingUp,
  },
  {
    label: 'Avg Approval Time',
    value: '46 days',
    status: '38d over target',
    detail: 'Needs operational focus',
    tone: 'orange',
    icon: Clock3,
    sparkline: [13, 15, 14, 20, 19, 23, 22, 29, 28, 27, 31, 39],
    statusIcon: Clock3,
  },
]

function ExecutiveMiniTrend({ values = [], tone = {} }) {
  const safeValues = (values.length ? values : [16, 20, 18, 26, 30, 28, 35]).map((value) => normalizeNumber(value))
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 72 - 14
    return `${x},${y}`
  })
  const areaPoints = [`0,100`, ...points, `100,100`].join(' ')

  return (
    <svg className="absolute inset-x-3 bottom-0 h-[42px] w-[calc(100%-24px)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={areaPoints} fill={tone.fill} />
      <polyline points={points.join(' ')} fill="none" stroke={tone.line} strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
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
      <div className="flex h-[62%] w-[62%] flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        {center}
      </div>
    </div>
  )
}

function HqCard({ children, className = '' }) {
  return (
    <section className={`rounded-[16px] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.035)] ring-1 ring-[#dfe7ef] ${className}`}>
      {children}
    </section>
  )
}

function SectionTitle({ children, action = null }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-[20px] font-bold tracking-[-0.01em] text-[#142132]">{children}</h2>
      {action}
    </div>
  )
}

function CardLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">{children}</p>
  )
}

function DataTable({ columns = [], rows = [], emptyLabel = 'Not enough data.' }) {
  if (!rows.length) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[14px] bg-[#f8fafc] px-6 text-center text-sm font-medium text-[#64748b]">
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
  const health = buildOperationalHealthModel(hq)

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-0 pb-8">
      <ExecutiveHeader />
      <ExecutiveKpiStrip />
      <NetworkIntelligencePanel source={{ snapshot, hq }} />
      <OperationalAlerts alerts={hq.alerts || []} bankPerformance={hq.bankPerformance || {}} />
      <PipelineSnapshot funnel={hq.pipelineFunnel || {}} />
      <section className="grid gap-6 xl:grid-cols-[1.05fr_1fr_0.95fr]">
        <TopRegions rows={hq.regionalPerformance || []} />
        <TopConsultants rows={hq.topConsultants || hq.consultantPerformance || snapshot.teamPerformance || []} />
        <TopBanks bankPerformance={hq.bankPerformance || {}} />
      </section>
      <SystemFooter hq={hq} health={health} />
    </div>
  )
}

function ExecutiveHeader() {
  return (
    <header className="flex flex-wrap items-start justify-end gap-4">
      <div className="flex flex-wrap gap-2">
        <HeaderControl icon={CalendarDays}>Date Range</HeaderControl>
        <HeaderControl icon={Filter}>Filters</HeaderControl>
        <HeaderControl icon={RefreshCw}>Refresh</HeaderControl>
        <HeaderControl icon={Download}>Export</HeaderControl>
      </div>
    </header>
  )
}

function HeaderControl({ icon: Icon, children }) {
  return (
    <button type="button" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d8e2ec] bg-white px-3 text-sm font-semibold text-[#17324d] shadow-[0_6px_16px_rgba(15,23,42,0.035)] transition hover:bg-[#f8fafc]">
      {createElement(Icon, { size: 15 })}
      {children}
    </button>
  )
}

function buildOperationalHealthModel(hq = {}) {
  const alerts = hq.alerts || []
  const hasOperationalData = Boolean(
    (hq.nationalSnapshot || []).some((item) => getNumericFromLabel(item.value) > 0) ||
      (hq.pipelineFunnel?.stages || []).some((stage) => normalizeNumber(stage.count) > 0) ||
      (hq.regionalPerformance || []).length ||
      (hq.bankPerformance?.rows || []).length,
  )
  const missingDocs = normalizeNumber(getAlert(alerts, 'missing_docs')?.value)
  const awaitingOtp = normalizeNumber(getAlert(alerts, 'awaiting_otp')?.value, getStageSourceCount(hq.pipelineFunnel, 'intake', 'awaiting_otp'))
  const unassigned = normalizeNumber(getAlert(alerts, 'unassigned')?.value)
  const slaBreaches = normalizeNumber(getAlert(alerts, ['sla', 'sla_breaches'])?.value)
  const highRiskBranches = normalizeNumber(getAlert(alerts, ['branches', 'high_risk_branches'])?.value)
  const bankDelays = (hq.bankPerformance?.rows || []).filter((row) => normalizeNumber(row.averageResponseTime) >= 48).length
  const staleApplications = normalizeNumber(getAlert(alerts, ['stale', 'stale_applications'])?.value)
  const noNextAction = normalizeNumber(getAlert(alerts, ['no_next_action', 'next_action'])?.value)
  const pressure =
    slaBreaches * 9 +
    bankDelays * 7 +
    highRiskBranches * 6 +
    missingDocs * 2 +
    awaitingOtp * 3 +
    unassigned * 5 +
    staleApplications * 4 +
    noNextAction * 4
  if (!hasOperationalData && pressure === 0) {
    return {
      score: null,
      status: 'Baseline Pending',
      pressureSignals: 0,
      metrics: { missingDocs, awaitingOtp, unassigned, slaBreaches, highRiskBranches, bankDelays, staleApplications, noNextAction },
    }
  }
  const score = Math.max(0, Math.min(100, 100 - pressure))
  const status = score >= 90 ? 'Excellent' : score >= 75 ? 'Stable' : score >= 60 ? 'Needs Attention' : 'Critical'
  return {
    score,
    status,
    pressureSignals: missingDocs + awaitingOtp + unassigned + slaBreaches + highRiskBranches + bankDelays + staleApplications + noNextAction,
    metrics: { missingDocs, awaitingOtp, unassigned, slaBreaches, highRiskBranches, bankDelays, staleApplications, noNextAction },
  }
}

function ExecutiveKpiStrip() {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 2xl:gap-5">
      {hqKpis.map((item) => {
        const tone = KPI_TONES[item.tone] || KPI_TONES.blue
        const Icon = item.icon
        const StatusIcon = item.statusIcon
        return (
          <article
            key={item.label}
            className={`flex h-[220px] min-w-0 flex-col overflow-hidden rounded-[20px] border p-4 shadow-[0_18px_42px_rgba(15,23,42,0.07)] ring-1 transition ${tone.wash} ${
              item.featured
                ? 'border-[#24b86f] shadow-[0_22px_48px_rgba(22,163,74,0.16)] ring-[#bdeccd]'
                : 'border-[rgba(15,23,42,0.08)] ring-[#e4ebf2]'
            }`}
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ring-1 ${tone.icon}`}>
                <Icon size={19} strokeWidth={2.4} />
              </span>
            </div>

            <div className="mt-4 min-w-0">
              <p className="whitespace-nowrap text-[clamp(0.58rem,0.62vw,0.7rem)] font-bold uppercase leading-4 tracking-[0.13em] text-[#526178] 2xl:tracking-[0.2em]">{item.label}</p>
              <p className="mt-2 max-w-full whitespace-nowrap text-[clamp(1.75rem,2.2vw,3.4rem)] font-bold leading-none tracking-normal text-[#07142b]">
                {item.value}
              </p>
              <p className={`mt-2 flex min-w-0 items-center gap-1.5 text-[clamp(0.68rem,0.72vw,0.86rem)] font-bold leading-5 ${tone.status}`}>
                {StatusIcon ? <StatusIcon size={14} className="shrink-0" strokeWidth={2.5} /> : null}
                <span className="min-w-0 break-words">{item.status}</span>
              </p>
            </div>

            <div className={`relative mt-auto h-[64px] overflow-hidden rounded-[15px] px-3 pt-3 ring-1 ${tone.panel}`}>
              <p className="relative z-10 flex min-w-0 items-center gap-2 text-[clamp(0.68rem,0.7vw,0.84rem)] font-bold leading-4 text-[#0f1f36]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} />
                <span className="min-w-0 break-words">{item.detail}</span>
              </p>
              <ExecutiveMiniTrend values={item.sparkline} tone={tone} />
            </div>
          </article>
        )
      })}
    </section>
  )
}

function OperationalAlerts({ alerts = [], bankPerformance = {} }) {
  const rows = [
    {
      key: 'awaiting_otp',
      label: 'Applications waiting for OTP',
      value: normalizeNumber(getAlert(alerts, 'awaiting_otp')?.value),
      severity: 'Needs attention',
      href: '/bond/pipeline?view=all',
    },
    {
      key: 'sla',
      label: 'Applications exceeded SLA',
      value: normalizeNumber(getAlert(alerts, ['sla', 'sla_breaches'])?.value),
      severity: 'High priority',
      href: '/bond/reports?view=sla-breaches',
    },
    {
      key: 'bank_delays',
      label: 'Bank response delays',
      value: (bankPerformance.rows || []).filter((row) => normalizeNumber(row.averageResponseTime) >= 48).length,
      severity: 'Monitor',
      href: '/bond/banks',
    },
    {
      key: 'unassigned',
      label: 'Unassigned applications',
      value: normalizeNumber(getAlert(alerts, 'unassigned')?.value),
      severity: 'Needs owner',
      href: '/bond/applications?filter=unassigned',
    },
    {
      key: 'missing_docs',
      label: 'Missing documents',
      value: normalizeNumber(getAlert(alerts, 'missing_docs')?.value),
      severity: 'Needs attention',
      href: '/bond/pipeline?view=awaiting-docs',
    },
  ]

  return (
    <section>
      <SectionTitle action={<Link to="/bond/reports?view=executive-risk" className="inline-flex items-center gap-2 text-sm font-semibold text-[#204b84]">View all alerts <ArrowRight size={15} /></Link>}>
        Operational Alerts
      </SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => {
          const clear = row.value === 0
          return (
            <Link key={row.key} to={row.href} className="rounded-[16px] border border-[#dfe7ef] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.03)] transition hover:border-[#bfd0e1] hover:bg-[#fbfdff]">
              <div className="flex items-start justify-between gap-3">
                <p className={`text-[28px] font-semibold leading-none ${clear ? 'text-[#166534]' : row.key === 'sla' ? 'text-[#b42318]' : 'text-[#111827]'}`}>{formatNumber(row.value)}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${clear ? 'bg-[#ecfdf3] text-[#027a48]' : row.key === 'sla' ? 'bg-[#fef3f2] text-[#b42318]' : 'bg-[#fffaeb] text-[#b54708]'}`}>
                  {clear ? 'No action required' : row.severity}
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-[#17324d]">{row.label}</p>
              <p className="mt-2 text-xs font-semibold text-[#204b84]">Open queue</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

const EXECUTIVE_PIPELINE_CONFIG = [
  { key: 'intake', label: 'Intake', icon: FileText, color: '#2563eb' },
  { key: 'documents', label: 'Documents', icon: FileCheck2, color: '#0f766e' },
  { key: 'submitted', label: 'Submitted', icon: Layers3, color: '#7c3aed' },
  { key: 'bank_review', label: 'Bank Review', icon: Landmark, color: '#b45309' },
  { key: 'approved', label: 'Approved', icon: Gauge, color: '#15803d' },
  { key: 'instruction', label: 'Instruction', icon: Building2, color: '#24518a' },
]

function buildExecutivePipelineRows(funnel = {}) {
  const applicationPrepCount = getStageCount(funnel, 'application_prep')
  const reviewSubmitCount = getStageCount(funnel, 'review_submit')
  const bankDecisionCount = getStageCount(funnel, 'bank_decision')
  return [
    { key: 'intake', count: getStageCount(funnel, 'intake'), trend: `${formatPercent(getStageSourceCount(funnel, 'intake', 'awaiting_otp'))} awaiting OTP` },
    { key: 'documents', count: applicationPrepCount, trend: `${formatNumber(getStageSourceCount(funnel, 'application_prep', 'awaiting_documents'))} awaiting docs` },
    { key: 'submitted', count: reviewSubmitCount, trend: `${formatNumber(getStageSourceCount(funnel, 'review_submit', 'submitted_to_banks'))} submitted to banks` },
    { key: 'bank_review', count: bankDecisionCount, trend: `${formatNumber(getStageSourceCount(funnel, 'bank_decision', 'bank_feedback'))} awaiting feedback` },
    { key: 'approved', count: getStageSourceCount(funnel, 'bank_decision', 'approved'), trend: 'Approved offers' },
    { key: 'instruction', count: getStageCount(funnel, 'registration'), trend: 'Instruction or registration' },
  ].map((row) => ({ ...EXECUTIVE_PIPELINE_CONFIG.find((item) => item.key === row.key), ...row }))
}

function PipelineSnapshot({ funnel = {} }) {
  const rows = buildExecutivePipelineRows(funnel)
  const maxCount = Math.max(...rows.map((row) => row.count), 1)

  return (
    <section>
      <SectionTitle action={<Link to="/bond/pipeline" className="text-sm font-semibold text-[#204b84]">View pipeline</Link>}>Pipeline Snapshot</SectionTitle>
      <HqCard>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {rows.map((row) => {
            const Icon = row.icon
            const width = Math.max(4, Math.min(100, (row.count / maxCount) * 100))
            return (
              <Link key={row.key} to="/bond/pipeline" className="rounded-[14px] bg-[#f8fafc] p-4 transition hover:bg-[#f1f5f9]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white ring-1 ring-[#e2e8f0]">
                  <Icon size={16} color={row.color} />
                </span>
                <p className="mt-4 text-sm font-semibold text-[#17324d]">{row.label}</p>
                <p className="mt-2 text-[28px] font-semibold leading-none text-[#111827]">{formatNumber(row.count)}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <span className="block h-full rounded-full" style={{ width: `${width}%`, backgroundColor: row.color }} />
                </div>
                <p className="mt-3 truncate text-xs font-medium text-[#64748b]">{row.trend}</p>
              </Link>
            )
          })}
        </div>
      </HqCard>
    </section>
  )
}

function TopRegions({ rows = [] }) {
  const topRows = [...rows]
    .sort((left, right) => getNumericFromLabel(right.pipelineValueLabel || right.pipelineValue) - getNumericFromLabel(left.pipelineValueLabel || left.pipelineValue))
    .slice(0, 5)
  const maxValue = Math.max(...topRows.map((row) => getNumericFromLabel(row.pipelineValueLabel || row.pipelineValue)), 1)

  return (
    <HqCard className="min-h-[390px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Top Regions</CardLabel>
          <p className="mt-1 text-sm text-[#64748b]">Ranked by national pipeline value.</p>
        </div>
        <Link to="/bond/organisation?view=regions" className="text-sm font-semibold text-[#204b84]">View all regions</Link>
      </div>
      {!topRows.length ? <HqEmptyState title="No regional performance yet." description="Region rankings will appear once applications are assigned to regional structures." /> : (
        <div className="space-y-4">
          {topRows.map((row) => {
            const value = getNumericFromLabel(row.pipelineValueLabel || row.pipelineValue)
            return (
              <div key={row.key || row.region} className="grid gap-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="truncate text-sm font-semibold text-[#17324d]">{row.region || row.regionName || 'Unassigned Region'}</p>
                  <p className="shrink-0 text-sm font-semibold text-[#111827]">{row.pipelineValueLabel || formatCompactMoney(row.pipelineValue)}</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <span className="block h-full rounded-full bg-[#24518a]" style={{ width: `${Math.max(4, (value / maxValue) * 100)}%` }} />
                </div>
                <p className="text-xs font-semibold text-[#166534]">{row.growth || row.trend || `${formatPercent(row.approvalRate)} approval`}</p>
              </div>
            )
          })}
        </div>
      )}
    </HqCard>
  )
}

function getConsultantApplications(row = {}) {
  return normalizeNumber(row.applicationsSubmitted || row.submittedApplications || row.activeFiles || row.activeApplications || row.applications)
}

function TopConsultants({ rows = [] }) {
  const topRows = [...rows].sort((left, right) => getConsultantApplications(right) - getConsultantApplications(left)).slice(0, 5)

  return (
    <HqCard className="min-h-[390px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Top Consultants</CardLabel>
          <p className="mt-1 text-sm text-[#64748b]">Ranked by applications submitted.</p>
        </div>
        <Link to="/bond/organisation?view=consultants" className="text-sm font-semibold text-[#204b84]">View all consultants</Link>
      </div>
      {!topRows.length ? <HqEmptyState title="No consultant ranking available yet." description="Consultants will appear once applications are assigned and active." /> : (
        <div className="space-y-3">
          {topRows.map((row, index) => {
            const name = row.name || row.consultantName || row.consultant || 'Unassigned Consultant'
            return (
              <div key={row.key || row.id || name} className="flex items-center gap-3 rounded-[14px] bg-[#f8fafc] p-3">
                <span className="w-5 text-xs font-semibold text-[#64748b]">{index + 1}</span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8f0f8] text-sm font-semibold text-[#17324d]">{getInitials(name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#17324d]">{name}</p>
                  <p className="truncate text-xs text-[#64748b]">{row.branch || row.region || row.role || 'National book'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#111827]">{formatNumber(getConsultantApplications(row))}</p>
                  <p className="text-xs font-semibold text-[#166534]">{row.growth || formatPercent(row.approvalRate || 0)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </HqCard>
  )
}

function TopBanks({ bankPerformance = {} }) {
  const rows = [...(bankPerformance.rows || [])]
    .sort((left, right) => normalizeNumber(right.approvalRate) - normalizeNumber(left.approvalRate) || normalizeNumber(right.submitted) - normalizeNumber(left.submitted))
    .slice(0, 3)

  return (
    <HqCard className="min-h-[390px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Top Banks</CardLabel>
          <p className="mt-1 text-sm text-[#64748b]">Configured bank performance by approval quality.</p>
        </div>
        <Link to="/bond/banks" className="text-sm font-semibold text-[#204b84]">View bank relationships</Link>
      </div>
      {!rows.length ? <HqEmptyState title="No bank performance data yet." description="Bank performance will appear once applications are submitted to configured banks." /> : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.bank || row.bankId} className="rounded-[14px] border border-[#e2e8f0] bg-[#fbfdff] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#17324d]">{row.bank || 'Configured Bank'}</p>
                  <p className="mt-1 text-xs text-[#64748b]">{formatNumber(row.submitted || row.applicationsSubmitted || row.total)} applications</p>
                </div>
                <p className="text-lg font-semibold text-[#111827]">{formatPercent(row.approvalRate)}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <p><span className="font-semibold text-[#64748b]">Revenue</span><br /><span className="font-semibold text-[#17324d]">{row.revenueLabel || row.revenueGeneratedLabel || formatCompactMoney(row.revenueGenerated || row.revenue, 'Pending')}</span></p>
                <p><span className="font-semibold text-[#64748b]">Response</span><br /><span className="font-semibold text-[#17324d]">{row.averageResponseTime ? `${row.averageResponseTime}h avg` : 'Pending'}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}
    </HqCard>
  )
}

function buildTrendSeries(hq = {}) {
  if (Array.isArray(hq.performanceTrend) && hq.performanceTrend.length) return hq.performanceTrend
  const metrics = hq.nationalSnapshot || []
  return [
    { key: 'applications', label: 'Applications', color: '#24518a', values: findMetric(metrics, 'active_applications')?.sparkline || [] },
    { key: 'approval', label: 'Approval Rate', color: '#15803d', values: findMetric(metrics, 'approval_rate')?.sparkline || [] },
    { key: 'response', label: 'Avg Response Time', color: '#b45309', values: findMetric(metrics, 'average_approval_time')?.sparkline || [] },
    { key: 'revenue', label: 'Revenue', color: '#7c3aed', values: findMetric(metrics, 'pipeline_value')?.sparkline || [] },
  ].filter((series) => Array.isArray(series.values) && series.values.length >= 2)
}

function PerformanceTrend({ hq = {} }) {
  const series = buildTrendSeries(hq)
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const allValues = series.flatMap((row) => row.values.map((value) => normalizeNumber(value)))
  const max = Math.max(...allValues, 1)
  const min = Math.min(...allValues, 0)
  const range = Math.max(max - min, 1)

  return (
    <HqCard className="min-h-[430px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardLabel>Performance Trend</CardLabel>
          <p className="mt-1 text-sm text-[#64748b]">12-month movement across applications, approval, response time and revenue.</p>
        </div>
        <span className="text-sm font-semibold text-[#64748b]">12 months</span>
      </div>
      {!series.length ? <HqEmptyState title="Performance trend is building." description="A 12-month trend will appear once historical application, approval, response-time and revenue data is available." /> : (
        <>
          <div className="relative h-[260px] rounded-[14px] bg-[#f8fafc] p-5">
            <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="12 month performance trend">
              {[0, 25, 50, 75, 100].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="#e2e8f0" strokeWidth="0.45" />)}
              {series.map((row) => {
                const values = row.values.slice(-12)
                const points = values.map((value, index) => {
                  const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100
                  const y = 100 - ((normalizeNumber(value) - min) / range) * 88 - 6
                  return `${x},${y}`
                }).join(' ')
                return <polyline key={row.key || row.label} points={points} fill="none" stroke={row.color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              })}
            </svg>
          </div>
          <div className="mt-4 grid grid-cols-6 gap-2 text-xs font-semibold text-[#64748b] md:grid-cols-12">
            {months.map((month) => <span key={month}>{month}</span>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-4">
            {series.map((row) => (
              <span key={row.key || row.label} className="inline-flex items-center gap-2 text-sm font-semibold text-[#17324d]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                {row.label}
              </span>
            ))}
          </div>
        </>
      )}
    </HqCard>
  )
}

function SystemFooter({ hq = {}, health = {} }) {
  const updatedAt = hq.updatedAt || hq.dataUpdatedAt || new Date().toISOString()
  const formatted = new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(updatedAt))
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe7ef] pt-5 text-xs text-[#64748b]">
      <span>Data freshness: {formatted}</span>
      <span>Operational health: {health.status || 'Tracking'} · {formatNumber(health.pressureSignals || 0)} pressure signals</span>
    </footer>
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
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon
          return (
            <HqCard key={item.key || item.label} className="flex min-h-[188px] flex-col overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#f2f6fb] text-[#17324d] ring-1 ring-[#e5edf5]">
                  <Icon size={18} />
                </span>
              </div>
              <div className="mt-4 min-w-0">
                <CardLabel>{item.label}</CardLabel>
                <p className={`mt-2 truncate text-[32px] font-bold leading-none tracking-[-0.02em] ${getKpiValueClass(item.key)}`}>{item.value || '0'}</p>
                <p className="mt-2 truncate text-[13px] font-semibold text-[#177245]">{formatTrendLabel(item.trend)}</p>
              </div>
              <div className="mt-auto pt-4">
                <MicroTrend values={item.sparkline} color={item.color} />
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
    <section className="col-span-12 mt-7">
      <SectionTitle
        action={(
          <Link to="/bond/reports?view=executive-risk" className="inline-flex items-center gap-2 rounded-[12px] bg-[#f5f8fc] px-4 py-2 text-sm font-semibold text-[#17324d] transition hover:bg-[#edf3f8]">
            View All Issues <ArrowRight size={16} />
          </Link>
        )}
      >
        Operational Health
      </SectionTitle>
      <HqCard className="p-5">
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-center">
          <div className="flex min-w-0 items-center gap-5 rounded-[20px] bg-[#f8fbfe] p-5">
            <div className="shrink-0">
              <Donut
                segments={[
                  { label: 'Health', value: healthScore, color: healthColor },
                  { label: 'Remaining', value: 100 - healthScore, color: '#e8eef5' },
                ]}
                sizeClass="h-32 w-32"
                center={(
                  <>
                    <strong className="text-[25px] font-bold leading-none text-[#142132]">{formatPercent(healthScore)}</strong>
                    <span className="mt-1 text-[11px] font-semibold text-[#64748b]">{healthLabel}</span>
                  </>
                )}
              />
            </div>
            <div className="min-w-0">
              <CardLabel>Health Score</CardLabel>
              <p className="mt-2 text-lg font-bold text-[#142132]">{healthLabel}</p>
              <p className="mt-2 text-[13px] leading-6 text-[#64748b]">National operations are running with {formatNumber(pressure)} active pressure signals.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon
              return (
                <Link key={metric.label} to="/bond/reports?view=executive-risk" className="group min-h-[118px] rounded-[20px] bg-[#f8fbfe] p-4 transition hover:bg-[#f1f6fb]">
                  <Icon size={21} color={metric.color} />
                  <p className="mt-3 text-[24px] font-bold leading-none text-[#142132]">{formatNumber(metric.value)}</p>
                  <p className="mt-2 text-[13px] font-semibold text-[#17324d]">{metric.label}</p>
                  <p className="mt-1 text-xs font-medium text-[#64748b]">{metric.helper}</p>
                </Link>
              )
            })}
          </div>
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
    <section className="col-span-12 mt-7">
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
                  <Link to={stage.href} className="relative z-10 flex min-h-[164px] flex-col rounded-[22px] bg-[#f8fbfe] p-5 transition hover:-translate-y-0.5 hover:bg-[#f2f7fc]">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-[#17324d] shadow-sm">
                      <Icon size={19} color={stage.color} />
                    </span>
                    <p className="mt-4 text-[15px] font-bold text-[#17324d]">{stage.label}</p>
                    <p className="mt-3 text-[30px] font-bold leading-none tracking-[-0.02em] text-[#101828]">{formatNumber(stage.count)}</p>
                    <div className="mt-auto pt-4">
                      <div className="h-2 overflow-hidden rounded-full bg-[#e6eef6]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, (stage.count / maxCount) * 100))}%`, backgroundColor: stage.color }} />
                      </div>
                      <p className="mt-3 text-[13px] font-semibold" style={{ color: stage.color }}>{formatPercent(stage.conversionRate)} conversion</p>
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
      <p className={`mt-2 truncate text-xl font-bold ${toneClass}`}>{value}</p>
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
                  <strong className="text-2xl font-bold text-[#142132]">{formatNumber(partners.length)}</strong>
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
          <p className="mt-4 truncate text-[32px] font-bold leading-none tracking-[-0.02em] text-[#101828]">{revenue.projectedCommissionLabel || 'Pending'}</p>
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
                  <strong className="text-lg font-bold text-[#142132]">{revenue.commissionConfirmedLabel || 'Pending'}</strong>
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
            <MicroTrend values={[8, 10, 9, 14, 16, 18, 24, 27, 32, 36, 42, 51]} color="#2563eb" />
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
      <p className="mt-2 text-lg font-bold text-[#142132]">{value}</p>
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
