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
  MoreVertical,
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
  BANK_AGREEMENT_STATUSES,
  BANK_COMMISSION_BASES,
  BANK_SUPPORTED_PRODUCTS,
  BOND_ORIGINATOR_BANK_STATUSES,
  addOriginatorBank,
  deactivateOriginatorBank,
  getBankPanelForCurrentUser,
  getSystemBanks,
  updateOriginatorBank,
} from '../../services/bondOriginatorBankService'
import {
  getBondBankRelationshipSeedData,
  isBondBankRelationshipSeedBank,
} from '../../services/bondBankRelationshipSeedData'
import NetworkIntelligencePanel from '../../components/bond/NetworkIntelligencePanel'

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
  const role = normalizeText(membership.workspaceRole || membership.workspace_role || membership.organisationRole || membership.organisation_role || membership.role || membership.rawRole || workspaceContext.workspaceRole).toLowerCase()
  const scope = normalizeText(membership.scopeLevel || membership.scope_level || workspaceContext.scopeLevel).toLowerCase()
  return ['owner', 'director', 'principal', 'admin', 'owner_director', 'hq_manager', 'bond_hq_manager', 'national_manager'].includes(role) || scope === 'workspace_hq'
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function humanize(value = '') {
  return normalizeText(value).replaceAll('_', ' ') || 'Not configured'
}

function formatAgreementStatus(value = '') {
  const labels = {
    draft: 'Draft',
    under_review: 'Under review',
    active: 'Active',
    renewal_due: 'Renewal due',
    expired: 'Expired',
  }
  return labels[normalizeText(value)] || humanize(value)
}

function formatCommissionBasis(value = '') {
  const labels = {
    gross_bond_amount: 'Gross bond amount',
    bank_commission_received: 'Bank commission received',
    originator_gross_revenue: 'Originator gross revenue',
    fixed_per_instruction: 'Fixed per instruction',
  }
  return labels[normalizeText(value)] || humanize(value)
}

function formatCommissionRate(row = {}) {
  if (row.commissionRate === null || row.commissionRate === undefined || row.commissionRate === '') return 'Not set'
  const value = Number(row.commissionRate)
  if (row.commissionBasis === BANK_COMMISSION_BASES.fixedPerInstruction) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value || 0).replace('ZAR', 'R')
  }
  return `${value}%`
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

function responseDaysNumber(value) {
  return Math.round((Number(value || 0) / 24) * 10) / 10
}

function classifySlaStatus(responseTime) {
  if (responseTime === null || responseTime === undefined) return 'empty'
  const days = responseDaysNumber(responseTime)
  if (days <= 2) return 'excellent'
  if (days <= 3) return 'average'
  if (days <= 4) return 'slow'
  return 'problem'
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

function BankLogo({ bankId = '', bankName = '', size = 'md' }) {
  const label = normalizeText(bankName).split(/\s+/).map((part) => part[0]).join('').slice(0, 2) || 'B'
  const dimensions = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
  const palette = ['#0f172a', '#2563eb', '#059669', '#7c3aed', '#c2410c', '#be123c', '#0369a1', '#4f46e5']
  const index = [...normalizeText(bankId || bankName)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-black text-white ${dimensions}`} style={{ backgroundColor: palette[index] }}>
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
    <section className={`rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 ${className}`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
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

function TrendBadge({ value, label = 'vs last month', inverse = false }) {
  const number = Number(value || 0)
  if (!number) return label ? <span className="text-xs font-semibold text-slate-400">Pending trend</span> : null
  const positive = inverse ? number < 0 : number > 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
      {number > 0 ? '▲' : '▼'} {formatTrendValue(Math.abs(number))} {label}
    </span>
  )
}

function ResponseTrendBadge({ value }) {
  const number = Math.round(Number(value || 0) * 10) / 10
  if (!number) return <span className="text-xs font-semibold text-slate-400">Pending trend</span>
  const positive = number < 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
      {number > 0 ? '▲' : '▼'} {Math.abs(number)} days
    </span>
  )
}

function CommandKpiCard({ label, value, helper, trend, icon, accent = 'blue', pending = false, inverseTrend = false }) {
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
    <article className="flex min-h-[148px] flex-col justify-between rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${accentClass}`}>
          <IconComponent className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className={`mt-2 text-2xl font-bold tracking-normal ${pending ? 'text-slate-400' : 'text-slate-950'}`}>{value}</p>
        {helper ? <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p> : null}
        {trend !== undefined ? <p className="mt-2"><TrendBadge value={trend} inverse={inverseTrend} /></p> : null}
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
    <svg viewBox={`0 0 100 ${height}`} className="w-full overflow-visible" style={{ height }} aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function relationshipTier(row = {}, rank = 0) {
  const score = Number(row.healthScore || 0)
  if (rank === 1 || score >= 80) return 'Strategic Banking Partner'
  if (score >= 72) return 'Preferred Partner'
  if (score >= 62) return 'Growth Opportunity'
  return 'Partner'
}

function healthScoreTone(score = 0) {
  const value = Number(score || 0)
  if (value >= 75) return '#22c55e'
  if (value >= 62) return '#2563eb'
  if (value >= 50) return '#f97316'
  return '#ef4444'
}

function relationshipRankTone(rank = 0) {
  if (rank === 1) return 'bg-emerald-500 text-white'
  if (rank === 2) return 'bg-violet-600 text-white'
  if (rank === 3) return 'bg-blue-600 text-white'
  return 'bg-slate-100 text-slate-600'
}

function HealthRing({ score, size = 'md' }) {
  const value = Math.max(0, Math.min(100, Number(score || 0)))
  const ringSize = size === 'lg' ? 'h-28 w-28' : 'h-20 w-20'
  const innerSize = size === 'lg' ? 'h-[78px] w-[78px]' : 'h-14 w-14'
  const color = healthScoreTone(value)
  return (
    <span className={`relative inline-flex ${ringSize} shrink-0 items-center justify-center rounded-full`} style={{ background: `conic-gradient(${color} ${value * 3.6}deg, #e8eef5 0deg)` }}>
      <span className={`flex ${innerSize} flex-col items-center justify-center rounded-full bg-white text-center shadow-inner`}>
        <span className={`${size === 'lg' ? 'text-3xl' : 'text-xl'} font-black leading-none text-slate-950`}>{value || '—'}</span>
        <span className="mt-0.5 text-[10px] font-bold text-slate-400">/100</span>
      </span>
    </span>
  )
}

function LeaderboardMetric({ icon: Icon, label, value, trend, inverseTrend = false, dark = false }) {
  return (
    <div className={`${dark ? 'border-white/20' : 'border-slate-200'} min-w-0 border-l pl-4 first:border-l-0 first:pl-0`}>
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${dark ? 'bg-white/10 text-emerald-300' : 'bg-blue-50 text-blue-700'}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className={`mt-3 text-xs font-medium ${dark ? 'text-white/75' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1 truncate text-2xl font-black ${dark ? 'text-white' : 'text-slate-950'}`}>{value}</p>
      {trend !== undefined ? <p className="mt-2">{inverseTrend ? <ResponseTrendBadge value={trend} /> : <TrendBadge value={trend} label="vs last month" />}</p> : null}
    </div>
  )
}

function LeaderboardCard({ row, rank }) {
  const isHero = rank === 1
  const profileHref = `/bond/banks/${encodeURIComponent(row.bankId)}`
  const approvalDisplay = row.applications ? formatPercent(row.approvalRate) : 'Pending'
  const responseDisplay = row.averageResponseTime ? formatResponseDays(row.averageResponseTime) : 'Pending'
  return (
    <Link
      to={profileHref}
      className={`${isHero ? 'w-[min(86vw,690px)] bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.18),transparent_32%),linear-gradient(135deg,#062f20,#062817_58%,#0a3b27)] text-white' : 'w-[min(82vw,500px)] bg-white'} flex min-h-[300px] shrink-0 flex-col overflow-hidden rounded-[24px] border ${isHero ? 'border-emerald-900/30' : 'border-slate-200'} shadow-[0_22px_54px_rgba(15,23,42,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_68px_rgba(15,23,42,0.14)]`}
    >
      <div className={`${isHero ? 'p-7' : 'p-6'} flex flex-1 flex-col`}>
        <div className="flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className={`inline-flex h-12 min-w-12 items-center justify-center rounded-2xl text-lg font-black ${relationshipRankTone(rank)}`}>#{rank}</span>
            <BankLogo bankId={row.bankId} bankName={row.bankName} />
            <div className="min-w-0">
              <h3 className={`truncate text-2xl font-black ${isHero ? 'text-white' : 'text-slate-950'}`}>{row.bankName}</h3>
              <p className={`mt-1 text-sm font-medium ${isHero ? 'text-white/80' : 'text-slate-500'}`}>{relationshipTier(row, rank)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`mb-2 text-[10px] font-black uppercase tracking-[0.16em] ${isHero ? 'text-white/75' : 'text-slate-500'}`}>Health Score</p>
            <HealthRing score={row.healthScore} size={isHero ? 'lg' : 'md'} />
          </div>
        </div>

        <div className={`${isHero ? 'mt-8 grid-cols-2 xl:grid-cols-4' : 'mt-6 grid-cols-2'} grid gap-5`}>
          <LeaderboardMetric dark={isHero} icon={TrendingUp} label="Approval Rate" value={approvalDisplay} trend={row.trend?.approvalRateChangePercent} />
          <LeaderboardMetric dark={isHero} icon={Clock3} label="Avg Response" value={responseDisplay} trend={row.trend?.responseTimeChange} inverseTrend />
          <LeaderboardMetric dark={isHero} icon={Coins} label="Revenue" value={formatCompactCurrency(row.revenueGenerated)} trend={row.trend?.revenueChangePercent} />
          <LeaderboardMetric dark={isHero} icon={FileText} label="Applications" value={row.applications || 0} trend={row.trend?.applicationsChangePercent} />
        </div>

        {isHero ? (
          <div className="mt-7 grid gap-5 border-t border-white/20 pt-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-black text-emerald-300">Strengths</p>
              <div className="mt-3 space-y-2 text-sm font-medium text-white/90">
                <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> {row.averageResponseTime ? 'Fast response profile' : 'Response data pending'}</p>
                <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> {row.approvalRate ? `${formatPercent(row.approvalRate)} approval rate` : 'Approval data pending'}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-black text-amber-300">Watch-outs</p>
              <div className="mt-3 space-y-2 text-sm font-medium text-white/90">
                <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /> {row.escalations || 0} escalations</p>
                <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /> {row.healthStatus || 'Health status pending'}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className={`${isHero ? 'bg-emerald-50 text-emerald-800' : 'border-t border-slate-200 bg-white text-blue-700'} flex h-14 items-center justify-center gap-2 text-sm font-black`}>
        Open Relationship <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
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
  const [sort, setSort] = useState({ key: 'healthScore', direction: 'desc' })
  const columns = [
    ['rank', 'Rank'],
    ['bankName', 'Bank'],
    ['performance', 'Performance'],
    ['healthScore', 'Health Score'],
    ['revenueGenerated', 'Revenue'],
    ['trend', 'Trend'],
    ['action', 'Actions'],
  ]
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    if (sort.key === 'rank' || sort.key === 'action' || sort.key === 'performance') return 0
    if (sort.key === 'trend') return (right.trend?.revenueChangePercent || 0) - (left.trend?.revenueChangePercent || 0)
    const leftValue = left[sort.key]
    const rightValue = right[sort.key]
    if (typeof leftValue === 'string') return sort.direction === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
    return sort.direction === 'asc' ? Number(leftValue || 0) - Number(rightValue || 0) : Number(rightValue || 0) - Number(leftValue || 0)
  }), [rows, sort])
  if (!rows.length) return <EmptyState title="No bank performance data yet" icon={Landmark} />
  function toggleSort(key) {
    if (['rank', 'performance', 'action'].includes(key)) return
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))
  }
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-white text-xs uppercase tracking-[0.14em] text-slate-500">
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} className="border-b border-slate-200 px-5 py-4 font-bold">
                <button type="button" onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1 ${['rank', 'performance', 'action'].includes(key) ? 'cursor-default' : 'hover:text-slate-950'}`}>
                  {label}
                  {sort.key === key ? <span>{sort.direction === 'desc' ? '↓' : '↑'}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {sortedRows.map((row, index) => {
            const rank = index + 1
            const trendIsDown = row.trend?.direction === 'down' || Number(row.trend?.revenueChangePercent || 0) < 0
            const healthStatus = row.healthStatus || (Number(row.healthScore || 0) >= 75 ? 'Excellent' : Number(row.healthScore || 0) >= 62 ? 'Good' : Number(row.healthScore || 0) >= 50 ? 'Average' : 'Needs attention')
            const rankingBadge = rank === 1 ? 'Top Performer' : rank === 2 ? 'High Performer' : rank === 3 ? 'Focus Area' : 'Stable'
            return (
            <tr key={row.bankId} className="transition hover:bg-slate-50/80">
              <td className="w-[84px] px-5 py-7 align-middle">
                <div className="flex flex-col items-center gap-2">
                  <span className={`text-3xl font-black ${rank <= 3 ? 'text-amber-600' : 'text-slate-500'}`}>{rank}</span>
                  {rank <= 3 ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                      <Trophy className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="min-w-[230px] px-5 py-7 align-middle">
                <div className="flex items-center gap-3">
                  <BankLogo bankId={row.bankId} bankName={row.bankName} />
                  <div>
                    <p className="text-lg font-black text-slate-950">{row.bankName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{relationshipTier(row, rank)}</p>
                    <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusClass(rankingBadge)}`}>{rankingBadge}</span>
                  </div>
                </div>
              </td>
              <td className="min-w-[250px] px-5 py-7 align-middle">
                <div className="space-y-2.5 text-sm font-semibold text-slate-700">
                  <p className="flex items-center gap-3"><Users className="h-4 w-4 text-slate-500" /> <span className="font-black text-slate-950">{row.applications || 0}</span> Applications</p>
                  <p className="flex items-center gap-3"><Percent className="h-4 w-4 text-slate-500" /> <span className="font-black text-slate-950">{formatPercent(row.approvalRate)}</span> Approval Rate</p>
                  <p className="flex items-center gap-3"><Clock3 className="h-4 w-4 text-slate-500" /> <span className="font-black text-slate-950">{formatResponseDays(row.averageResponseTime)}</span> Avg Response</p>
                  <p className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-slate-500" /> <span className="font-black text-slate-950">{formatPercent(row.instructionRate)}</span> Instruction Rate</p>
                </div>
              </td>
              <td className="min-w-[150px] px-5 py-7 align-middle">
                <div className="flex flex-col items-center gap-2">
                  <HealthRing score={row.healthScore} />
                  <StatusPill status={healthStatus} />
                </div>
              </td>
              <td className="min-w-[160px] px-5 py-7 align-middle">
                <p className="text-2xl font-black text-slate-950">{formatCompactCurrency(row.revenueGenerated)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Revenue Generated</p>
                <div className="mt-3"><TrendBadge value={row.trend?.revenueChangePercent} label="vs last month" /></div>
              </td>
              <td className="min-w-[190px] px-5 py-7 align-middle">
                <Sparkline values={row.sparkline} tone={trendIsDown ? 'red' : 'emerald'} height={54} />
                <p className={`mt-2 text-sm font-black ${trendIsDown ? 'text-red-700' : 'text-emerald-700'}`}>{trendIsDown ? 'Declining' : 'Improving'}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{trendIsDown ? 'Monitor closely' : 'Positive trajectory'}</p>
              </td>
              <td className="w-[160px] px-5 py-7 align-middle">
                <div className="flex items-center gap-2">
                  <Link className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-blue-950 shadow-sm hover:bg-slate-50" to={`/bond/banks/${encodeURIComponent(row.bankId)}`}>
                    Open <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50" aria-label={`More actions for ${row.bankName}`}>
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          )})}
        </tbody>
      </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
        <span>Showing 1 to {sortedRows.length} of {rows.length} relationships</span>
        <div className="flex gap-2">
          <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-slate-950 px-3 text-sm font-bold text-white">1</button>
          <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700">2</button>
          <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700" aria-label="Next page"><ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}

function RegionalSlaHeatmap({ heatmap }) {
  const rows = heatmap?.rows || []
  const banks = heatmap?.banks || []
  const hasValues = rows.some((row) => row.cells.some((cell) => cell.responseTime !== null))
  if (!hasValues) return <EmptyState title="Regional SLA data is pending" description="Regional SLA data will appear once applications have region and bank activity." icon={LineChart} />
  const cellClass = {
    excellent: 'bg-emerald-100 text-emerald-900',
    average: 'bg-amber-100 text-amber-900',
    slow: 'bg-orange-100 text-orange-900',
    problem: 'bg-red-100 text-red-900',
    empty: 'bg-slate-50 text-slate-300 ring-1 ring-slate-100',
  }
  const rowsWithFastest = rows.map((row) => {
    const validCells = row.cells.filter((cell) => cell.responseTime !== null)
    const fastest = validCells.sort((left, right) => Number(left.responseTime || 0) - Number(right.responseTime || 0))[0] || null
    return { ...row, fastest }
  })
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 px-5 py-4 text-xs font-black text-slate-700">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-400" /> Within SLA (&le; 2.0 days)</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" /> Approaching (2.1 - 3.0 days)</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-orange-400" /> Slow (3.1 - 5.0 days)</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-400" /> Breach (&gt; 5.0 days)</span>
      </div>
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="sticky top-0 z-10 bg-white text-xs uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-5 py-4 text-left font-black">Region</th>
              {banks.map((bank) => (
                <th key={bank.bankId} className="border-b border-slate-200 px-4 py-4 text-left font-black">
                  <span className="inline-flex items-center gap-2">
                    <BankLogo bankId={bank.bankId} bankName={bank.bankName} size="sm" />
                    {bank.bankName}
                  </span>
                </th>
              ))}
              <th className="border-b border-slate-200 px-5 py-4 text-left font-black">
                <span className="inline-flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Fastest Bank</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rowsWithFastest.map((row) => (
              <tr key={row.id} className="transition hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-5 py-4 text-base font-black text-slate-950">{row.regionName}</td>
                {row.cells.map((cell) => (
                  <td key={cell.id} className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex min-w-[82px] justify-center rounded-lg px-3 py-2 text-xs font-black ${cellClass[classifySlaStatus(cell.responseTime)]}`}>
                        {cell.responseTime === null ? '—' : `${responseDaysNumber(cell.responseTime)} days`}
                      </span>
                      {cell.responseTime !== null ? (
                        <span className="text-xs font-bold text-slate-400">
                          {cell.applications || 0} apps
                        </span>
                      ) : null}
                    </div>
                  </td>
                ))}
                <td className="whitespace-nowrap px-5 py-4">
                  {row.fastest ? (
                    <div className="flex items-center gap-3">
                      <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-black text-slate-950">{row.fastest.bankName}</p>
                        <p className="text-xs font-semibold text-slate-500">{responseDaysNumber(row.fastest.responseTime)} days</p>
                      </div>
                    </div>
                  ) : <span className="text-sm font-semibold text-slate-400">Pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2"><LineChart className="h-4 w-4 text-blue-700" /> SLA target: 2.0 days average response time</span>
        <span>Showing 1 to {rowsWithFastest.length} of {rowsWithFastest.length} regions</span>
      </div>
    </div>
  )
}

function TrendWidget({ widget }) {
  const tone = { blue: 'blue', green: 'emerald', purple: 'purple', orange: 'orange' }[widget.tone] || 'blue'
  const values = (widget.series || []).map((point) => point.value)
  const latest = values[values.length - 1] || 0
  const displayValue = widget.id === 'revenue' ? formatCompactCurrency(latest) : widget.id === 'approval-rate' ? formatPercent(latest) : widget.id === 'turnaround' ? `${latest} days` : latest.toLocaleString?.('en-ZA') || latest
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{widget.title}</h3>
          <p className="mt-2 text-2xl font-bold text-slate-950">{displayValue}</p>
        </div>
        <TrendBadge value={widget.changePercent} inverse={widget.id === 'turnaround'} />
      </div>
      <div className="mt-6 min-h-[128px] rounded-2xl bg-slate-50 px-3 py-5">
        <Sparkline values={values} tone={tone} height={96} />
        <div className="mt-3 grid grid-cols-6 gap-1 text-center text-[11px] font-semibold text-slate-400">
          {(widget.series || []).filter((_, index) => index % 2 === 0).map((point) => <span key={point.id}>{point.label}</span>)}
        </div>
      </div>
    </article>
  )
}

function RelationshipHealthCards({ profiles = [], onManageHref = '/bond/banks?view=manage' }) {
  if (!profiles.length) {
    return (
      <EmptyState
        title="No banks configured yet."
        description="Add banks to your bank panel to start tracking bank performance."
        icon={Landmark}
      />
    )
  }
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {profiles.map((profile) => {
        const hasContact = Boolean(profile.primaryContact?.name)
        const profileHref = `/bond/banks/${encodeURIComponent(profile.bankId)}`
        return (
          <article key={profile.bankId} className="flex min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <BankLogo bankId={profile.bankId} bankName={profile.bankName} />
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-slate-950">{profile.bankName}</h3>
                  <p className="text-sm text-slate-500">Health score {profile.healthScore ?? 'Pending'}</p>
                </div>
              </div>
              <StatusPill status={profile.relationshipHealth} />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Primary Contact</p>
                <p className="mt-1 font-semibold text-slate-950">{profile.primaryContact?.name || 'No contact assigned'}</p>
                {profile.primaryContact?.email ? <p className="text-xs text-slate-500">{profile.primaryContact.email}</p> : null}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Relationship Owner</p>
                <p className="mt-1 font-semibold text-slate-950">{profile.relationshipOwner || 'No owner assigned'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Applications</p>
                <p className="mt-1 font-bold text-slate-950">{profile.applications}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Revenue</p>
                <p className="mt-1 font-bold text-slate-950">{formatCompactCurrency(profile.revenueGenerated)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Approval Rate</p>
                <p className="mt-1 font-bold text-slate-950">{profile.applications ? formatPercent(profile.approvalRate) : 'Pending'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Escalations</p>
                <p className="mt-1 font-bold text-slate-950">{profile.escalations}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Last Escalation</p>
                <p className="mt-1 font-semibold text-slate-950">{profile.lastEscalationAt ? new Date(profile.lastEscalationAt).toLocaleDateString('en-ZA') : 'None logged'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Next Review</p>
                <p className="mt-1 font-semibold text-slate-950">{profile.nextReviewDate || 'Not scheduled'}</p>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap gap-3 pt-6">
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800" to={profileHref}>
                View Profile <ArrowRight className="h-4 w-4" />
              </Link>
              {!hasContact ? (
                <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" to={onManageHref}>
                  Add Contact
                </Link>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function BankOpportunityMatrix({ matrix }) {
  const quadrants = matrix?.quadrants || []
  if (!matrix?.hasData) {
    return <EmptyState title="Bank opportunity data is pending" description="Opportunity quadrants will appear once configured banks have application, approval and revenue activity." icon={BarChart3} />
  }
  const quadrantClass = {
    preferred: 'bg-emerald-50 ring-emerald-100',
    growth: 'bg-blue-50 ring-blue-100',
    review: 'bg-amber-50 ring-amber-100',
    'low-priority': 'bg-slate-50 ring-slate-200',
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {quadrants.map((quadrant) => (
        <article key={quadrant.id} className={`min-h-[220px] rounded-2xl p-6 ring-1 ${quadrantClass[quadrant.id] || 'bg-slate-50 ring-slate-200'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{quadrant.approval} + {quadrant.revenue}</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{quadrant.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{quadrant.description}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {quadrant.banks.length ? quadrant.banks.map((bank) => (
              <Link key={bank.bankId} to={`/bond/banks/${encodeURIComponent(bank.bankId)}`} className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm hover:border-slate-300">
                <BankLogo bankId={bank.bankId} bankName={bank.bankName} size="sm" />
                <span>{bank.bankName}</span>
                <span className="text-xs text-slate-500">{formatPercent(bank.approvalRate)} · {formatCompactCurrency(bank.revenueGenerated)}</span>
              </Link>
            )) : <p className="text-sm font-semibold text-slate-500">No banks currently sit in this quadrant.</p>}
          </div>
        </article>
      ))}
    </div>
  )
}

function RelationshipSignals({ insights = [] }) {
  const rows = insights.filter((insight) => insight.id !== 'no-insights')
  if (!rows.length) {
    return (
      <EmptyState
        title="Relationship signals are pending"
        description="Relationship signals will appear once bank applications, approvals, response times and escalations are available."
        icon={LineChart}
      />
    )
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((insight) => (
        <article key={insight.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${insight.tone === 'warning' ? 'bg-amber-50 text-amber-700' : insight.tone === 'positive' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
            {insight.tone === 'warning' ? <AlertTriangle className="h-5 w-5" /> : insight.tone === 'positive' ? <TrendingUp className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-bold text-slate-950">{insight.title}</p>
            <p className="mt-1 text-sm text-slate-500">{insight.description}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

function BankProfilesTable({ profiles = [] }) {
  if (!profiles.length) {
    return <EmptyState title="No bank profiles yet" description="Configured bank profile details will appear after banks are added to the originator bank panel." icon={Users} />
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-[1180px] w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
          <tr>
            {['Bank', 'Primary Contact', 'Contact Email', 'Contact Phone', 'Relationship Owner', 'Next Review Date', 'Notes', 'Status'].map((label) => (
              <th key={label} className="px-4 py-3.5 font-bold">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {profiles.map((profile) => (
            <tr key={profile.bankId} className="transition hover:bg-slate-50/80">
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <BankLogo bankId={profile.bankId} bankName={profile.bankName} size="sm" />
                  <span className="font-bold text-slate-950">{profile.bankName}</span>
                </div>
              </td>
              <td className="px-4 py-3.5 font-semibold text-slate-700">{profile.primaryContact?.name || 'No contact assigned'}</td>
              <td className="px-4 py-3.5 text-slate-600">{profile.primaryContact?.email || '—'}</td>
              <td className="px-4 py-3.5 text-slate-600">{profile.primaryContact?.phone || '—'}</td>
              <td className="px-4 py-3.5 font-semibold text-slate-700">{profile.relationshipOwner || 'No owner assigned'}</td>
              <td className="px-4 py-3.5 text-slate-600">{profile.nextReviewDate || 'Not scheduled'}</td>
              <td className="max-w-[260px] px-4 py-3.5 text-slate-600">
                <span className="block max-h-10 overflow-hidden">{profile.relationshipNotes || 'No notes captured'}</span>
              </td>
              <td className="px-4 py-3.5"><StatusPill status={profile.relationshipHealth} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    slaOwner: '',
    slaEscalationHours: '',
    agreementStatus: BANK_AGREEMENT_STATUSES.draft,
    agreementType: 'Panel Agreement',
    agreementReference: '',
    agreementStartDate: '',
    agreementReviewDate: '',
    commissionRate: '',
    commissionBasis: BANK_COMMISSION_BASES.bankCommissionReceived,
    commissionTrigger: 'Instruction issued',
    commissionNotes: '',
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
    slaOwner: row.slaOwner || '',
    slaEscalationHours: row.slaEscalationHours || '',
    agreementStatus: row.agreementStatus || BANK_AGREEMENT_STATUSES.draft,
    agreementType: row.agreementType || 'Panel Agreement',
    agreementReference: row.agreementReference || '',
    agreementStartDate: row.agreementStartDate || '',
    agreementReviewDate: row.agreementReviewDate || '',
    commissionRate: row.commissionRate || '',
    commissionBasis: row.commissionBasis || BANK_COMMISSION_BASES.bankCommissionReceived,
    commissionTrigger: row.commissionTrigger || 'Instruction issued',
    commissionNotes: row.commissionNotes || '',
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
      <div className="max-h-[calc(100vh-48px)] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Bank Panel</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{isEditing ? 'Edit Bank' : 'Add Bank'}</h2>
            <p className="mt-1 text-sm text-slate-500">Configure partner details, agreement terms, SLA ownership and commission structure for this bank.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Close</button>
        </div>
        <div className="mt-6 space-y-6">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Partner Details</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <SelectField label="Select Bank" value={draft.bankId} onChange={(value) => setDraft({ ...draft, bankId: value })} disabled={isEditing}>
                <option value="">{availableBanks.length ? 'Choose bank' : 'No banks available'}</option>
                {availableBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.shortName}</option>)}
              </SelectField>
              <SelectField label="Panel Status" value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })}>
                {Object.values(BOND_ORIGINATOR_BANK_STATUSES).map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
              </SelectField>
              <Field label="Primary Contact Name" value={draft.primaryContactName} onChange={(value) => setDraft({ ...draft, primaryContactName: value })} />
              <Field label="Primary Contact Email" value={draft.primaryContactEmail} onChange={(value) => setDraft({ ...draft, primaryContactEmail: value })} type="email" />
              <Field label="Primary Contact Phone" value={draft.primaryContactPhone} onChange={(value) => setDraft({ ...draft, primaryContactPhone: value })} />
              <Field label="Submission Email" value={draft.submissionEmail} onChange={(value) => setDraft({ ...draft, submissionEmail: value })} type="email" />
              <Field label="Portal URL" value={draft.portalUrl} onChange={(value) => setDraft({ ...draft, portalUrl: value })} />
              <Field label="Regions Supported" value={draft.regionsSupportedText} onChange={(value) => setDraft({ ...draft, regionsSupportedText: value })} />
            </div>
          </section>

          <section>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Agreement & SLA</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Agreement Status" value={draft.agreementStatus} onChange={(value) => setDraft({ ...draft, agreementStatus: value })}>
                {Object.values(BANK_AGREEMENT_STATUSES).map((status) => <option key={status} value={status}>{formatAgreementStatus(status)}</option>)}
              </SelectField>
              <Field label="Agreement Type" value={draft.agreementType} onChange={(value) => setDraft({ ...draft, agreementType: value })} />
              <Field label="Agreement Reference" value={draft.agreementReference} onChange={(value) => setDraft({ ...draft, agreementReference: value })} />
              <Field label="Agreement Start Date" value={draft.agreementStartDate} onChange={(value) => setDraft({ ...draft, agreementStartDate: value })} type="date" />
              <Field label="Review / Renewal Date" value={draft.agreementReviewDate} onChange={(value) => setDraft({ ...draft, agreementReviewDate: value })} type="date" />
              <Field label="SLA Target Days" value={draft.slaDays} onChange={(value) => setDraft({ ...draft, slaDays: value })} type="number" />
              <Field label="SLA Owner" value={draft.slaOwner} onChange={(value) => setDraft({ ...draft, slaOwner: value })} />
              <Field label="Escalate After Hours" value={draft.slaEscalationHours} onChange={(value) => setDraft({ ...draft, slaEscalationHours: value })} type="number" />
            </div>
          </section>

          <section>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Commission Structure</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Commission Rate" value={draft.commissionRate} onChange={(value) => setDraft({ ...draft, commissionRate: value })} type="number" />
              <SelectField label="Commission Basis" value={draft.commissionBasis} onChange={(value) => setDraft({ ...draft, commissionBasis: value })}>
                {Object.values(BANK_COMMISSION_BASES).map((basis) => <option key={basis} value={basis}>{formatCommissionBasis(basis)}</option>)}
              </SelectField>
              <Field label="Commission Trigger" value={draft.commissionTrigger} onChange={(value) => setDraft({ ...draft, commissionTrigger: value })} />
            </div>
          </section>

          <section>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Products & Notes</p>
            <div className="md:col-span-2">
              <p className="mt-3 text-sm font-medium text-slate-600">Supported Products</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {BANK_SUPPORTED_PRODUCTS.map((product) => (
                  <label key={product} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={draft.supportedProducts.includes(product)} onChange={() => toggleProduct(product)} className="h-4 w-4 rounded border-slate-300" />
                    {product}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <TextAreaField label="Commission Notes" value={draft.commissionNotes} onChange={(value) => setDraft({ ...draft, commissionNotes: value })} />
              <TextAreaField label="Relationship Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} />
            </div>
          </section>
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
      <CommandSection eyebrow="Banks, Agreements & Commission" title="Configured Bank Partners" description="List every bank on the originator panel, then maintain its agreement, SLA and commission terms from one place.">
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
            <table className="min-w-[1280px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Bank</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Agreement</th>
                  <th className="px-4 py-3 font-bold">SLA</th>
                  <th className="px-4 py-3 font-bold">Commission</th>
                  <th className="px-4 py-3 font-bold">Primary Contact</th>
                  <th className="px-4 py-3 font-bold">Submission Method</th>
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
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">{formatAgreementStatus(row.agreementStatus)}</p>
                      <p className="text-xs text-slate-500">{row.agreementReviewDate ? `Review ${row.agreementReviewDate}` : row.agreementReference || 'No review date'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">{row.slaDays ? `${row.slaDays} days` : 'Not set'}</p>
                      <p className="text-xs text-slate-500">{row.slaEscalationHours ? `Escalate after ${row.slaEscalationHours}h` : row.slaOwner || 'No escalation rule'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">{formatCommissionRate(row)}</p>
                      <p className="text-xs text-slate-500">{formatCommissionBasis(row.commissionBasis)} · {row.commissionTrigger || 'Trigger not set'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">{row.primaryContactName || 'Not assigned'}</p>
                      <p className="text-xs text-slate-500">{row.primaryContactEmail || row.primaryContactPhone || 'No contact details'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">{row.submissionEmail || row.portalUrl || 'Not configured'}</p>
                      <p className="text-xs text-slate-500">{row.supportedProducts?.length ? row.supportedProducts.join(', ') : 'Products not set'} · {row.regionsSupported?.length ? row.regionsSupported.join(', ') : 'All regions'}</p>
                    </td>
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
  const headers = ['Bank', 'Status', 'Agreement Status', 'Agreement Type', 'Agreement Reference', 'Agreement Review Date', 'SLA Target Days', 'SLA Owner', 'SLA Escalation Hours', 'Commission Rate', 'Commission Basis', 'Commission Trigger', 'Primary Contact', 'Primary Contact Email', 'Submission Email', 'Portal URL', 'Supported Products', 'Regions', 'Commission Notes', 'Notes']
  const csvRows = rows.map((row) => [
    row.bankName,
    row.status,
    row.agreementStatus,
    row.agreementType,
    row.agreementReference,
    row.agreementReviewDate,
    row.slaDays ?? '',
    row.slaOwner,
    row.slaEscalationHours ?? '',
    row.commissionRate ?? '',
    row.commissionBasis,
    row.commissionTrigger,
    row.primaryContactName,
    row.primaryContactEmail,
    row.submissionEmail,
    row.portalUrl,
    (row.supportedProducts || []).join('; '),
    (row.regionsSupported || []).join('; '),
    row.commissionNotes,
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

function DashboardView({ commandCentre, notice }) {
  const model = commandCentre || {}
  const kpis = model.kpis || {}
  const topBanks = model.leaderboard?.topBanks || []
  const otherBanks = model.leaderboard?.otherBanks || []
  const performanceRows = model.performanceMatrix || []
  const hasConfiguredBanks = performanceRows.length > 0
  const hasApplicationData = Number(kpis.totalApplications || 0) > 0
  return (
    <>
      {notice ? <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{notice}</p> : null}

      {!hasConfiguredBanks ? (
        <CommandSection eyebrow="Bank Panel" title="No banks configured yet." description="Add banks to your bank panel to start tracking bank performance.">
          <Link className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800" to="/bond/banks?view=manage">
            Manage Bank Panel <ArrowRight className="h-4 w-4" />
          </Link>
        </CommandSection>
      ) : null}

      <CommandSection
        eyebrow="Relationship Leaderboard"
        title="Relationship Leaderboard"
        description="Ranked by approval, response speed, instruction conversion, revenue and escalation pressure."
        action={<Link to="/bond/banks?view=profiles" className="text-sm font-bold text-blue-700 hover:text-blue-900">View all profiles</Link>}
      >
        {topBanks.length ? (
          <div className="-mx-1 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
            <div className="flex min-w-max gap-5">
              {topBanks.map((row, index) => <LeaderboardCard key={row.bankId} row={row} rank={index + 1} />)}
            </div>
          </div>
        ) : <EmptyState title="Relationship leaderboard is pending" description="Ranking cards will appear once configured banks have application activity." icon={Trophy} />}
        {otherBanks.length ? (
          <div className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-950">Other configured relationships</h3>
              <Link to="/bond/banks?view=profiles" className="text-xs font-bold text-blue-700">View all profiles</Link>
              </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {otherBanks.map((row, index) => (
                <Link key={row.bankId} to={`/bond/banks/${encodeURIComponent(row.bankId)}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm hover:ring-1 hover:ring-slate-200">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-sm font-bold text-slate-400">{index + 4}</span>
                      <BankLogo bankId={row.bankId} bankName={row.bankName} size="sm" />
                      <span className="truncate text-sm font-bold text-slate-800">{row.bankName}</span>
                    </div>
                  <span className="text-sm font-bold text-slate-950">{formatPercent(row.approvalRate)}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </CommandSection>

      <CommandSection
        eyebrow="Performance Matrix"
        title="Bank Performance Matrix"
        description="Real-time overview of bank relationship performance and value contribution."
        action={<button type="button" onClick={() => downloadCsv(model.performanceMatrix || [])} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Download className="h-4 w-4" /> Export</button>}
      >
        <SortablePerformanceMatrix rows={model.performanceMatrix} />
      </CommandSection>

      <CommandSection eyebrow="Regional SLA" title="SLA Intelligence Centre" description="Average response time by region, configured bank and SLA performance.">
        <RegionalSlaHeatmap heatmap={model.regionalSlaHeatmap} />
      </CommandSection>

      <NetworkIntelligencePanel source={model} />

      <CommandSection eyebrow="Relationship Signals" title="Relationship Signals" description="Rules-based observations for HQ follow-up and bank relationship attention.">
        <RelationshipSignals insights={model.insights || []} />
      </CommandSection>

      <CommandSection
        eyebrow="Bank Profiles"
        title="Bank Profiles"
        description="Configured profile details for bank contacts, ownership, reviews and notes."
        action={<Link className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800" to="/bond/banks?view=manage">Manage Bank Profiles <ArrowRight className="h-4 w-4" /></Link>}
      >
        <BankProfilesTable profiles={model.profiles || []} />
      </CommandSection>
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
  const [searchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [contactDraft, setContactDraft] = useState({ name: '', role: 'Business Development Manager', email: '', phone: '', region: '', notes: '' })
  const [escalationDraft, setEscalationDraft] = useState({ applicationId: '', issue: '', issueType: 'Slow Responses', priority: 'Medium' })
  const [feedbackDraft, setFeedbackDraft] = useState({ feedbackType: 'Relationship Feedback', message: '' })
  const [panelDraft, setPanelDraft] = useState(null)
  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])
  const seededOptions = useMemo(() => ({ ...options, ...getBondBankRelationshipSeedData(workspaceId) }), [options, workspaceId])
  const currentView = bankId ? 'profile' : (searchParams.get('view') || 'overview')
  const canManageBankPanel = isHqUser(workspaceContext)

  const state = useMemo(() => {
    try {
      if (bankId) {
        const liveBankPanel = getBankPanelForCurrentUser(workspaceContext, options)
        const activeOptions = !liveBankPanel.length && isBondBankRelationshipSeedBank(bankId) ? seededOptions : options
        return {
          commandCentre: null,
          workspace: getBankWorkspace(bankId, workspaceContext, activeOptions),
          analytics: getBankSubmissionAnalytics(bankId, workspaceContext, activeOptions),
          bankPanel: [],
          systemBanks: [],
          error: '',
        }
      }
      const commandCentre = getBankRelationshipCommandCentre(workspaceContext, options)
      const bankPanel = getBankPanelForCurrentUser(workspaceContext, options)
      const shouldUseSeed = !bankPanel.length && !(commandCentre.performanceMatrix || []).length
      if (shouldUseSeed) {
        return {
          commandCentre: getBankRelationshipCommandCentre(workspaceContext, seededOptions),
          workspace: null,
          analytics: [],
          bankPanel: getBankPanelForCurrentUser(workspaceContext, seededOptions),
          systemBanks: getSystemBanks(seededOptions),
          error: '',
        }
      }
      return {
        commandCentre,
        workspace: null,
        analytics: [],
        bankPanel,
        systemBanks: getSystemBanks(options),
        error: '',
      }
    } catch (error) {
      return { commandCentre: null, workspace: null, analytics: [], bankPanel: [], systemBanks: [], error: String(error?.message || 'Could not load bank relationships.') }
    }
  }, [bankId, workspaceContext, options, seededOptions])

  function refresh() {
    setNotice('Bank relationships refreshed.')
    setRefreshKey((value) => value + 1)
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
      slaOwner: panelDraft.slaOwner,
      slaEscalationHours: panelDraft.slaEscalationHours,
      agreementStatus: panelDraft.agreementStatus,
      agreementType: panelDraft.agreementType,
      agreementReference: panelDraft.agreementReference,
      agreementStartDate: panelDraft.agreementStartDate,
      agreementReviewDate: panelDraft.agreementReviewDate,
      commissionRate: panelDraft.commissionRate,
      commissionBasis: panelDraft.commissionBasis,
      commissionTrigger: panelDraft.commissionTrigger,
      commissionNotes: panelDraft.commissionNotes,
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
          <DashboardView commandCentre={state.commandCentre} notice={notice} />
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
