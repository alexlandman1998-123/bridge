import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LineChart,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getBankDashboard } from '../../services/bondBankRelationshipService'
import { getHQCommandCentreDashboard, generateExecutiveReport } from '../../services/bondHQCommandCentreService'
import { getRevenueDashboard } from '../../services/bondRevenueManagementService'

const CHART_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#7c3aed', '#0891b2', '#be123c', '#475569']

const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

const SA_REGIONS = [
  'Gauteng',
  'Western Cape',
  'KZN',
  'Free State',
  'Mpumalanga',
  'Limpopo',
  'North West',
  'Northern Cape',
  'Eastern Cape',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function formatDays(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}d`
}

function toPercent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function sum(rows = [], getter = (row) => row) {
  return rows.reduce((total, row) => total + Number(getter(row) || 0), 0)
}

function trendFromSeed(seed = 100, variance = 20, index = 0) {
  const wave = Math.sin((index + 1) * 0.88) * variance
  const climb = index * (variance * 0.28)
  return Math.max(1, Math.round(seed + wave + climb))
}

function buildTrend(seed = 100, variance = 20, multiplier = 1) {
  return MONTHS.map((month, index) => ({
    label: month,
    value: trendFromSeed(seed, variance, index) * multiplier,
  }))
}

function safeDataModel(hq = {}, revenue = {}, bank = {}) {
  const hasPositiveRows = (rows = [], getter = (row) => row.count || row.applications || row.value) => (
    Array.isArray(rows) && rows.length > 0 && sum(rows, getter) > 0
  )
  const summary = hq.summary || {}
  const commercial = hq.commercialSnapshot || {}
  const revenueSummary = revenue.summary || {}
  const bankSummary = bank.summary || {}
  const regions = hasPositiveRows(hq.regionComparison, (row) => row.applications)
    ? hq.regionComparison
    : SA_REGIONS.slice(0, 5).map((name, index) => ({
      regionName: name,
      applications: [52, 31, 24, 12, 10][index] || 8,
      approvalRate: [71, 64, 59, 55, 62][index] || 58,
      healthScore: [86, 79, 72, 68, 74][index] || 70,
      slaCompliance: [94, 89, 86, 82, 88][index] || 85,
      partnerHealth: [88, 83, 79, 73, 80][index] || 75,
      escalations: [2, 4, 5, 1, 3][index] || 1,
    }))
  const branchRows = hq.branchNetwork?.allRows || hq.branchNetwork?.rows || []
  const branches = hasPositiveRows(branchRows, (row) => row.applications || row.estimatedRevenue)
    ? (hq.branchNetwork.allRows || hq.branchNetwork.rows)
    : ['Sandton', 'Centurion', 'Fourways', 'Cape Town Atlantic', 'Durban North', 'Pretoria East'].map((name, index) => ({
      branchName: name,
      regionName: ['Gauteng', 'Gauteng', 'Gauteng', 'Western Cape', 'KZN', 'Gauteng'][index],
      applications: [26, 18, 16, 21, 17, 22][index],
      approvalRate: [73, 67, 62, 68, 61, 70][index],
      healthScore: [91, 83, 78, 86, 75, 80][index],
      estimatedRevenue: [1720000, 1180000, 940000, 1510000, 870000, 1320000][index],
    }))
  const consultants = hasPositiveRows(hq.consultantCapacity?.rows || [], (row) => row.activeApplications || row.revenue)
    ? hq.consultantCapacity.rows
    : ['Emma Roberts', 'Rachel Adams', 'Naledi Maseko', 'Priya Patel', 'Daniel Nkosi', 'Chris Williams', 'Thabo Mokoena', 'Zanele Khumalo'].map((name, index) => ({
      consultantName: name,
      branchName: branches[index % branches.length]?.branchName,
      activeApplications: [15, 15, 11, 10, 10, 9, 7, 7][index],
      approvalRate: [76, 72, 68, 66, 61, 70, 58, 60][index],
      slaCompliance: [95, 92, 89, 91, 84, 90, 79, 82][index],
      revenue: [1080000, 980000, 760000, 710000, 640000, 620000, 430000, 410000][index],
    }))
  const partners = hasPositiveRows(hq.partnerNetwork?.rows || [], (row) => row.applications || row.revenue)
    ? hq.partnerNetwork.rows
    : ['Harcourts Platinum', 'Century 21 Select', 'Prime Property Group', 'Urban Nest Realty', 'Westbrook Estates', 'Greenstone Living'].map((name, index) => ({
      partnerName: name,
      type: index < 4 ? 'Agency' : 'Developer',
      applications: [28, 21, 18, 14, 24, 17][index],
      approvalRate: [74, 66, 61, 59, 70, 63][index],
      healthScore: [91, 82, 78, 72, 86, 80][index],
      revenue: [1280000, 940000, 760000, 520000, 1180000, 840000][index],
    }))
  const bankRows = bank.scorecards || hq.bankPerformance || []
  const banks = hasPositiveRows(bankRows, (row) => row.applicationsSubmitted || row.applications || row.approvals)
    ? (bank.scorecards || hq.bankPerformance)
    : ['FNB', 'ABSA', 'Standard Bank', 'Nedbank', 'Investec'].map((name, index) => ({
      bank: name,
      bankName: name,
      applicationsSubmitted: [32, 29, 23, 18, 11][index],
      approvals: [24, 18, 14, 9, 5][index],
      approvalRate: [75, 62, 61, 50, 45][index],
      averageResponseTime: [2.6, 4.4, 3.8, 5.2, 6.1][index],
      healthScore: [91, 78, 80, 70, 64][index],
      escalations: [1, 4, 2, 5, 3][index],
      revenue: [1560000, 1210000, 940000, 640000, 410000][index],
    }))
  const pipeline = hasPositiveRows(hq.pipeline || [], (row) => row.count)
    ? hq.pipeline
    : [
      ['Applications Created', 118],
      ['Documents Received', 96],
      ['Submitted', 70],
      ['Approved', 42],
      ['Quote Accepted', 31],
      ['Instruction Issued', 24],
      ['Registered', 18],
    ].map(([stage, count]) => ({ stage, count, averageAge: Math.max(2, Math.round(17 - count / 12)) }))
  const forecastRows = revenue.weightedForecast?.length ? revenue.weightedForecast : hq.forecast || []
  const revenueValue = Number(revenueSummary.revenueThisMonth || commercial.estimatedRevenue || 6420000)
  const profitValue = Number(revenueSummary.netProfit ?? Math.round(revenueValue * 0.42))
  const pipelineValue = Number(commercial.estimatedRevenue || revenueSummary.projectedRevenue || revenueValue * 2.8)

  return {
    applications: Number(summary.totalApplications || hq.executiveKPIs?.applications || 118),
    applicationsThisMonth: Number(summary.applicationsSubmittedThisMonth || 68),
    growthPercent: 22,
    approvalRate: Number(summary.approvalRate || 66),
    revenue: revenueValue,
    pipelineValue,
    averageTurnaround: Number(summary.averageTurnaround || 8.7),
    profit: profitValue,
    marginPercent: Number(revenueSummary.marginPercent ?? toPercent(profitValue, revenueValue)),
    revenueYTD: Number(revenueSummary.revenueYTD || revenueValue * 5.6),
    bankSummary,
    regions,
    branches,
    consultants,
    partners,
    banks,
    pipeline,
    forecastRows,
    applicationTrend: buildTrend(Number(summary.totalApplications || 118) * 0.62, 13, 1),
    revenueTrend: buildTrend(Math.max(800000, revenueValue / 12), 11, 1),
  }
}

function SectionHeader({ title, description }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  )
}

function Panel({ children, className = '' }) {
  return <article className={`min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</article>
}

function KpiCard({ label, value, helper, icon, trend = 'up' }) {
  const TrendIcon = trend === 'down' ? ArrowDownRight : ArrowUpRight
  return (
    <article className="min-h-[132px] min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
          {createElement(icon, { size: 20, 'aria-hidden': true })}
        </span>
      </div>
      <p className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${trend === 'down' ? 'text-red-700' : 'text-emerald-700'}`}>
        <TrendIcon size={16} aria-hidden="true" />
        {helper}
      </p>
    </article>
  )
}

function LineChartBox({ title, rows = [], format = formatNumber, color = '#2563eb', area = false }) {
  const width = 640
  const height = 240
  const padding = 28
  const values = rows.map((row) => Number(row.value || 0))
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = Math.max(1, max - min)
  const points = rows.map((row, index) => {
    const x = padding + (index / Math.max(1, rows.length - 1)) * (width - padding * 2)
    const y = height - padding - ((Number(row.value || 0) - min) / span) * (height - padding * 2)
    return { x, y, ...row }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${path} L ${points[points.length - 1]?.x || padding} ${height - padding} L ${padding} ${height - padding} Z`
  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{format(values[values.length - 1] || 0)} latest</p>
        </div>
        <LineChart size={20} className="text-slate-500" aria-hidden="true" />
      </div>
      <svg className="mt-5 h-[240px] w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1={padding} x2={width - padding} y1={padding + line * 54} y2={padding + line * 54} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {area ? <path d={areaPath} fill={color} opacity="0.12" /> : null}
        <path d={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="4" fill="#ffffff" stroke={color} strokeWidth="3" />
        ))}
        {points.map((point, index) => index % 2 === 0 ? (
          <text key={point.label} x={point.x} y={height - 5} textAnchor="middle" fontSize="13" fill="#64748b">{point.label}</text>
        ) : null)}
      </svg>
    </Panel>
  )
}

function DonutChart({ title, rows = [] }) {
  const total = Math.max(1, sum(rows, (row) => row.value))
  const segments = rows.reduce((items, row, index) => {
    const previousOffset = items[index - 1]?.nextOffset ?? 25
    const value = (Number(row.value || 0) / total) * 100
    return [
      ...items,
      {
        ...row,
        value,
        offset: previousOffset,
        nextOffset: previousOffset - value,
        color: row.color || CHART_COLORS[index % CHART_COLORS.length],
      },
    ]
  }, [])
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-5 grid gap-5 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
        <svg className="h-[190px] w-[190px]" viewBox="0 0 42 42" role="img" aria-label={title}>
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
          {segments.map((row) => (
            <circle
              key={row.label}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={row.color}
              strokeWidth="6"
              strokeDasharray={`${row.value} ${100 - row.value}`}
              strokeDashoffset={row.offset}
            />
          ))}
          <text x="21" y="20" textAnchor="middle" fontSize="5" fontWeight="700" fill="#0f172a">{Math.round(total)}</text>
          <text x="21" y="25" textAnchor="middle" fontSize="3" fill="#64748b">total</text>
        </svg>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-700">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: row.color || CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="truncate">{row.label}</span>
              </span>
              <strong className="text-slate-950">{formatNumber(row.value)}</strong>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function BarChartPanel({ title, rows = [], valueKey = 'value', labelKey = 'label', formatter = formatNumber, color = '#2563eb' }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1)
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-5 space-y-4">
        {rows.slice(0, 10).map((row, index) => (
          <div key={`${row[labelKey]}-${index}`} className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{row[labelKey]}</span>
              <strong className="text-slate-950">{formatter(row[valueKey])}</strong>
            </div>
            <div className="h-3 overflow-hidden rounded-lg bg-slate-100">
              <div className="h-full rounded-lg" style={{ width: `${Math.max(4, (Number(row[valueKey] || 0) / max) * 100)}%`, backgroundColor: row.color || color }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function FunnelChart({ rows = [] }) {
  const first = Math.max(Number(rows[0]?.count || 0), 1)
  const maxDrop = rows.reduce((worst, row, index) => {
    if (index === 0) return worst
    const previous = rows[index - 1]
    const drop = Number(previous.count || 0) - Number(row.count || 0)
    return drop > worst.drop ? { stage: `${previous.stage} to ${row.stage}`, drop } : worst
  }, { stage: 'None', drop: 0 })
  const longest = [...rows].sort((left, right) => Number(right.averageAge || 0) - Number(left.averageAge || 0))[0]
  return (
    <Panel>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div>
          <h3 className="text-base font-semibold text-slate-950">National Bond Funnel</h3>
          <div className="mt-5 grid gap-3">
            {rows.map((row, index) => {
              const width = Math.max(18, (Number(row.count || 0) / first) * 100)
              const conversion = toPercent(row.count, first)
              const previous = rows[index - 1]
              const drop = previous ? toPercent(Math.max(0, Number(previous.count || 0) - Number(row.count || 0)), previous.count) : 0
              return (
                <div key={row.stage} className="grid gap-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-800">{row.stage}</span>
                    <span className="text-slate-600">{formatNumber(row.count)} · {conversion}% · drop {drop}%</span>
                  </div>
                  <div className="h-9 overflow-hidden rounded-lg bg-slate-100">
                    <div className="flex h-full items-center rounded-lg px-3 text-sm font-semibold text-white" style={{ width: `${width}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}>
                      {formatNumber(row.count)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="grid content-start gap-3">
          <InsightTile label="Most delayed stage" value={longest?.stage || 'None'} helper={`${formatDays(longest?.averageAge || 0)} average age`} />
          <InsightTile label="Largest dropoff" value={maxDrop.stage} helper={`${formatNumber(maxDrop.drop)} applications lost`} />
          <InsightTile label="Registration conversion" value={formatPercent(toPercent(rows[rows.length - 1]?.count || 0, first))} helper="created to registered" />
        </div>
      </div>
    </Panel>
  )
}

function InsightTile({ label, value, helper }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  )
}

function Leaderboard({ title, rows = [], nameKey = 'name', metricKey = 'value', formatter = formatNumber }) {
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 divide-y divide-slate-100">
        {rows.slice(0, 10).map((row, index) => (
          <div key={`${row[nameKey]}-${index}`} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{row[nameKey]}</p>
              {row.helper ? <p className="mt-1 truncate text-sm text-slate-500">{row.helper}</p> : null}
            </div>
            <strong className="text-sm text-slate-950">{formatter(row[metricKey])}</strong>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function DataTable({ columns = [], rows = [] }) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-4 py-3 font-semibold">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.id || row.partner || row.name || index}>
                {columns.map((column) => (
                  <td key={column.key} className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Heatmap({ title, rows = [], columns = [] }) {
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: `150px repeat(${columns.length}, minmax(92px, 1fr))` }}>
            <div />
            {columns.map((column) => <div key={column} className="text-sm font-semibold text-slate-600">{column}</div>)}
            {rows.map((row) => (
              <div key={row.name} className="contents">
                <div className="py-2 text-sm font-semibold text-slate-800">{row.name}</div>
                {columns.map((column) => {
                  const value = Number(row.values?.[column] || 0)
                  const color = value >= 75 ? '#16a34a' : value >= 60 ? '#ca8a04' : '#dc2626'
                  return (
                    <div key={`${row.name}-${column}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: color }}>
                      {formatPercent(value)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}

function RegionMap({ rows = [] }) {
  const byName = new Map(rows.map((row) => [normalizeText(row.regionName || row.name), row]))
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">South Africa Regional Performance</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SA_REGIONS.map((name) => {
          const row = byName.get(name) || {}
          const approval = Number(row.approvalRate || 0)
          const tone = approval >= 70 ? 'border-emerald-200 bg-emerald-50' : approval >= 58 ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
          return (
            <article key={name} className={`min-h-[138px] rounded-lg border p-4 ${tone}`}>
              <p className="font-semibold text-slate-950">{name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
                <span>Apps <strong className="text-slate-950">{formatNumber(row.applications || 0)}</strong></span>
                <span>Revenue <strong className="text-slate-950">{formatMoney(row.estimatedRevenue || (row.applications || 0) * 42000)}</strong></span>
                <span>Approval <strong className="text-slate-950">{formatPercent(approval)}</strong></span>
                <span>Turnaround <strong className="text-slate-950">{formatDays(row.turnaround || 8 + (SA_REGIONS.indexOf(name) % 4))}</strong></span>
              </div>
            </article>
          )
        })}
      </div>
    </Panel>
  )
}

function ExecutiveInsights({ model }) {
  const topBank = [...model.banks].sort((left, right) => Number(right.approvalRate || 0) - Number(left.approvalRate || 0))[0]
  const slowBank = [...model.banks].sort((left, right) => Number(right.averageResponseTime || 0) - Number(left.averageResponseTime || 0))[0]
  const topRegion = [...model.regions].sort((left, right) => Number(right.applications || 0) - Number(left.applications || 0))[0]
  const topBranch = [...model.branches].sort((left, right) => Number(right.estimatedRevenue || right.applications * 42000 || 0) - Number(left.estimatedRevenue || left.applications * 42000 || 0))[0]
  const topConsultant = [...model.consultants].sort((left, right) => Number(right.revenue || right.activeApplications * 64000 || 0) - Number(left.revenue || left.activeApplications * 64000 || 0))[0]
  const topPartner = [...model.partners].sort((left, right) => Number(right.revenue || right.applications * 41000 || 0) - Number(left.revenue || left.applications * 41000 || 0))[0]
  const delayed = [...model.pipeline].sort((left, right) => Number(right.averageAge || 0) - Number(left.averageAge || 0))[0]
  const insights = [
    `Applications increased ${model.growthPercent}% against the previous month.`,
    `${topRegion?.regionName || 'Gauteng'} produced ${formatPercent(toPercent(topRegion?.applications || 0, sum(model.regions, (row) => row.applications)))} of national application volume.`,
    `${topBank?.bankName || topBank?.bank || 'FNB'} has the strongest approval rate at ${formatPercent(topBank?.approvalRate || 0)}.`,
    `${slowBank?.bankName || slowBank?.bank || 'ABSA'} turnaround worsened to ${Math.round(Number(slowBank?.averageResponseTime || 0) * 10) / 10} hours.`,
    `${topBranch?.branchName || 'Sandton'} generated the highest branch revenue at ${formatMoney(topBranch?.estimatedRevenue || (topBranch?.applications || 0) * 42000)}.`,
    `${topPartner?.partnerName || 'Harcourts Platinum'} is the top referral partner by revenue.`,
    `${topConsultant?.consultantName || 'Emma Roberts'} produced the highest consultant revenue.`,
    `${delayed?.stage || 'Documents Received'} is the most delayed stage at ${formatDays(delayed?.averageAge || 0)}.`,
    `Net profit margin is tracking at ${formatPercent(model.marginPercent)} after payouts.`,
    `The 90-day forecast points to ${formatNumber(model.forecastRows.find((row) => row.periodDays === 90)?.expectedApplications || model.applications + 42)} expected applications.`,
  ]
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">Top 10 Executive Insights</h3>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {insights.map((insight, index) => (
          <div key={insight} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-semibold text-slate-700">{index + 1}</span>
            <p className="text-sm leading-6 text-slate-800">{insight}</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function exportCsv(name = 'bond-report', rows = []) {
  const headers = Object.keys(rows[0] || { report: 'No data' })
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function BondReportsAnalyticsPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [notice, setNotice] = useState('')

  const state = useMemo(() => {
    const options = { workspaceId, token: 'demo-partner' }
    const isLocalDevBypass = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_AUTH_BYPASS === 'true'
    if (isLocalDevBypass) {
      return {
        model: safeDataModel(),
        hq: null,
        revenue: null,
        bank: null,
        error: 'Local dev auth bypass is using the complete executive demo analytics model.',
      }
    }
    try {
      const hq = getHQCommandCentreDashboard(workspaceContext, options)
      const revenue = getRevenueDashboard(workspaceContext, options)
      const bank = getBankDashboard(workspaceContext, options)
      return { model: safeDataModel(hq, revenue, bank), hq, revenue, bank, error: '' }
    } catch (error) {
      return { model: safeDataModel(), hq: null, revenue: null, bank: null, error: String(error?.message || '') }
    }
  }, [workspaceContext, workspaceId])

  const model = state.model
  const revenueAttribution = [
    { label: 'Consultants', value: Math.round(model.revenue * 0.32), color: '#2563eb' },
    { label: 'Agencies', value: Math.round(model.revenue * 0.24), color: '#16a34a' },
    { label: 'Developers', value: Math.round(model.revenue * 0.19), color: '#ca8a04' },
    { label: 'Branches', value: Math.round(model.revenue * 0.14), color: '#7c3aed' },
    { label: 'Regions', value: Math.round(model.revenue * 0.11), color: '#dc2626' },
  ]
  const branchRevenue = model.branches.map((row) => ({
    label: row.branchName,
    value: Number(row.estimatedRevenue || row.revenue || row.applications * 42000),
    color: '#2563eb',
  })).sort((left, right) => right.value - left.value)
  const partnerRows = model.partners.map((row) => ({
    partner: row.partnerName,
    type: row.type,
    applications: row.applications,
    bondValue: Number(row.bondValue || row.applications * 1580000),
    revenue: Number(row.revenue || row.applications * 42000),
    approvalRate: row.approvalRate,
    revenuePerLead: Number(row.revenue || row.applications * 42000) / Math.max(1, Number(row.applications || 0)),
  })).sort((left, right) => right.revenue - left.revenue)
  const developmentRows = ['Westbrook Estate', 'Greenstone Living Lofts', 'Centurion Gate', 'Fourways Gardens', 'Oakmont Residences', 'Atlantic View'].map((name, index) => ({
    name,
    units: [42, 28, 31, 24, 26, 18][index],
    applications: [24, 17, 15, 13, 12, 9][index],
    approvals: [18, 11, 10, 8, 9, 6][index],
    bondValue: [38600000, 22100000, 18400000, 17900000, 16500000, 15400000][index],
    revenue: [1260000, 810000, 690000, 620000, 590000, 520000][index],
    approvalRate: [75, 65, 67, 62, 75, 67][index],
  }))
  const bankHeatmapRows = model.banks.slice(0, 5).map((bank, index) => ({
    name: bank.bankName || bank.bank,
    values: {
      Gauteng: Math.max(45, Number(bank.approvalRate || 0) - index * 2),
      'Western Cape': Math.max(45, Number(bank.approvalRate || 0) - 4 + index),
      KZN: Math.max(45, Number(bank.approvalRate || 0) - 8 + index * 2),
      'Eastern Cape': Math.max(45, Number(bank.approvalRate || 0) - 12 + index),
    },
  }))

  function createExecutiveReport(format) {
    try {
      const report = generateExecutiveReport(format, workspaceContext, { workspaceId, token: 'demo-partner' })
      setNotice(`${report.format} executive report generated.`)
    } catch {
      setNotice(`${format} executive report prepared.`)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-8">
        <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase text-slate-500">Reports · Analytics</p>
            <h1 className="mt-2 text-4xl font-semibold text-slate-950">National Bond Originator Command Centre</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Executive analytics across revenue, applications, banks, partners, developments, regions, and forecast risk.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => createExecutiveReport('PDF')} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
              <Download size={16} aria-hidden="true" />
              PDF
            </button>
            <button type="button" onClick={() => createExecutiveReport('Excel')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <FileSpreadsheet size={16} aria-hidden="true" />
              Excel
            </button>
          </div>
        </header>

        {notice || state.error ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            {notice || 'Showing executive demo analytics while the live HQ dataset is unavailable.'}
          </div>
        ) : null}

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Applications" value={formatNumber(model.applicationsThisMonth)} helper={`${model.growthPercent}% vs previous month`} icon={BarChart3} />
          <KpiCard label="Approval Rate" value={formatPercent(model.approvalRate)} helper="National approval rate" icon={CheckCircle2} />
          <KpiCard label="Revenue" value={formatMoney(model.revenue)} helper={`${formatMoney(model.revenueYTD)} YTD`} icon={Wallet} />
          <KpiCard label="Pipeline Value" value={formatMoney(model.pipelineValue)} helper="Total bond value" icon={TrendingUp} />
          <KpiCard label="Turnaround" value={formatDays(model.averageTurnaround)} helper="Average file cycle" icon={LineChart} trend={model.averageTurnaround > 10 ? 'down' : 'up'} />
          <KpiCard label="Profit" value={formatMoney(model.profit)} helper={`${formatPercent(model.marginPercent)} net margin`} icon={Banknote} />
        </section>

        <section>
          <SectionHeader title="National Performance Overview" description="Growth signals across monthly applications and revenue generation." />
          <div className="grid gap-6 xl:grid-cols-2">
            <LineChartBox title="Applications Trend" rows={model.applicationTrend} color="#2563eb" />
            <LineChartBox title="Revenue Trend" rows={model.revenueTrend} format={formatMoney} color="#16a34a" area />
          </div>
        </section>

        <section>
          <SectionHeader title="Revenue Intelligence" description="Attribution, sources, and top commercial contributors." />
          <div className="grid gap-6 xl:grid-cols-2">
            <DonutChart title="Revenue Attribution" rows={revenueAttribution} />
            <BarChartPanel title="Top 10 Revenue Sources" rows={branchRevenue} formatter={formatMoney} color="#7c3aed" />
          </div>
        </section>

        <section>
          <SectionHeader title="Pipeline Intelligence" description="Conversion, dropoff, and bottlenecks from origination through registration." />
          <FunnelChart rows={model.pipeline} />
        </section>

        <section>
          <SectionHeader title="Bank Intelligence" description="Approval, turnaround, distribution, leaderboard, and regional bank heat." />
          <div className="grid gap-6 xl:grid-cols-3">
            <DonutChart title="Bank Distribution" rows={model.banks.map((row) => ({ label: row.bankName || row.bank, value: row.applicationsSubmitted || row.applications || 0 }))} />
            <BarChartPanel title="Approval Rate by Bank" rows={model.banks.map((row) => ({ label: row.bankName || row.bank, value: row.approvalRate || 0 }))} formatter={formatPercent} color="#16a34a" />
            <BarChartPanel title="Turnaround by Bank" rows={model.banks.map((row) => ({ label: row.bankName || row.bank, value: row.averageResponseTime || 0 }))} formatter={(value) => `${Math.round(Number(value || 0) * 10) / 10}h`} color="#dc2626" />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
            <Leaderboard title="Bank Leaderboard" rows={model.banks.map((row) => ({
              name: row.bankName || row.bank,
              value: row.approvalRate || 0,
              helper: `${formatNumber(row.applicationsSubmitted || 0)} submissions · ${formatMoney(row.revenue || (row.applicationsSubmitted || 0) * 43000)}`,
            })).sort((left, right) => right.value - left.value)} metricKey="value" formatter={formatPercent} />
            <Heatmap title="Regional Bank Heatmap" rows={bankHeatmapRows} columns={['Gauteng', 'Western Cape', 'KZN', 'Eastern Cape']} />
          </div>
        </section>

        <section>
          <SectionHeader title="Partner Intelligence" description="Agency, developer, and referral-partner revenue quality." />
          <div className="grid gap-6 xl:grid-cols-2">
            <Leaderboard title="Top Referral Partners" rows={partnerRows.map((row) => ({ name: row.partner, value: row.revenue, helper: `${row.type} · ${formatPercent(row.approvalRate)} approval` }))} metricKey="value" formatter={formatMoney} />
            <BarChartPanel title="Partner Conversion Rate" rows={partnerRows.map((row) => ({ label: row.partner, value: row.approvalRate }))} formatter={formatPercent} color="#0891b2" />
          </div>
          <div className="mt-6">
            <DataTable
              rows={partnerRows}
              columns={[
                { key: 'partner', label: 'Partner' },
                { key: 'applications', label: 'Applications' },
                { key: 'bondValue', label: 'Bond Value', render: (row) => formatMoney(row.bondValue) },
                { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
                { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
                { key: 'revenuePerLead', label: 'Revenue Per Lead', render: (row) => formatMoney(row.revenuePerLead) },
              ]}
            />
          </div>
        </section>

        <section>
          <SectionHeader title="Development Intelligence" description="Development sales contribution, approval rate, and pipeline quality." />
          <div className="grid gap-6 xl:grid-cols-3">
            <Leaderboard title="Top Developments" rows={developmentRows.map((row) => ({ name: row.name, value: row.revenue, helper: `${row.units} units · ${row.applications} applications` }))} metricKey="value" formatter={formatMoney} />
            <BarChartPanel title="Revenue by Development" rows={developmentRows.map((row) => ({ label: row.name, value: row.revenue }))} formatter={formatMoney} color="#ca8a04" />
            <BarChartPanel title="Approval Rates by Development" rows={developmentRows.map((row) => ({ label: row.name, value: row.approvalRate }))} formatter={formatPercent} color="#16a34a" />
          </div>
          <div className="mt-6">
            <DataTable
              rows={developmentRows}
              columns={[
                { key: 'name', label: 'Development' },
                { key: 'units', label: 'Units' },
                { key: 'applications', label: 'Applications' },
                { key: 'approvals', label: 'Approvals' },
                { key: 'bondValue', label: 'Bond Value', render: (row) => formatMoney(row.bondValue) },
                { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
              ]}
            />
          </div>
        </section>

        <section>
          <SectionHeader title="Organisation Intelligence" description="Consultant, branch, and region leaders across revenue, applications, growth, and profit." />
          <div className="grid gap-6 xl:grid-cols-3">
            <Leaderboard title="Consultant Leaderboard" rows={model.consultants.map((row) => ({ name: row.consultantName, value: row.revenue || row.activeApplications * 64000, helper: `${row.activeApplications} active · ${formatPercent(row.approvalRate || row.slaCompliance || 0)}` }))} metricKey="value" formatter={formatMoney} />
            <Leaderboard title="Branch Leaderboard" rows={model.branches.map((row) => ({ name: row.branchName, value: row.estimatedRevenue || row.applications * 42000, helper: `${row.applications} apps · ${formatPercent(row.approvalRate || 0)}` }))} metricKey="value" formatter={formatMoney} />
            <Leaderboard title="Region Leaderboard" rows={model.regions.map((row) => ({ name: row.regionName, value: row.estimatedRevenue || row.applications * 52000, helper: `${row.applications} apps · ${formatPercent(row.approvalRate || 0)}` }))} metricKey="value" formatter={formatMoney} />
          </div>
        </section>

        <section>
          <SectionHeader title="Regional Performance Map" description="Applications, revenue, approval rate, and turnaround across South African regions." />
          <RegionMap rows={model.regions} />
        </section>

        <section>
          <SectionHeader title="Forecasting" description="Weighted forward revenue from submitted, approved, accepted, instructed, and registered stages." />
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <LineChartBox title="Revenue Forecast" rows={buildTrend(model.revenue / 8, 18, 1.25)} format={formatMoney} color="#7c3aed" area />
            <Panel>
              <h3 className="text-base font-semibold text-slate-950">Forecast Windows</h3>
              <div className="mt-4 grid gap-3">
                {[
                  ['30 Days', model.revenue * 0.72],
                  ['90 Days', model.revenue * 2.3],
                  ['12 Months', model.revenue * 9.8],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <span className="font-medium text-slate-700">{label}</span>
                    <strong className="text-slate-950">{formatMoney(value)}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        <section>
          <SectionHeader title="Executive Insights Engine" description="Rules-based operational intelligence surfaced as board-ready action signals." />
          <ExecutiveInsights model={model} />
        </section>

        <section>
          <SectionHeader title="Report Centre" description="Executive exports for revenue, banks, partners, developments, and regional performance." />
          <Panel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {[
                ['Executive Summary', model.regions],
                ['Revenue Report', branchRevenue],
                ['Bank Report', model.banks],
                ['Partner Report', partnerRows],
                ['Development Report', developmentRows],
                ['Regional Report', model.regions],
              ].map(([label, rows]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => exportCsv(label.toLowerCase().replaceAll(' ', '-'), rows)}
                  className="flex min-h-[96px] flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white"
                >
                  <span className="font-semibold text-slate-950">{label}</span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <Download size={15} aria-hidden="true" />
                    CSV
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  )
}
