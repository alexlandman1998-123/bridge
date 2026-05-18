import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileSignature,
  FileText,
  Gauge,
  LayoutGrid,
  LineChart,
  Loader2,
  PieChart,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { getPrincipalDashboardData } from '../services/principalDashboardService'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const compactCurrency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const number = new Intl.NumberFormat('en-ZA')

const STAGE_COLORS = {
  new: '#3b82f6',
  qualifying: '#8b5cf6',
  under_offer: '#f59e0b',
  pending: '#22a06b',
  closed: '#94a3b8',
}

const FINANCE_COLORS = {
  cash: '#2f80ed',
  bond: '#7c5cff',
  unknown: '#94a3b8',
}

const dashboardCardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'
const dashboardCardPadding = 'p-4 sm:p-5'

function formatCurrency(value, { compact = false, empty = 'R0' } = {}) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return empty
  return compact ? compactCurrency.format(numeric).replace('ZAR', 'R') : currency.format(numeric)
}

function formatCount(value) {
  const numeric = Number(value || 0)
  return number.format(Number.isFinite(numeric) ? Math.round(numeric) : 0)
}

function formatPercent(value, empty = '0%') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return empty
  return `${Math.round(Number(value))}%`
}

function formatDays(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value))} Days`
}

function formatTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000))
  if (diffMinutes < 60) return `${diffMinutes || 1}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.round(diffHours / 24)}d ago`
}

function TrendBadge({ value, inverse = false, label = 'vs last month' }) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return <span className="text-[0.72rem] font-medium text-[#8a9aac]">— {label}</span>
  }
  const positive = Number(value) >= 0
  const good = inverse ? !positive : positive
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-[0.72rem] font-semibold ${good ? 'text-[#169b52]' : 'text-[#dc3e37]'}`}>
      <Icon size={12} />
      {Math.abs(Math.round(Number(value)))}%
      <span className="font-medium text-[#8a9aac]">{label}</span>
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-11 animate-pulse rounded-2xl bg-white" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-white" />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[360px] animate-pulse rounded-2xl bg-white" />
        <div className="h-[360px] animate-pulse rounded-2xl bg-white" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[340px] animate-pulse rounded-2xl bg-white" />
        <div className="h-[340px] animate-pulse rounded-2xl bg-white" />
      </div>
    </div>
  )
}

function DashboardEmptyState({ onRetry }) {
  return (
    <section className="rounded-2xl border border-dashed border-[#cfdbe8] bg-white px-4 py-12 text-center shadow-sm sm:px-6">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf5ff] text-[#1769d1]">
        <LineChart size={22} />
      </div>
      <h2 className="mt-4 text-[1.2rem] font-semibold text-[#101828]">Your agency dashboard will appear here once transactions, leads, and activity are added.</h2>
      <p className="mx-auto mt-2 max-w-[560px] text-sm leading-6 text-[#667085]">The dashboard uses live transaction, lead, document, signing, and activity data. Once those records exist, the KPIs and charts will populate automatically.</p>
      <button type="button" onClick={onRetry} className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#1f4f78] shadow-sm">
        Refresh
      </button>
    </section>
  )
}

function PrincipalDashboardHeader({ dateRange, onDateRangeChange, workspaceLabel, profile }) {
  const initials = String(profile?.fullName || profile?.name || profile?.email || 'AL')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <header className="flex justify-end">
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm">
          <LayoutGrid size={16} className="text-[#1769d1]" />
          {workspaceLabel || 'All Workspaces'}
          <ChevronDown size={14} className="text-[#8a9aac]" />
        </button>
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm">
          <select value={dateRange} onChange={(event) => onDateRangeChange(event.target.value)} className="appearance-none border-0 bg-transparent p-0 text-sm font-semibold outline-none">
            <option value="this_month">This Month</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="last_month">Last Month</option>
          </select>
          <CalendarDays size={15} className="text-[#51657b]" />
        </label>
        <button type="button" className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#d9e3ef] bg-white text-[#24364b] shadow-sm">
          <Bell size={17} />
        </button>
        <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-2.5 shadow-sm">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0f172a] text-xs font-semibold text-white">{initials}</span>
          <ChevronDown size={14} className="text-[#8a9aac]" />
        </button>
      </div>
    </header>
  )
}

function PrincipalKpiCard({ icon: Icon, label, value, trend, inverse = false, tone = 'blue' }) {
  const tones = {
    blue: 'bg-[#edf5ff] text-[#1769d1]',
    green: 'bg-[#ecfdf3] text-[#16894f]',
    orange: 'bg-[#fff4e5] text-[#e07800]',
    purple: 'bg-[#f3efff] text-[#7657d8]',
    indigo: 'bg-[#eef4ff] text-[#3d63dd]',
  }
  return (
    <article className={`${dashboardCardClass} flex h-full min-h-[132px] flex-col justify-between p-[18px]`}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="truncate text-[13px] font-medium leading-5 text-[#52657a]">{label}</p>
        <p className="mt-1.5 text-[1.55rem] font-semibold leading-none tracking-[-0.035em] text-[#101828] tabular-nums">{value}</p>
      </div>
      <TrendBadge value={trend} inverse={inverse} />
    </article>
  )
}

function PrincipalKpiRow({ data }) {
  const kpis = data.kpis
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <PrincipalKpiCard icon={PieChart} label="Pipeline Value" value={formatCurrency(kpis.pipelineValue, { compact: true })} trend={kpis.trends.pipelineValue} />
      <PrincipalKpiCard icon={Users} label="Active Transactions" value={formatCount(kpis.activeTransactions)} trend={kpis.trends.activeTransactions} tone="green" />
      <PrincipalKpiCard icon={BriefcaseBusiness} label="Expected Commission" value={kpis.expectedCommission === null ? '—' : formatCurrency(kpis.expectedCommission, { compact: true })} trend={kpis.trends.expectedCommission} tone="orange" />
      <PrincipalKpiCard icon={CalendarDays} label="Closing This Month" value={formatCount(kpis.closingThisMonth)} trend={kpis.trends.closingThisMonth} tone="purple" />
      <PrincipalKpiCard icon={Gauge} label="Avg. Deal Cycle" value={formatDays(kpis.avgDealCycleDays)} trend={kpis.trends.avgDealCycleDays} inverse tone="indigo" />
      <PrincipalKpiCard icon={Target} label="Lead → Deal Conversion" value={formatPercent(kpis.leadToDealConversion)} trend={kpis.trends.leadToDealConversion} tone="green" />
    </section>
  )
}

function PipelineStageChart({ stages }) {
  const maxValue = Math.max(1, ...stages.map((stage) => Number(stage.value || 0)))
  const points = stages.map((stage, index) => {
    const x = 8 + index * (84 / Math.max(1, stages.length - 1))
    const y = 78 - (Number(stage.value || 0) / maxValue) * 48
    return { ...stage, x, y }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = `${path} L ${points.at(-1)?.x || 92} 84 L ${points[0]?.x || 8} 84 Z`
  return (
    <div className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div>
        <p className="text-xs font-medium text-[#667085]">Total Pipeline Value</p>
        <p className="mt-1 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#101828]">{formatCurrency(stages.reduce((sum, stage) => sum + Number(stage.value || 0), 0))}</p>
      </div>
      <div className="flex min-h-[210px] items-center justify-center">
        <svg viewBox="0 0 100 92" className="h-[190px] w-full overflow-visible" role="img" aria-label="Pipeline by stage">
          <defs>
            <linearGradient id="pipelineArea" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="36%" stopColor="#ede9fe" />
              <stop offset="62%" stopColor="#ffedd5" />
              <stop offset="80%" stopColor="#dcfce7" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>
          </defs>
          {[8, 26, 44, 62, 80].map((x) => <line key={x} x1={x} x2={x} y1="24" y2="84" stroke="#e8eef6" strokeWidth="0.6" />)}
          <path d={area} fill="url(#pipelineArea)" opacity="0.88" />
          <path d={path} fill="none" stroke="#4f86e8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point) => <circle key={point.key} cx={point.x} cy={point.y} r="2.5" fill={STAGE_COLORS[point.key] || '#3b82f6'} />)}
        </svg>
      </div>
      <div className="mt-auto grid gap-3 sm:grid-cols-5">
        {stages.map((stage) => (
          <div key={stage.key} className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#344054]">
              <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLORS[stage.key] || '#3b82f6' }} />
              <span className="truncate">{stage.label}</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-[#101828]">{formatCurrency(stage.value, { compact: true })}</p>
            <p className="text-xs text-[#667085]">{stage.percentage}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinanceTypeDonut({ items, totalValue }) {
  let cursor = 0
  const gradient = items
    .filter((item) => item.percentage > 0)
    .map((item) => {
      const start = cursor
      cursor += item.percentage
      return `${FINANCE_COLORS[item.key] || '#94a3b8'} ${start}% ${cursor}%`
    })
    .join(', ')
  return (
    <div className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <p className="text-sm font-semibold text-[#101828]">Pipeline by Type</p>
      <div className="grid flex-1 place-items-center py-4">
        <div className="grid h-40 w-40 place-items-center rounded-full" style={{ background: gradient ? `conic-gradient(${gradient})` : 'conic-gradient(#e2e8f0 0% 100%)' }}>
          <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-inner">
            <div>
              <p className="text-[1.15rem] font-semibold text-[#101828]">{formatCurrency(totalValue, { compact: true })}</p>
              <p className="text-xs text-[#667085]">Total</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-auto space-y-3">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-[#344054]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: FINANCE_COLORS[item.key] || '#94a3b8' }} />
              {item.label}
            </span>
            <span className="font-semibold text-[#101828]">{formatCurrency(item.value, { compact: true })} <span className="font-medium text-[#667085]">({item.percentage}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PipelineSalesOverview({ data }) {
  const metrics = [
    { label: 'Registered This Month', value: formatCount(data.pipeline.registeredThisMonth), trend: null },
    { label: 'Pending Registration', value: formatCount(data.pipeline.pendingRegistration), trend: null },
    { label: 'Avg. Deal Value', value: data.pipeline.avgDealValue === null ? '—' : formatCurrency(data.pipeline.avgDealValue, { compact: true }), trend: null },
    { label: 'Win Rate', value: formatPercent(data.pipeline.winRate), trend: null },
  ]
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 px-1 md:flex-row md:items-center md:justify-between">
        <h2 className="text-[1.08rem] font-semibold text-[#101828]">Pipeline & Sales Overview</h2>
        <div className="inline-flex h-9 w-fit rounded-xl border border-[#d9e3ef] bg-[#f8fafc] p-1 text-xs font-semibold text-[#52657a]">
          <span className="rounded-lg bg-white px-3 py-1.5 text-[#1769d1] shadow-sm">Pipeline</span>
          <span className="px-3 py-1.5">Transactions</span>
          <span className="px-3 py-1.5">Revenue</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PipelineStageChart stages={data.pipeline.stages} />
        <FinanceTypeDonut items={data.pipeline.financeTypes} totalValue={data.pipeline.totalValue} />
      </div>
      <div className={`${dashboardCardClass} grid gap-3 p-3 sm:p-4 md:grid-cols-4`}>
        {metrics.map((metric, index) => (
          <div key={metric.label} className={`px-3 py-2 ${index ? 'md:border-l md:border-[#edf2f7]' : ''}`}>
            <p className="text-xs font-medium text-[#667085]">{metric.label}</p>
            <p className="mt-2 text-[1.25rem] font-semibold text-[#101828]">{metric.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function AgentPerformanceTable({ rows }) {
  const navigate = useNavigate()
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold text-[#101828]">Agent Performance</h2>
        <button type="button" onClick={() => navigate('/agents')} className="h-9 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">View all agents</button>
      </div>
      <div className="mt-4 flex-1 overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="text-[0.72rem] uppercase tracking-[0.04em] text-[#667085]">
            <tr className="border-b border-[#edf2f7]">
              <th className="py-3 font-semibold">Agent</th>
              <th className="py-3 font-semibold">Pipeline Value</th>
              <th className="py-3 font-semibold">Active Deals</th>
              <th className="py-3 font-semibold">Conversion</th>
              <th className="py-3 font-semibold">Registered</th>
              <th className="py-3 font-semibold text-right">Response Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((agent, index) => (
              <tr key={`${agent.agentId || agent.agentName}-${index}`} onClick={() => agent.agentId ? navigate(`/agents/${agent.agentId}`) : null} className="cursor-pointer border-b border-[#edf2f7] last:border-0 hover:bg-[#f8fafc]">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#edf5ff] text-xs font-semibold text-[#1769d1]">{agent.agentName.slice(0, 2).toUpperCase()}</span>
                    <span className="font-medium text-[#101828]">{agent.agentName}</span>
                  </div>
                </td>
                <td className="py-3 font-medium text-[#101828]">{formatCurrency(agent.pipelineValue, { compact: true })}</td>
                <td className="py-3 text-[#344054]">{formatCount(agent.activeDeals)}</td>
                <td className="py-3 text-[#344054]">{formatPercent(agent.conversionRate)}</td>
                <td className="py-3 text-[#344054]">{formatCount(agent.registeredCount)}</td>
                <td className="py-3 text-right text-[#344054]">{agent.responseRate === null ? '—' : formatPercent(agent.responseRate)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="6" className="h-[210px] text-center align-middle text-sm text-[#667085]">No agent performance data yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AttentionRequiredCard({ attention }) {
  const items = [
    { key: 'stuckTransactions', label: 'Transactions stuck > 14 days', icon: Clock3, color: '#dc3e37' },
    { key: 'unsignedMandates', label: 'Unsigned mandates', icon: FileSignature, color: '#f97316' },
    { key: 'missingDocuments', label: 'Missing documents', icon: FileText, color: '#f59e0b' },
    { key: 'otpAwaitingSignature', label: 'OTPs awaiting signature', icon: FileSignature, color: '#f97316' },
    { key: 'financeApprovalsPending', label: 'Finance approvals pending', icon: WalletCards, color: '#1769d1' },
    { key: 'attorneyDelays', label: 'Attorney delays', icon: ShieldAlert, color: '#3d63dd' },
  ]
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold text-[#101828]">Attention Required</h2>
        <button type="button" className="h-9 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">View all</button>
      </div>
      <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-[#edf2f7] pr-1">
        <div className="divide-y divide-[#edf2f7]">
        {items.map((item) => {
          const Icon = item.icon
          const count = Number(attention[item.key] || 0)
          return (
            <div key={item.key} className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: item.color, background: `${item.color}14` }}>
                  <Icon size={15} />
                </span>
                <span className="truncate text-sm font-medium text-[#344054]">{item.label}</span>
              </div>
              <span className="text-[1rem] font-semibold tabular-nums" style={{ color: count ? item.color : '#667085' }}>{count}</span>
            </div>
          )
        })}
        </div>
      </div>
      <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#1f4f78]">
        View all tasks <ArrowRight size={14} />
      </button>
    </section>
  )
}

function LeadIntelligenceTable({ rows }) {
  const navigate = useNavigate()
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold text-[#101828]">Lead Intelligence</h2>
        <button type="button" onClick={() => navigate('/reports')} className="h-9 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">This Month</button>
      </div>
      <div className="mt-4 flex-1 overflow-x-auto">
        <table className="min-w-[650px] w-full text-left text-sm">
          <thead className="text-[0.72rem] uppercase tracking-[0.04em] text-[#667085]">
            <tr className="border-b border-[#edf2f7]">
              <th className="py-3 font-semibold">Source</th>
              <th className="py-3 font-semibold">Leads</th>
              <th className="py-3 font-semibold">Converted</th>
              <th className="py-3 font-semibold">Conversion Rate</th>
              <th className="py-3 font-semibold">CPL</th>
              <th className="py-3 font-semibold text-right">Avg. Deal Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((source, index) => (
              <tr key={`${source.source}-${index}`} className="border-b border-[#edf2f7] last:border-0">
                <td className="py-3 font-medium text-[#101828]"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#1769d1]" />{source.source}</td>
                <td className="py-3 text-[#344054]">{formatCount(source.leads)}</td>
                <td className="py-3 text-[#344054]">{formatCount(source.converted)}</td>
                <td className="py-3 text-[#344054]">{formatPercent(source.conversionRate)}</td>
                <td className="py-3 text-[#344054]">{source.cpl === null ? '—' : formatCurrency(source.cpl)}</td>
                <td className="py-3 text-right text-[#344054]">{source.avgDealValue === null ? '—' : formatCurrency(source.avgDealValue, { compact: true })}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="6" className="h-[190px] text-center align-middle text-sm text-[#667085]">Lead source data will appear once leads are captured.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => navigate('/reports')} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#1f4f78]">
        View full lead report <ArrowRight size={14} />
      </button>
    </section>
  )
}

function RecentActivityFeed({ rows }) {
  const icons = {
    otp_signed: FileSignature,
    registration_confirmed: CheckCircle2,
    document_uploaded: FileText,
    new_mandate: FileSignature,
    offer_accepted: CircleDollarSign,
  }
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold text-[#101828]">Recent Activity</h2>
        <button type="button" className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">
          All Activity <ChevronDown size={13} />
        </button>
      </div>
      <div className="mt-4 max-h-[360px] flex-1 divide-y divide-[#edf2f7] overflow-y-auto pr-1">
        {rows.length ? rows.map((item) => {
          const Icon = icons[item.type] || CheckCircle2
          return (
            <article key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edfdf3] text-[#169b52]">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#101828]">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-[#667085]">{item.subtitle}</p>
                <p className="mt-0.5 text-xs text-[#667085]">By {item.actorName}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-[#667085]">{formatTimestamp(item.createdAt)}</span>
            </article>
          )
        }) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#667085]">
            No recent high-value activity yet.
          </div>
        )}
      </div>
      <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#1f4f78]">
        View all activity <ArrowRight size={14} />
      </button>
    </section>
  )
}

function PrincipalDashboard({ agencyId = '', workspaceId = '' }) {
  const { workspace, profile } = useWorkspace()
  const [dateRange, setDateRange] = useState('this_month')
  const [resolvedAgencyId, setResolvedAgencyId] = useState(agencyId)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function resolveAgency() {
      if (agencyId) {
        setResolvedAgencyId(agencyId)
        return
      }
      try {
        const context = await fetchOrganisationSettings()
        if (active) setResolvedAgencyId(String(context?.organisation?.id || '').trim())
      } catch {
        if (active) setResolvedAgencyId('')
      }
    }
    void resolveAgency()
    return () => {
      active = false
    }
  }, [agencyId])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getPrincipalDashboardData({
        agencyId: resolvedAgencyId,
        workspaceId: workspaceId || workspace?.id || '',
        dateRange,
      })
      setData(result)
    } catch (loadError) {
      console.error('[PrincipalDashboard] load failed', loadError)
      setError(loadError?.message || 'We couldn’t load the principal dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [dateRange, resolvedAgencyId, workspace?.id, workspaceId])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    function refresh() {
      void loadDashboard()
    }
    window.addEventListener('itg:transaction-created', refresh)
    window.addEventListener('itg:transaction-updated', refresh)
    window.addEventListener('itg:agency-crm-updated', refresh)
    return () => {
      window.removeEventListener('itg:transaction-created', refresh)
      window.removeEventListener('itg:transaction-updated', refresh)
      window.removeEventListener('itg:agency-crm-updated', refresh)
    }
  }, [loadDashboard])

  const lastUpdated = useMemo(() => formatTimestamp(data?.meta?.lastUpdatedAt), [data?.meta?.lastUpdatedAt])

  return (
    <main className="principal-dashboard min-h-screen bg-[#f8fafc] text-[#101828]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <PrincipalDashboardHeader
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          workspaceLabel={workspace?.id === 'all' ? 'All Workspaces' : workspace?.name}
          profile={profile}
        />

        {error ? (
          <section className="rounded-[18px] border border-[#f7c9c9] bg-[#fff5f5] p-4 text-sm text-[#b42318]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2"><AlertTriangle size={16} /> We couldn’t load the principal dashboard data.</span>
              <button type="button" onClick={loadDashboard} className="rounded-lg border border-[#f0b8b8] bg-white px-3 py-1.5 text-xs font-semibold">Retry</button>
            </div>
          </section>
        ) : null}

        {loading ? <DashboardSkeleton /> : null}

        {!loading && data?.meta?.isEmpty ? <DashboardEmptyState onRetry={loadDashboard} /> : null}

        {!loading && data && !data.meta?.isEmpty ? (
          <>
            <PrincipalKpiRow data={data} />
            <PipelineSalesOverview data={data} />
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <AgentPerformanceTable rows={data.agentPerformance} />
              <AttentionRequiredCard attention={data.attentionRequired} />
            </section>
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <LeadIntelligenceTable rows={data.leadIntelligence} />
              <RecentActivityFeed rows={data.recentActivity} />
            </section>
            <p className="pb-2 text-center text-xs text-[#667085]">
              <Loader2 size={12} className="mr-1 inline-block" />
              Data last updated: {lastUpdated || 'just now'}
            </p>
          </>
        ) : null}
      </div>
    </main>
  )
}

export default PrincipalDashboard
