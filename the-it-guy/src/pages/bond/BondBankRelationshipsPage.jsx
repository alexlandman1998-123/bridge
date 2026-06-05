import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock3,
  Coins,
  Download,
  Edit3,
  Eye,
  FileText,
  Gauge,
  Landmark,
  LineChart,
  MessageSquare,
  Percent,
  Plus,
  Power,
  RefreshCw,
  Trophy,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  createBankContact,
  createBankEscalation,
  createConsultantFeedback,
  getBankRelationshipCommandCentre,
  getBankSubmissionAnalytics,
  getBankWorkspace,
  updateBankContact,
} from '../../services/bondBankRelationshipService'
import {
  BANK_SUPPORTED_PRODUCTS,
  BOND_ORIGINATOR_BANK_STATUSES,
  addOriginatorBank,
  deactivateOriginatorBank,
  getBankPanelForCurrentUser,
  getSystemBanks,
  updateOriginatorBank,
} from '../../services/bondOriginatorBankService'

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

function resolveActorId(workspaceContext = {}) {
  return normalizeText(workspaceContext.userId || workspaceContext.user?.id || workspaceContext.profile?.id || workspaceContext.currentMembership?.userId || workspaceContext.currentMembership?.user_id)
}

function isHqUser(workspaceContext = {}) {
  const membership = workspaceContext.currentMembership || {}
  const role = normalizeText(membership.workspaceRole || membership.workspace_role || membership.organisationRole || membership.organisation_role || workspaceContext.workspaceRole).toLowerCase()
  const scope = normalizeText(membership.scopeLevel || membership.scope_level || workspaceContext.scopeLevel).toLowerCase()
  return ['owner_director', 'hq_manager'].includes(role) || scope === 'workspace_hq'
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function formatHours(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}h`
}

function formatDays(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}d`
}

function formatResponseDays(value) {
  const days = Math.round((Number(value || 0) / 24) * 10) / 10
  return `${days} days`
}

function formatCurrency(value) {
  return `R ${Math.round(Number(value || 0)).toLocaleString('en-ZA')}`
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0)
  if (amount >= 1000000) return `R${Math.round((amount / 1000000) * 10) / 10}m`
  if (amount >= 1000) return `R${Math.round(amount / 1000)}k`
  return formatCurrency(amount)
}

function formatTrendValue(value) {
  const number = Math.round(Number(value || 0) * 10) / 10
  if (!number) return '0%'
  return `${number > 0 ? '+' : ''}${number}%`
}

function statusClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('critical') || normalized.includes('high')) return 'bg-red-50 text-red-700 ring-red-200'
  if (normalized.includes('poor') || normalized.includes('risk') || normalized.includes('medium') || normalized.includes('increasing')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (normalized.includes('fair') || normalized.includes('healthy') || normalized.includes('low') || normalized.includes('stable') || normalized.includes('open')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (normalized.includes('excellent') || normalized.includes('good') || normalized.includes('positive')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

const BANK_ACCENTS = {
  fnb: 'bg-amber-400 text-slate-950',
  absa: 'bg-red-600 text-white',
  nedbank: 'bg-emerald-600 text-white',
  'standard-bank': 'bg-blue-700 text-white',
  investec: 'bg-slate-100 text-slate-950 ring-1 ring-slate-300',
  other: 'bg-slate-800 text-white',
}

function BankLogo({ bankId = '', bankName = '', size = 'md' }) {
  const label = normalizeText(bankName).split(/\s+/).map((part) => part[0]).join('').slice(0, 2) || 'B'
  const dimensions = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-black ${dimensions} ${BANK_ACCENTS[bankId] || BANK_ACCENTS.other}`}>
      {label}
    </span>
  )
}

function MetricCard({ label, value, helper, icon: Icon }) {
  return (
    <article className="min-h-[132px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        {Icon ? <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" /> : null}
      </div>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    </article>
  )
}

function Section({ title, icon: Icon, children, action = null }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

function DataTable({ columns = [], rows = [], empty = 'No records match this view yet.' }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
  }
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full min-w-[920px] divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3 text-left font-semibold">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.bankId || row.applicationId || `${row.stage || row.reason || 'row'}-${index}`} className="align-top transition hover:bg-slate-50/70">
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ status }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(status)}`}>{status || 'Stable'}</span>
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="text-sm font-medium text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-950"
      />
    </label>
  )
}

function SelectField({ label, value, onChange, children, disabled = false }) {
  return (
    <label className="text-sm font-medium text-slate-600">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {children}
      </select>
    </label>
  )
}

function TextAreaField({ label, value, onChange }) {
  return (
    <label className="text-sm font-medium text-slate-600">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
      />
    </label>
  )
}

function EmptyState({ title = 'Not enough data', description = 'This section will populate as bank applications move through the workflow.', icon = LineChart }) {
  const IconComponent = icon
  return (
    <div className="flex min-h-[136px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700">
        <IconComponent className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  )
}

function CommandSection({ eyebrow, title, description, action, children, className = '' }) {
  return (
    <section className={`rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p> : null}
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function CommandKpiCard({ label, value, helper, icon, accent = 'blue' }) {
  const IconComponent = icon
  const accentClass = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-violet-50 text-violet-700',
    orange: 'bg-orange-50 text-orange-700',
    slate: 'bg-slate-100 text-slate-700',
  }[accent] || 'bg-blue-50 text-blue-700'
  return (
    <article className="flex min-h-[156px] flex-col justify-between rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${accentClass}`}>
          <IconComponent className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950">{value}</p>
        {helper ? <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p> : null}
      </div>
    </article>
  )
}

function Sparkline({ values = [], tone = 'emerald', height = 48 }) {
  const safeValues = values.map(Number).filter((value) => Number.isFinite(value))
  if (safeValues.length < 2) return <div className="h-12 rounded-xl bg-slate-50" />
  const min = Math.min(...safeValues)
  const max = Math.max(...safeValues)
  const span = max - min || 1
  const points = safeValues.map((value, index) => {
    const x = (index / (safeValues.length - 1)) * 100
    const y = height - ((value - min) / span) * (height - 8) - 4
    return `${x},${y}`
  }).join(' ')
  const stroke = {
    emerald: '#10b981',
    blue: '#2563eb',
    purple: '#8b5cf6',
    orange: '#f97316',
    red: '#ef4444',
  }[tone] || '#10b981'
  return (
    <svg viewBox={`0 0 100 ${height}`} className="h-12 w-full overflow-visible" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function LeaderboardCard({ row, rank }) {
  return (
    <article className="flex min-h-[258px] flex-col rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">{rank}</span>
          <BankLogo bankId={row.bankId} bankName={row.bankName} />
          <div>
            <h3 className="text-base font-bold text-slate-950">{row.bankName}</h3>
            <StatusPill status={row.healthStatus} />
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Approval</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{formatPercent(row.approvalRate)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Response</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{formatResponseDays(row.averageResponseTime)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Apps</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{row.applications}</p>
        </div>
      </div>
      <div className="mt-auto pt-5">
        <Sparkline values={row.sparkline} />
        <p className="mt-2 text-xs font-semibold text-emerald-700">{formatTrendValue(row.trend?.applicationsChangePercent)} application trend</p>
      </div>
    </article>
  )
}

function BankDistribution({ rows = [] }) {
  if (!rows.length) return <EmptyState title="No bank distribution yet" icon={BarChart3} />
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#2563eb', '#64748b', '#cbd5e1']
  const gradient = rows.reduce((segments, row, index) => {
    const start = segments.cursor
    const end = start + row.percentage
    return {
      cursor: end,
      values: [...segments.values, `${colors[index % colors.length]} ${start}% ${end}%`],
    }
  }, { cursor: 0, values: [] }).values.join(', ')
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[220px_1fr]">
      <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <span className="text-2xl font-bold text-slate-950">{rows.reduce((sum, row) => sum + row.applications, 0).toLocaleString('en-ZA')}</span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Applications</span>
        </div>
      </div>
      <div className="space-y-3">
        {rows.slice(0, 6).map((row, index) => (
          <div key={row.bankId} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              <span className="truncate">{row.bankName}</span>
            </span>
            <span className="font-bold text-slate-950">{row.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ApprovalFunnel({ stages = [] }) {
  if (!stages.length) return <EmptyState title="No approval funnel data yet" icon={Gauge} />
  const colors = ['bg-slate-950', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-600']
  return (
    <div className="space-y-4">
      {stages.map((stage, index) => (
        <div key={stage.id} className="grid gap-3 md:grid-cols-[170px_1fr_90px] md:items-center">
          <div>
            <p className="text-sm font-semibold text-slate-700">{stage.stage}</p>
          </div>
          <div className="h-9 rounded-full bg-slate-100 p-1">
            <div className={`h-full rounded-full ${colors[index % colors.length]}`} style={{ width: `${Math.max(4, stage.totalConversionRate || 0)}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-sm md:block md:text-right">
            <span className="font-bold text-slate-950">{stage.count.toLocaleString('en-ZA')}</span>
            <span className="ml-2 text-xs font-semibold text-emerald-700">{stage.totalConversionRate}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function SortablePerformanceMatrix({ rows = [] }) {
  const [sort, setSort] = useState({ key: 'applications', direction: 'desc' })
  const columns = [
    ['bankName', 'Bank'],
    ['applications', 'Applications'],
    ['approvalRate', 'Approval %'],
    ['averageResponseTime', 'Avg Response'],
    ['instructionRate', 'Instruction %'],
    ['escalations', 'Escalations'],
    ['revenueGenerated', 'Revenue'],
    ['healthScore', 'Health'],
    ['trend', 'Trend'],
    ['action', 'Action'],
  ]
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    if (sort.key === 'trend') return (right.trend?.applicationsChangePercent || 0) - (left.trend?.applicationsChangePercent || 0)
    if (sort.key === 'action') return 0
    const leftValue = left[sort.key]
    const rightValue = right[sort.key]
    if (typeof leftValue === 'string') return sort.direction === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
    return sort.direction === 'asc' ? Number(leftValue || 0) - Number(rightValue || 0) : Number(rightValue || 0) - Number(leftValue || 0)
  }), [rows, sort])
  if (!rows.length) return <EmptyState title="No bank performance data yet" icon={Landmark} />
  function toggleSort(key) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-[1040px] w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} className="px-4 py-3 font-bold">
                <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-slate-950">
                  {label}
                  {sort.key === key ? <span>{sort.direction === 'desc' ? '↓' : '↑'}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {sortedRows.map((row) => (
            <tr key={row.bankId} className="transition hover:bg-slate-50/80">
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <BankLogo bankId={row.bankId} bankName={row.bankName} size="sm" />
                  <span className="font-bold text-slate-950">{row.bankName}</span>
                </div>
              </td>
              <td className="px-4 py-4 font-semibold text-slate-700">{row.applications}</td>
              <td className="px-4 py-4 font-semibold text-slate-700">{formatPercent(row.approvalRate)}</td>
              <td className="px-4 py-4 font-semibold text-slate-700">{formatResponseDays(row.averageResponseTime)}</td>
              <td className="px-4 py-4 font-semibold text-slate-700">{formatPercent(row.instructionRate)}</td>
              <td className="px-4 py-4 font-semibold text-slate-700">{row.escalations}</td>
              <td className="px-4 py-4 font-semibold text-slate-700">{formatCompactCurrency(row.revenueGenerated)}</td>
              <td className="px-4 py-4"><StatusPill status={row.healthStatus} /></td>
              <td className="px-4 py-4"><Sparkline values={row.sparkline} tone={row.trend?.direction === 'down' ? 'red' : 'emerald'} /></td>
              <td className="px-4 py-4">
                <Link className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900" to={`/bond/banks/${encodeURIComponent(row.bankId)}`}>
                  View Profile <ArrowRight className="h-4 w-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RegionalSlaHeatmap({ heatmap }) {
  const rows = heatmap?.rows || []
  const banks = heatmap?.banks || []
  const hasValues = rows.some((row) => row.cells.some((cell) => cell.responseTime !== null))
  if (!hasValues) return <EmptyState title="No regional SLA data yet" description="Regional bank response times will appear once scoped applications have region and bank activity." icon={LineChart} />
  const cellClass = {
    excellent: 'bg-emerald-100 text-emerald-900',
    average: 'bg-amber-100 text-amber-900',
    slow: 'bg-orange-100 text-orange-900',
    problem: 'bg-red-100 text-red-900',
    empty: 'bg-slate-50 text-slate-300',
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-bold">Region</th>
            {banks.map((bank) => <th key={bank.bankId} className="px-3 py-3 text-center font-bold">{bank.bankName}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-bold text-slate-950">{row.regionName}</td>
              {row.cells.map((cell) => (
                <td key={cell.id} className="px-3 py-3 text-center">
                  <span className={`inline-flex min-w-[66px] justify-center rounded-lg px-3 py-2 text-xs font-bold ${cellClass[cell.status]}`}>
                    {cell.responseTime === null ? '—' : formatResponseDays(cell.responseTime)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrendWidget({ widget }) {
  const tone = { blue: 'blue', green: 'emerald', purple: 'purple', orange: 'orange' }[widget.tone] || 'blue'
  const values = (widget.series || []).map((point) => point.value)
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-950">{widget.title}</h3>
        <span className={`text-xs font-bold ${widget.changePercent >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatTrendValue(widget.changePercent)}</span>
      </div>
      <div className="mt-4"><Sparkline values={values} tone={tone} height={54} /></div>
    </article>
  )
}

function RelationshipProfiles({ profiles = [] }) {
  if (!profiles.length) return <EmptyState title="No relationship profiles yet" icon={Users} />
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {profiles.slice(0, 4).map((profile) => (
        <article key={profile.bankId} className="flex min-h-[248px] flex-col rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <BankLogo bankId={profile.bankId} bankName={profile.bankName} />
            <div>
              <h3 className="font-bold text-slate-950">{profile.bankName}</h3>
              <StatusPill status={profile.relationshipHealth} />
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, profile.healthScore || 0))}%` }} />
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Primary Contact</p>
              <p className="font-semibold text-slate-950">{profile.primaryContact?.name || 'Not assigned'}</p>
              {profile.primaryContact?.role ? <p className="text-xs text-slate-500">{profile.primaryContact.role}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Approval</p>
                <p className="font-bold text-slate-950">{formatPercent(profile.approvalRate)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Revenue</p>
                <p className="font-bold text-slate-950">{formatCompactCurrency(profile.revenueGenerated)}</p>
              </div>
            </div>
          </div>
          <Link className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" to={`/bond/banks/${encodeURIComponent(profile.bankId)}`}>
            View Profile <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
      ))}
    </div>
  )
}

function emptyPanelDraft() {
  return {
    id: '',
    bankId: '',
    status: BOND_ORIGINATOR_BANK_STATUSES.active,
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactPhone: '',
    submissionEmail: '',
    portalUrl: '',
    slaDays: '',
    supportedProducts: [],
    regionsSupportedText: '',
    notes: '',
  }
}

function panelDraftFromRow(row = {}) {
  return {
    ...emptyPanelDraft(),
    id: row.id || '',
    bankId: row.bankId || '',
    status: row.status || BOND_ORIGINATOR_BANK_STATUSES.active,
    primaryContactName: row.primaryContactName || '',
    primaryContactEmail: row.primaryContactEmail || '',
    primaryContactPhone: row.primaryContactPhone || '',
    submissionEmail: row.submissionEmail || '',
    portalUrl: row.portalUrl || '',
    slaDays: row.slaDays || '',
    supportedProducts: row.supportedProducts || [],
    regionsSupportedText: (row.regionsSupported || []).join(', '),
    notes: row.notes || '',
  }
}

function BankPanelModal({ draft, setDraft, systemBanks = [], panelRows = [], onClose, onSave }) {
  const isEditing = Boolean(draft.id)
  const usedBankIds = new Set(panelRows.filter((row) => row.id !== draft.id).map((row) => row.bankId))
  const availableBanks = systemBanks.filter((bank) => isEditing || !usedBankIds.has(bank.id))
  function toggleProduct(product) {
    setDraft({
      ...draft,
      supportedProducts: draft.supportedProducts.includes(product)
        ? draft.supportedProducts.filter((item) => item !== product)
        : [...draft.supportedProducts, product],
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
      <div className="max-h-[calc(100vh-48px)] w-full max-w-3xl overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Bank Panel</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{isEditing ? 'Edit Bank' : 'Add Bank'}</h2>
            <p className="mt-1 text-sm text-slate-500">Configure the bank details your originator team uses for submissions and performance tracking.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Close</button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <SelectField label="Select Bank" value={draft.bankId} onChange={(value) => setDraft({ ...draft, bankId: value })} disabled={isEditing}>
            <option value="">{availableBanks.length ? 'Choose bank' : 'No banks available'}</option>
            {availableBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.shortName}</option>)}
          </SelectField>
          <SelectField label="Status" value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })}>
            {Object.values(BOND_ORIGINATOR_BANK_STATUSES).map((status) => <option key={status} value={status}>{status}</option>)}
          </SelectField>
          <Field label="Primary Contact Name" value={draft.primaryContactName} onChange={(value) => setDraft({ ...draft, primaryContactName: value })} />
          <Field label="Primary Contact Email" value={draft.primaryContactEmail} onChange={(value) => setDraft({ ...draft, primaryContactEmail: value })} type="email" />
          <Field label="Primary Contact Phone" value={draft.primaryContactPhone} onChange={(value) => setDraft({ ...draft, primaryContactPhone: value })} />
          <Field label="Submission Email" value={draft.submissionEmail} onChange={(value) => setDraft({ ...draft, submissionEmail: value })} type="email" />
          <Field label="Portal URL" value={draft.portalUrl} onChange={(value) => setDraft({ ...draft, portalUrl: value })} />
          <Field label="SLA Target Days" value={draft.slaDays} onChange={(value) => setDraft({ ...draft, slaDays: value })} type="number" />
          <div className="md:col-span-2">
            <p className="text-sm font-medium text-slate-600">Supported Products</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {BANK_SUPPORTED_PRODUCTS.map((product) => (
                <label key={product} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={draft.supportedProducts.includes(product)} onChange={() => toggleProduct(product)} className="h-4 w-4 rounded border-slate-300" />
                  {product}
                </label>
              ))}
            </div>
          </div>
          <Field label="Regions Supported" value={draft.regionsSupportedText} onChange={(value) => setDraft({ ...draft, regionsSupportedText: value })} />
          <div className="md:col-span-2">
            <TextAreaField label="Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onSave} className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Save Bank</button>
        </div>
      </div>
    </div>
  )
}

function BankPanelManagementView({ panelRows = [], systemBanks = [], canManage = false, openEditor, deactivateBank, refresh, notice }) {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Relationship Configuration</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-slate-950">Manage Bank Panel</h1>
          <p className="mt-1 text-sm text-slate-500">Control which banks your originator organisation works with.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={() => downloadBankPanelCsv(panelRows)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" /> Export
          </button>
          {canManage ? (
            <button type="button" onClick={() => openEditor()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Add Bank
            </button>
          ) : null}
        </div>
      </header>
      {notice ? <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}
      <CommandSection eyebrow="Originator Bank Panel" title="Configured Banks" description="Active banks feed bank selections, relationship analytics, scorecards and submission workflows.">
        {!panelRows.length ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
            <Landmark className="h-9 w-9 text-blue-700" aria-hidden="true" />
            <h3 className="mt-3 text-base font-bold text-slate-950">No banks configured yet.</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">Add the banks your organisation works with to start submitting applications and tracking bank performance.</p>
            {canManage ? (
              <button type="button" onClick={() => openEditor()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Add Bank
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Bank</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">SLA Target</th>
                  <th className="px-4 py-3 font-bold">Primary Contact</th>
                  <th className="px-4 py-3 font-bold">Submission Method</th>
                  <th className="px-4 py-3 font-bold">Supported Products</th>
                  <th className="px-4 py-3 font-bold">Regions</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {panelRows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <BankLogo bankId={row.bankId} bankName={row.bankName} size="sm" />
                        <div>
                          <p className="font-bold text-slate-950">{row.bankName}</p>
                          <p className="text-xs text-slate-500">{row.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4"><StatusPill status={row.status} /></td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{row.slaDays ? `${row.slaDays} days` : 'Not set'}</td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">{row.primaryContactName || 'Not assigned'}</p>
                      <p className="text-xs text-slate-500">{row.primaryContactEmail || row.primaryContactPhone || 'No contact details'}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{row.submissionEmail || row.portalUrl || 'Not configured'}</td>
                    <td className="px-4 py-4 text-slate-700">{row.supportedProducts?.length ? row.supportedProducts.join(', ') : 'Not configured'}</td>
                    <td className="px-4 py-4 text-slate-700">{row.regionsSupported?.length ? row.regionsSupported.join(', ') : 'All regions'}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Link to={`/bond/banks/${encodeURIComponent(row.bankId)}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          <Eye className="h-3.5 w-3.5" /> Profile
                        </Link>
                        {canManage ? (
                          <>
                            <button type="button" onClick={() => openEditor(row)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>
                            {row.status !== BOND_ORIGINATOR_BANK_STATUSES.inactive ? (
                              <button type="button" onClick={() => deactivateBank(row)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100">
                                <Power className="h-3.5 w-3.5" /> Deactivate
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CommandSection>
      {!systemBanks.length ? <EmptyState title="Global bank directory is empty" description="A Bridge administrator needs to add active banks before originators can configure their panel." icon={Landmark} /> : null}
    </>
  )
}

function BankProfilesView({ profiles = [], notice }) {
  return (
    <>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Relationship Profiles</p>
        <h1 className="mt-1 text-3xl font-bold tracking-normal text-slate-950">Bank Profiles</h1>
        <p className="mt-1 text-sm text-slate-500">Configured bank relationships, contacts, health and executive ownership.</p>
      </header>
      {notice ? <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}
      <CommandSection eyebrow="Profiles" title="Bank Relationship Profiles" description="Open a bank profile to manage contacts, escalations and relationship activity.">
        <RelationshipProfiles profiles={profiles} />
      </CommandSection>
    </>
  )
}

function downloadCsv(rows = []) {
  const headers = ['Bank', 'Applications', 'Approvals', 'Approval Rate', 'Avg Response Hours', 'Instruction Rate', 'Escalations', 'Revenue', 'Health Score', 'Health Status']
  const csvRows = rows.map((row) => [
    row.bankName,
    row.applications,
    row.approvals,
    row.approvalRate,
    row.averageResponseTime,
    row.instructionRate,
    row.escalations,
    row.revenueGenerated,
    row.healthScore ?? '',
    row.healthStatus,
  ])
  const csv = [headers, ...csvRows].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'bank-relationships-command-centre.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function downloadBankPanelCsv(rows = []) {
  const headers = ['Bank', 'Status', 'SLA Target Days', 'Primary Contact', 'Primary Contact Email', 'Submission Email', 'Portal URL', 'Supported Products', 'Regions', 'Notes']
  const csvRows = rows.map((row) => [
    row.bankName,
    row.status,
    row.slaDays ?? '',
    row.primaryContactName,
    row.primaryContactEmail,
    row.submissionEmail,
    row.portalUrl,
    (row.supportedProducts || []).join('; '),
    (row.regionsSupported || []).join('; '),
    row.notes,
  ])
  const csv = [headers, ...csvRows].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'bond-originator-bank-panel.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function DashboardView({ commandCentre, refresh, notice }) {
  const model = commandCentre || {}
  const kpis = model.kpis || {}
  const topBanks = model.leaderboard?.topBanks || []
  const otherBanks = model.leaderboard?.otherBanks || []
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Command Centre</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-slate-950">Bank Relationships</h1>
          <p className="mt-1 text-sm text-slate-500">Strategic view of bank performance, revenue, turnaround and relationship health.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={() => downloadCsv(model.performanceMatrix || [])} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </header>

      {notice ? <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <CommandKpiCard label="Total Applications" value={kpis.totalApplications?.toLocaleString('en-ZA') || 0} helper="Submitted or active bank-linked files" icon={FileText} accent="blue" />
        <CommandKpiCard label="Approval Rate" value={formatPercent(kpis.approvalRate)} helper="Approved against decisionable volume" icon={Percent} accent="green" />
        <CommandKpiCard label="Fastest Bank" value={kpis.fastestBank?.bankName || '—'} helper={kpis.fastestBank ? formatResponseDays(kpis.fastestBank.responseTime) : 'Not enough data'} icon={Zap} accent="amber" />
        <CommandKpiCard label="Most Used Bank" value={kpis.mostUsedBank?.bankName || '—'} helper={kpis.mostUsedBank ? `${kpis.mostUsedBank.applications} applications` : 'Not enough data'} icon={Landmark} accent="purple" />
        <CommandKpiCard label="Avg Response Time" value={formatResponseDays(kpis.averageResponseTime)} helper="Across scoped bank activity" icon={Clock3} accent="slate" />
        <CommandKpiCard label="Revenue Generated" value={formatCompactCurrency(kpis.revenueGenerated)} helper={`R${model.revenuePerBond || 500} per approved bond`} icon={Coins} accent="orange" />
      </section>

      <CommandSection eyebrow="Leaderboard" title="Bank Leaderboard" description="Ranked by approval, response speed, instruction conversion and escalation pressure.">
        {topBanks.length ? (
          <div className="grid gap-4 xl:grid-cols-[repeat(3,minmax(0,1fr))_260px]">
            {topBanks.map((row, index) => <LeaderboardCard key={row.bankId} row={row} rank={index + 1} />)}
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-950">Other Banks</h3>
                <Link to="/bond/banks" className="text-xs font-bold text-blue-700">View all</Link>
              </div>
              <div className="mt-4 space-y-4">
                {otherBanks.length ? otherBanks.map((row, index) => (
                  <div key={row.bankId} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-sm font-bold text-slate-400">{index + 4}</span>
                      <BankLogo bankId={row.bankId} bankName={row.bankName} size="sm" />
                      <span className="truncate text-sm font-bold text-slate-800">{row.bankName}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-950">{formatPercent(row.approvalRate)}</span>
                  </div>
                )) : <p className="text-sm text-slate-500">No additional bank data.</p>}
              </div>
            </div>
          </div>
        ) : <EmptyState title="No bank leaderboard yet" icon={Trophy} />}
      </CommandSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <CommandSection eyebrow="Market Share" title="Bank Distribution" description="Application volume split by bank.">
          <BankDistribution rows={model.distribution} />
        </CommandSection>
        <CommandSection eyebrow="Conversion" title="Approval Funnel" description="Conversion from bank submission to instruction issued.">
          <ApprovalFunnel stages={model.approvalFunnel} />
        </CommandSection>
      </div>

      <CommandSection eyebrow="Performance Matrix" title="Bank Performance Matrix" description="Sortable command view with revenue, health score and relationship trend.">
        <SortablePerformanceMatrix rows={model.performanceMatrix} />
      </CommandSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <CommandSection eyebrow="Regional SLA" title="Regional SLA Heatmap" description="Average bank response time by visible region.">
          <RegionalSlaHeatmap heatmap={model.regionalSlaHeatmap} />
        </CommandSection>
        <CommandSection eyebrow="Analytics" title="Trends & Analytics" description="Twelve-month movement across volume, approval, response and revenue.">
          <div className="grid gap-4 sm:grid-cols-2">
            {(model.trends || []).map((widget) => <TrendWidget key={widget.id} widget={widget} />)}
          </div>
        </CommandSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <CommandSection eyebrow="Executive Insights" title="Relationship Signals" description="Rules-based observations from scoped bank metrics.">
          <div className="space-y-3">
            {(model.insights || []).map((insight) => (
              <div key={insight.id} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${insight.tone === 'warning' ? 'bg-amber-50 text-amber-700' : insight.tone === 'positive' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                  {insight.tone === 'warning' ? <AlertTriangle className="h-4 w-4" /> : insight.tone === 'positive' ? <TrendingUp className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-950">{insight.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{insight.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CommandSection>
        <CommandSection eyebrow="Relationship Management" title="Bank Relationship Profiles" description="Bank-level ownership, contacts and relationship health foundation.">
          <RelationshipProfiles profiles={model.profiles} />
        </CommandSection>
      </div>
    </>
  )
}

function WorkspaceView({ workspace, analytics, notice, saveContact, saveEscalation, saveFeedback, contactDraft, setContactDraft, escalationDraft, setEscalationDraft, feedbackDraft, setFeedbackDraft }) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Applications" value={workspace.performance.metrics.applications} icon={Banknote} />
        <MetricCard label="Approval Rate" value={formatPercent(workspace.performance.metrics.approvalRate)} icon={Gauge} />
        <MetricCard label="Instruction Rate" value={formatPercent(workspace.performance.metrics.instructionRate)} icon={CheckCircle2} />
        <MetricCard label="Relationship Health" value={workspace.health.score} helper={workspace.health.status} icon={LineChart} />
      </section>

      {notice ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

      <nav className="flex flex-wrap gap-2 text-sm">
        {workspace.tabs.map((tab) => (
          <a key={tab} href={`#${tab.toLowerCase()}`} className="rounded-lg bg-white px-3 py-2 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">{tab}</a>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Performance" icon={LineChart}>
          <DataTable
            rows={workspace.performance.trend}
            columns={[
              { key: 'periodDays', label: 'Trend', render: (row) => `${row.periodDays}d` },
              { key: 'applications', label: 'Applications' },
              { key: 'approvals', label: 'Approvals' },
              { key: 'declines', label: 'Declines' },
              { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
              { key: 'averageResponseTime', label: 'Response', render: (row) => formatHours(row.averageResponseTime) },
            ]}
          />
        </Section>

        <Section title="Submission Analytics" icon={Gauge}>
          <DataTable
            rows={analytics}
            columns={[
              { key: 'stage', label: 'Stage' },
              { key: 'count', label: 'Count' },
              { key: 'conversionRate', label: 'Conversion', render: (row) => formatPercent(row.conversionRate) },
              { key: 'dropOff', label: 'Drop-off' },
              { key: 'averageDelay', label: 'Delay', render: (row) => formatDays(row.averageDelay) },
            ]}
          />
        </Section>
      </div>

      <Section title="Applications" icon={FileText}>
        <DataTable
          rows={workspace.applications}
          columns={[
            { key: 'applicationReference', label: 'Application' },
            { key: 'consultantName', label: 'Consultant' },
            { key: 'branchName', label: 'Branch' },
            { key: 'status', label: 'Status' },
            { key: 'responseTime', label: 'Response', render: (row) => formatHours(row.responseTime) },
            { key: 'declineReason', label: 'Decline Reason' },
          ]}
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Escalations" icon={AlertTriangle}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Application ID" value={escalationDraft.applicationId} onChange={(value) => setEscalationDraft({ ...escalationDraft, applicationId: value })} />
            <Field label="Issue" value={escalationDraft.issue} onChange={(value) => setEscalationDraft({ ...escalationDraft, issue: value })} />
            <Field label="Issue Type" value={escalationDraft.issueType} onChange={(value) => setEscalationDraft({ ...escalationDraft, issueType: value })} />
            <Field label="Priority" value={escalationDraft.priority} onChange={(value) => setEscalationDraft({ ...escalationDraft, priority: value })} />
          </div>
          <button type="button" onClick={saveEscalation} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Create Escalation</button>
          <DataTable
            rows={workspace.escalations}
            columns={[
              { key: 'application', label: 'Application' },
              { key: 'consultantName', label: 'Consultant' },
              { key: 'branchName', label: 'Branch' },
              { key: 'issue', label: 'Issue' },
              { key: 'age', label: 'Age', render: (row) => `${row.age}d` },
              { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
            ]}
          />
        </Section>

        <Section title="Contacts" icon={Users}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Name" value={contactDraft.name} onChange={(value) => setContactDraft({ ...contactDraft, name: value })} />
            <Field label="Role" value={contactDraft.role} onChange={(value) => setContactDraft({ ...contactDraft, role: value })} />
            <Field label="Email" value={contactDraft.email} onChange={(value) => setContactDraft({ ...contactDraft, email: value })} />
            <Field label="Phone" value={contactDraft.phone} onChange={(value) => setContactDraft({ ...contactDraft, phone: value })} />
            <Field label="Region" value={contactDraft.region} onChange={(value) => setContactDraft({ ...contactDraft, region: value })} />
            <Field label="Notes" value={contactDraft.notes} onChange={(value) => setContactDraft({ ...contactDraft, notes: value })} />
          </div>
          <button type="button" onClick={saveContact} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Save Contact</button>
          <DataTable
            rows={workspace.contacts}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'region', label: 'Region' },
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Consultant Bank Feedback" icon={MessageSquare}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Feedback Type" value={feedbackDraft.feedbackType} onChange={(value) => setFeedbackDraft({ ...feedbackDraft, feedbackType: value })} />
            <Field label="Message" value={feedbackDraft.message} onChange={(value) => setFeedbackDraft({ ...feedbackDraft, message: value })} />
          </div>
          <button type="button" onClick={saveFeedback} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Add Feedback</button>
          <DataTable
            rows={workspace.feedback}
            columns={[
              { key: 'feedbackType', label: 'Type' },
              { key: 'sentiment', label: 'Sentiment', render: (row) => <StatusPill status={row.sentiment} /> },
              { key: 'message', label: 'Message' },
              { key: 'consultantName', label: 'Consultant' },
            ]}
          />
        </Section>

        <Section title="Activity" icon={Clock3}>
          <div className="space-y-3">
            {workspace.activity.slice(0, 12).map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{row.eventType.replaceAll('_', ' ')}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</p>
                </div>
                <StatusPill status={row.eventType} />
              </div>
            ))}
            {!workspace.activity.length ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No bank activity yet.</p> : null}
          </div>
        </Section>
      </div>
    </>
  )
}

export default function BondBankRelationshipsPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const { bankId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [contactDraft, setContactDraft] = useState({ name: '', role: 'Business Development Manager', email: '', phone: '', region: '', notes: '' })
  const [escalationDraft, setEscalationDraft] = useState({ applicationId: '', issue: '', issueType: 'Slow Responses', priority: 'Medium' })
  const [feedbackDraft, setFeedbackDraft] = useState({ feedbackType: 'Relationship Feedback', message: '' })
  const [panelDraft, setPanelDraft] = useState(null)
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])
  const currentView = bankId ? 'profile' : (searchParams.get('view') || 'overview')
  const canManageBankPanel = isHqUser(workspaceContext)

  const state = useMemo(() => {
    try {
      if (bankId) {
        return {
          commandCentre: null,
          workspace: getBankWorkspace(bankId, workspaceContext, options),
          analytics: getBankSubmissionAnalytics(bankId, workspaceContext, options),
          bankPanel: [],
          systemBanks: [],
          error: '',
        }
      }
      return {
        commandCentre: getBankRelationshipCommandCentre(workspaceContext, options),
        workspace: null,
        analytics: [],
        bankPanel: getBankPanelForCurrentUser(workspaceContext, options),
        systemBanks: getSystemBanks(options),
        error: '',
      }
    } catch (error) {
      return { commandCentre: null, workspace: null, analytics: [], bankPanel: [], systemBanks: [], error: String(error?.message || 'Could not load bank relationships.') }
    }
  }, [bankId, workspaceContext, options])

  function refresh() {
    setNotice('Bank relationships refreshed.')
    setRefreshKey((value) => value + 1)
  }

  function selectView(view) {
    const next = new URLSearchParams(searchParams)
    if (view === 'overview') next.delete('view')
    else next.set('view', view)
    setSearchParams(next)
  }

  function openPanelEditor(row = null) {
    setPanelDraft(row ? panelDraftFromRow(row) : emptyPanelDraft())
  }

  function savePanelDraft() {
    if (!panelDraft) return
    if (!panelDraft.bankId) {
      setNotice('Select a bank before saving.')
      return
    }
    const payload = {
      bankId: panelDraft.bankId,
      status: panelDraft.status,
      primaryContactName: panelDraft.primaryContactName,
      primaryContactEmail: panelDraft.primaryContactEmail,
      primaryContactPhone: panelDraft.primaryContactPhone,
      submissionEmail: panelDraft.submissionEmail,
      portalUrl: panelDraft.portalUrl,
      slaDays: panelDraft.slaDays,
      supportedProducts: panelDraft.supportedProducts,
      regionsSupported: panelDraft.regionsSupportedText.split(',').map((item) => item.trim()).filter(Boolean),
      notes: panelDraft.notes,
    }
    try {
      if (panelDraft.id) updateOriginatorBank(panelDraft.id, payload, workspaceContext, options)
      else addOriginatorBank(payload, workspaceContext, options)
      setPanelDraft(null)
      setNotice('Bank panel saved.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not save bank panel.'))
    }
  }

  function deactivatePanelRow(row = {}) {
    try {
      deactivateOriginatorBank(row.id, workspaceContext, options)
      setNotice(`${row.bankName} deactivated.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not deactivate bank.'))
    }
  }

  function saveContact() {
    if (!bankId) return
    try {
      const existing = state.workspace?.contacts?.find((contact) => contact.email && contact.email === contactDraft.email)
      if (existing) updateBankContact(existing.id, contactDraft, workspaceContext, options)
      else createBankContact({ ...contactDraft, bankId }, workspaceContext, options)
      setNotice('Bank contact saved.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not save bank contact.'))
    }
  }

  function saveEscalation() {
    if (!bankId) return
    try {
      createBankEscalation({ ...escalationDraft, bankId, createdBy: resolveActorId(workspaceContext) }, workspaceContext, options)
      setNotice('Bank escalation created.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not create bank escalation.'))
    }
  }

  function saveFeedback() {
    if (!bankId) return
    try {
      createConsultantFeedback(bankId, { ...feedbackDraft, createdBy: resolveActorId(workspaceContext) }, workspaceContext, options)
      setNotice('Bank feedback added.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice(String(error?.message || 'Could not add bank feedback.'))
    }
  }

  if (state.error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Bank Relationships</h1>
          <p className="mt-3 text-sm text-slate-600">{state.error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-8">
        {state.workspace ? (
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bank Workspace</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950">{state.workspace.bank.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Relationship workspace, contacts, escalations and application activity.</p>
            </div>
            <Link className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" to="/bond/banks">All Banks</Link>
          </header>
        ) : null}

        {!state.workspace ? (
          <nav className="flex gap-2 overflow-x-auto rounded-[18px] border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/60">
            {[
              ['overview', 'Overview'],
              ['profiles', 'Bank Profiles'],
              ['manage', 'Manage Bank Panel'],
            ].map(([view, label]) => (
              <button
                key={view}
                type="button"
                onClick={() => selectView(view)}
                className={`h-10 shrink-0 rounded-xl px-4 text-sm font-bold transition ${currentView === view ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : null}

        {state.workspace ? (
          <WorkspaceView
            workspace={state.workspace}
            analytics={state.analytics}
            notice={notice}
            saveContact={saveContact}
            saveEscalation={saveEscalation}
            saveFeedback={saveFeedback}
            contactDraft={contactDraft}
            setContactDraft={setContactDraft}
            escalationDraft={escalationDraft}
            setEscalationDraft={setEscalationDraft}
            feedbackDraft={feedbackDraft}
            setFeedbackDraft={setFeedbackDraft}
          />
        ) : currentView === 'manage' ? (
          <BankPanelManagementView
            panelRows={state.bankPanel}
            systemBanks={state.systemBanks}
            canManage={canManageBankPanel}
            openEditor={openPanelEditor}
            deactivateBank={deactivatePanelRow}
            refresh={refresh}
            notice={notice}
          />
        ) : currentView === 'profiles' ? (
          <BankProfilesView profiles={state.commandCentre?.profiles || []} notice={notice} />
        ) : (
          <DashboardView commandCentre={state.commandCentre} refresh={refresh} notice={notice} />
        )}
      </div>
      {panelDraft ? (
        <BankPanelModal
          draft={panelDraft}
          setDraft={setPanelDraft}
          systemBanks={state.systemBanks}
          panelRows={state.bankPanel}
          onClose={() => setPanelDraft(null)}
          onSave={savePanelDraft}
        />
      ) : null}
    </main>
  )
}
