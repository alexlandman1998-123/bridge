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
  MapPinned,
  PieChart,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { createElement } from 'react'
import { Link } from 'react-router-dom'

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeText(value = '') {
  return String(value || '').trim()
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

function getMoneyValueFromLabel(value = '') {
  const label = String(value || '').trim().toLowerCase()
  const numeric = getNumericFromLabel(label)
  if (!numeric) return 0
  if (label.includes('m')) return numeric * 1000000
  if (label.includes('k')) return numeric * 1000
  return numeric
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

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(normalizeNumber(value))))
}

function getRegionalName(row = {}) {
  return row.region || row.regionName || row.name || 'Unassigned Region'
}

function getRegionalApplications(row = {}) {
  return normalizeNumber(row.applications || row.activeApplications || row.submittedApplications || row.submitted || row.total)
}

function getRegionalRevenueLabel(row = {}) {
  if (row.revenueLabel || row.revenueGeneratedLabel || row.projectedCommissionLabel || row.pipelineValueLabel) {
    return row.revenueLabel || row.revenueGeneratedLabel || row.projectedCommissionLabel || row.pipelineValueLabel
  }
  return formatCompactMoney(row.revenue || row.revenueGenerated || row.projectedCommission || row.pipelineValue, 'R0')
}

function getRegionalSla(row = {}) {
  if (row.slaCompliance !== undefined) return clampScore(row.slaCompliance)
  if (row.sla !== undefined) return clampScore(row.sla)
  const applications = Math.max(getRegionalApplications(row), 1)
  const riskCount = normalizeNumber(row.escalations || row.riskCount || row.slaBreaches)
  return clampScore(((applications - riskCount) / applications) * 100)
}

function getRegionalApproval(row = {}) {
  return clampScore(row.approvalRate || row.approval || row.approvals)
}

function getRegionalHealth(row = {}) {
  if (row.healthScore !== undefined || row.health !== undefined || row.score !== undefined) {
    return clampScore(row.healthScore || row.health || row.score)
  }
  const approval = getRegionalApproval(row)
  const sla = getRegionalSla(row)
  const applications = getRegionalApplications(row)
  const responseDays = normalizeNumber(row.avgApprovalTime || row.averageApprovalTime || row.averageResponseTime)
  const escalationCount = normalizeNumber(row.escalations || row.riskCount || row.slaBreaches)
  const responseScore = responseDays ? Math.max(0, 100 - Math.max(0, responseDays - 7) * 4) : 78
  const throughputScore = Math.min(100, applications * 4)
  const escalationScore = Math.max(0, 100 - escalationCount * 12)
  return clampScore(approval * 0.34 + sla * 0.26 + responseScore * 0.18 + throughputScore * 0.12 + escalationScore * 0.1)
}

function getRegionalTrend(row = {}) {
  const rawTrend = row.monthlyTrendLabel || row.growth || row.trend || row.applicationTrend || row.revenueTrend || '0%'
  const trend = String(rawTrend).trim()
  const direction = trend.includes('▼') || trend.startsWith('-') ? 'down' : 'up'
  return {
    direction,
    label: formatTrendLabel(trend.replace(/[▲▼]/g, '').trim()),
  }
}

function getRegionalHref(row = {}, name = '') {
  const regionalHref = row.regionHref || row.regionDetailHref || row.regionalHref || ''
  if (regionalHref) return regionalHref
  const existingHref = row.href || ''
  if (existingHref.includes('view=regions') || existingHref.includes('regional-operations')) return existingHref
  return `/bond/organisation?view=regions&region=${encodeURIComponent(row.regionId || name)}`
}

function getRegionalTone(score = 0) {
  if (score >= 80) {
    return {
      label: 'Strong',
      ring: '#16a34a',
      track: '#dcfce7',
      soft: 'bg-[#ecfdf3] text-[#027a48] ring-[#bbf7d0]',
      border: 'border-[#bbf7d0] hover:border-[#86efac]',
      surface: 'bg-[linear-gradient(180deg,#ffffff_0%,#f0fdf4_100%)]',
      metric: 'bg-white/80 ring-[#d9fbe5]',
      glow: 'shadow-[0_14px_34px_rgba(22,163,74,0.1)]',
      trend: 'text-[#027a48]',
    }
  }
  if (score >= 72) {
    return {
      label: 'Watch',
      ring: '#f59e0b',
      track: '#fef3c7',
      soft: 'bg-[#fffaeb] text-[#b54708] ring-[#fedf89]',
      border: 'border-[#fde68a] hover:border-[#fbbf24]',
      surface: 'bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)]',
      metric: 'bg-white/80 ring-[#fdecc8]',
      glow: 'shadow-[0_14px_34px_rgba(245,158,11,0.1)]',
      trend: 'text-[#b54708]',
    }
  }
  return {
    label: 'Needs Attention',
    ring: '#dc2626',
    track: '#fee2e2',
    soft: 'bg-[#fef3f2] text-[#b42318] ring-[#fecaca]',
    border: 'border-[#fecaca] hover:border-[#fca5a5]',
    surface: 'bg-[linear-gradient(180deg,#ffffff_0%,#fff5f5_100%)]',
    metric: 'bg-white/80 ring-[#fee2e2]',
    glow: 'shadow-[0_14px_34px_rgba(220,38,38,0.1)]',
    trend: 'text-[#b42318]',
  }
}

const DEMO_REGIONAL_ROWS = [
  { key: 'seed-gauteng-north', region: 'Gauteng North', activeApplications: 28, approvalRate: 68, slaCompliance: 82, healthScore: 78, projectedCommissionLabel: 'R92k', monthlyTrendLabel: '+12% vs last month', href: '/bond/organisation?view=regions&region=Gauteng%20North' },
  { key: 'seed-gauteng-south', region: 'Gauteng South', activeApplications: 24, approvalRate: 62, slaCompliance: 76, healthScore: 72, projectedCommissionLabel: 'R84k', monthlyTrendLabel: '+8% vs last month', href: '/bond/organisation?view=regions&region=Gauteng%20South' },
  { key: 'seed-western-cape', region: 'Western Cape', activeApplications: 19, approvalRate: 71, slaCompliance: 88, healthScore: 84, projectedCommissionLabel: 'R76k', monthlyTrendLabel: '+15% vs last month', href: '/bond/organisation?view=regions&region=Western%20Cape' },
  { key: 'seed-kwazulu-natal', region: 'KwaZulu-Natal', activeApplications: 14, approvalRate: 58, slaCompliance: 74, healthScore: 69, projectedCommissionLabel: 'R51k', monthlyTrendLabel: '+4% vs last month', href: '/bond/organisation?view=regions&region=KwaZulu-Natal' },
  { key: 'seed-eastern-cape', region: 'Eastern Cape', activeApplications: 9, approvalRate: 53, slaCompliance: 79, healthScore: 66, projectedCommissionLabel: 'R33k', monthlyTrendLabel: '-3% vs last month', href: '/bond/organisation?view=regions&region=Eastern%20Cape' },
  { key: 'seed-free-state', region: 'Free State', activeApplications: 7, approvalRate: 64, slaCompliance: 86, healthScore: 73, projectedCommissionLabel: 'R28k', monthlyTrendLabel: '+6% vs last month', href: '/bond/organisation?view=regions&region=Free%20State' },
  { key: 'seed-mpumalanga', region: 'Mpumalanga', activeApplications: 6, approvalRate: 57, slaCompliance: 81, healthScore: 70, projectedCommissionLabel: 'R24k', monthlyTrendLabel: '+2% vs last month', href: '/bond/organisation?view=regions&region=Mpumalanga' },
]

function buildRegionalStripRows(rows = []) {
  const rawRows = (rows || []).filter((row) => normalizeText(getRegionalName(row)))
  const hasAssignedRegions = rawRows.some((row) => !['unassigned', 'unassigned region'].includes(getRegionalName(row).toLowerCase()))
  const sourceRows = hasAssignedRegions ? rawRows : []
  const mergedRows = [...sourceRows]
  const existingNames = new Set(sourceRows.map((row) => getRegionalName(row).toLowerCase()))

  if (!hasAssignedRegions || mergedRows.length < 6) {
    for (const row of DEMO_REGIONAL_ROWS) {
      if (mergedRows.length >= 7) break
      const name = getRegionalName(row).toLowerCase()
      if (!existingNames.has(name)) {
        mergedRows.push(row)
        existingNames.add(name)
      }
    }
  }

  return mergedRows
    .map((row) => {
      const name = getRegionalName(row)
      const healthScore = getRegionalHealth(row)
      return {
        key: row.key || row.id || row.regionId || name,
        name,
        healthScore,
        applications: getRegionalApplications(row),
        revenue: getRegionalRevenueLabel(row),
        approval: getRegionalApproval(row),
        sla: getRegionalSla(row),
        trend: getRegionalTrend(row),
        href: getRegionalHref(row, name),
      }
    })
    .sort((left, right) => right.healthScore - left.healthScore || right.applications - left.applications)
    .map((row, index) => ({ ...row, rank: index + 1 }))
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
    <svg className="absolute inset-x-3 bottom-3 h-[44px] w-[calc(100%-24px)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
      <RegionalPerformanceStrip rows={hq.regionalPerformance || hq.regionComparison || []} loading={snapshot.loading || hq.loading} />
      <BankRelationshipBreakdown bankPerformance={hq.bankPerformance || {}} bankDistribution={snapshot.buyerDemographics?.bankDistribution || []} />
      <RegionalHeatmapOverview rows={hq.regionalPerformance || hq.regionComparison || []} />
      <BuyerStatsVisualRow demographics={snapshot.buyerDemographics || {}} qualityDistribution={snapshot.buyerQualityDistribution || {}} />
      <section className="grid gap-6 xl:grid-cols-[1.05fr_1fr_0.95fr]">
        <TopRegions rows={hq.regionalPerformance || []} />
        <TopConsultants rows={hq.topConsultants || hq.consultantPerformance || snapshot.teamPerformance || []} />
        <TopBanks bankPerformance={hq.bankPerformance || {}} />
      </section>
      <SystemFooter hq={hq} health={health} />
    </div>
  )
}

const BANK_BREAKDOWN_COLORS = ['#24518a', '#17946b', '#b7791f', '#7c3aed']
const DEMO_BANK_BREAKDOWN_ROWS = [
  { bank: 'Nedbank', submitted: 8, approvalRate: 75, averageResponseTime: 5, revenueGenerated: 210000 },
  { bank: 'FNB', submitted: 6, approvalRate: 58, averageResponseTime: 9, revenueGenerated: 140000 },
  { bank: 'ABSA', submitted: 5, approvalRate: 64, averageResponseTime: 8, revenueGenerated: 125000 },
  { bank: 'Standard Bank', submitted: 4, approvalRate: 61, averageResponseTime: 7, revenueGenerated: 98000 },
]

function buildBankBreakdownRows(bankPerformance = {}, bankDistribution = []) {
  const distributionByBank = new Map((bankDistribution || []).map((row) => [normalizeText(row.bank).toLowerCase(), row]))
  const sourceRows = (bankPerformance.rows || []).map((row) => {
    const distribution = distributionByBank.get(normalizeText(row.bank).toLowerCase()) || {}
    return {
      bank: row.bank || distribution.bank || 'Configured Bank',
      submitted: normalizeNumber(row.submitted || row.applicationsSubmitted || row.total || distribution.submitted || distribution.total),
      approved: normalizeNumber(row.approved || distribution.approved),
      declined: normalizeNumber(row.declined || distribution.declined),
      active: normalizeNumber(row.active || distribution.active),
      approvalRate: clampScore(row.approvalRate || (distribution.total ? (normalizeNumber(distribution.approved) / normalizeNumber(distribution.total)) * 100 : 0)),
      averageResponseTime: normalizeNumber(row.averageResponseTime || row.avgResponseTime || row.responseTimeHours),
      revenue: row.revenueGenerated || row.revenue || row.projectedCommission || distribution.revenue,
      revenueLabel: row.revenueLabel || row.revenueGeneratedLabel || row.projectedCommissionLabel || distribution.revenueLabel,
    }
  })
  const rows = [...sourceRows]
  const existingBanks = new Set(rows.map((row) => normalizeText(row.bank).toLowerCase()))
  for (const row of DEMO_BANK_BREAKDOWN_ROWS) {
    if (rows.length >= 4) break
    if (!existingBanks.has(row.bank.toLowerCase())) rows.push(row)
  }
  return rows.slice(0, 4)
}

function BankRelationshipBreakdown({ bankPerformance = {}, bankDistribution = [] }) {
  const rows = buildBankBreakdownRows(bankPerformance, bankDistribution)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold tracking-[-0.01em] text-[#142132]">Bank Relationship Breakdown</h2>
          <p className="mt-1 text-sm font-medium text-[#64748b]">Four-bank performance view across submissions, approvals, revenue and response speed.</p>
        </div>
        <Link to="/bond/banks" className="inline-flex items-center gap-2 text-sm font-semibold text-[#204b84] transition hover:text-[#0f2f5f]">
          Manage banks <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rows.map((row, index) => (
          <BankBreakdownCard key={row.bank} row={row} color={BANK_BREAKDOWN_COLORS[index % BANK_BREAKDOWN_COLORS.length]} />
        ))}
      </div>
    </section>
  )
}

function BankBreakdownCard({ row = {}, color = '#24518a' }) {
  const submitted = normalizeNumber(row.submitted || row.total)
  const approved = row.approved || Math.round((submitted * normalizeNumber(row.approvalRate)) / 100)
  const declined = normalizeNumber(row.declined)
  const pending = Math.max(0, submitted - approved - declined)
  const responseLabel = row.averageResponseTime ? `${formatNumber(row.averageResponseTime)}h avg` : 'Pending'
  const approvalRate = clampScore(row.approvalRate)
  const revenueValue = row.revenue || row.revenueGenerated || row.projectedCommission

  return (
    <Link to="/bond/banks" className="group min-w-0 rounded-[18px] border border-[#dfe7ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-[#bfd0e1] hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <CardLabel>Bank Partner</CardLabel>
          <p className="mt-1 truncate text-lg font-bold text-[#142132]">{row.bank || 'Configured Bank'}</p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f8fafc] ring-1 ring-[#e2e8f0]">
          <Landmark size={18} color={color} />
        </span>
      </div>

      <div className="mt-5 flex items-center justify-center">
        <Donut
          segments={[
            { label: 'Approved', value: approved, color },
            { label: 'Pending', value: pending, color: '#dbe6f0' },
            { label: 'Declined', value: declined, color: '#f3b2a8' },
          ]}
          sizeClass="h-36 w-36"
          center={(
            <>
              <strong className="text-[25px] font-bold leading-none text-[#142132]">{formatPercent(approvalRate)}</strong>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]">approval</span>
            </>
          )}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <BankMiniStat label="Apps" value={formatNumber(submitted)} />
        <BankMiniStat label="Rev." value={row.revenueLabel || formatCompactMoney(revenueValue, 'R0')} />
        <BankMiniStat label="Resp." value={responseLabel} />
      </div>

      <div className="mt-5 space-y-2">
        <BankStatusBar label="Approved" value={approved} total={Math.max(submitted, 1)} color={color} />
        <BankStatusBar label="Pending" value={pending} total={Math.max(submitted, 1)} color="#8aa0b7" />
        <BankStatusBar label="Declined" value={declined} total={Math.max(submitted, 1)} color="#d92d20" />
      </div>
    </Link>
  )
}

function BankMiniStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-[#f8fafc] px-3 py-2 text-center ring-1 ring-[#edf2f7]">
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#71869d]">{label}</p>
      <p className="mt-1 text-[12px] font-bold leading-4 text-[#17324d]">{value}</p>
    </div>
  )
}

function BankStatusBar({ label, value, total, color }) {
  const width = Math.max(4, Math.min(100, (normalizeNumber(value) / Math.max(normalizeNumber(total), 1)) * 100))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-bold text-[#64748b]">
        <span>{label}</span>
        <span>{formatNumber(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e7eef6]">
        <span className="block h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

const SA_PROVINCE_SHAPES = [
  { key: 'western-cape', label: 'Western Cape', x: 92, y: 234, points: '47,232 98,212 154,228 170,268 137,309 74,294' },
  { key: 'northern-cape', label: 'Northern Cape', x: 154, y: 135, points: '74,112 180,72 276,104 260,182 201,232 154,228 98,212 47,232' },
  { key: 'eastern-cape', label: 'Eastern Cape', x: 236, y: 260, points: '170,268 201,232 286,214 344,256 312,310 224,326 137,309' },
  { key: 'free-state', label: 'Free State', x: 290, y: 162, points: '260,142 330,122 380,154 362,214 286,214 260,182' },
  { key: 'north-west', label: 'North West', x: 310, y: 96, points: '276,78 350,58 404,88 380,154 330,122 276,104' },
  { key: 'gauteng', label: 'Gauteng', x: 400, y: 112, points: '392,96 428,94 444,124 418,148 386,132' },
  { key: 'limpopo', label: 'Limpopo', x: 430, y: 54, points: '350,58 396,22 484,24 526,72 470,118 428,94 404,88' },
  { key: 'mpumalanga', label: 'Mpumalanga', x: 474, y: 130, points: '444,124 470,118 526,72 548,124 514,174 454,168 418,148' },
  { key: 'kwazulu-natal', label: 'KwaZulu-Natal', x: 424, y: 236, points: '362,214 454,168 514,174 490,248 424,306 344,256' },
]

const DEMO_BUYER_FINANCE_MIX = { bond: 8, cash: 2, hybrid: 3 }
const DEMO_BUYER_PROFILE_MIX = { individual: 9, company: 2, trust: 1, foreign_buyer: 1 }

function normalizeProvinceKey(value = '') {
  const normalized = normalizeText(value).toLowerCase().replace(/&/g, 'and')
  if (normalized.includes('gauteng')) return 'gauteng'
  if (normalized.includes('western cape')) return 'western-cape'
  if (normalized.includes('kwazulu') || normalized.includes('kzn')) return 'kwazulu-natal'
  if (normalized.includes('eastern cape')) return 'eastern-cape'
  if (normalized.includes('free state')) return 'free-state'
  if (normalized.includes('mpumalanga')) return 'mpumalanga'
  if (normalized.includes('limpopo')) return 'limpopo'
  if (normalized.includes('north west')) return 'north-west'
  if (normalized.includes('northern cape')) return 'northern-cape'
  return normalized.replace(/\s+/g, '-')
}

function buildProvinceHeatRows(rows = []) {
  const buckets = new Map()
  for (const row of buildRegionalStripRows(rows)) {
    const key = normalizeProvinceKey(getRegionalName(row))
    const existing = buckets.get(key) || { applications: 0, revenueValue: 0, approvalTotal: 0, approvalRows: 0, healthTotal: 0, healthRows: 0 }
    const applications = getRegionalApplications(row)
    existing.applications += applications
    existing.revenueValue += getMoneyValueFromLabel(row.revenue || getRegionalRevenueLabel(row))
    existing.approvalTotal += getRegionalApproval(row)
    existing.approvalRows += 1
    existing.healthTotal += getRegionalHealth(row)
    existing.healthRows += 1
    buckets.set(key, existing)
  }

  return SA_PROVINCE_SHAPES.map((shape) => {
    const bucket = buckets.get(shape.key) || {}
    const applications = normalizeNumber(bucket.applications)
    return {
      ...shape,
      applications,
      revenueValue: normalizeNumber(bucket.revenueValue),
      approval: bucket.approvalRows ? Math.round(bucket.approvalTotal / bucket.approvalRows) : 0,
      health: bucket.healthRows ? Math.round(bucket.healthTotal / bucket.healthRows) : 0,
    }
  })
}

function getHeatColor(score = 0) {
  if (score >= 80) return '#15935f'
  if (score >= 72) return '#e59f24'
  if (score > 0) return '#d85b46'
  return '#d7e1ec'
}

function RegionalHeatmapOverview({ rows = [] }) {
  const provinceRows = buildProvinceHeatRows(rows)
  const activeRows = provinceRows.filter((row) => row.applications > 0)
  const nationalApplications = provinceRows.reduce((sum, row) => sum + row.applications, 0)
  const averageHealth = activeRows.length ? Math.round(activeRows.reduce((sum, row) => sum + row.health, 0) / activeRows.length) : 0
  const topRegions = [...provinceRows].sort((left, right) => right.health - left.health || right.applications - left.applications).slice(0, 5)

  return (
    <section className="grid gap-5 rounded-[18px] border border-[#dfe7ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardLabel>South Africa Regional Heatmap</CardLabel>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.01em] text-[#142132]">Regional application concentration and health</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-[#17324d] ring-1 ring-[#e2e8f0]">
            <MapPinned size={14} /> {formatNumber(nationalApplications)} applications
          </span>
        </div>

        <div className="overflow-hidden rounded-[16px] bg-[#f6f9fc] p-4 ring-1 ring-[#e6eef6]">
          <svg className="h-[360px] w-full" viewBox="0 0 590 350" role="img" aria-label="South Africa regional heatmap">
            <rect x="0" y="0" width="590" height="350" rx="18" fill="#f6f9fc" />
            {provinceRows.map((province) => (
              <g key={province.key}>
                <polygon
                  points={province.points}
                  fill={getHeatColor(province.health)}
                  stroke="#ffffff"
                  strokeWidth="4"
                  strokeLinejoin="round"
                  opacity={province.applications ? 0.92 : 0.68}
                />
                <text x={province.x} y={province.y} textAnchor="middle" className="fill-white text-[10px] font-bold" style={{ paintOrder: 'stroke', stroke: 'rgba(15,23,42,0.24)', strokeWidth: 3 }}>
                  {province.label}
                </text>
                <text x={province.x} y={province.y + 15} textAnchor="middle" className="fill-white text-[11px] font-bold" style={{ paintOrder: 'stroke', stroke: 'rgba(15,23,42,0.24)', strokeWidth: 3 }}>
                  {formatNumber(province.applications)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <aside className="rounded-[16px] bg-[#f8fafc] p-5 ring-1 ring-[#e6eef6]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardLabel>Heatmap Key</CardLabel>
            <p className="mt-1 text-3xl font-bold leading-none text-[#142132]">{averageHealth ? formatPercent(averageHealth) : 'Pending'}</p>
            <p className="mt-2 text-sm font-medium text-[#64748b]">Average active region health</p>
          </div>
          <PieChart size={22} className="text-[#24518a]" />
        </div>

        <div className="mt-5 space-y-2">
          <HeatKey color="#15935f" label="Strong" description="80%+ regional health" />
          <HeatKey color="#e59f24" label="Watch" description="72-79% regional health" />
          <HeatKey color="#d85b46" label="Needs attention" description="Below 72% regional health" />
          <HeatKey color="#d7e1ec" label="Unassigned" description="No active regional data" />
        </div>

        <div className="mt-6 space-y-3">
          {topRegions.map((row) => (
            <div key={row.key} className="rounded-[13px] bg-white p-3 ring-1 ring-[#edf2f7]">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-bold text-[#17324d]">{row.label}</span>
                <span className="shrink-0 text-sm font-bold text-[#142132]">{row.health ? formatPercent(row.health) : '0%'}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(4, row.health)}%`, backgroundColor: getHeatColor(row.health) }} />
              </div>
              <p className="mt-2 text-xs font-semibold text-[#64748b]">{formatNumber(row.applications)} applications · {formatCompactMoney(row.revenueValue, 'R0')}</p>
            </div>
          ))}
        </div>
      </aside>
    </section>
  )
}

function HeatKey({ color, label, description }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-white px-3 py-2 ring-1 ring-[#edf2f7]">
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#17324d]">{label}</p>
        <p className="text-xs font-medium text-[#64748b]">{description}</p>
      </div>
    </div>
  )
}

function formatBuyerLabel(value = '') {
  return normalizeText(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function objectEntriesWithValues(items = {}) {
  return Object.entries(items || {}).filter(([, value]) => normalizeNumber(value) > 0)
}

function BuyerStatsVisualRow({ demographics = {}, qualityDistribution = {} }) {
  const financeMix = objectEntriesWithValues(demographics.bondVsCash || {}).length ? demographics.bondVsCash : DEMO_BUYER_FINANCE_MIX
  const clientType = objectEntriesWithValues(demographics.clientType || {}).length ? demographics.clientType : DEMO_BUYER_PROFILE_MIX
  const readiness = qualityDistribution.readiness || qualityDistribution || {}

  return (
    <section className="grid gap-5 xl:grid-cols-3">
      <BuyerDonutPanel title="Buyer Finance Mix" icon={Banknote} items={financeMix} colors={['#24518a', '#17946b', '#b7791f']} />
      <BuyerBarsPanel title="Buyer Profile Mix" icon={UserRound} items={clientType} colors={['#17946b', '#24518a', '#b7791f', '#7c3aed']} />
      <BuyerReadinessPanel title="Buyer Readiness Quality" items={readiness} />
    </section>
  )
}

function BuyerDonutPanel({ title, icon: Icon, items = {}, colors = [] }) {
  const entries = objectEntriesWithValues(items)
  const total = entries.reduce((sum, [, value]) => sum + normalizeNumber(value), 0)
  const segments = entries.map(([key, value], index) => ({ label: key, value, color: colors[index % colors.length] || '#24518a' }))

  return (
    <HqCard className="min-h-[360px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Buyer Stats</CardLabel>
          <p className="mt-1 text-lg font-bold text-[#142132]">{title}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#f8fafc] ring-1 ring-[#e2e8f0]">
          {createElement(Icon, { size: 18, className: 'text-[#24518a]' })}
        </span>
      </div>

      <div className="grid gap-5">
        <div className="flex justify-center">
          <Donut
            segments={segments}
            sizeClass="h-40 w-40"
            center={(
              <>
                <strong className="text-[28px] font-bold leading-none text-[#142132]">{formatNumber(total)}</strong>
                <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]">buyers</span>
              </>
            )}
          />
        </div>
        <div className="space-y-3">
          {entries.map(([key, value], index) => (
            <BuyerLegendBar key={key} label={formatBuyerLabel(key)} value={value} total={total} color={colors[index % colors.length] || '#24518a'} />
          ))}
        </div>
      </div>
    </HqCard>
  )
}

function BuyerBarsPanel({ title, icon: Icon, items = {}, colors = [] }) {
  const entries = objectEntriesWithValues(items)
  const total = entries.reduce((sum, [, value]) => sum + normalizeNumber(value), 0)

  return (
    <HqCard className="min-h-[360px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Buyer Stats</CardLabel>
          <p className="mt-1 text-lg font-bold text-[#142132]">{title}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#f8fafc] ring-1 ring-[#e2e8f0]">
          {createElement(Icon, { size: 18, className: 'text-[#17946b]' })}
        </span>
      </div>

      <div className="space-y-4">
        {entries.map(([key, value], index) => (
          <BuyerLegendBar key={key} label={formatBuyerLabel(key)} value={value} total={total} color={colors[index % colors.length] || '#24518a'} size="large" />
        ))}
      </div>
    </HqCard>
  )
}

function BuyerReadinessPanel({ title, items = {} }) {
  const entries = objectEntriesWithValues(items)
  const fallbackEntries = entries.length ? entries : [['strong', 7], ['watch', 4], ['at_risk', 2]]
  const total = fallbackEntries.reduce((sum, [, value]) => sum + normalizeNumber(value), 0)
  const colors = ['#17946b', '#e59f24', '#d85b46', '#24518a']
  const max = Math.max(...fallbackEntries.map(([, value]) => normalizeNumber(value)), 1)

  return (
    <HqCard className="min-h-[360px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Buyer Stats</CardLabel>
          <p className="mt-1 text-lg font-bold text-[#142132]">{title}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#f8fafc] ring-1 ring-[#e2e8f0]">
          <Gauge size={18} className="text-[#b7791f]" />
        </span>
      </div>

      <div className="flex h-[210px] items-end gap-4 rounded-[16px] bg-[#f8fafc] px-4 pb-4 pt-6 ring-1 ring-[#e6eef6]">
        {fallbackEntries.map(([key, value], index) => {
          const height = Math.max(14, (normalizeNumber(value) / max) * 100)
          return (
            <div key={key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-sm font-bold text-[#142132]">{formatNumber(value)}</span>
              <span className="w-full rounded-t-[10px]" style={{ height: `${height}%`, backgroundColor: colors[index % colors.length] }} />
              <span className="max-w-full truncate text-[10px] font-bold uppercase tracking-[0.06em] text-[#64748b]">{formatBuyerLabel(key)}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-sm font-semibold text-[#64748b]">{formatNumber(total)} buyers represented across readiness bands</p>
    </HqCard>
  )
}

function BuyerLegendBar({ label, value, total, color, size = 'default' }) {
  const pct = Math.round((normalizeNumber(value) / Math.max(normalizeNumber(total), 1)) * 100)
  return (
    <div className={size === 'large' ? 'rounded-[14px] bg-[#f8fafc] p-3 ring-1 ring-[#edf2f7]' : ''}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-[#17324d]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 break-words">{label}</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-[#142132]">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, pct)}%`, backgroundColor: color }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-[#64748b]">{formatNumber(value)} buyers</p>
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
            className={`flex min-h-[336px] min-w-0 flex-col overflow-hidden rounded-[20px] border p-6 shadow-[0_18px_42px_rgba(15,23,42,0.07)] ring-1 transition xl:min-h-[352px] ${tone.wash} ${
              item.featured
                ? 'border-[#24b86f] shadow-[0_22px_48px_rgba(22,163,74,0.16)] ring-[#bdeccd]'
                : 'border-[rgba(15,23,42,0.08)] ring-[#e4ebf2]'
            }`}
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] ring-1 ${tone.icon}`}>
                <Icon size={19} strokeWidth={2.4} />
              </span>
            </div>

            <div className="mt-7 min-w-0">
              <p className="whitespace-nowrap text-[clamp(0.58rem,0.62vw,0.7rem)] font-bold uppercase leading-4 tracking-[0.13em] text-[#526178] 2xl:tracking-[0.2em]">{item.label}</p>
              <p className="mt-4 max-w-full whitespace-nowrap text-[clamp(1.85rem,2.35vw,3.5rem)] font-bold leading-none tracking-normal text-[#07142b]">
                {item.value}
              </p>
              <p className={`mt-3 flex min-w-0 items-center gap-1.5 text-[clamp(0.68rem,0.72vw,0.86rem)] font-bold leading-5 ${tone.status}`}>
                {StatusIcon ? <StatusIcon size={14} className="shrink-0" strokeWidth={2.5} /> : null}
                <span className="min-w-0 break-words">{item.status}</span>
              </p>
            </div>

            <div className={`relative mt-auto h-[122px] overflow-hidden rounded-[15px] px-4 pt-5 ring-1 ${tone.panel}`}>
              <p className="relative z-10 flex min-w-0 items-start gap-2 text-[clamp(0.68rem,0.7vw,0.84rem)] font-bold leading-5 text-[#0f1f36]">
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

function RegionalPerformanceStrip({ rows = [], loading = false }) {
  const regionalRows = buildRegionalStripRows(rows)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold tracking-[-0.01em] text-[#142132]">Regional Performance</h2>
          <p className="mt-1 text-sm font-medium text-[#64748b]">Live performance across your national network</p>
        </div>
        <Link to="/bond/organisation?view=regions" className="inline-flex items-center gap-2 text-sm font-semibold text-[#204b84] transition hover:text-[#0f2f5f]">
          View all regions <ArrowRight size={15} />
        </Link>
      </div>

      {loading ? (
        <div className="flex snap-x gap-4 overflow-x-auto pb-3 pr-2 [scrollbar-width:thin]">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="min-h-[218px] w-[330px] min-w-[330px] snap-start animate-pulse rounded-[18px] border border-[#e2e8f0] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
              <div className="h-4 w-28 rounded-full bg-[#e2e8f0]" />
              <div className="mt-4 h-12 w-12 rounded-full bg-[#e2e8f0]" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="h-3 rounded-full bg-[#e2e8f0]" />
                <div className="h-3 rounded-full bg-[#e2e8f0]" />
                <div className="h-3 rounded-full bg-[#e2e8f0]" />
                <div className="h-3 rounded-full bg-[#e2e8f0]" />
              </div>
            </div>
          ))}
        </div>
      ) : !regionalRows.length ? (
        <div className="rounded-[16px] border border-dashed border-[#cbd5e1] bg-white px-5 py-6 text-sm font-medium text-[#64748b] shadow-[0_10px_28px_rgba(15,23,42,0.025)]">
          <p className="font-semibold text-[#17324d]">No regions available yet.</p>
          <p className="mt-1">Create your first region to begin tracking performance.</p>
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pr-2 [scrollbar-width:thin]">
          {regionalRows.map((row) => (
            <RegionalPerformanceCard key={row.key} row={row} />
          ))}
        </div>
      )}
    </section>
  )
}

function RegionalPerformanceCard({ row = {} }) {
  const tone = getRegionalTone(row.healthScore)
  const trendArrow = row.trend.direction === 'down' ? '▼' : '▲'
  const trendClass = row.trend.direction === 'down' ? 'text-[#b42318]' : tone.trend

  return (
    <Link
      to={row.href}
      aria-label={`Open ${row.name} regional performance`}
      className={`group flex min-h-[226px] w-[340px] min-w-[340px] snap-start flex-col rounded-[18px] border p-5 shadow-[0_10px_28px_rgba(15,23,42,0.035)] ring-1 ring-[#e9eff5] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#24518a] sm:w-[360px] sm:min-w-[360px] ${tone.surface} ${tone.border} ${tone.glow}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-bold leading-5 tracking-[-0.01em] text-[#142132]">{row.name}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${tone.soft}`}>#{row.rank}</span>
          </div>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71869d]">{tone.label}</p>
        </div>
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f8fafc] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]" style={{ background: `conic-gradient(${tone.ring} ${row.healthScore * 3.6}deg, ${tone.track} 0deg)` }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[15px] font-bold text-[#142132]">
            {row.healthScore}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <RegionalMiniMetric tone={tone} label="Applications" value={formatNumber(row.applications)} />
        <RegionalMiniMetric tone={tone} label="Revenue" value={row.revenue} />
        <RegionalMiniMetric tone={tone} label="Approval" value={formatPercent(row.approval)} />
        <RegionalMiniMetric tone={tone} label="SLA" value={formatPercent(row.sla)} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#eef3f8] pt-3">
        <p className={`min-w-0 text-xs font-bold leading-4 ${trendClass}`}>{trendArrow} {row.trend.label}</p>
        <ArrowRight size={14} className="shrink-0 text-[#8aa0b7] transition group-hover:translate-x-0.5 group-hover:text-[#204b84]" />
      </div>
    </Link>
  )
}

function RegionalMiniMetric({ tone = {}, label, value }) {
  return (
    <div className={`min-w-0 rounded-[12px] px-3 py-2 ring-1 ${tone.metric || 'bg-[#f8fafc] ring-[#edf2f7]'}`}>
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-[#71869d]">{label}</p>
      <p className="mt-1 truncate text-[13px] font-bold leading-4 text-[#17324d]">{value}</p>
    </div>
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
