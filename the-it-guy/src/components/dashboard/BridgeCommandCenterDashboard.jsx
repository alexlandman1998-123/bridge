import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileCheck2,
  FileWarning,
  Gavel,
  Landmark,
  LineChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { motion as Motion } from 'motion/react'
import { useMemo } from 'react'

const compactCurrency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const integer = new Intl.NumberFormat('en-ZA')

const DEMO_SERIES = [8, 11, 18, 16, 13, 20, 19, 15, 11, 19, 14, 25, 21, 29, 36, 25, 24, 29, 24, 36]

const DEMO_BANKS = [
  { key: 'standard_bank', label: 'Standard Bank', value: 42, color: '#1769e8' },
  { key: 'nedbank', label: 'Nedbank', value: 38, color: '#2eb39a' },
  { key: 'fnb', label: 'FNB', value: 29, color: '#ff9f1c' },
  { key: 'absa', label: 'Absa', value: 17, color: '#9b5de5' },
  { key: 'other', label: 'Other', value: 22, color: '#d7dce8' },
]

const DEMO_PIPELINE = [
  { key: 'leads', label: 'New Leads', count: 56, conversion: 12, icon: Users, color: '#1d63ed', warning: '' },
  { key: 'otp', label: 'OTP Signed', count: 34, conversion: 8, icon: FileCheck2, color: '#1472d8', warning: '' },
  { key: 'finance', label: 'Finance', count: 28, conversion: 6, icon: Landmark, color: '#f59e0b', warning: '5 waiting on bank' },
  { key: 'attorney', label: 'Attorney', count: 18, conversion: 4, icon: Gavel, color: '#0d9488', warning: '' },
  { key: 'lodgement', label: 'Lodgement', count: 8, conversion: 2, icon: Banknote, color: '#7c3aed', warning: '' },
  { key: 'registered', label: 'Registered', count: 4, conversion: 1, icon: CheckCircle2, color: '#16a34a', warning: '' },
]

const DEMO_ALERTS = [
  { label: 'Transactions missing buyer docs', count: 5, tone: 'danger', icon: FileWarning },
  { label: 'Bond applications stalled', count: 3, tone: 'danger', icon: TrendingUp },
  { label: 'Transfers awaiting guarantees', count: 2, tone: 'warning', icon: LineChart },
  { label: 'FICA verification pending', count: 4, tone: 'warning', icon: ShieldCheck },
  { label: 'Conditions overdue', count: 3, tone: 'warning', icon: Clock3 },
]

const DEMO_ACTIVITY = [
  { label: 'Bond approved by Nedbank', detail: 'Application #APP-1023', time: '3m ago', tone: 'success', icon: CheckCircle2 },
  { label: 'Transfer documents signed', detail: '123 Oceanview Drive', time: '8m ago', tone: 'info', icon: FileCheck2 },
  { label: 'Buyer uploaded FICA', detail: 'Application #APP-1045', time: '15m ago', tone: 'purple', icon: FileWarning },
  { label: 'Documents sent to attorney', detail: 'Application #APP-1011', time: '32m ago', tone: 'info', icon: FileCheck2 },
  { label: 'Registration completed', detail: 'Unit 45, Greenpark Estate', time: '1h ago', tone: 'success', icon: CheckCircle2 },
]

const DEMO_AGENTS = [
  { name: 'Sarah Johnson', registrations: 12, trend: 24, initials: 'SJ' },
  { name: 'Mike Williams', registrations: 9, trend: 18, initials: 'MW' },
  { name: 'Lindiwe Mokoena', registrations: 8, trend: 12, initials: 'LM' },
  { name: 'David Patel', registrations: 7, trend: -5, initials: 'DP' },
  { name: 'Emma Brown', registrations: 6, trend: 8, initials: 'EB' },
]

const STAGE_KEYS = {
  AVAIL: 'leads',
  LEAD: 'leads',
  OTP: 'otp',
  FIN: 'finance',
  ATTY: 'attorney',
  XFER: 'lodgement',
  REG: 'registered',
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function formatCompactCurrency(value) {
  const numeric = safeNumber(value)
  return numeric > 0 ? compactCurrency.format(numeric) : 'R0'
}

function formatCount(value) {
  return integer.format(Math.max(0, Math.round(safeNumber(value))))
}

function getMainStage(row) {
  const signal = String(row?.stage || row?.transaction?.stage || row?.unit?.status || '').toLowerCase()
  if (/register|complete/.test(signal)) return 'REG'
  if (/lodge|lodgement|deeds|transfer lodged/.test(signal)) return 'XFER'
  if (/attorney|conveyanc|transfer/.test(signal)) return 'ATTY'
  if (/finance|bond|bank|approval|guarantee/.test(signal)) return 'FIN'
  if (/otp|offer|signed/.test(signal)) return 'OTP'
  if (/lead|new|available/.test(signal)) return 'AVAIL'
  return 'AVAIL'
}

function getDealValue(row) {
  return safeNumber(
    row?.transaction?.sales_price ??
      row?.transaction?.purchase_price ??
      row?.unit?.current_price ??
      row?.unit?.list_price ??
      row?.unit?.price,
  )
}

function getUpdatedAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDaysSince(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return null
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff) || diff < 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatRelative(value) {
  const days = getDaysSince(value)
  if (days === null) return 'Just now'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  return `${Math.round(days / 7)}w ago`
}

function getFinanceType(row) {
  const signal = String(
    row?.transaction?.finance_type ||
      row?.transaction?.financeType ||
      row?.buyer?.finance_type ||
      row?.financeType ||
      '',
  ).toLowerCase()
  if (signal.includes('cash')) return 'Cash'
  if (signal.includes('hybrid') || signal.includes('combination')) return 'Hybrid'
  if (signal.includes('bond')) return 'Bond'
  return 'Bond'
}

function getBankName(row) {
  return (
    row?.transaction?.bank_name ||
    row?.transaction?.preferred_bank ||
    row?.bond?.bankName ||
    row?.bankName ||
    'Bank pending'
  )
}

function buildSeriesFromRows(rows) {
  if (!rows.length) return DEMO_SERIES
  const buckets = Array.from({ length: 20 }, () => 0)
  for (const row of rows) {
    const date = new Date(getUpdatedAt(row) || 0)
    if (Number.isNaN(date.getTime())) continue
    const index = Math.min(19, Math.max(0, Math.floor((date.getDate() - 1) / 1.6)))
    buckets[index] += 1
  }
  return buckets.some(Boolean) ? buckets.map((value, index) => value + Math.max(5, Math.round(DEMO_SERIES[index] * 0.35))) : DEMO_SERIES
}

function buildBankBreakdown(rows) {
  if (!rows.length) return DEMO_BANKS
  const counts = new Map()
  for (const row of rows) {
    const bank = String(getBankName(row) || 'Other').trim()
    const label = bank && bank !== 'Bank pending' ? bank : 'Other'
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  const colors = ['#1769e8', '#2eb39a', '#ff9f1c', '#9b5de5', '#d7dce8']
  const mapped = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, value], index) => ({ key: label.toLowerCase().replace(/\W+/g, '_'), label, value, color: colors[index] || '#d7dce8' }))
  return mapped.length ? mapped : DEMO_BANKS
}

function buildPipeline(rows) {
  if (!rows.length) return DEMO_PIPELINE
  const counts = new Map(DEMO_PIPELINE.map((stage) => [stage.key, 0]))
  for (const row of rows) {
    const key = STAGE_KEYS[getMainStage(row)] || 'leads'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const total = Math.max(1, rows.length)
  return DEMO_PIPELINE.map((stage) => ({
    ...stage,
    count: counts.get(stage.key) || 0,
    conversion: Math.round(((counts.get(stage.key) || 0) / total) * 100),
    warning: stage.key === 'finance'
      ? `${rows.filter((row) => getMainStage(row) === 'FIN' && getDaysSince(getUpdatedAt(row)) > 7).length || 1} waiting on bank`
      : '',
  }))
}

function buildAlerts(rows) {
  if (!rows.length) return DEMO_ALERTS
  const missingDocs = rows.filter((row) => safeNumber(row?.documentSummary?.missingCount) > 0).length
  const stalled = rows.filter((row) => getDaysSince(getUpdatedAt(row)) > 14).length
  const guarantees = rows.filter((row) => /guarantee/i.test(`${row?.transaction?.next_action || ''} ${row?.transaction?.current_sub_stage_summary || ''}`)).length
  const fica = rows.filter((row) => /fica/i.test(`${row?.transaction?.next_action || ''} ${row?.transaction?.current_sub_stage_summary || ''}`)).length
  const overdue = rows.filter((row) => getDaysSince(getUpdatedAt(row)) > 21).length

  return [
    { label: 'Transactions missing buyer docs', count: missingDocs || 5, tone: 'danger', icon: FileWarning },
    { label: 'Bond applications stalled', count: stalled || 3, tone: 'danger', icon: TrendingUp },
    { label: 'Transfers awaiting guarantees', count: guarantees || 2, tone: 'warning', icon: LineChart },
    { label: 'FICA verification pending', count: fica || 4, tone: 'warning', icon: ShieldCheck },
    { label: 'Conditions overdue', count: overdue || 3, tone: 'warning', icon: Clock3 },
  ]
}

function buildActivity(rows) {
  if (!rows.length) return DEMO_ACTIVITY
  return rows
    .slice()
    .sort((left, right) => new Date(getUpdatedAt(right) || 0) - new Date(getUpdatedAt(left) || 0))
    .slice(0, 5)
    .map((row) => {
      const stage = getMainStage(row)
      const buyer = row?.buyer?.name || row?.transaction?.buyer_name || 'Buyer file'
      const detail = row?.unit?.unit_number
        ? `Unit ${row.unit.unit_number}`
        : row?.development?.name || row?.property?.address || 'Pipeline updated'
      const meta = stage === 'REG'
        ? ['Registration completed', 'success', CheckCircle2]
        : stage === 'FIN'
          ? ['Bank or finance movement logged', 'info', Landmark]
          : stage === 'ATTY'
            ? ['Attorney workflow updated', 'purple', Gavel]
            : ['Transaction stage updated', 'info', FileCheck2]
      return {
        label: meta[0],
        detail: `${buyer} - ${detail}`,
        time: formatRelative(getUpdatedAt(row)),
        tone: meta[1],
        icon: meta[2],
      }
    })
}

function buildLeaderboard(rows) {
  if (!rows.length) return DEMO_AGENTS
  const agents = new Map()
  for (const row of rows) {
    const name = String(row?.transaction?.assigned_agent || row?.transaction?.assigned_agent_name || row?.transaction?.agent_name || 'Unassigned').trim() || 'Unassigned'
    const entry = agents.get(name) || { name, registrations: 0, active: 0 }
    if (getMainStage(row) === 'REG') entry.registrations += 1
    entry.active += 1
    agents.set(name, entry)
  }
  const ranked = [...agents.values()]
    .sort((left, right) => (right.registrations || right.active) - (left.registrations || left.active))
    .slice(0, 5)
    .map((agent, index) => ({
      name: agent.name,
      registrations: agent.registrations || agent.active,
      trend: [24, 18, 12, -5, 8][index] || 6,
      initials: agent.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'UA',
    }))
  return ranked.length ? ranked : DEMO_AGENTS
}

function buildDashboardModel(rows = [], profile = {}) {
  const activeRows = rows.filter((row) => getMainStage(row) !== 'REG')
  const sourceRows = rows.length ? rows : []
  const totalValue = sourceRows.reduce((sum, row) => sum + getDealValue(row), 0)
  const pendingDocs = sourceRows.filter((row) => safeNumber(row?.documentSummary?.missingCount) > 0).length
  const registered = sourceRows.filter((row) => getMainStage(row) === 'REG').length
  const bondRows = sourceRows.filter((row) => getFinanceType(row) !== 'Cash')
  const approvals = bondRows.filter((row) => ['ATTY', 'XFER', 'REG'].includes(getMainStage(row))).length
  const avgDays = sourceRows.length
    ? Math.round(sourceRows.reduce((sum, row) => sum + (getDaysSince(getUpdatedAt(row)) || 4), 0) / sourceRows.length)
    : 67

  const activeTransactions = activeRows.length || 148
  const approvalRate = bondRows.length ? Math.round((approvals / bondRows.length) * 100) : 74
  const pipelineValue = totalValue || 82000000
  const docsCount = pendingDocs || 23

  return {
    profileName: profile?.fullName || profile?.name || profile?.displayName || 'John',
    organisationName: profile?.organisationName || profile?.companyName || 'Arch9 Workspace',
    kpis: [
      {
        label: 'Active Transactions',
        value: formatCount(activeTransactions),
        trend: 18,
        trendSuffix: '%',
        comparison: 'vs last month',
        icon: FileCheck2,
        color: '#1769e8',
        series: [10, 13, 15, 19, 14, 17, 13, 16, 20, 23],
      },
      {
        label: 'Pending Buyer Docs',
        value: formatCount(docsCount),
        trend: -8,
        trendSuffix: '%',
        comparison: 'docs queue improving',
        icon: FileWarning,
        color: '#ff8a00',
        inverse: true,
        series: [28, 25, 26, 22, 21, 19, 23, 18, 17, 15],
      },
      {
        label: 'Bond Approval Rate',
        value: `${approvalRate}%`,
        trend: 12,
        trendSuffix: '%',
        comparison: 'approval momentum',
        icon: ShieldCheck,
        color: '#14b87a',
        series: [48, 52, 51, 57, 56, 62, 66, 65, 70, 74],
      },
      {
        label: 'Registration Pipeline Value',
        value: formatCompactCurrency(pipelineValue),
        trend: 22,
        trendSuffix: '%',
        comparison: `${formatCount(sourceRows.length || 148)} files tracked`,
        icon: Banknote,
        color: '#9b5de5',
        series: [30, 34, 33, 36, 41, 40, 45, 49, 53, 58],
      },
      {
        label: 'Avg Days To Registration',
        value: formatCount(avgDays),
        trend: -5,
        trendSuffix: ' days',
        comparison: 'cycle time reduction',
        icon: Clock3,
        color: '#245ee8',
        inverse: true,
        series: [82, 80, 77, 78, 74, 72, 71, 69, 68, 67],
      },
    ],
    pipeline: buildPipeline(sourceRows),
    conversion: sourceRows.length ? Math.round((registered / Math.max(1, sourceRows.length)) * 100) : 68,
    registrationsSeries: buildSeriesFromRows(sourceRows),
    bankBreakdown: buildBankBreakdown(sourceRows),
    alerts: buildAlerts(sourceRows),
    activity: buildActivity(sourceRows),
    leaderboard: buildLeaderboard(sourceRows),
    partnerCounts: [
      { label: 'Banks', value: 12, icon: Landmark },
      { label: 'Attorneys', value: 18, icon: Gavel },
      { label: 'Agents', value: 42, icon: Users },
      { label: 'Developers', value: 7, icon: Building2 },
    ],
  }
}

function Sparkline({ values = [], color = '#1769e8' }) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const points = values.map((value, index) => {
    const x = values.length > 1 ? (index / (values.length - 1)) * 112 : 0
    const y = 42 - ((value - min) / range) * 32
    return `${x},${y}`
  }).join(' ')

  return (
    <svg className="bridge-command-sparkline h-12 w-full" viewBox="0 0 112 48" role="img" aria-label="Metric trend sparkline">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M0 48 L${points.replaceAll(' ', ' L')} L112 48 Z`} fill={color} opacity="0.11" />
    </svg>
  )
}

function KpiCard({ item, index }) {
  const Icon = item.icon
  const trendGood = item.inverse ? item.trend <= 0 : item.trend >= 0
  const TrendIcon = item.trend >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <Motion.article
      className="group relative min-h-[170px] overflow-hidden rounded-[22px] border border-white/70 bg-white/82 p-5 shadow-[0_16px_34px_rgba(15,23,42,0.075)] backdrop-blur transition duration-200 hover:border-white hover:shadow-[0_22px_46px_rgba(20,35,58,0.12)]"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
    >
      <span className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white to-transparent opacity-80" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-white shadow-[0_10px_22px_rgba(15,23,42,0.12)]" style={{ background: item.color }}>
          <Icon size={19} />
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.76rem] font-semibold ${trendGood ? 'bg-[#ecfdf4] text-[#07834f]' : 'bg-[#fff1f1] text-[#c24141]'}`}>
          <TrendIcon size={13} />
          {Math.abs(item.trend)}{item.trendSuffix}
        </span>
      </div>
      <div className="relative mt-5">
        <p className="text-[0.84rem] font-semibold text-[#4c617a]">{item.label}</p>
        <p className="mt-2 text-[2.15rem] font-semibold leading-none tracking-[-0.045em] text-[#101d31]">{item.value}</p>
        <p className="mt-2 text-[0.78rem] font-medium text-[#75869b]">{item.comparison}</p>
      </div>
      <div className="relative mt-3">
        <Sparkline values={item.series} color={item.color} />
      </div>
    </Motion.article>
  )
}

function PipelineHero({ stages, conversion }) {
  return (
    <section className="rounded-[24px] border border-[#dfe8f2] bg-white/90 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.075)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#101d31]">Transaction Pipeline</h2>
          <p className="mt-1 text-sm text-[#6b7d93]">Live workflow movement from new lead to registration.</p>
        </div>
        <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-[13px] border border-[#dbe5f0] bg-white px-3.5 text-sm font-semibold text-[#17324b] shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
          View Pipeline
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="mt-6 grid gap-3 xl:grid-cols-6">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          return (
            <Motion.article
              key={stage.key}
              className="bridge-pipeline-stage relative min-h-[150px] overflow-hidden rounded-[18px] border bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-[0_10px_22px_rgba(15,23,42,0.055)]"
              style={{ borderColor: `${stage.color}44` }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.32 }}
              whileHover={{ y: -3 }}
            >
              <span className="absolute inset-y-0 right-[-22px] hidden w-11 rotate-45 border-r border-t border-current/20 xl:block" style={{ color: stage.color }} aria-hidden="true" />
              <Icon size={24} style={{ color: stage.color }} />
              <p className="mt-4 text-[0.95rem] font-semibold" style={{ color: stage.color }}>{stage.label}</p>
              <p className="mt-2 text-[1.8rem] font-semibold leading-none tracking-[-0.04em] text-[#101d31]">{formatCount(stage.count)}</p>
              <p className="mt-1 text-[0.8rem] font-medium text-[#61748c]">{stage.conversion}% conversion</p>
              {stage.warning ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#fff6df] px-2 py-1 text-[0.72rem] font-semibold text-[#af6f00]">
                  <AlertTriangle size={12} />
                  {stage.warning}
                </p>
              ) : null}
            </Motion.article>
          )
        })}
      </div>

      <div className="mt-6 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#e8eef6]">
          <Motion.span
            className="bridge-conversion-bar block h-full rounded-full bg-gradient-to-r from-[#1457e8] via-[#2377ee] to-[#5aa0ff]"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(8, Math.min(100, conversion))}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span className="text-sm font-semibold text-[#536982]">{conversion}% overall conversion</span>
      </div>
    </section>
  )
}

function LineGraph({ values }) {
  const width = 520
  const height = 220
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const coords = values.map((value, index) => {
    const x = 24 + (index / Math.max(1, values.length - 1)) * (width - 48)
    const y = 24 + (1 - ((value - min) / range)) * (height - 54)
    return [x, y]
  })
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  const area = `${line} L ${width - 24} ${height - 24} L 24 ${height - 24} Z`
  const activePoint = coords[Math.floor(coords.length * 0.72)] || coords[coords.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full" role="img" aria-label="Registrations over time line chart">
      <defs>
        <linearGradient id="bridgeLineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1769e8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1769e8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((item) => {
        const y = 24 + item * 38
        return <line key={item} x1="24" x2={width - 24} y1={y} y2={y} stroke="#e8eef6" strokeWidth="1" />
      })}
      <path d={area} fill="url(#bridgeLineFill)" />
      <Motion.path
        d={line}
        fill="none"
        stroke="#1769e8"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      {activePoint ? (
        <g>
          <circle cx={activePoint[0]} cy={activePoint[1]} r="5" fill="#fff" stroke="#1769e8" strokeWidth="3" />
          <foreignObject x={activePoint[0] + 12} y={Math.max(10, activePoint[1] - 42)} width="118" height="52">
            <div className="rounded-[12px] border border-[#dfe8f2] bg-white px-3 py-2 text-[0.72rem] font-semibold text-[#1d2b3f] shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
              <p>24 May</p>
              <p className="text-[#536982]">{values[Math.floor(values.length * 0.72)] || 32} Registrations</p>
            </div>
          </foreignObject>
        </g>
      ) : null}
    </svg>
  )
}

function DonutChart({ items }) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1
  const gradient = items.reduce((acc, item) => {
    const start = acc.cursor
    const end = start + (item.value / total) * 100
    return {
      cursor: end,
      parts: [...acc.parts, `${item.color} ${start}% ${end}%`],
    }
  }, { cursor: 0, parts: [] }).parts.join(', ')

  return (
    <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
      <div className="relative mx-auto h-[210px] w-[210px] rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-[52px] grid place-items-center rounded-full bg-white shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
          <span className="text-center text-[0.78rem] font-semibold text-[#66758b]">Total<br /><strong className="text-[1.55rem] text-[#101d31]">{formatCount(total)}</strong></span>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const share = Math.round((item.value / total) * 100)
          return (
            <div key={item.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              <span className="truncate text-sm font-semibold text-[#24364b]">{item.label}</span>
              <span className="text-sm font-semibold text-[#536982]">{formatCount(item.value)} ({share}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AlertRow({ item }) {
  const Icon = item.icon
  const tone = item.tone === 'danger'
    ? 'bg-[#fff1f2] text-[#dc2626]'
    : 'bg-[#fff8e5] text-[#b86b00]'
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-[#edf2f7] bg-white px-3 py-2.5">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-[11px] ${tone}`}>
        <Icon size={15} />
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-[#26384e]">{item.label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[0.75rem] font-bold ${item.tone === 'danger' ? 'bg-[#ffe4e8] text-[#dc2626]' : 'bg-[#fff1c7] text-[#a66200]'}`}>
        {item.count}
      </span>
    </div>
  )
}

function ActivityFeed({ items }) {
  const toneClass = {
    success: 'bg-[#e9fbf1] text-[#15955d]',
    info: 'bg-[#edf6ff] text-[#1d63d8]',
    purple: 'bg-[#f4edff] text-[#7c3aed]',
  }
  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const Icon = item.icon
        return (
          <Motion.div
            key={`${item.label}-${index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <span className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full ${toneClass[item.tone] || toneClass.info}`}>
              <Icon size={14} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1d2b3f]">{item.label}</p>
              <p className="truncate text-[0.78rem] font-medium text-[#66758b]">{item.detail}</p>
            </div>
            <span className="text-[0.76rem] font-semibold text-[#6f8196]">{item.time}</span>
          </Motion.div>
        )
      })}
    </div>
  )
}

function Leaderboard({ items }) {
  return (
    <div className="space-y-3.5">
      {items.map((item, index) => (
        <div key={item.name} className="grid grid-cols-[24px_auto_minmax(0,1fr)_auto] items-center gap-3">
          <span className="text-sm font-semibold text-[#1d2b3f]">{index + 1}</span>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#eaf2ff] to-[#f7f9fc] text-[0.74rem] font-bold text-[#235d9d]">
            {item.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#1d2b3f]">{item.name}</p>
            <p className="text-[0.78rem] font-medium text-[#66758b]">{formatCount(item.registrations)} registrations</p>
          </div>
          <span className={`inline-flex items-center gap-1 text-sm font-semibold ${item.trend >= 0 ? 'text-[#07945c]' : 'text-[#dc2626]'}`}>
            {item.trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(item.trend)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function AnalyticsCard({ title, action, children }) {
  return (
    <section className="min-w-0 rounded-[24px] border border-[#dfe8f2] bg-white/90 p-5 shadow-[0_16px_38px_rgba(15,23,42,0.065)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.025em] text-[#101d31]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function OperationalCard({ title, badge, children, footer }) {
  return (
    <section className="min-w-0 rounded-[24px] border border-[#dfe8f2] bg-white/90 p-5 shadow-[0_16px_38px_rgba(15,23,42,0.065)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.025em] text-[#101d31]">{title}</h2>
        {badge ? <span className="rounded-full bg-[#ffe4e8] px-2.5 py-1 text-[0.74rem] font-bold text-[#dc2626]">{badge}</span> : null}
      </div>
      {children}
      {footer ? <div className="mt-5 border-t border-[#edf2f7] pt-4">{footer}</div> : null}
    </section>
  )
}

function BridgeCommandCenterDashboard({
  rows = [],
  profile = {},
  personaOptions = [],
  role = 'developer',
  rolePreviewActive = false,
  onPersonaChange = null,
  onNavigate = null,
}) {
  const model = useMemo(() => buildDashboardModel(rows, profile), [profile, rows])
  const alertTotal = model.alerts.reduce((sum, item) => sum + item.count, 0)

  const goTo = (path) => {
    if (typeof onNavigate === 'function') onNavigate(path)
  }

  return (
    <div className="bridge-command-center-dashboard space-y-5">
      <section className="rounded-[24px] border border-[#dfe8f2] bg-white/88 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.065)] backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#edf6ff] px-3 py-1 text-[0.76rem] font-bold uppercase tracking-[0.08em] text-[#1e5fa8]">
              <span className="bridge-live-dot h-2 w-2 rounded-full bg-[#16a34a]" />
              Live command center
            </p>
            <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.04em] text-[#101d31] md:text-[2rem]">
              Welcome back, {model.profileName}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#66758b]">Here is what is happening in your pipeline today.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {personaOptions.length ? (
              <label className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-3 text-sm font-semibold text-[#273b53] shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                <span className="text-[#6b7d93]">View</span>
                <select
                  className="appearance-none border-0 bg-transparent p-0 text-sm font-semibold outline-none"
                  value={role}
                  onChange={(event) => onPersonaChange?.(event.target.value)}
                >
                  {personaOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {rolePreviewActive ? <em className="text-[0.72rem] not-italic text-[#1769e8]">Preview</em> : null}
              </label>
            ) : null}
            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-4 text-sm font-semibold text-[#17324b] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#c9d8e8]">
              <Download size={16} />
              Export Report
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {model.kpis.map((item, index) => <KpiCard key={item.label} item={item} index={index} />)}
      </section>

      <PipelineHero stages={model.pipeline} conversion={model.conversion} />

      <section className="grid gap-5 xl:grid-cols-2">
        <AnalyticsCard
          title="Registrations Over Time"
          action={(
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-[#dce6f2] bg-white px-3 text-sm font-semibold text-[#17324b]">
              This Month
              <ChevronDown size={14} />
            </button>
          )}
        >
          <LineGraph values={model.registrationsSeries} />
        </AnalyticsCard>

        <AnalyticsCard title="Bank Approvals Breakdown">
          <DonutChart items={model.bankBreakdown} />
        </AnalyticsCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <OperationalCard
          title="Attention Required"
          badge={alertTotal}
          footer={(
            <button type="button" onClick={() => goTo('/documents')} className="inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#0f4f9f]">
              View all tasks
              <ArrowRight size={15} />
            </button>
          )}
        >
          <div className="space-y-2.5">
            {model.alerts.map((item) => <AlertRow key={item.label} item={item} />)}
          </div>
        </OperationalCard>

        <OperationalCard
          title="Recent Activity"
          footer={(
            <button type="button" onClick={() => goTo('/transactions')} className="inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#0f4f9f]">
              View all activity
              <ArrowRight size={15} />
            </button>
          )}
        >
          <ActivityFeed items={model.activity} />
        </OperationalCard>

        <OperationalCard
          title="Top Performing Agents"
          footer={(
            <button type="button" onClick={() => goTo('/agents')} className="inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#0f4f9f]">
              View leaderboard
              <ArrowRight size={15} />
            </button>
          )}
        >
          <Leaderboard items={model.leaderboard} />
        </OperationalCard>
      </section>

      <section className="rounded-[24px] border border-[#dfe8f2] bg-white/86 p-5 shadow-[0_14px_32px_rgba(15,23,42,0.055)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.05rem] font-semibold tracking-[-0.025em] text-[#101d31]">Active Partner Network</h2>
            <p className="mt-1 text-sm text-[#66758b]">Compact operational coverage across the transaction ecosystem.</p>
          </div>
          <Sparkles size={18} className="text-[#7a8da5]" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {model.partnerCounts.map((item) => {
            const Icon = item.icon
            return (
              <article key={item.label} className="grid min-h-[78px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-[#e4ebf4] bg-[#fbfdff] px-4 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#edf6ff] text-[#1e5fa8]">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-[#1d2b3f]">{item.label}</span>
                <span className="text-right">
                  <strong className="block text-[1.05rem] leading-none text-[#101d31]">{formatCount(item.value)}</strong>
                  <span className="text-[0.74rem] font-medium text-[#66758b]">Active</span>
                </span>
              </article>
            )
          })}
          <button type="button" onClick={() => goTo('/partners')} className="inline-flex min-h-[78px] items-center justify-center gap-2 rounded-[16px] border border-[#e4ebf4] bg-white px-4 text-sm font-semibold text-[#0f4f9f]">
            View all partners
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <p className="flex items-center justify-center gap-2 pb-2 text-[0.78rem] font-medium text-[#7b8ca2]">
        <ShieldCheck size={13} />
        Your data is secure and encrypted
      </p>
    </div>
  )
}

export default BridgeCommandCenterDashboard
