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
import { Link, useNavigate } from 'react-router-dom'
import ActivePipelineCarousel from '../pipeline/ActivePipelineCarousel'
import {
  resolvePortalBuyerName,
  resolvePortalPropertyLabel,
  resolvePortalSellerName,
} from '../../services/portalCanonicalFieldFallbacks'
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

function getDiagnosticIssueCount(operationalDiagnostics = {}, codes = []) {
  const safeCodes = Array.isArray(codes) ? codes : [codes]
  const byCode = operationalDiagnostics?.issueSummary?.byCode || {}
  const summaryCount = safeCodes.reduce((sum, code) => sum + normalizeNumber(byCode[code]), 0)
  if (summaryCount) return summaryCount

  return (Array.isArray(operationalDiagnostics?.issues) ? operationalDiagnostics.issues : [])
    .filter((issue) => safeCodes.includes(issue?.code))
    .length
}

function getDiagnosticQueueCount(operationalDiagnostics = {}, queueKeys = []) {
  const safeKeys = Array.isArray(queueKeys) ? queueKeys : [queueKeys]
  return (Array.isArray(operationalDiagnostics?.actionQueues) ? operationalDiagnostics.actionQueues : [])
    .filter((row) => safeKeys.includes(row?.queueKey) || safeKeys.includes(row?.stage))
    .reduce((sum, row) => sum + normalizeNumber(row.count), 0)
}

function buildAttentionItems({ alerts = [], priorityActions = [], operationalRiskMatrix = [], atRiskApplications = [], operationalDiagnostics = {} } = {}) {
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
  const grantEvidence = Math.max(
    getDiagnosticIssueCount(operationalDiagnostics, [
      'missing_grant_document',
      'missing_signed_grant_document',
      'missing_grant_submission_evidence',
      'missing_instruction_evidence',
    ]),
    getDiagnosticQueueCount(operationalDiagnostics, ['awaiting_grant', 'grant_received', 'grant_signed', 'ready_for_instruction']),
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
    {
      key: 'grant_evidence',
      label: 'Grant Evidence',
      value: grantEvidence,
      detail: 'Grant and instruction evidence before attorney handoff',
      tone: grantEvidence ? 'critical' : 'neutral',
      href: '/bond/applications?view=grant-submitted',
    },
  ]
    .sort((left, right) => right.value - left.value)
}

const DEMO_REGIONAL_ROWS = []

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

const RANGE_LABELS = Object.freeze({
  last_30_days: 'Last 30 Days',
  this_month: 'This Month',
  quarter_to_date: 'Quarter to Date',
  all_time: 'All Time',
})

const MANAGEMENT_CARD_BASE = 'rounded-[18px] border border-[#e7edf4] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_18px_44px_rgba(15,23,42,0.045)] ring-1 ring-white/80'
const MANAGEMENT_CARD_HOVER = 'transition hover:-translate-y-px hover:border-[#cbd9e8] hover:shadow-[0_22px_50px_rgba(15,23,42,0.065)]'
const MANAGEMENT_PANEL_BASE = 'rounded-[22px] border border-[#e4ebf3] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_22px_56px_rgba(15,23,42,0.045)] ring-1 ring-white/80 sm:p-6'

const MANAGEMENT_KPI_ICON_TONES = Object.freeze({
  new_buyer_cases: 'bg-[#eef6ff] text-[#2563a8] ring-[#dcecff]',
  active_pipeline: 'bg-[#eefaf4] text-[#16875f] ring-[#d9f2e5]',
  approval_rate: 'bg-[#f6f0ff] text-[#7c3aed] ring-[#eadcff]',
  registered_ytd: 'bg-[#fff4ed] text-[#ea580c] ring-[#fedfc7]',
  commission_forecast: 'bg-[#edfdf6] text-[#16875f] ring-[#d2f4e3]',
})

const MANAGEMENT_KPI_ACCENTS = Object.freeze({
  new_buyer_cases: 'bg-[#3b82f6]',
  active_pipeline: 'bg-[#22a06b]',
  approval_rate: 'bg-[#8b5cf6]',
  registered_ytd: 'bg-[#f97316]',
  commission_forecast: 'bg-[#10b981]',
})

const MANAGEMENT_KPI_CHART_TONES = Object.freeze({
  new_buyer_cases: { line: '#3b82f6', fill: 'rgba(59,130,246,0.1)' },
  active_pipeline: { line: '#22a06b', fill: 'rgba(34,160,107,0.11)' },
  approval_rate: { line: '#8b5cf6', fill: 'rgba(139,92,246,0.1)' },
  registered_ytd: { line: '#f97316', fill: 'rgba(249,115,22,0.11)' },
  commission_forecast: { line: '#10b981', fill: 'rgba(16,185,129,0.11)' },
})

const MANAGEMENT_PIPELINE_STAGE_TONES = Object.freeze({
  application: 'border-[#d8e8fb] bg-[linear-gradient(135deg,#f7fbff_0%,#edf6ff_100%)]',
  at_banks: 'border-[#f0dfbb] bg-[linear-gradient(135deg,#fffdf6_0%,#fff5dc_100%)]',
  accepted: 'border-[#cfe9df] bg-[linear-gradient(135deg,#f5fffb_0%,#eaf8f1_100%)]',
  lodged: 'border-[#e0d6fb] bg-[linear-gradient(135deg,#fbf8ff_0%,#f1eaff_100%)]',
  registered: 'border-[#cae9e0] bg-[linear-gradient(135deg,#f4fffb_0%,#e6f7f1_100%)]',
})

const MANAGEMENT_PIPELINE_STAGE_ICON_TONES = Object.freeze({
  application: 'bg-white text-[#2563a8] ring-[#d7e6f5]',
  at_banks: 'bg-white text-[#b7791f] ring-[#f0dfbb]',
  accepted: 'bg-white text-[#16875f] ring-[#cfe9df]',
  lodged: 'bg-white text-[#7c3aed] ring-[#ded2fb]',
  registered: 'bg-white text-[#16875f] ring-[#cfe9df]',
})

const MANAGEMENT_PIPELINE_STAGE_ACCENTS = Object.freeze({
  application: '#3b82f6',
  at_banks: '#d89b26',
  accepted: '#22a06b',
  lodged: '#8b5cf6',
  registered: '#10b981',
})

const MANAGEMENT_SLA_ICON_TONES = Object.freeze({
  first_contact: 'bg-[#eef6ff] text-[#2563a8] ring-[#dcecff]',
  ready_to_submit: 'bg-[#fff8eb] text-[#b7791f] ring-[#f0dfbb]',
  first_bank_decision: 'bg-[#f6f0ff] text-[#7c3aed] ring-[#eadcff]',
  within_sla: 'bg-[#edfdf6] text-[#16875f] ring-[#d2f4e3]',
})

const MANAGEMENT_SLA_ACCENTS = Object.freeze({
  first_contact: '#3b82f6',
  ready_to_submit: '#d89b26',
  first_bank_decision: '#8b5cf6',
  within_sla: '#10b981',
})

const MANAGEMENT_COMMISSION_TONES = Object.freeze({
  forecast: {
    accent: '#10b981',
    card: 'border-[#cfe9df] bg-[linear-gradient(135deg,#f5fffb_0%,#eaf8f1_100%)]',
    icon: 'bg-white text-[#16875f] ring-[#cfe9df]',
  },
  committed: {
    accent: '#2563a8',
    card: 'border-[#d8e8fb] bg-[linear-gradient(135deg,#f7fbff_0%,#edf6ff_100%)]',
    icon: 'bg-white text-[#2563a8] ring-[#d7e6f5]',
  },
  ready_to_invoice: {
    accent: '#d89b26',
    card: 'border-[#f0dfbb] bg-[linear-gradient(135deg,#fffdf6_0%,#fff5dc_100%)]',
    icon: 'bg-white text-[#b7791f] ring-[#f0dfbb]',
  },
  invoiced: {
    accent: '#8b5cf6',
    card: 'border-[#e0d6fb] bg-[linear-gradient(135deg,#fbf8ff_0%,#f1eaff_100%)]',
    icon: 'bg-white text-[#7c3aed] ring-[#ded2fb]',
  },
  paid: {
    accent: '#15803d',
    card: 'border-[#cae9d6] bg-[linear-gradient(135deg,#f7fff9_0%,#e9f8ee_100%)]',
    icon: 'bg-white text-[#15803d] ring-[#cae9d6]',
  },
})

const MANAGEMENT_TABLE_TONES = Object.freeze({
  consultants: {
    accent: '#2563a8',
    icon: 'bg-[#eef6ff] text-[#2563a8] ring-[#dcecff]',
    panel: 'bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]',
  },
  partners: {
    accent: '#10b981',
    icon: 'bg-[#edfdf6] text-[#16875f] ring-[#d2f4e3]',
    panel: 'bg-[linear-gradient(180deg,#ffffff_0%,#fbfffc_100%)]',
  },
  banks: {
    accent: '#8b5cf6',
    icon: 'bg-[#f6f0ff] text-[#7c3aed] ring-[#eadcff]',
    panel: 'bg-[linear-gradient(180deg,#ffffff_0%,#fcfaff_100%)]',
  },
})

function formatDashboardTimestamp(value = '') {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Last updated: No data yet'
  return `Last updated: ${new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`
}

export default function BondHqCommandCentre({
  snapshot = {},
  rangeKey = 'last_30_days',
  onRangeChange = () => {},
  onRefresh = () => {},
}) {
  const overview = snapshot.managementOverview || {}
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-0 pb-6">
      <ManagementDashboardHeader
        overview={overview}
        rangeKey={rangeKey}
        onRangeChange={onRangeChange}
        onRefresh={onRefresh}
        generatedAt={snapshot.generatedAt}
      />

      <ManagementOverviewDashboard
        overview={overview}
        applications={snapshot.activeApplications || []}
        onOpenApplication={(href) => navigate(href || '/bond/applications')}
      />
    </div>
  )
}

function ManagementDashboardHeader({
  overview = {},
  rangeKey = 'last_30_days',
  onRangeChange = () => {},
  onRefresh = () => {},
  generatedAt = '',
}) {
  const filters = overview.filters || {}
  const rangeOptions = Object.entries(RANGE_LABELS)

  return (
    <section className="flex justify-end">
      <div className="grid w-full grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:w-auto xl:flex xl:flex-wrap">
          <select
            className="h-10 w-full min-w-0 rounded-[12px] border border-[#dfe7f0] bg-white px-4 text-[13px] font-semibold text-[#17324d] shadow-[0_8px_18px_rgba(15,23,42,0.035)] xl:w-auto"
            value={filters.scopeLabel || 'Current scope'}
            aria-label="Dashboard scope"
            disabled
          >
            <option>{filters.scopeLabel || 'Current scope'}</option>
          </select>
          <select
            className="h-10 w-full min-w-0 rounded-[12px] border border-[#dfe7f0] bg-white px-4 text-[13px] font-semibold text-[#17324d] shadow-[0_8px_18px_rgba(15,23,42,0.035)] xl:w-auto"
            value={rangeKey}
            onChange={(event) => onRangeChange(event.target.value)}
            aria-label="Dashboard date range"
          >
            {rangeOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select
            className="h-10 w-full min-w-0 rounded-[12px] border border-[#dfe7f0] bg-white px-4 text-[13px] font-semibold text-[#52657a] shadow-[0_8px_18px_rgba(15,23,42,0.035)] xl:w-auto"
            value="previous_period"
            aria-label="Comparison period"
            disabled
          >
            <option>Previous period</option>
          </select>
          <span className="min-w-0 truncate text-xs font-medium text-[#71869d] sm:col-span-3 xl:col-span-1">{formatDashboardTimestamp(generatedAt || filters.lastUpdatedAt)}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-[#dfe7f0] bg-white text-[#0b8a5b] shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition hover:border-[#b9cadc] sm:w-10"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={15} />
          </button>
      </div>
    </section>
  )
}

function ManagementOverviewDashboard({ overview = {}, applications = [], onOpenApplication = () => {} }) {
  const kpis = (Array.isArray(overview.kpis) ? overview.kpis : []).filter((item) => item?.key !== 'registered_ytd')
  const pipeline = Array.isArray(overview.pipeline) ? overview.pipeline : []
  const targetTracker = overview.targetTracker || overview.targets || {}
  const clientRankings = overview.clientRankings || overview.topClients || {}
  const bankApprovalRanking = Array.isArray(overview.bankApprovalRanking) ? overview.bankApprovalRanking : []
  const visualMetrics = Array.isArray(overview.visualMetrics) ? overview.visualMetrics : []

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => <ManagementKpiCard key={item.key} item={item} source={overview.metricSources?.[toMetricSourceKey(item.key)]} />)}
      </section>

      <ManagementPipelineSection stages={pipeline} />
      <ManagementTargetTracker target={targetTracker} />
      <ManagementActiveApplicationsSection applications={applications} onOpenApplication={onOpenApplication} />
      <ManagementRankingSection clientRankings={clientRankings} bankApprovalRanking={bankApprovalRanking} />
      <ManagementVisualMetricGrid metrics={visualMetrics} />
    </div>
  )
}

function toMetricSourceKey(key = '') {
  return {
    new_buyer_cases: 'newBuyerCases',
    active_pipeline: 'activePipeline',
    approval_rate: 'approvalRate',
    registered_ytd: 'registeredYtd',
    commission_forecast: 'commissionForecast',
  }[key] || key
}

function getManagementKpiTrendLabel(item = {}) {
  if (normalizeText(item.comparison)) return item.comparison
  if (item.key === 'active_pipeline') return 'Loans in progress'
  if (item.key === 'commission_forecast') return 'Forecast'
  return 'Tracking'
}

function formatCompactMoneyLabel(value = '', fallback = 'R0') {
  if (typeof value === 'number') return formatCompactMoney(value, fallback)
  const raw = normalizeText(value)
  if (!raw) return fallback
  const amount = getMoneyValueFromLabel(raw)
  return amount ? formatCompactMoney(amount, fallback) : raw
}

function formatKpiDisplayValue(item = {}) {
  if (item.key === 'commission_forecast') return formatCompactMoneyLabel(item.value, item.value || 'No data yet')
  return item.value || 'No data yet'
}

function formatKpiDisplayLabel(item = {}) {
  if (item.key === 'approval_rate') return 'Approval Rate'
  return item.label || 'Metric'
}

function formatKpiSecondaryValue(value = '') {
  const raw = normalizeText(value)
  if (!raw) return 'No secondary data yet'
  return raw.toLowerCase().startsWith('r') ? formatCompactMoneyLabel(raw, raw) : raw
}

function getManagementKpiSeries(item = {}) {
  const explicitSeries = [item.sparkline, item.series, item.trendSeries, item.values].find((value) => Array.isArray(value) && value.length)
  if (explicitSeries) return explicitSeries.slice(-8).map((value) => normalizeNumber(value))

  const rawValue = getNumericFromLabel(item.value || item.secondary)
  const baseValue = rawValue > 0 ? rawValue : 18 + (String(item.key || '').length * 3)
  const direction = getTrendDirection(item.comparison)
  const slope = direction === 'down' ? -0.14 : direction === 'up' ? 0.16 : 0.07
  const seed = String(item.key || 'kpi').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)

  return Array.from({ length: 8 }, (_, index) => {
    const wave = Math.sin((index + 1) * ((seed % 5) + 1)) * 0.045
    const progress = (index / 7) * slope
    const value = baseValue * (0.9 + progress + wave)
    return Math.max(1, Math.round(value))
  })
}

function ManagementKpiTrendBadge({ label = '', direction = 'flat' }) {
  const level = direction === 'down' ? 'critical' : direction === 'up' ? 'positive' : 'neutral'
  const Icon = direction === 'down' ? TrendingUp : TrendingUp
  return (
    <span className={`inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${getBadgeTone(level)}`}>
      <Icon size={11} className={direction === 'down' ? 'rotate-180' : ''} />
      <span className="max-w-[96px] truncate">{label || 'Tracking'}</span>
    </span>
  )
}

function ManagementKpiSparkline({ values = [], tone = MANAGEMENT_KPI_CHART_TONES.new_buyer_cases }) {
  const safeValues = (values.length ? values : [12, 14, 13, 17, 19, 18, 22, 25]).slice(-8).map((value) => normalizeNumber(value))
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)
  const points = safeValues.map((value, index) => {
    const x = 4 + (index / Math.max(safeValues.length - 1, 1)) * 92
    const y = 33 - ((value - min) / range) * 24
    return { x, y }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1]?.x.toFixed(2) || 96} 38 L ${points[0]?.x.toFixed(2) || 4} 38 Z`

  return (
    <svg className="h-10 w-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="KPI trend">
      <path d={areaPath} fill={tone.fill || 'rgba(59,130,246,0.1)'} />
      <path d={linePath} fill="none" stroke={tone.line || '#3b82f6'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={points[points.length - 1]?.x || 96} cy={points[points.length - 1]?.y || 12} r="2.4" fill={tone.line || '#3b82f6'} />
    </svg>
  )
}

function ManagementKpiCard({ item = {}, source = '' }) {
  const Icon = {
    new_buyer_cases: UserRound,
    active_pipeline: Layers3,
    approval_rate: Gauge,
    registered_ytd: FileCheck2,
    commission_forecast: Banknote,
  }[item.key] || LineChart
  const iconTone = MANAGEMENT_KPI_ICON_TONES[item.key] || 'bg-[#eef6ff] text-[#2563a8] ring-[#dcecff]'
  const accent = MANAGEMENT_KPI_ACCENTS[item.key] || 'bg-[#3b82f6]'
  const chartTone = MANAGEMENT_KPI_CHART_TONES[item.key] || MANAGEMENT_KPI_CHART_TONES.new_buyer_cases
  const trendLabel = getManagementKpiTrendLabel(item)
  const trendDirection = getTrendDirection(item.comparison)
  const series = getManagementKpiSeries(item)

  return (
    <Link
      to={item.href || '/bond/applications'}
      title={source || item.label}
      className={`group relative flex min-h-[168px] min-w-0 flex-col overflow-hidden p-5 ${MANAGEMENT_CARD_BASE} ${MANAGEMENT_CARD_HOVER}`}
    >
      <span className={`pointer-events-none absolute inset-x-6 bottom-0 h-1 rounded-t-full ${accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${iconTone}`}>
            {createElement(Icon, { size: 18 })}
          </span>
          <p className="truncate text-[14px] font-semibold text-[#17324d]">{formatKpiDisplayLabel(item)}</p>
        </div>
        <ArrowRight size={15} className="mt-2 shrink-0 text-[#9aacbf] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_88px] items-end gap-5">
        <div className="min-w-0">
          <p className={`truncate text-[clamp(2rem,2.4vw,2.45rem)] font-semibold leading-none tracking-normal ${getKpiValueClass(item.key)}`}>
            {formatKpiDisplayValue(item)}
          </p>
          <p className="mt-3 truncate text-[13px] font-semibold text-[#52677d]">{formatKpiSecondaryValue(item.secondary)}</p>
        </div>
        <div className="min-w-0">
          <ManagementKpiSparkline values={series} tone={chartTone} />
        </div>
      </div>

      <div className="mt-auto pt-4 text-[12px]">
        <span className={`inline-flex min-w-0 items-center gap-1 font-semibold ${trendDirection === 'down' ? 'text-[#b42318]' : trendDirection === 'up' ? 'text-[#16875f]' : 'text-[#60758d]'}`}>
          <TrendingUp size={13} className={trendDirection === 'down' ? 'rotate-180' : ''} />
          <span className="truncate">{trendLabel}</span>
        </span>
      </div>
    </Link>
  )
}

const PIPELINE_ICONS = Object.freeze({
  application: FileText,
  at_banks: Landmark,
  accepted: FileCheck2,
  lodged: Download,
  registered: ShieldAlert,
})

function getPipelineHeroTotals(stages = []) {
  const totalCases = stages.reduce((sum, stage) => sum + normalizeNumber(stage.count), 0)
  const totalValue = stages.reduce((sum, stage) => sum + getMoneyValueFromLabel(stage.loanValueLabel), 0)
  return {
    totalCases,
    totalValueLabel: totalValue ? formatCompactMoney(totalValue, 'R0') : 'R0',
  }
}

function getPipelineStageShapeClass(index = 0, totalStages = 1) {
  if (totalStages <= 1) return 'xl:[clip-path:polygon(0_0,100%_0,100%_100%,0_100%)]'
  if (index === 0) return 'xl:[clip-path:polygon(0_0,calc(100%-18px)_0,100%_50%,calc(100%-18px)_100%,0_100%)]'
  if (index === totalStages - 1) return 'xl:[clip-path:polygon(0_0,100%_0,100%_100%,0_100%,18px_50%)]'
  return 'xl:[clip-path:polygon(0_0,calc(100%-18px)_0,100%_50%,calc(100%-18px)_100%,0_100%,18px_50%)]'
}

function ManagementPipelineStageCard({ stage = {}, index = 0, totalStages = 1, totalCases = 0 }) {
  const Icon = PIPELINE_ICONS[stage.key] || Layers3
  const tone = MANAGEMENT_PIPELINE_STAGE_TONES[stage.key] || 'border-[#dce6f0] bg-[#f8fbff]'
  const iconTone = MANAGEMENT_PIPELINE_STAGE_ICON_TONES[stage.key] || 'bg-white text-[#2563a8] ring-[#d7e6f5]'
  const accent = MANAGEMENT_PIPELINE_STAGE_ACCENTS[stage.key] || '#3b82f6'
  const count = normalizeNumber(stage.count)
  const share = totalCases ? Math.max(4, Math.min(100, Math.round((count / totalCases) * 100))) : 0

  return (
    <Link
      to={stage.href || '/bond/applications'}
      className={`group relative min-h-[126px] overflow-hidden rounded-[16px] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] transition hover:z-10 hover:border-[#b9cadc] hover:shadow-[0_16px_30px_rgba(15,23,42,0.065)] xl:flex-1 xl:rounded-none xl:pl-8 xl:first:rounded-l-[18px] xl:last:rounded-r-[18px] ${tone} ${getPipelineStageShapeClass(index, totalStages)}`}
      aria-label={`${stage.label}: ${formatNumber(count)} cases`}
    >
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/75" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-1 transition-all duration-300" style={{ width: `${share}%`, backgroundColor: accent }} />
      <div className="relative flex h-full items-start gap-4">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${iconTone}`}>
          {createElement(Icon, { size: 17 })}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#17324d]">{stage.label}</p>
          <p className="mt-2 text-[2rem] font-semibold leading-none text-[#101828]">{formatNumber(count)}</p>
          <p className="mt-2 text-[12px] font-semibold text-[#4c6076]">{formatCompactMoneyLabel(stage.loanValueLabel || '', 'R0')}</p>
          {stage.detail ? <p className="mt-1 truncate text-[12px] font-medium text-[#71869d]">{stage.detail}</p> : null}
        </div>
      </div>
    </Link>
  )
}

function ManagementPipelineSection({ stages = [] }) {
  const totals = getPipelineHeroTotals(stages)
  return (
    <section className={`${MANAGEMENT_PANEL_BASE} overflow-hidden`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[1.5rem] font-semibold tracking-normal text-[#142132]">Applications Pipeline</h2>
          <p className="mt-1 text-sm font-medium text-[#60758d]">{formatNumber(totals.totalCases)} cases across {totals.totalValueLabel}</p>
        </div>
        <Link to="/bond/pipeline" className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] border border-[#dfe7f0] bg-white px-4 text-xs font-bold text-[#17324d] shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition hover:border-[#b9cadc] sm:w-auto">
          View pipeline
          <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-6 grid gap-3 overflow-x-auto pb-1 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:gap-0">
        {stages.map((stage, index) => (
          <ManagementPipelineStageCard
            key={stage.key}
            stage={stage}
            index={index}
            totalStages={stages.length}
            totalCases={totals.totalCases}
          />
        ))}
      </div>
    </section>
  )
}

function ManagementTargetTracker({ target = {} }) {
  const actual = normalizeNumber(target.actual ?? target.current ?? target.value)
  const goal = normalizeNumber(target.target ?? target.goal)
  const progress = goal ? Math.round((actual / goal) * 100) : normalizeNumber(target.progress)
  const clampedProgress = Math.max(0, Math.min(100, progress))
  const remaining = Math.max(goal - actual, 0)
  const title = normalizeText(target.title || target.label) || 'Target Tracker'
  const helper = normalizeText(target.helper || target.detail) || (goal ? `${formatNumber(remaining)} applications remaining` : 'Set monthly targets under organisation targets')
  const goalLabel = goal ? `${formatNumber(actual)} of ${formatNumber(goal)} applications` : `${formatNumber(actual)} applications tracked`

  return (
    <section className={`${MANAGEMENT_PANEL_BASE} overflow-hidden`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[1.5rem] font-semibold tracking-normal text-[#142132]">{title}</h2>
            <span className="rounded-full bg-[#eef8f4] px-2.5 py-1 text-[11px] font-bold text-[#16875f] ring-1 ring-[#d2f4e3]">
              {clampedProgress}% complete
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-[#60758d]">{goalLabel}</p>
        </div>
        <Link to={target.href || '/settings/organisation#targets'} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] border border-[#dfe7f0] bg-white px-4 text-xs font-bold text-[#17324d] shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition hover:border-[#b9cadc] sm:w-auto">
          Organisation targets
          <ArrowRight size={13} />
        </Link>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e8eef6]" aria-label={`${title}: ${clampedProgress}% complete`}>
        <span className="block h-full rounded-full bg-[#0b8a5b] transition-all duration-300" style={{ width: `${clampedProgress}%` }} />
      </div>
      <div className="mt-3 flex flex-col gap-1 text-xs font-semibold text-[#60758d] sm:flex-row sm:items-center sm:justify-between">
        <span>{helper}</span>
        <span>{goal ? `Target ${formatNumber(goal)}` : 'No target set'}</span>
      </div>
    </section>
  )
}

function ManagementClientRankingList({ title = '', rows = [], metric = 'value' }) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 5) : []
  const maxValue = Math.max(...safeRows.map((row) => metric === 'volume' ? normalizeNumber(row.count || row.applications) : getMoneyValueFromLabel(row.valueLabel || row.value)), 1)

  return (
    <div className="min-w-0 rounded-[16px] border border-[#e7edf4] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.035)]">
      <h3 className="text-sm font-semibold text-[#17324d]">{title}</h3>
      <div className="mt-4 space-y-3">
        {safeRows.length ? safeRows.map((row, index) => {
          const value = metric === 'volume' ? normalizeNumber(row.count || row.applications) : getMoneyValueFromLabel(row.valueLabel || row.value)
          const share = Math.max(6, Math.min(100, Math.round((value / maxValue) * 100)))
          return (
            <div key={row.key || `${title}-${index}`} className="min-w-0">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-[#142132]">{row.client || row.name || 'Client pending'}</p>
                <p className="shrink-0 text-xs font-bold text-[#204b84]">{metric === 'volume' ? formatNumber(value) : row.valueLabel || formatCompactMoney(value, 'R0')}</p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8eef6]">
                <span className="block h-full rounded-full bg-[#24518a]" style={{ width: `${share}%` }} />
              </div>
            </div>
          )
        }) : (
          <p className="rounded-[12px] bg-[#f8fbfd] px-3 py-4 text-center text-xs font-semibold text-[#60758d]">No client data yet</p>
        )}
      </div>
    </div>
  )
}

function ManagementTopClientsCard({ rankings = {} }) {
  const byVolume = Array.isArray(rankings.byVolume) ? rankings.byVolume : []
  const byValue = Array.isArray(rankings.byValue) ? rankings.byValue : []

  return (
    <section className={`${MANAGEMENT_PANEL_BASE} min-w-0 overflow-hidden`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef6ff] text-[#24518a] ring-1 ring-[#dcecff]">
          <UsersRound size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[1.35rem] font-semibold tracking-normal text-[#142132]">Top Clients</h2>
          <p className="mt-1 text-sm font-medium text-[#60758d]">By volume and value</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <ManagementClientRankingList title="By Volume" rows={byVolume} metric="volume" />
        <ManagementClientRankingList title="By Value" rows={byValue} metric="value" />
      </div>
    </section>
  )
}

function ManagementBankApprovalRankingCard({ rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 6) : []

  return (
    <section className={`${MANAGEMENT_PANEL_BASE} min-w-0 overflow-hidden`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edfdf6] text-[#16875f] ring-1 ring-[#d2f4e3]">
          <Landmark size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[1.35rem] font-semibold tracking-normal text-[#142132]">Bank Approval Rate Ranking</h2>
          <p className="mt-1 text-sm font-medium text-[#60758d]">Approval rate by submitted bank</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {safeRows.length ? safeRows.map((row, index) => {
          const approvalRate = normalizeNumber(row.approvalRate)
          return (
            <div key={row.key || row.bank || index} className="rounded-[14px] border border-[#e7edf4] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f4f8fb] text-xs font-bold text-[#24518a] ring-1 ring-[#e1e9f2]">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#142132]">{row.bank || row.name || 'Bank pending'}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-[#60758d]">{formatNumber(row.approved)} of {formatNumber(row.submitted || row.total)} approved</p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-bold text-[#16875f]">{formatPercent(approvalRate)}</p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8eef6]">
                <span className="block h-full rounded-full bg-[#16875f]" style={{ width: `${Math.max(4, Math.min(100, approvalRate))}%` }} />
              </div>
            </div>
          )
        }) : (
          <p className="rounded-[12px] bg-[#f8fbfd] px-3 py-4 text-center text-xs font-semibold text-[#60758d]">No bank approval data yet</p>
        )}
      </div>
    </section>
  )
}

function ManagementRankingSection({ clientRankings = {}, bankApprovalRanking = [] }) {
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <ManagementTopClientsCard rankings={clientRankings} />
      <ManagementBankApprovalRankingCard rows={bankApprovalRanking} />
    </section>
  )
}

function ManagementVisualMetricCard({ metric = {} }) {
  const values = (Array.isArray(metric.values) && metric.values.length ? metric.values : [0]).map((value) => normalizeNumber(value))
  const max = Math.max(...values, 1)
  const tone = metric.tone || '#24518a'

  return (
    <section className={`${MANAGEMENT_CARD_BASE} min-w-0 overflow-hidden p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#17324d]">{metric.label || 'Metric'}</p>
          <p className="mt-3 truncate text-[clamp(2rem,2.2vw,2.35rem)] font-semibold leading-none text-[#101828]">{metric.value || 'No data yet'}</p>
          <p className="mt-2 truncate text-xs font-semibold text-[#60758d]">{metric.detail || 'Tracking current portfolio'}</p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4f8fb] text-[#24518a] ring-1 ring-[#e1e9f2]">
          <LineChart size={17} />
        </span>
      </div>
      <div className="mt-6 flex h-[104px] items-end gap-2 border-b border-[#e8eef5] pb-1" aria-label={`${metric.label || 'Metric'} visualisation`}>
        {values.slice(-12).map((value, index) => (
          <span
            key={`${metric.key || 'metric'}-${index}`}
            className="block flex-1 rounded-t-[5px] transition-all duration-300"
            style={{ height: `${Math.max(8, Math.round((value / max) * 96))}px`, backgroundColor: tone }}
            title={String(value)}
          />
        ))}
      </div>
    </section>
  )
}

function ManagementVisualMetricGrid({ metrics = [] }) {
  const safeMetrics = Array.isArray(metrics) ? metrics : []

  return (
    <section className="grid gap-5 lg:grid-cols-3">
      {safeMetrics.map((metric) => <ManagementVisualMetricCard key={metric.key || metric.label} metric={metric} />)}
    </section>
  )
}

const BOND_APPLICATION_STAGE_TO_TRANSACTION_STAGE = Object.freeze({
  docs: 'new_listing',
  submission: 'under_offer',
  feedback: 'conditional',
  approval: 'unconditional',
  instruction: 'settled_pending_registration',
  lead: 'new_listing',
})

function getBondApplicationCarouselStage(application = {}) {
  const stageKey = normalizeText(application.currentStage || application.financeStageKey || '').toLowerCase()
  const filterStage = (application.filterKeys || []).find((key) => ['awaiting_docs', 'ready_for_review', 'submitted', 'bank_feedback', 'approved'].includes(key))
  if (filterStage === 'awaiting_docs') return 'new_listing'
  if (filterStage === 'ready_for_review' || filterStage === 'submitted') return 'under_offer'
  if (filterStage === 'bank_feedback') return 'conditional'
  if (filterStage === 'approved') return 'unconditional'
  if (stageKey.includes('instruction') || stageKey.includes('lodged') || stageKey.includes('registered')) return 'settled_pending_registration'
  if (stageKey.includes('approved') || stageKey.includes('accepted')) return 'unconditional'
  if (stageKey.includes('bank') || stageKey.includes('feedback')) return 'conditional'
  if (stageKey.includes('submit')) return 'under_offer'
  return BOND_APPLICATION_STAGE_TO_TRANSACTION_STAGE[stageKey] || 'new_listing'
}

function getBondApplicationArea(application = {}) {
  const row = application.row || {}
  return normalizeText(
    application.area ||
      row?.property?.suburb ||
      row?.property?.area ||
      row?.listing?.suburb ||
      row?.transaction?.suburb ||
      application.developmentName,
  ) || 'Area pending'
}

function getBondApplicationSeller(application = {}) {
  const row = application.row || {}
  return resolvePortalSellerName(
    {
      ...row,
      sellerName: application.sellerName,
      transaction: row.transaction,
    },
    { fallback: row?.transaction?.assigned_agent || application.agentName || 'Seller pending' },
  )
}

function getBondApplicationValueRaw(application = {}) {
  const explicit = normalizeNumber(application.bondValueRaw)
  if (explicit) return explicit
  return getMoneyValueFromLabel(application.bondValue)
}

function getBondApplicationStatusLabel(application = {}) {
  const raw = normalizeText(application.statusLabel || application.currentStage || 'Active')
  const normalized = raw.toLowerCase()
  if (normalized.includes('transfer') || normalized.includes('instruction')) return 'XFER'
  if (normalized.includes('attorney') || normalized.includes('lodged')) return 'ATTY'
  if (normalized.includes('final') || normalized.includes('registered') || normalized.includes('approved')) return 'FIN'
  if (normalized.includes('offer') || normalized.includes('accepted')) return 'OTP'
  return raw.length <= 5 ? raw.toUpperCase() : 'OTP'
}

function buildBondApplicationCarouselRecords(applications = []) {
  return (Array.isArray(applications) ? applications : []).slice(0, 10).map((application, index) => ({
    id: application.id || application.transactionId || `${index}-${application.propertyLabel || application.buyerName || 'bond-application'}`,
    title: resolvePortalPropertyLabel(application.row || application, { fallback: application.propertyLabel || application.developmentName || 'Property pending' }),
    subtitle: getBondApplicationArea(application),
    value: getBondApplicationValueRaw(application),
    valueLabel: formatCompactMoneyLabel(application.bondValue || '', 'R0'),
    ownerName: application.consultantName || 'Unassigned originator',
    ownerRoleLabel: 'Originator',
    daysInStage: getNumericFromLabel(application.applicationAge),
    stageKey: getBondApplicationCarouselStage(application),
    statusLabel: getBondApplicationStatusLabel(application),
    clientLabel: 'Buyer',
    clientName: resolvePortalBuyerName(application.row || application, { fallback: application.buyerName || 'Buyer pending' }),
    secondaryClientLabel: 'Seller',
    secondaryClientName: getBondApplicationSeller(application),
    imageUrl: application.imageUrl || application.propertyImage || application.row?.property?.imageUrl || application.row?.listing?.imageUrl,
    href: application.href || '/bond/applications',
  }))
}

function ManagementActiveApplicationsSection({ applications = [], onOpenApplication = () => {} }) {
  const records = buildBondApplicationCarouselRecords(applications)
  const totalValue = records.reduce((sum, record) => sum + normalizeNumber(record.value), 0)
  const recordById = new Map(records.map((record) => [record.id, record]))

  return (
    <section className={`${MANAGEMENT_PANEL_BASE} overflow-hidden`}>
      <ActivePipelineCarousel
        title="Active Applications"
        subtitle="The current bond files your team is actively moving."
        mode="residential_sales"
        records={records}
        onViewAll={() => onOpenApplication('/bond/applications')}
        onOpenRecord={(recordId) => onOpenApplication(recordById.get(recordId)?.href || '/bond/applications')}
        viewAllLabel="View all applications"
        summary={{
          primary: `${records.length} active application${records.length === 1 ? '' : 's'}`,
          secondary: `${formatCompactMoney(totalValue, 'R0')} total application value`,
        }}
        emptyState={
          <div className="rounded-[24px] border border-dashed border-[#d8e1ec] bg-[#fbfdff] px-6 py-10 text-center">
            <p className="text-[16px] font-semibold tracking-normal text-[#10243a]">No active applications yet.</p>
            <p className="mt-2 text-[13px] leading-6 text-[#66768a]">Active bond applications will appear here once buyer files move into progress.</p>
          </div>
        }
      />
    </section>
  )
}

function getManagementSlaIcon(key = '') {
  return {
    first_contact: Clock3,
    ready_to_submit: FileText,
    first_bank_decision: Landmark,
    within_sla: ShieldAlert,
  }[key] || Gauge
}

function getManagementSlaProgress(item = {}) {
  const value = getNumericFromLabel(item.value)
  if (!value) return 0
  if (item.key === 'within_sla') return Math.max(0, Math.min(100, value))
  const target = getNumericFromLabel(item.target)
  if (!target) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function ManagementSlaMetric({ item = {} }) {
  const Icon = getManagementSlaIcon(item.key)
  const iconTone = MANAGEMENT_SLA_ICON_TONES[item.key] || 'bg-[#eef6ff] text-[#2563a8] ring-[#dcecff]'
  const accent = MANAGEMENT_SLA_ACCENTS[item.key] || '#3b82f6'
  const progress = getManagementSlaProgress(item)
  const barColor = item.onTrack === false ? '#ef4444' : accent
  const valueLabel = normalizeText(item.value) || '--'
  const targetLabel = normalizeText(item.target).replace('<=', '≤') || 'No target set'
  const helperLabel = item.onTrack === null || item.onTrack === undefined ? 'No data' : item.onTrack ? 'On track' : 'Needs attention'

  return (
    <div className="group relative min-w-0 overflow-hidden rounded-[16px] border border-[#e7edf4] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.035)] transition hover:border-[#cbd9e8] hover:shadow-[0_16px_34px_rgba(15,23,42,0.055)]">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${iconTone}`}>
          {createElement(Icon, { size: 17 })}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-[#17324d]">{item.label}</p>
          <p className="mt-3 truncate text-[2rem] font-semibold leading-none text-[#101828]">{valueLabel}</p>
          <p className="mt-2 truncate text-[12px] font-medium text-[#60758d]">{helperLabel}</p>
        </div>
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e8eef6]" aria-hidden="true">
        <span className="block h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: barColor }} />
      </div>
      <p className="mt-3 truncate text-[12px] font-medium text-[#52677d]">{targetLabel}</p>
    </div>
  )
}

function ManagementSlaSection({ items = [] }) {
  const measuredItems = items.filter((item) => item.onTrack !== null && item.onTrack !== undefined)
  const onTrackCount = measuredItems.filter((item) => item.onTrack).length
  const overallOnTrack = measuredItems.length ? onTrackCount === measuredItems.length : null

  return (
    <section className={`${MANAGEMENT_PANEL_BASE} overflow-hidden`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[1.5rem] font-semibold tracking-normal text-[#142132]">Application Speed & SLA</h2>
          <p className="mt-1 text-sm font-medium text-[#60758d]">{measuredItems.length ? `${onTrackCount} of ${measuredItems.length} targets on track` : 'SLA measurement pending'}</p>
        </div>
        <span className={`inline-flex h-10 items-center rounded-[12px] px-4 text-xs font-bold ring-1 ${
          overallOnTrack === null ? getBadgeTone('neutral') : overallOnTrack ? getBadgeTone('positive') : getBadgeTone('critical')
        }`}>
          {overallOnTrack === null ? 'Pending' : overallOnTrack ? 'Healthy' : 'Watch'}
        </span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => <ManagementSlaMetric key={item.key} item={item} />)}
      </div>
    </section>
  )
}

function getManagementCommissionIcon(key = '') {
  return {
    forecast: LineChart,
    committed: FileCheck2,
    ready_to_invoice: FileText,
    invoiced: Download,
    paid: Banknote,
  }[key] || Banknote
}

function getManagementCommissionAmount(item = {}) {
  return getMoneyValueFromLabel(item.value)
}

function ManagementCommissionCard({ item = {} }) {
  const tone = MANAGEMENT_COMMISSION_TONES[item.key] || MANAGEMENT_COMMISSION_TONES.forecast
  const Icon = getManagementCommissionIcon(item.key)

  return (
    <Link
      to={item.href || '/bond/revenue'}
      className="group relative min-w-0 overflow-hidden rounded-[16px] border border-[#e7edf4] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.035)] transition hover:-translate-y-px hover:border-[#b9cadc] hover:shadow-[0_16px_34px_rgba(15,23,42,0.055)]"
    >
      <span className="pointer-events-none absolute inset-x-5 bottom-0 h-1 rounded-t-full" style={{ backgroundColor: tone.accent }} />
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${tone.icon}`}>
          {createElement(Icon, { size: 17 })}
        </span>
        <ArrowRight size={13} className="mt-1 shrink-0 text-[#8aa0b7] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <div className="mt-5 min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#17324d]">{item.label}</p>
        <p className="mt-2 truncate text-[clamp(1.75rem,2vw,2.1rem)] font-semibold leading-none text-[#101828]">{item.value}</p>
        <p className="mt-3 truncate text-[12px] font-medium text-[#60758d]">{item.detail}</p>
      </div>
    </Link>
  )
}

function buildExecutiveCommissionCards(cards = [], commission = {}) {
  const byKey = new Map(cards.map((item) => [item.key, item]))
  const forecast = byKey.get('forecast') || {}
  const committedAmount = getManagementCommissionAmount(byKey.get('committed'))
  const readyAmount = getManagementCommissionAmount(byKey.get('ready_to_invoice'))
  const invoicedAmount = getManagementCommissionAmount(byKey.get('invoiced'))
  const pendingAmount = committedAmount || readyAmount + invoicedAmount
  const paid = byKey.get('paid') || {}
  const paidAmount = getManagementCommissionAmount(paid)
  const reconciliationRate = normalizeText(commission.reconciliationRate || commission.reconciliationRateLabel)
    || (pendingAmount || paidAmount ? `${Math.max(0, Math.min(100, Math.round((paidAmount / Math.max(pendingAmount + paidAmount, 1)) * 100)))}%` : 'Pending')

  return [
    {
      key: 'forecast',
      label: 'Forecast (30 Days)',
      value: formatCompactMoneyLabel(forecast.value || '', forecast.value || 'Pending'),
      detail: forecast.detail || 'Forecast revenue',
      href: forecast.href || '/bond/revenue?view=forecast',
    },
    {
      key: 'ready_to_invoice',
      label: 'Pending Payout',
      value: pendingAmount ? formatCompactMoney(pendingAmount, 'R0') : 'Pending',
      detail: byKey.get('ready_to_invoice')?.detail || byKey.get('committed')?.detail || 'Applications pending',
      href: '/bond/revenue?view=pending',
    },
    {
      key: 'paid',
      label: 'Paid (30 Days)',
      value: formatCompactMoneyLabel(paid.value || '', paid.value || 'Pending'),
      detail: paid.detail || 'Paid applications',
      href: paid.href || '/bond/revenue?view=paid',
    },
    {
      key: 'committed',
      label: 'Reconciliation Rate',
      value: reconciliationRate,
      detail: normalizeText(commission.reconciliationDetail) || 'Revenue matched',
      href: '/bond/revenue?view=reconciliation',
    },
  ]
}

function buildCommissionTrendValues(commission = {}, cards = []) {
  const explicit = [commission.trend, commission.trendValues, commission.chart, commission.chartValues, commission.series]
    .find((value) => Array.isArray(value) && value.length)
  if (explicit) return explicit.slice(-30).map((item) => normalizeNumber(item?.value ?? item?.amount ?? item))
  const seedAmount = Math.max(...cards.map(getManagementCommissionAmount), 1)
  return Array.from({ length: 30 }, (_, index) => {
    const wave = Math.sin(index * 1.7) * 0.12
    const lift = index > 22 ? 0.1 : index > 14 ? -0.03 : 0.02
    return Math.max(1, Math.round(seedAmount * (0.54 + wave + lift + ((index % 5) * 0.025))))
  })
}

function ManagementCommissionTrendChart({ values = [] }) {
  const safeValues = values.length ? values : [12, 15, 14, 18, 20, 16, 22, 19]
  const max = Math.max(...safeValues, 1)

  return (
    <div className="mt-6 rounded-[18px] border border-[#e7edf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.035)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[#17324d]">Commission Trend</h3>
          <p className="mt-1 text-[12px] font-medium text-[#71869d]">Last 30 days</p>
        </div>
      </div>
      <div className="mt-5 flex h-[150px] items-end gap-2 border-b border-[#e8eef5] pb-1" aria-label="Commission trend chart">
        {safeValues.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="block flex-1 rounded-t-[4px] bg-[#173f38] transition-all duration-300"
            style={{ height: `${Math.max(8, Math.round((value / max) * 128))}px` }}
            title={formatCompactMoney(value, 'R0')}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-5 text-[11px] font-medium text-[#71869d]">
        <span>01 Jul</span>
        <span>08 Jul</span>
        <span>15 Jul</span>
        <span>22 Jul</span>
        <span className="text-right">30 Jul</span>
      </div>
    </div>
  )
}

function ManagementInvoiceQueue({ items = [] }) {
  if (!items.length) return null

  return (
    <div className="mt-2.5 rounded-[11px] border border-[#e5edf4] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#71869d]">Ready to invoice</p>
        <span className="rounded-full bg-[#fffaeb] px-2 py-0.5 text-[10px] font-semibold text-[#b54708] ring-1 ring-[#fde68a]">
          {items.length} queued
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link key={item.key} to={item.href || '/bond/revenue'} className="group min-w-0 rounded-[10px] bg-white px-3 py-2 ring-1 ring-[#edf2f7] transition hover:-translate-y-px hover:ring-[#cbd9e8]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#17324d]">{item.partner}</p>
                <p className="mt-0.5 truncate text-xs text-[#60758d]">{item.buyer} · {item.bank}</p>
              </div>
              <p className="w-fit shrink-0 rounded-full bg-[#edfdf6] px-2 py-0.5 text-[11px] font-bold text-[#16875f] ring-1 ring-[#d2f4e3]">{item.amount}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ManagementCommissionSection({ commission = {} }) {
  const cards = Array.isArray(commission.cards) ? commission.cards : []
  const executiveCards = buildExecutiveCommissionCards(cards, commission)
  const trendValues = buildCommissionTrendValues(commission, cards)

  return (
    <section className={`${MANAGEMENT_PANEL_BASE} overflow-hidden`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[1.5rem] font-semibold tracking-normal text-[#142132]">Commission & Reconciliation</h2>
          <p className="mt-1 text-sm font-medium text-[#60758d]">Forecast, payout and reconciliation movement.</p>
        </div>
        {commission.unpricedApplications ? (
          <span className="inline-flex h-10 min-w-0 items-center rounded-[12px] bg-[#fff7ed] px-4 text-xs font-bold text-[#b54708] ring-1 ring-[#fed7aa]">
            {commission.unpricedApplications} unpriced
          </span>
        ) : null}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {executiveCards.map((item) => <ManagementCommissionCard key={item.key} item={item} />)}
      </div>
      <ManagementCommissionTrendChart values={trendValues} />
    </section>
  )
}

function ManagementPerformanceTables({ tables = {} }) {
  const consultantRows = (tables.consultants || []).map((row) => [row.name, row.newCases, row.registered, `${row.approvalRate}%`, row.revenue])
  const partnerRows = (tables.partners || []).map((row) => [row.name, row.referred, row.registered, `${row.approvalRate}%`, row.revenue])
  const bankRows = (tables.banks || []).map((row) => [row.name, row.applications, row.approved, `${row.approvalRate}%`, row.avgTat])

  return (
    <section className="grid gap-2.5 xl:grid-cols-2 2xl:grid-cols-3">
      <ManagementTable
        title="Consultant Performance"
        viewHref="/bond/consultant-performance"
        icon={UsersRound}
        tone={MANAGEMENT_TABLE_TONES.consultants}
        columns={['Consultant', 'New Cases', 'Registered', 'Approval', 'Revenue']}
        rows={consultantRows}
        summaryLabel="Team leaders"
      />
      <ManagementTable
        title="Top Referral Partners"
        viewHref="/bond/partners"
        icon={Building2}
        tone={MANAGEMENT_TABLE_TONES.partners}
        columns={['Partner', 'Referred', 'Registered', 'Approval', 'Revenue']}
        rows={partnerRows}
        summaryLabel="Referral quality"
      />
      <ManagementTable
        title="Bank Performance"
        viewHref="/bond/banks"
        icon={Landmark}
        tone={MANAGEMENT_TABLE_TONES.banks}
        columns={['Bank', 'Applications', 'Approved', 'Approval', 'Avg. TAT']}
        rows={bankRows}
        summaryLabel="Bank efficiency"
      />
    </section>
  )
}

function ManagementTable({ title = '', viewHref = '', icon: Icon = LineChart, tone = MANAGEMENT_TABLE_TONES.consultants, columns = [], rows = [], summaryLabel = '' }) {
  const topRow = rows[0] || []

  return (
    <div className={`relative min-w-0 overflow-hidden p-3 ${MANAGEMENT_CARD_BASE} ${tone.panel}`}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: tone.accent }} />
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ring-1 ${tone.icon}`}>
            {createElement(Icon, { size: 16 })}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[#142132]">{title}</h2>
            <p className="mt-0.5 truncate text-[11px] font-medium text-[#60758d]">
              {rows.length ? `${rows.length} ranked · ${summaryLabel}` : 'No ranked rows yet'}
            </p>
          </div>
        </div>
        <Link to={viewHref} className="inline-flex h-7 w-full shrink-0 items-center justify-center gap-1 rounded-[8px] border border-[#dbe5ef] bg-white px-2.5 text-xs font-bold text-[#204b84] transition hover:border-[#b9cadc] sm:w-auto">
          View all
          <ArrowRight size={12} />
        </Link>
      </div>

      {topRow.length ? (
        <div className="mt-2.5 rounded-[10px] border border-[#e5edf4] bg-white/75 px-3 py-2">
          <p className="truncate text-[11px] font-bold text-[#71869d]">Top performer</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p className="min-w-0 truncate text-sm font-semibold text-[#17324d]">{topRow[0]}</p>
            <p className="shrink-0 text-xs font-bold" style={{ color: tone.accent }}>{topRow[topRow.length - 1]}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-2.5 overflow-x-auto pb-1">
        <table className="w-full min-w-[390px] border-separate border-spacing-y-1 text-left text-xs sm:min-w-[430px]">
          <thead className="text-[#71869d]">
            <tr>
              {columns.map((column, index) => (
                <th key={column} className={`pb-1 pr-2 font-bold sm:pr-3 ${index === 0 ? 'pl-2 text-left' : 'text-right'}`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[#17324d]">
            {rows.length ? rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${title}-${index}-${cellIndex}`}
                    className={`bg-[#f8fbfd] py-1.5 pr-2 sm:pr-3 ${cellIndex === 0 ? 'rounded-l-[9px] pl-2 text-left font-semibold' : 'text-right font-medium'} ${cellIndex === row.length - 1 ? 'rounded-r-[9px]' : ''}`}
                  >
                    {cellIndex === 0 ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold ring-1 ring-[#e1e9f2]" style={{ color: tone.accent }}>{index + 1}</span>
                        <span className="truncate">{cell}</span>
                      </span>
                    ) : cell}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td className="rounded-[10px] bg-[#f8fbfd] px-3 py-4 text-center font-medium text-[#60758d]" colSpan={columns.length}>No data yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HqNewApplicationsRail({ applications = [] }) {
  const rows = Array.isArray(applications) ? applications.slice(0, 8) : []

  return (
    <section className="rounded-[22px] border border-[#e1e9f2] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#748aa0]">New Applications</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#142132]">Incoming and recently assigned work</h2>
        </div>
        <Link to="/bond/applications?view=incoming" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
          Open applications <ArrowRight size={15} />
        </Link>
      </div>

      {rows.length ? (
        <div className="mt-5 -mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          <div className="flex min-w-max gap-3">
            {rows.map((application, index) => (
              <Link
                key={application.id || application.transactionId || `${application.buyerName}-${index}`}
                to={application.href || '/bond/applications?view=incoming'}
                className="w-[285px] shrink-0 rounded-[16px] border border-[#e2eaf3] bg-[#fbfdff] p-4 transition hover:-translate-y-px hover:border-[#bfd0e1] hover:bg-white hover:shadow-[0_10px_22px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#142132]">{application.buyerName || 'Buyer pending'}</p>
                    <p className="mt-1 truncate text-xs text-[#667f96]">{application.propertyLabel || application.developmentName || 'Property pending'}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#eaf2fb] px-2 py-1 text-[11px] font-semibold text-[#24518a]">{application.statusLabel || 'Incoming'}</span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7b8fa6]">Next action</p>
                    <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-[#38536c]">{application.nextAction || 'Review application'}</p>
                  </div>
                  <ArrowRight size={16} className="shrink-0 text-[#315f8c]" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-[14px] bg-[#f8fbff] px-4 py-3 text-sm text-[#60758d]">New applications will appear here as buyers choose or are referred to your bond team.</p>
      )}
    </section>
  )
}

const BANK_BREAKDOWN_COLORS = ['#24518a', '#17946b', '#b7791f', '#7c3aed']

function buildBankBreakdownRows(bankPerformance = {}, bankDistribution = []) {
  const distributionByBank = new Map((bankDistribution || []).map((row) => [normalizeText(row.bank).toLowerCase(), row]))
  return (bankPerformance.rows || []).map((row) => {
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
  }).slice(0, 4)
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
  const financeMix = objectEntriesWithValues(demographics.bondVsCash || {}).length ? demographics.bondVsCash : {}
  const clientType = objectEntriesWithValues(demographics.clientType || {}).length ? demographics.clientType : {}

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
          {createElement(Icon, { size: 18, strokeWidth: 2.25 })}
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

function WhatNeedsAttentionSection({ hq = {}, priorityActions = [], operationalRiskMatrix = [], atRiskApplications = [], operationalDiagnostics = {} }) {
  const health = buildOperationalHealthModel(hq)
  const attentionItems = buildAttentionItems({
    alerts: hq.alerts || [],
    priorityActions,
    operationalRiskMatrix,
    atRiskApplications,
    operationalDiagnostics,
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
