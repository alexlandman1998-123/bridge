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
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { createElement, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SOUTH_AFRICA_DISTRICT_PATHS,
  SOUTH_AFRICA_MAP_VIEWBOX,
  SOUTH_AFRICA_PROVINCE_LABELS,
} from './southAfricaDistrictMap'

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
  if (existingHref.includes('/bond/organisation/regions/')) return existingHref
  return `/bond/organisation/regions/${encodeURIComponent(row.regionId || row.id || name)}`
}

function getRegionalTone(score = 0) {
  if (score >= 80) {
    return {
      label: 'Strong',
      ring: '#16a34a',
      track: '#dcfce7',
      soft: 'bg-[#ecfdf3] text-[#027a48] ring-[#bbf7d0]',
      border: 'border-[#e7edf3] hover:border-[#cfe8d7]',
      surface: 'bg-white',
      metric: 'bg-[#f9fffb] ring-[#e1f4e8]',
      glow: 'shadow-[0_12px_30px_rgba(22,163,74,0.06)]',
      trend: 'text-[#027a48]',
    }
  }
  if (score >= 72) {
    return {
      label: 'Watch',
      ring: '#f59e0b',
      track: '#fef3c7',
      soft: 'bg-[#fffaeb] text-[#b54708] ring-[#fedf89]',
      border: 'border-[#ece4cf] hover:border-[#f3ca76]',
      surface: 'bg-white',
      metric: 'bg-[#fffdf7] ring-[#f4ead0]',
      glow: 'shadow-[0_12px_30px_rgba(245,158,11,0.06)]',
      trend: 'text-[#b54708]',
    }
  }
  return {
    label: 'Needs Attention',
    ring: '#dc2626',
    track: '#fee2e2',
    soft: 'bg-[#fef3f2] text-[#b42318] ring-[#fecaca]',
    border: 'border-[#f3d4d1] hover:border-[#eaa8a1]',
    surface: 'bg-white',
    metric: 'bg-[#fffafa] ring-[#fde5e1]',
    glow: 'shadow-[0_12px_30px_rgba(220,38,38,0.06)]',
    trend: 'text-[#b42318]',
  }
}

function getTrendDirection(value = '') {
  const trend = String(value || '').trim()
  if (trend.includes('▼') || trend.startsWith('-')) return 'down'
  if (trend.includes('▲') || trend.startsWith('+')) return 'up'
  return 'flat'
}

function getTrendLabel(value = '') {
  const trend = String(value || '').trim()
  if (!trend) return 'Tracking'
  if (trend.toLowerCase().includes('vs last month')) return trend
  return `${trend} vs last month`
}

function getBadgeTone(level = 'neutral') {
  if (level === 'positive') {
    return 'bg-[#ecfdf3] text-[#027a48] ring-[#bdeccb]'
  }
  if (level === 'warning') {
    return 'bg-[#fffaeb] text-[#b54708] ring-[#fde68a]'
  }
  if (level === 'critical') {
    return 'bg-[#fef3f2] text-[#b42318] ring-[#fecaca]'
  }
  return 'bg-[#f1f5f9] text-[#5f7287] ring-[#dbe5ef]'
}

function getBankHealthLabel({ approvalRate = 0, averageResponseTime = 0 } = {}) {
  const rate = clampScore(approvalRate)
  const response = normalizeNumber(averageResponseTime)
  if (rate >= 60 && response <= 24) return 'Strong'
  if (rate >= 40 && response <= 48) return 'Watch'
  return 'Needs Attention'
}

function getBankHealthTone(label = '') {
  if (label === 'Strong') return 'bg-[#ecfdf3] text-[#027a48] ring-[#bdeccb]'
  if (label === 'Watch') return 'bg-[#fffaeb] text-[#b54708] ring-[#fde68a]'
  return 'bg-[#fef3f2] text-[#b42318] ring-[#fecaca]'
}

function getAlertMetricValue(alerts = [], keys = []) {
  const alert = getAlert(alerts, keys)
  return normalizeNumber(alert?.value)
}

function getRiskyText(item = {}) {
  return [
    item.label,
    item.metric,
    item.description,
    item.reason,
    item.bottleneck,
    item.predictedDelay,
    item.statusLabel,
    item.nextAction,
    item.financeStage,
  ]
    .map(normalizeText)
    .join(' ')
    .toLowerCase()
}

function countRowsMatching(rows = [], needles = []) {
  const safeNeedles = (Array.isArray(needles) ? needles : [needles]).map((value) => String(value || '').toLowerCase())
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const haystack = getRiskyText(row)
    return safeNeedles.some((needle) => needle && haystack.includes(needle))
  }).length
}

function buildAttentionItems({ alerts = [], priorityActions = [], operationalRiskMatrix = [], atRiskApplications = [] } = {}) {
  const missingDocuments = Math.max(
    getAlertMetricValue(alerts, ['missing_docs', 'missing_documents']),
    normalizeNumber(findMetric(priorityActions, 'missing_documents')?.count),
    countRowsMatching(operationalRiskMatrix, ['missing documents', 'document pack', 'documents missing', 'documents']),
  )
  const bankFeedback = Math.max(
    getAlertMetricValue(alerts, ['sla', 'sla_breaches']),
    normalizeNumber(findMetric(priorityActions, 'bank_feedback')?.count),
    countRowsMatching(operationalRiskMatrix, ['bank feedback', 'lender query', 'bank review']),
  )
  const awaitingClient = Math.max(
    getAlertMetricValue(alerts, ['awaiting_otp']),
    normalizeNumber(findMetric(priorityActions, 'submission_readiness')?.count),
    countRowsMatching(operationalRiskMatrix, ['buyer response', 'client response', 'stale', 'waiting']),
  )
  const valuationOutstanding = Math.max(
    normalizeNumber(findMetric(priorityActions, 'overdue_applications')?.count),
    countRowsMatching(operationalRiskMatrix, ['valuation', 'valuer', 'valuation request']),
    countRowsMatching(atRiskApplications, ['valuation', 'valuer', 'valuation request']),
  )

  return [
    {
      key: 'missing_documents',
      label: 'Missing Documents',
      value: missingDocuments,
      detail: 'Applications still waiting on document packs',
      tone: missingDocuments ? 'critical' : 'neutral',
      href: '/bond/pipeline?view=awaiting-docs',
    },
    {
      key: 'bank_feedback',
      label: 'Bank Feedback',
      value: bankFeedback,
      detail: 'Lender responses and queries needing action',
      tone: bankFeedback ? 'warning' : 'neutral',
      href: '/bond/pipeline?view=submitted',
    },
    {
      key: 'awaiting_client',
      label: 'Awaiting Client',
      value: awaitingClient,
      detail: 'Files paused while the client responds',
      tone: awaitingClient ? 'warning' : 'neutral',
      href: '/bond/pipeline?view=all',
    },
    {
      key: 'valuation_outstanding',
      label: 'Valuation Outstanding',
      value: valuationOutstanding,
      detail: 'Deals still waiting on valuation movement',
      tone: valuationOutstanding ? 'critical' : 'neutral',
      href: '/bond/pipeline?view=stalled',
    },
  ]
    .sort((left, right) => right.value - left.value)
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
    icon: 'bg-[#eef9f1] text-[#177245] ring-[#d8eedf]',
    status: 'text-[#177245]',
    dot: '#2ebd69',
    panel: 'bg-white ring-[#e4f0e8]',
    wash: 'bg-white',
    line: '#78d89a',
    fill: 'rgba(34,197,94,0.1)',
  },
  blue: {
    accent: '#3b8edb',
    icon: 'bg-[#eef6ff] text-[#2b76b9] ring-[#d7e7fb]',
    status: 'text-[#2b76b9]',
    dot: '#3b8edb',
    panel: 'bg-white ring-[#e2ecf8]',
    wash: 'bg-white',
    line: '#80b9f2',
    fill: 'rgba(59,142,219,0.1)',
  },
  purple: {
    accent: '#8257e6',
    icon: 'bg-[#f4efff] text-[#7654dc] ring-[#e4dbff]',
    status: 'text-[#7c3aed]',
    dot: '#8257e6',
    panel: 'bg-white ring-[#ece3ff]',
    wash: 'bg-white',
    line: '#aa92f3',
    fill: 'rgba(130,87,230,0.1)',
  },
  orange: {
    accent: '#f97316',
    icon: 'bg-[#fff4ec] text-[#f97316] ring-[#fde1cc]',
    status: 'text-[#f97316]',
    dot: '#f97316',
    panel: 'bg-white ring-[#f5e4d3]',
    wash: 'bg-white',
    line: '#f7a46a',
    fill: 'rgba(249,115,22,0.1)',
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
    <section className={`rounded-[24px] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.045)] ring-1 ring-[#e5ebf2] ${className}`}>
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
  const performanceSnapshot = Array.isArray(snapshot.performanceSnapshot) ? snapshot.performanceSnapshot : []
  const priorityActions = Array.isArray(snapshot.priorityActions) ? snapshot.priorityActions : []
  const operationalRiskMatrix = Array.isArray(snapshot.operationalRiskMatrix) ? snapshot.operationalRiskMatrix : []
  const atRiskApplications = Array.isArray(snapshot.atRiskApplications) ? snapshot.atRiskApplications : []

  return (
    <div className="space-y-10 pb-8">
      <ExecutiveHeader />
      <ExecutiveKpiStrip snapshot={snapshot} hq={hq} performanceSnapshot={performanceSnapshot} />
      <WhatNeedsAttentionSection
        hq={hq}
        priorityActions={priorityActions}
        operationalRiskMatrix={operationalRiskMatrix}
        atRiskApplications={atRiskApplications}
      />
      <RegionalPerformanceStrip rows={hq.regionalPerformance || hq.regionComparison || []} loading={snapshot.loading || hq.loading} />
      <BankRelationshipBreakdown bankPerformance={hq.bankPerformance || {}} bankDistribution={snapshot.buyerDemographics?.bankDistribution || []} />
      <RegionalHeatmapOverview rows={hq.regionalPerformance || hq.regionComparison || []} />
      <BuyerStatsVisualRow demographics={snapshot.buyerDemographics || {}} bottleneckRows={operationalRiskMatrix} />
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
          <p className="mt-1 text-sm font-medium text-[#64748b]">Approval rate, response speed and lender health across the active bank set.</p>
        </div>
        <Link to="/bond/banks" className="inline-flex items-center gap-2 text-sm font-semibold text-[#204b84] transition hover:text-[#0f2f5f]">
          Manage banks <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid w-full gap-6 md:grid-cols-2 xl:grid-cols-4">
        {rows.map((row, index) => (
          <BankBreakdownCard key={row.bank} row={row} color={BANK_BREAKDOWN_COLORS[index % BANK_BREAKDOWN_COLORS.length]} />
        ))}
      </div>
    </section>
  )
}

function BankBreakdownCard({ row = {}, color = '#24518a' }) {
  const submitted = normalizeNumber(row.submitted || row.total)
  const responseLabel = row.averageResponseTime ? `${formatNumber(row.averageResponseTime)}h avg` : 'Pending'
  const approvalRate = clampScore(row.approvalRate)
  const healthLabel = getBankHealthLabel({ approvalRate, averageResponseTime: row.averageResponseTime })

  return (
    <Link to="/bond/banks" className="group min-w-0 rounded-[24px] border border-[#e7edf4] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <CardLabel>Bank Partner</CardLabel>
          <p className="mt-1 truncate text-[17px] font-semibold tracking-[-0.02em] text-[#142132]">{row.bank || 'Configured Bank'}</p>
        </div>
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[#f8fafc] ring-1 ring-[#e5edf4]">
          <Landmark size={18} color={color} />
        </span>
      </div>

      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#71869d]">Approval Rate</p>
        <p className="mt-2 text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-[#07142b]">
          {formatPercent(approvalRate)}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <BankMiniStat label="Applications" value={formatNumber(submitted)} />
        <BankMiniStat label="Avg Response" value={responseLabel} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#eef3f8] pt-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getBankHealthTone(healthLabel)}`}>
          Health: {healthLabel}
        </span>
        <ArrowRight size={14} className="shrink-0 text-[#8aa0b7] transition group-hover:translate-x-0.5 group-hover:text-[#204b84]" />
      </div>
    </Link>
  )
}

function BankMiniStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-[16px] bg-[#f8fbfd] px-3 py-2.5 text-center ring-1 ring-[#e5edf4]">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[#71869d]">{label}</p>
      <p className="mt-1 text-sm font-bold leading-5 text-[#17324d]">{value}</p>
    </div>
  )
}

const SA_PROVINCE_SHAPES = Object.entries(SOUTH_AFRICA_PROVINCE_LABELS).map(([label, position]) => ({
  key: normalizeProvinceKey(label),
  label,
  shortLabel: label === 'KwaZulu-Natal' ? 'KZN' : label,
  ...position,
}))

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
  const [expanded, setExpanded] = useState(false)
  const provinceRows = buildProvinceHeatRows(rows)
  const activeRows = provinceRows.filter((row) => row.applications > 0)
  const nationalApplications = provinceRows.reduce((sum, row) => sum + row.applications, 0)
  const averageHealth = activeRows.length ? Math.round(activeRows.reduce((sum, row) => sum + row.health, 0) / activeRows.length) : 0
  const topRegions = [...provinceRows].sort((left, right) => right.health - left.health || right.applications - left.applications).slice(0, 5)
  const topRegion = topRegions[0]

  return (
    <section className="rounded-[28px] border border-[#e7edf4] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardLabel>South Africa Regional Heatmap</CardLabel>
          <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#142132]">Regional health overview</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full bg-[#143250] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(20,50,80,0.16)] transition hover:bg-[#173a5e]"
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse heatmap' : 'View Heatmap'}
            <ArrowRight size={13} className={`transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div className="rounded-[22px] bg-[#f8fbfd] p-4 ring-1 ring-[#e5edf4]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#71869d]">Regional Health Overview</p>
          <p className="mt-3 text-[clamp(2rem,3vw,3.25rem)] font-semibold leading-none tracking-[-0.04em] text-[#07142b]">
            {averageHealth ? formatPercent(averageHealth) : 'Pending'}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#516074]">{activeRows.length ? `${formatNumber(activeRows.length)} regions active` : 'No active regions yet'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#17324d] ring-1 ring-[#e5edf4]">
              {formatNumber(nationalApplications)} applications
            </span>
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#17324d] ring-1 ring-[#e5edf4]">
              {topRegion ? topRegion.label : 'No top region'}
            </span>
          </div>
        </div>

        <div className="rounded-[22px] bg-white p-4 ring-1 ring-[#e5edf4]">
          {expanded ? (
            <>
              <div className="overflow-hidden rounded-[18px] bg-[#f6f9fc] px-4 py-5 ring-1 ring-[#e6eef6] sm:px-6 xl:px-8">
                <svg className="mx-auto h-[min(560px,58vw)] min-h-[360px] w-full max-w-[1180px]" viewBox={SOUTH_AFRICA_MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" role="img" aria-label="South Africa regional heatmap">
                  <rect x="0" y="0" width="760" height="520" rx="18" fill="#f6f9fc" />
                  {SOUTH_AFRICA_DISTRICT_PATHS.map((district) => {
                    const province = provinceRows.find((row) => row.label === district.province)
                    const fill = getHeatColor(province?.health || 0)
                    return (
                      <path
                        key={district.name}
                        d={district.path}
                        fill={fill}
                        stroke="#ffffff"
                        strokeWidth="1.15"
                        strokeLinejoin="round"
                        opacity={province?.applications ? 0.92 : 0.7}
                      >
                        <title>{`${district.name} · ${district.province}`}</title>
                      </path>
                    )
                  })}
                  {provinceRows.map((province) => (
                    <g key={province.key}>
                      <text x={province.x} y={province.y} textAnchor="middle" className="fill-white text-[14px] font-bold" style={{ paintOrder: 'stroke', stroke: 'rgba(15,23,42,0.34)', strokeWidth: 5 }}>
                        {province.shortLabel || province.label}
                      </text>
                      <text x={province.x} y={province.y + 20} textAnchor="middle" className="fill-white text-[15px] font-bold" style={{ paintOrder: 'stroke', stroke: 'rgba(15,23,42,0.34)', strokeWidth: 5 }}>
                        {formatNumber(province.applications)}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>

              <div className="mt-4 rounded-[16px] bg-[#f8fafc] p-4 ring-1 ring-[#e6eef6]">
                <div className="grid gap-3 xl:grid-cols-[minmax(220px,0.24fr)_minmax(0,0.76fr)] xl:items-stretch">
                  <div>
                    <CardLabel>Heatmap Key</CardLabel>
                    <p className="mt-1 text-sm font-semibold text-[#64748b]">{averageHealth ? formatPercent(averageHealth) : 'Pending'} average active region health</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <HeatKey color="#15935f" label="Strong" description="80%+" />
                    <HeatKey color="#e59f24" label="Watch" description="72-79%" />
                    <HeatKey color="#d85b46" label="Needs attention" description="Below 72%" />
                    <HeatKey color="#d7e1ec" label="Unassigned" description="No data" />
                  </div>
                </div>

                <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {topRegions.map((row) => (
                    <div key={row.key} className="min-w-[220px] rounded-[13px] bg-white p-3 ring-1 ring-[#edf2f7]">
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
              </div>
            </>
          ) : (
            <div className="flex min-h-[280px] flex-col justify-between rounded-[18px] bg-[#f8fbfd] p-4 ring-1 ring-[#e6eef6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#71869d]">Collapsed view</p>
                  <p className="mt-3 text-sm leading-6 text-[#516074]">
                    The full map stays hidden until requested, keeping the page calmer on first scan.
                  </p>
                </div>
                <MapPinned size={18} className="text-[#2b76b9]" />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <HeatKey color="#15935f" label={`${averageHealth ? formatPercent(averageHealth) : '—'}`} description="Average health" />
                <HeatKey color="#e59f24" label={formatNumber(activeRows.length)} description="Regions active" />
                <HeatKey color="#3b8edb" label={topRegion ? topRegion.label : '—'} description="Top region" />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function HeatKey({ color, label, description }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[13px] bg-white px-3 py-2.5 ring-1 ring-[#edf2f7]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-[#17324d]">{label}</p>
        <p className="truncate text-[0.72rem] font-medium text-[#64748b]">{description}</p>
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

function BuyerStatsVisualRow({ demographics = {}, bottleneckRows = [] }) {
  const financeMix = objectEntriesWithValues(demographics.bondVsCash || {}).length ? demographics.bondVsCash : DEMO_BUYER_FINANCE_MIX
  const clientType = objectEntriesWithValues(demographics.clientType || {}).length ? demographics.clientType : DEMO_BUYER_PROFILE_MIX

  return (
    <section className="grid gap-6 xl:grid-cols-3">
      <BuyerDonutPanel title="Buyer Finance Mix" icon={Banknote} items={financeMix} colors={['#24518a', '#17946b', '#b7791f']} />
      <BuyerBarsPanel title="Buyer Profile Mix" icon={UserRound} items={clientType} colors={['#17946b', '#24518a', '#b7791f', '#7c3aed']} />
      <ApplicationBottlenecksPanel title="Application Bottlenecks" bottleneckRows={bottleneckRows} />
    </section>
  )
}

function BuyerDonutPanel({ title, icon: Icon, items = {}, colors = [] }) {
  const entries = objectEntriesWithValues(items)
  const total = entries.reduce((sum, [, value]) => sum + normalizeNumber(value), 0)
  const segments = entries.map(([key, value], index) => ({ label: key, value, color: colors[index % colors.length] || '#24518a' }))

  return (
    <HqCard className="min-h-[390px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Buyer Stats</CardLabel>
          <p className="mt-1 text-lg font-semibold text-[#142132]">{title}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#f8fafc] ring-1 ring-[#e5edf4]">
          {createElement(Icon, { size: 18, className: 'text-[#24518a]' })}
        </span>
      </div>

      <div className="grid gap-6">
        <div className="flex justify-center">
          <Donut
            segments={segments}
            sizeClass="h-48 w-48"
            center={(
              <>
                <strong className="text-[32px] font-semibold leading-none tracking-[-0.04em] text-[#142132]">{formatNumber(total)}</strong>
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
    <HqCard className="min-h-[390px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Buyer Stats</CardLabel>
          <p className="mt-1 text-lg font-semibold text-[#142132]">{title}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#f8fafc] ring-1 ring-[#e5edf4]">
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

function ApplicationBottlenecksPanel({ title, bottleneckRows = [] }) {
  const bottlenecks = [
    { key: 'missing_documents', label: 'Missing Documents', needles: ['missing documents', 'document pack', 'docs'] },
    { key: 'bank_feedback', label: 'Bank Feedback', needles: ['bank feedback', 'lender query', 'bank review', 'feedback'] },
    { key: 'awaiting_client', label: 'Awaiting Client', needles: ['buyer response', 'client response', 'waiting', 'stale'] },
    { key: 'valuation_outstanding', label: 'Valuation Outstanding', needles: ['valuation', 'valuer', 'valuation request'] },
  ].map((item) => ({
    ...item,
    value: countRowsMatching(bottleneckRows, item.needles),
  }))

  return (
    <HqCard className="min-h-[390px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Buyer Stats</CardLabel>
          <p className="mt-1 text-lg font-semibold text-[#142132]">{title}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#f8fafc] ring-1 ring-[#e5edf4]">
          <AlertTriangle size={18} className="text-[#b7791f]" />
        </span>
      </div>

      <div className="space-y-3">
        {bottlenecks.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 rounded-[18px] bg-[#f8fbfd] px-4 py-3 ring-1 ring-[#e5edf4]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#17324d]">{item.label}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#142132] ring-1 ring-[#e5edf4]">
              {formatNumber(item.value)}
            </span>
          </div>
        ))}
      </div>
    </HqCard>
  )
}

function BuyerLegendBar({ label, value, total, color, size = 'default' }) {
  const pct = Math.round((normalizeNumber(value) / Math.max(normalizeNumber(total), 1)) * 100)
  return (
    <div className={size === 'large' ? 'rounded-[16px] bg-[#f8fbfd] p-3.5 ring-1 ring-[#e5edf4]' : ''}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[#17324d]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 break-words">{label}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-[#142132]">{pct}%</span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, pct)}%`, backgroundColor: color }} />
      </div>
      <p className="mt-1.5 text-xs font-medium text-[#64748b]">{formatNumber(value)} buyers</p>
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

function formatMetricTrend(item = {}) {
  const trend = normalizeText(item.trend)
  const label = normalizeText(item.trendLabel || item.comparison)
  if (!trend && !label) return 'Tracking'
  if (!label) return trend
  if (!trend) return label
  return `${trend} ${label}`.replace(/\s+/g, ' ').trim()
}

function getMetricSource(snapshot = {}, performanceSnapshot = [], key = '', fallbackIndex = 0) {
  const fromPerformance = findMetric(performanceSnapshot, key, fallbackIndex)
  if (fromPerformance && Object.keys(fromPerformance).length) return fromPerformance
  return findMetric(snapshot.hqCommandCentre?.nationalSnapshot || [], key, fallbackIndex)
}

function ExecutiveKpiStrip({ snapshot = {}, hq = {}, performanceSnapshot = [] }) {
  const revenueMetric = getMetricSource(snapshot, performanceSnapshot, ['commission_pipeline', 'pipeline_value'], 4)
  const applicationsMetric = getMetricSource(snapshot, performanceSnapshot, ['applications', 'active_applications'], 0)
  const approvalMetric = getMetricSource(snapshot, performanceSnapshot, ['approval_rate'], 2)
  const timeMetric = getMetricSource(snapshot, performanceSnapshot, ['avg_turnaround', 'average_approval_time', 'avg_approval_time'], 3)
  const revenue = hq.revenue || {}
  const supportCards = [
    {
      key: 'applications',
      label: 'Applications',
      value: applicationsMetric.value || '0',
      tone: KPI_TONES.green,
      icon: Layers3,
      trend: formatMetricTrend(applicationsMetric),
      sparkline: applicationsMetric.sparkline || [],
      helper: applicationsMetric.helper || 'Active national book',
      statusTone: 'positive',
    },
    {
      key: 'approval_rate',
      label: 'Approval Rate',
      value: approvalMetric.value || '0%',
      tone: KPI_TONES.blue,
      icon: Gauge,
      trend: formatMetricTrend(approvalMetric),
      sparkline: approvalMetric.sparkline || [],
      helper: approvalMetric.helper || 'Close the gap to target',
      statusTone: 'warning',
    },
    {
      key: 'avg_turnaround',
      label: 'Avg Approval Time',
      value: timeMetric.value || '0 days',
      tone: KPI_TONES.orange,
      icon: Clock3,
      trend: formatMetricTrend(timeMetric),
      sparkline: timeMetric.sparkline || [],
      helper: timeMetric.helper || 'Submission to approval movement',
      inverseTrend: true,
      statusTone: 'warning',
    },
  ]

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8799]">Executive Summary</p>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#142132] sm:text-[28px]">
            Revenue forecast leads the book
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-[#64748b]">
          The national forecast card anchors the page, while the supporting KPIs stay lighter and easier to scan at a glance.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <RevenueHeroCard
          className="xl:col-span-6"
          tone={KPI_TONES.green}
          title="Revenue Forecast"
          value={revenue.projectedCommissionLabel || revenueMetric.value || 'Pending'}
          trend={formatMetricTrend(revenueMetric)}
          detail={revenue.revenueThisMonthLabel ? `This month: ${revenue.revenueThisMonthLabel}` : revenueMetric.helper || '30-day trend'}
          subdetail={revenue.forecast90Day ? `90-day forecast: ${revenue.forecast90Day}` : 'Forward view based on active pipeline'}
          sparkline={revenueMetric.sparkline || []}
        />

        {supportCards.map((item) => (
          <SupportKpiCard
            key={item.key}
            className="xl:col-span-2"
            tone={item.tone}
            icon={item.icon}
            label={item.label}
            value={item.value}
            trend={item.trend}
            helper={item.helper}
            sparkline={item.sparkline}
            inverseTrend={item.inverseTrend}
            statusTone={item.statusTone}
          />
        ))}
      </div>
    </section>
  )
}

function RevenueHeroCard({ className = '', tone = KPI_TONES.green, title = '', value = '', trend = '', detail = '', subdetail = '', sparkline = [] }) {
  return (
    <article className={`group relative overflow-hidden rounded-[28px] border border-[#e7edf4] bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.05)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(15,23,42,0.075)] ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] ring-1 ${tone.icon}`}>
          <LineChart size={20} strokeWidth={2.25} />
        </span>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${getBadgeTone('positive')}`}>
          <TrendingUp size={13} />
          30-day trend
        </span>
      </div>

      <div className="mt-8 max-w-[92%]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#71869d]">{title}</p>
        <p className="mt-3 text-[clamp(2.55rem,4.3vw,4.8rem)] font-semibold leading-none tracking-[-0.045em] text-[#07142b]">
          {value}
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#177245]">
          <TrendingUp size={15} className="shrink-0" />
          <span>{trend || 'Tracking'}</span>
        </p>
        <p className="mt-3 text-sm leading-6 text-[#516074]">{detail}</p>
        <p className="mt-1 text-sm leading-6 text-[#6c7f92]">{subdetail}</p>
      </div>

      <div className="relative mt-8 rounded-[22px] bg-[#f8fbfd] p-4 ring-1 ring-[#e5edf4]">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#71869d]">Trend</p>
        <ExecutiveMiniTrend values={sparkline} tone={tone} />
      </div>
    </article>
  )
}

function SupportKpiCard({ className = '', tone = KPI_TONES.blue, icon: Icon = Gauge, label = '', value = '', trend = '', helper = '', sparkline = [], inverseTrend = false, statusTone = '' }) {
  const trendDirection = getTrendDirection(trend)
  const trendTone = statusTone || (!trend || trendDirection === 'flat'
    ? 'neutral'
    : inverseTrend
      ? trendDirection === 'down'
        ? 'positive'
        : 'critical'
      : trendDirection === 'down'
        ? 'critical'
        : 'positive')

  return (
    <article className={`group flex min-h-[240px] flex-col overflow-hidden rounded-[24px] border border-[#e7edf4] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(15,23,42,0.07)] ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ring-1 ${tone.icon}`}>
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getBadgeTone(trendTone)}`}>
          {trend || 'Tracking'}
        </span>
      </div>

      <div className="mt-6 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#728295]">{label}</p>
        <p className="mt-3 text-[clamp(1.9rem,3vw,2.7rem)] font-semibold leading-none tracking-[-0.04em] text-[#07142b]">
          {value}
        </p>
        <p className="mt-3 text-sm leading-6 text-[#556578]">{helper}</p>
      </div>

      <div className="mt-auto rounded-[18px] bg-[#f8fbfd] px-3 py-3 ring-1 ring-[#e5edf4]">
        <ExecutiveMiniTrend values={sparkline} tone={tone} />
      </div>
    </article>
  )
}

function WhatNeedsAttentionSection({ hq = {}, priorityActions = [], operationalRiskMatrix = [], atRiskApplications = [] }) {
  const health = buildOperationalHealthModel(hq)
  const attentionItems = buildAttentionItems({
    alerts: hq.alerts || [],
    priorityActions,
    operationalRiskMatrix,
    atRiskApplications,
  })
  const actionableItems = attentionItems.filter((item) => item.value > 0)
  const itemsToShow = actionableItems.length ? actionableItems : [{
    key: 'all_clear',
    label: 'All Clear',
    value: 0,
    detail: 'No urgent bottlenecks surfaced in the current window',
    tone: 'positive',
    href: '/bond/pipeline',
  }]

  return (
    <section className="rounded-[28px] border border-[#e7edf4] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8799]">What Needs Attention</p>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[#142132] sm:text-[22px]">Clear action cues for the desk</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${getBadgeTone(health.status === 'Critical' ? 'critical' : health.status === 'Needs Attention' ? 'warning' : health.status === 'Baseline Pending' ? 'neutral' : 'positive')}`}>
            <ShieldAlert size={14} />
            {health.status || 'Tracking'}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f8fbfd] px-3 py-1.5 text-xs font-semibold text-[#5f7287] ring-1 ring-[#e5edf4]">
            {formatNumber(health.pressureSignals || 0)} pressure signals
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="rounded-[22px] bg-[#f8fbfd] p-4 ring-1 ring-[#e5edf4]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#71869d]">Operational pressure</p>
          <p className="mt-3 text-[clamp(2rem,3vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-[#07142b]">
            {health.score === null ? '—' : `${formatPercent(health.score)}`}
          </p>
          <p className="mt-3 text-sm leading-6 text-[#516074]">
            {health.status === 'Baseline Pending'
              ? 'The desk is still warming up. Alerts will populate as workflow data deepens.'
              : 'The strongest signals are surfaced first so the team can move quickly on the right work.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#17324d] ring-1 ring-[#e5edf4]">
              {formatNumber(health.metrics?.missingDocs || 0)} docs missing
            </span>
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#17324d] ring-1 ring-[#e5edf4]">
              {formatNumber(health.metrics?.slaBreaches || 0)} SLA breaches
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {itemsToShow.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              className="group flex min-w-0 items-start justify-between gap-4 rounded-[20px] bg-[#f8fbfd] p-4 ring-1 ring-[#e5edf4] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_16px_30px_rgba(15,23,42,0.06)]"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#728295]">{item.label}</p>
                <p className="mt-2 text-[clamp(1.7rem,2.8vw,2.5rem)] font-semibold leading-none tracking-[-0.04em] text-[#07142b]">
                  {formatNumber(item.value)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#556578]">{item.detail}</p>
              </div>
              <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getBadgeTone(item.tone)}`}>
                {item.value ? 'Watch' : 'Clear'}
              </span>
            </Link>
          ))}
        </div>
      </div>
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
        <div className="flex snap-x gap-6 overflow-x-auto pb-4 pr-2 [scrollbar-width:thin]">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="min-h-[228px] w-[372px] min-w-[372px] snap-start animate-pulse rounded-[24px] border border-[#e7edf4] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
              <div className="h-4 w-28 rounded-full bg-[#e2e8f0]" />
              <div className="mt-4 flex items-start justify-between gap-4">
                <div className="h-10 w-24 rounded-full bg-[#e2e8f0]" />
                <div className="h-14 w-14 rounded-full bg-[#e2e8f0]" />
              </div>
              <div className="mt-5 flex gap-2">
                <div className="h-10 flex-1 rounded-[14px] bg-[#e2e8f0]" />
                <div className="h-10 flex-1 rounded-[14px] bg-[#e2e8f0]" />
              </div>
            </div>
          ))}
        </div>
      ) : !regionalRows.length ? (
        <div className="rounded-[20px] border border-dashed border-[#cbd5e1] bg-white px-5 py-6 text-sm font-medium text-[#64748b] shadow-[0_10px_28px_rgba(15,23,42,0.025)]">
          <p className="font-semibold text-[#17324d]">No regions available yet.</p>
          <p className="mt-1">Create your first region to begin tracking performance.</p>
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 pr-2 [scrollbar-width:thin]">
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
      className={`group flex min-h-[238px] w-[372px] min-w-[372px] snap-start flex-col rounded-[24px] border bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)] ring-1 ring-[#e9eff5] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#24518a] ${tone.border} ${tone.glow}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-5 tracking-[-0.02em] text-[#142132]">{row.name}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#71869d]">{tone.label}</p>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tone.soft}`}>
            Health score
          </span>
        </div>
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#f8fafc] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]"
          style={{ background: `conic-gradient(${tone.ring} ${row.healthScore * 3.6}deg, ${tone.track} 0deg)` }}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[16px] font-semibold text-[#142132]">
            {row.healthScore}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <RegionalMiniMetric label="Applications" value={formatNumber(row.applications)} />
        <RegionalMiniMetric label="Revenue" value={row.revenue} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#eef3f8] pt-3">
        <p className={`min-w-0 text-xs font-semibold leading-4 ${trendClass}`}>{trendArrow} {row.trend.label}</p>
        <ArrowRight size={14} className="shrink-0 text-[#8aa0b7] transition group-hover:translate-x-0.5 group-hover:text-[#204b84]" />
      </div>
    </Link>
  )
}

function RegionalMiniMetric({ label, value }) {
  return (
    <div className="min-w-0 rounded-[16px] bg-[#f8fbfd] px-3 py-2.5 ring-1 ring-[#e5edf4]">
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-[#71869d]">{label}</p>
      <p className="mt-1 truncate text-[14px] font-semibold leading-4 text-[#17324d]">{value}</p>
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
