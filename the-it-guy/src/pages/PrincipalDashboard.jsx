import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileSignature,
  FileText,
  Landmark,
  LayoutGrid,
  Lightbulb,
  LineChart,
  LogOut,
  Loader2,
  Settings,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuickCreateDropdown from '../components/QuickCreateDropdown'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessPrincipalExperience } from '../lib/organisationAccess'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { getPrincipalDashboardData, PRINCIPAL_DASHBOARD_DATE_PRESETS } from '../services/principalDashboardService'
import { resolveWorkspaceRole } from '../services/roleResolutionService'

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

const OVERVIEW_MODES = [
  { key: 'overview', label: 'Overview' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'revenue', label: 'Revenue' },
]

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-white" />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[360px] animate-pulse rounded-2xl bg-white" />
        <div className="h-[360px] animate-pulse rounded-2xl bg-white" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[340px] animate-pulse rounded-2xl bg-white" />
        <div className="h-[340px] animate-pulse rounded-2xl bg-white" />
      </div>
    </div>
  )
}

function DashboardEmptyState({ onRetry, onNavigate, filtered = false }) {
  const guideItems = [
    {
      title: 'Invite your agents',
      copy: 'Add team members so leads, listings, and transactions can be assigned cleanly.',
      action: 'Open team setup',
      path: '/agency/agents',
      icon: Users,
    },
    {
      title: 'Confirm branches',
      copy: 'Check your default branch and add any offices before activity starts landing.',
      action: 'Manage branches',
      path: '/agency/branches',
      icon: BriefcaseBusiness,
    },
    {
      title: 'Create first workflow',
      copy: 'Add a lead, listing, or transaction when you are ready to start live tracking.',
      action: 'Create record',
      path: '/pipeline',
      icon: FileText,
    },
  ]

  return (
    <section className="rounded-2xl border border-dashed border-[#cfdbe8] bg-white px-4 py-8 shadow-sm sm:px-6">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf5ff] text-[#1769d1]">
        <LineChart size={22} />
      </div>
      <div className="text-center">
        <h2 className="mt-4 text-[1.2rem] font-semibold text-[#101828]">{filtered ? 'No data found for this workspace and date range.' : 'Your agency workspace is ready.'}</h2>
        <p className="mx-auto mt-2 max-w-[640px] text-sm leading-6 text-[#667085]">{filtered ? 'Try another workspace or date preset to broaden the dashboard scope.' : 'Your live KPIs will populate once leads, listings, appointments, and transactions are added. Start with the setup steps below.'}</p>
      </div>

      {!filtered ? (
        <div className="mt-7 grid gap-3 text-left md:grid-cols-3">
          {guideItems.map((item, index) => {
            const Icon = item.icon
            return (
              <article key={item.title} className="flex min-h-[188px] flex-col rounded-2xl border border-[#dde7f2] bg-[#fbfdff] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf5ff] text-[#1f69b3]"><Icon size={18} /></span>
                  <span className="rounded-full border border-[#dce7f2] bg-white px-2.5 py-1 text-xs font-semibold text-[#60758b]">Step {index + 1}</span>
                </div>
                <h3 className="mt-4 text-[0.98rem] font-semibold text-[#172a3d]">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-[#667085]">{item.copy}</p>
                <button type="button" onClick={() => onNavigate?.(item.path)} className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#1f4f78] shadow-sm">
                  {item.action}
                </button>
              </article>
            )
          })}
        </div>
      ) : null}

      <div className="mt-5 flex justify-center">
        <button type="button" onClick={onRetry} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#1f4f78] shadow-sm">
          Refresh
        </button>
      </div>
    </section>
  )
}

function FilterDropdown({ icon: Icon, value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const selected = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex h-11 min-w-[168px] items-center justify-between gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm"
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon size={16} className="shrink-0 text-[#1769d1]" /> : null}
          <span className="truncate">{selected?.label || 'Select'}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-[#8a9aac] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-[240px] overflow-hidden rounded-xl border border-[#d9e3ef] bg-white p-1.5 shadow-xl shadow-slate-200/70">
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${active ? 'bg-[#edf5ff] text-[#1769d1]' : 'text-[#344054] hover:bg-[#f8fafc]'}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {active ? <Check size={15} className="shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function PrincipalDashboardHeader({
  dateRange,
  onDateRangeChange,
  selectedWorkspaceId,
  onWorkspaceChange,
  workspaceOptions,
  profile,
}) {
  const navigate = useNavigate()
  const { logout } = useAuthSession()
  const accountMenuRef = useRef(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const initials = String(profile?.fullName || profile?.name || profile?.email || 'AL')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    function handlePointerDown(event) {
      if (!accountMenuRef.current || accountMenuRef.current.contains(event.target)) return
      setAccountMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  async function handleLogout() {
    setAccountMenuOpen(false)
    await logout()
    navigate('/auth', { replace: true })
  }

  return (
    <header className="flex justify-end">
      <div className="flex flex-wrap items-center gap-2.5">
        <QuickCreateDropdown />
        <FilterDropdown
          icon={LayoutGrid}
          value={selectedWorkspaceId}
          options={workspaceOptions}
          onChange={onWorkspaceChange}
          ariaLabel="Filter dashboard by workspace"
        />
        <FilterDropdown
          icon={CalendarDays}
          value={dateRange}
          options={PRINCIPAL_DASHBOARD_DATE_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))}
          onChange={onDateRangeChange}
          ariaLabel="Filter dashboard by date range"
        />
        <button type="button" disabled title="Coming soon" className="relative inline-flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl border border-[#d9e3ef] bg-white text-[#8a9aac] opacity-70 shadow-sm">
          <Bell size={17} />
        </button>
        <div className="relative" ref={accountMenuRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-2.5 shadow-sm transition hover:border-[#bfd0e4] hover:bg-[#f8fbff]"
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0f172a] text-xs font-semibold text-white">{initials}</span>
            <ChevronDown size={14} className="text-[#526981]" />
          </button>

          {accountMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-56 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.15)]" role="menu">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false)
                  navigate('/settings/account')
                }}
              >
                <UserRound size={16} />
                Profile
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false)
                  navigate('/settings')
                }}
              >
                <Settings size={16} />
                Settings
              </button>
              <div className="my-1 border-t border-[#edf2f7]" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#b42318] hover:bg-[#fff5f5]"
                role="menuitem"
                onClick={() => void handleLogout()}
              >
                <LogOut size={16} />
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function PrincipalKpiCard({ icon, label, value, trend, inverse = false, tone = 'blue' }) {
  const KpiIcon = icon
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
        <KpiIcon size={18} />
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
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <PrincipalKpiCard icon={Users} label="Active Transactions" value={formatCount(kpis.activeTransactions)} trend={kpis.trends.activeTransactions} tone="green" />
      <PrincipalKpiCard icon={UserRound} label="New Leads" value={formatCount(kpis.newLeads)} trend={kpis.trends.newLeads} tone="indigo" />
      <PrincipalKpiCard icon={BriefcaseBusiness} label="Expected Commission" value={kpis.expectedCommission === null ? '—' : formatCurrency(kpis.expectedCommission, { compact: true })} trend={kpis.trends.expectedCommission} tone="orange" />
      <PrincipalKpiCard icon={LineChart} label="Likely Revenue" value={formatCurrency(kpis.likelyRevenue ?? kpis.forecastRevenue, { compact: true })} trend={kpis.trends.likelyRevenue ?? kpis.trends.forecastRevenue} tone="purple" />
    </section>
  )
}

function PipelineStageChart({ stages }) {
  const maxValue = Math.max(1, ...stages.map((stage) => Number(stage.value || 0)))
  const points = stages.map((stage, index) => {
    const x = 2 + index * (96 / Math.max(1, stages.length - 1))
    const y = 78 - (Number(stage.value || 0) / maxValue) * 48
    return { ...stage, x, y }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = `${path} L ${points.at(-1)?.x || 98} 84 L ${points[0]?.x || 2} 84 Z`
  return (
    <div className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div>
        <p className="text-xs font-medium text-[#667085]">Total Pipeline Value</p>
        <p className="mt-1 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#101828]">{formatCurrency(stages.reduce((sum, stage) => sum + Number(stage.value || 0), 0))}</p>
      </div>
      <div className="flex min-h-[210px] items-center justify-center">
        <svg viewBox="0 0 100 92" preserveAspectRatio="none" className="h-[190px] w-full overflow-visible" role="img" aria-label="Pipeline by stage">
          <defs>
            <linearGradient id="pipelineArea" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="36%" stopColor="#ede9fe" />
              <stop offset="62%" stopColor="#ffedd5" />
              <stop offset="80%" stopColor="#dcfce7" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>
          </defs>
          {[2, 26, 50, 74, 98].map((x) => <line key={x} x1={x} x2={x} y1="24" y2="84" stroke="#e8eef6" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="url(#pipelineArea)" opacity="0.88" />
          <path d={path} fill="none" stroke="#4f86e8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
  const gradientParts = items
    .filter((item) => item.percentage > 0)
    .reduce(
      (state, item) => {
        const start = state.cursor
        const end = start + item.percentage
        return {
          cursor: end,
          parts: [...state.parts, `${FINANCE_COLORS[item.key] || '#94a3b8'} ${start}% ${end}%`],
        }
      },
      { cursor: 0, parts: [] },
    )
  const gradient = gradientParts.parts.join(', ')
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

function TransactionsOverviewChart({ data }) {
  const stages = Array.isArray(data?.stages) ? data.stages : []
  const maxCount = Math.max(1, ...stages.map((stage) => Number(stage.count || 0)))
  return (
    <div className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div>
        <p className="text-xs font-medium text-[#667085]">Active Transactions</p>
        <p className="mt-1 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#101828]">{formatCount(data?.totalActive)}</p>
      </div>
      <div className="mt-5 flex flex-1 flex-col justify-center gap-4">
        {stages.map((stage) => (
          <div key={stage.key}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-medium">
              <span className="text-[#344054]">{stage.label}</span>
              <span className="text-[#667085]">{formatCount(stage.count)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#edf2f7]">
              <div className="h-full rounded-full bg-[#1769d1]" style={{ width: `${Math.max(4, (Number(stage.count || 0) / maxCount) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TransactionsSummaryCard({ data }) {
  const metrics = [
    { label: 'Registered', value: formatCount(data?.registeredInRange) },
    { label: 'Pending Registration', value: formatCount(data?.pendingRegistration) },
    { label: 'Cancelled', value: formatCount(data?.cancelledInRange) },
    { label: 'Deal Count Movement', value: data?.movement === null || data?.movement === undefined ? '—' : `${data.movement > 0 ? '+' : ''}${Math.round(data.movement)}%` },
  ]
  return (
    <div className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <p className="text-sm font-semibold text-[#101828]">Transaction Movement</p>
      <div className="mt-5 grid flex-1 content-center gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
            <p className="text-xs font-medium text-[#667085]">{metric.label}</p>
            <p className="mt-1 text-[1.25rem] font-semibold text-[#101828]">{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function RevenueOverviewChart({ data }) {
  const monthly = Array.isArray(data?.monthly) ? data.monthly : []
  const maxValue = Math.max(1, ...monthly.map((item) => Number(item.salesValue || 0)))
  return (
    <div className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div>
        <p className="text-xs font-medium text-[#667085]">Registered Value</p>
        <p className="mt-1 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#101828]">{formatCurrency(data?.registeredValue, { compact: true })}</p>
      </div>
      <div className="mt-6 flex min-h-[190px] items-end gap-3">
        {monthly.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-[160px] w-full items-end rounded-t-lg bg-[#f1f5f9]">
              <div className="w-full rounded-t-lg bg-[#169b52]" style={{ height: `${Math.max(4, (Number(item.salesValue || 0) / maxValue) * 100)}%` }} />
            </div>
            <span className="text-[0.7rem] font-medium text-[#667085]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyPanel({ title, action }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-[#344054]">{title}</p>
      {action ? <p className="mt-1 text-xs text-[#667085]">{action}</p> : null}
    </div>
  )
}

function PipelineFunnelPanel({ rows = [] }) {
  const maxCount = Math.max(1, ...rows.map((row) => Number(row.count || 0)))
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} min-h-[420px]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.08rem] font-semibold text-[#101828]">Pipeline Funnel</h2>
          <p className="mt-1 text-sm text-[#667085]">Live progression from lead capture to registration.</p>
        </div>
        <span className="rounded-full border border-[#d9e3ef] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">Live scoped data</span>
      </div>
      <div className="mt-6 space-y-3">
        {rows.length ? rows.map((stage, index) => {
          const width = Math.max(8, (Number(stage.count || 0) / maxCount) * 100)
          return (
            <article key={stage.key} className="rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#101828]">{stage.label}</p>
                  <p className="mt-0.5 text-xs text-[#667085]">{formatCurrency(stage.value, { compact: true })}</p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-[1.2rem] font-semibold tabular-nums text-[#101828]">{formatCount(stage.count)}</span>
                  <span className="w-[86px] rounded-full border border-[#d9e3ef] bg-white px-2 py-1 text-xs font-semibold text-[#52657a]">
                    {stage.conversionToNext === null ? 'Final' : `${stage.conversionToNext}% next`}
                  </span>
                </div>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#edf2f7]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${['#1769d1', '#7c5cff', '#f59e0b', '#169b52', '#0f766e', '#64748b'][index] || '#1769d1'}, #dbeafe)`,
                  }}
                />
              </div>
            </article>
          )
        }) : <EmptyPanel title="No pipeline activity yet" action="Create lead" />}
      </div>
    </section>
  )
}

function PipelineHealthPanel({ items = [], compact = false }) {
  const navigate = useNavigate()
  return (
    <section className={`${dashboardCardClass} ${compact ? 'px-3.5 py-3.5' : dashboardCardPadding} flex ${compact ? 'min-h-[250px]' : 'min-h-[420px]'} flex-col`}>
      <h2 className="text-[1.08rem] font-semibold text-[#101828]">Pipeline Health</h2>
      <div className={`${compact ? 'mt-3 gap-2' : 'mt-5 gap-3'} grid flex-1 auto-rows-fr`}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => item.href ? navigate(item.href) : null}
            className={`${compact ? 'min-h-[38px] rounded-xl px-3 py-2' : 'min-h-[52px] rounded-2xl px-4 py-3'} flex h-full w-full items-center justify-between gap-4 border border-[#e3ebf5] bg-[#fbfdff] text-left transition hover:border-[#bfd0e4] hover:bg-white`}
          >
            <span className="min-w-0 truncate text-sm font-semibold text-[#344054]">{item.label}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${item.count ? 'bg-[#fff2f0] text-[#b42318]' : 'bg-[#edfdf3] text-[#16894f]'}`}>{formatCount(item.count)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

const SALES_FUNNEL_TONES = [
  'var(--color-primary)',
  'var(--color-info)',
  'var(--color-primary-hover)',
  'var(--color-warning)',
  'var(--color-danger)',
]

const SALES_FUNNEL_KPI_TONES = {
  blue: {
    iconClass: 'bg-primarySoft text-primary',
    valueClass: 'text-primary',
    borderClass: 'border-primary/10',
  },
  red: {
    iconClass: 'bg-dangerSoft text-danger',
    valueClass: 'text-danger',
    borderClass: 'border-danger/10',
  },
  green: {
    iconClass: 'bg-successSoft text-success',
    valueClass: 'text-success',
    borderClass: 'border-success/10',
  },
  purple: {
    iconClass: 'bg-[#f1eafe] text-[#7c3aed]',
    valueClass: 'text-[#7c3aed]',
    borderClass: 'border-[#eadcff]',
  },
}

const TRANSACTION_STAGE_STYLES = {
  otp: {
    icon: FileSignature,
    iconClass: 'bg-dangerSoft text-danger',
    accentClass: 'border-danger bg-dangerSoft',
    barClass: 'bg-danger',
    dotClass: 'bg-danger',
  },
  finance: {
    icon: Landmark,
    iconClass: 'bg-primarySoft text-primary',
    accentClass: 'border-primary bg-primarySoft',
    barClass: 'bg-primary',
    dotClass: 'bg-primary',
  },
  transfer: {
    icon: BriefcaseBusiness,
    iconClass: 'bg-infoSoft text-info',
    accentClass: 'border-info bg-infoSoft',
    barClass: 'bg-info',
    dotClass: 'bg-info',
  },
  registration: {
    icon: FileText,
    iconClass: 'bg-successSoft text-success',
    accentClass: 'border-success bg-successSoft',
    barClass: 'bg-success',
    dotClass: 'bg-success',
  },
  complete: {
    icon: CheckCircle2,
    iconClass: 'bg-mutedBg text-textMuted',
    accentClass: 'border-borderStrong bg-mutedBg/80',
    barClass: 'bg-textMuted',
    dotClass: 'bg-textMuted',
  },
}

function formatSignedDelta(value, { suffix = '', empty = '—' } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return empty
  const numeric = Math.round(Number(value))
  if (!numeric) return `0${suffix}`
  const sign = numeric > 0 ? '+' : '-'
  return `${sign}${Math.abs(numeric)}${suffix}`
}

function FunnelKpiCard({ icon, label, value, subtext, trend, tone = 'blue', inverseTrend = false, trendSuffix = '' }) {
  const style = SALES_FUNNEL_KPI_TONES[tone] || SALES_FUNNEL_KPI_TONES.blue
  const hasTrend = trend !== null && trend !== undefined && Number.isFinite(Number(trend))
  const trendValue = hasTrend ? Math.round(Number(trend)) : null
  const goodTrend = hasTrend ? (inverseTrend ? trendValue <= 0 : trendValue >= 0) : false
  const TrendIcon = hasTrend && trendValue < 0 ? TrendingDown : TrendingUp

  return (
    <article className={`min-h-[120px] rounded-2xl border ${style.borderClass} bg-white p-3.5 shadow-sm shadow-slate-200/40`}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${style.iconClass}`}>
        {icon ? createElement(icon, { size: 18 }) : null}
      </span>
      <p className="mt-3 text-[0.82rem] font-semibold leading-5 text-textStrong">{label}</p>
      <p className={`mt-1.5 text-[1.65rem] font-semibold leading-none tracking-normal tabular-nums ${style.valueClass}`}>{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-textMuted">{subtext}</span>
        {hasTrend ? (
          <span className={`inline-flex items-center gap-1 font-semibold ${goodTrend ? 'text-success' : 'text-danger'}`}>
            <TrendIcon size={13} />
            {formatSignedDelta(trendValue, { suffix: trendSuffix })}
          </span>
        ) : (
          <span className="font-medium text-textMuted">—</span>
        )}
      </div>
    </article>
  )
}

function SalesFunnelOverview({ data = {} }) {
  const stages = Array.isArray(data.stages) ? data.stages : []
  const insight = data.insight || {}
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[1.12rem] font-semibold text-textStrong">Sales Funnel (Lead → OTP)</h2>
          <p className="mt-1 text-sm text-textMuted">How effectively are we creating transactions?</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(220px,0.72fr)_minmax(320px,1fr)] xl:items-start">
        <div className="min-w-0">
          <div className="mx-auto flex w-full max-w-[250px] flex-col items-center">
            {stages.map((stage, index) => {
              const width = Math.max(48, 100 - index * 11)
              const color = SALES_FUNNEL_TONES[index] || 'var(--color-primary)'
              return (
                <div key={stage.key} className="flex w-full flex-col items-center">
                  <article
                    className="grid min-h-[54px] place-items-center px-4 text-center text-white shadow-sm"
                    style={{
                      width: `${width}%`,
                      clipPath: 'polygon(7% 0, 93% 0, 84% 100%, 16% 100%)',
                      background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 82%, white))`,
                    }}
                  >
                    <span>
                      <span className="block text-[1.35rem] font-semibold leading-none tabular-nums text-white">{formatCount(stage.count)}</span>
                      <span className="mt-0.5 block text-xs font-semibold leading-4 text-white">{stage.label}</span>
                    </span>
                  </article>
                  {index < stages.length - 1 ? (
                    <div className="flex min-h-[28px] flex-col items-center justify-center text-center">
                      <span className="text-xs font-semibold leading-4 text-textStrong tabular-nums">{formatPercent(stage.conversionToNext)}</span>
                      <span className="text-base leading-none text-textMuted">↓</span>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="mx-auto mt-4 flex min-h-[46px] w-full max-w-[340px] items-center justify-center rounded-2xl border border-borderSoft bg-mutedBg/80 px-4 text-center shadow-inner">
            <p className="text-sm font-semibold text-textStrong">
              Lead → OTP Conversion: <span className="text-[1.35rem] text-primary tabular-nums">{formatPercent(data.leadToOtpConversion)}</span>
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <FunnelKpiCard
            icon={LineChart}
            label="Lead → OTP Conversion"
            value={formatPercent(data.leadToOtpConversion)}
            subtext="vs last month"
            trend={data.leadToOtpConversionTrend}
            trendSuffix="pp"
            tone="blue"
          />
          <FunnelKpiCard
            icon={AlertTriangle}
            label="Lost Deals"
            value={formatCount(data.lostDeals)}
            subtext="vs last month"
            trend={data.lostDealsTrend}
            inverseTrend
            tone="red"
          />
          <FunnelKpiCard
            icon={Clock3}
            label="Avg Days to OTP"
            value={data.averageDaysToOtp === null || data.averageDaysToOtp === undefined ? '—' : formatCount(data.averageDaysToOtp)}
            subtext="days"
            trend={data.averageDaysToOtpTrend}
            inverseTrend
            tone="green"
          />
          <FunnelKpiCard
            icon={CircleDollarSign}
            label="Pipeline Value (OTP)"
            value={formatCurrency(data.pipelineValue, { compact: true })}
            subtext="Expected commission"
            trend={data.pipelineValueTrend}
            trendSuffix="%"
            tone="purple"
          />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#dce8f6] bg-[#f3f8ff] px-4 py-3 text-sm text-[#52657a]">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm">
          <Lightbulb size={15} />
        </span>
        <p className="leading-6">
          <span className="font-semibold text-textStrong">{insight.message || 'Funnel movement is holding steady.'}</span>
          {insight.detail ? <span className="ml-1">{insight.detail}</span> : null}
        </p>
      </div>
    </section>
  )
}

function TransactionHealthOverview({ data = {} }) {
  const rows = Array.isArray(data.flow) ? data.flow : []
  const bottleneck = data.bottleneck || null
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} min-h-[330px]`}>
      <div>
        <h2 className="text-[1.12rem] font-semibold text-textStrong">Transaction Health (OTP → Registration)</h2>
        <p className="mt-1 text-sm text-textMuted">How effectively are we completing transactions?</p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-5">
        {rows.map((stage, index) => {
          const style = TRANSACTION_STAGE_STYLES[stage.key] || TRANSACTION_STAGE_STYLES.otp
          const Icon = style.icon
          return (
            <article key={stage.key} className={`relative min-h-[142px] rounded-2xl border bg-white p-4 text-center shadow-sm ${stage.isHighestVolume ? `${style.accentClass} shadow-[0_16px_35px_rgba(39,76,105,0.12)]` : 'border-borderSoft'}`}>
              {stage.isHighestVolume ? <span className="absolute inset-x-6 -bottom-2 h-1 rounded-full bg-warning" /> : null}
              {index < rows.length - 1 ? (
                <span className="absolute right-[-18px] top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-borderSoft bg-white text-textMuted shadow-sm md:flex">
                  <ArrowRight size={18} />
                </span>
              ) : null}
              <span className={`mx-auto grid h-10 w-10 place-items-center rounded-xl ${style.iconClass}`}>
                <Icon size={18} />
              </span>
              <p className="mt-3 text-[0.78rem] font-semibold leading-4 text-textStrong">{stage.label}</p>
              <p className="mt-2 text-[1.7rem] font-semibold leading-none text-textStrong tabular-nums">{formatCount(stage.count)}</p>
              <p className="mt-2 text-xs font-semibold text-textMuted">{formatPercent(stage.percentage)} of active</p>
            </article>
          )
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-warning bg-warningSoft px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-warning text-white">
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-textStrong">
              Current Bottleneck: {bottleneck?.label || 'None'}
            </p>
            <p className="mt-1 text-sm text-textMuted">
              {bottleneck ? `${formatCount(bottleneck.count || 0)} transactions · avg ${Number(bottleneck.averageDays || 0).toFixed(1)} days in stage` : 'No active bottleneck detected in the selected scope.'}
            </p>
          </div>
        </div>
        <button type="button" disabled title="Coming soon" className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl border border-warning bg-white/70 px-3 text-sm font-semibold text-textMuted opacity-75">
          View Transaction Details <ArrowRight size={14} />
        </button>
      </div>
    </section>
  )
}

function ActiveTransactionDistribution({ data = {}, totalActive = 0, compact = false }) {
  const rows = Array.isArray(data.activeDistribution) ? data.activeDistribution : []
  const activeTotal = Number(totalActive || 0)
  const distributionTotal = rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const gradient = !activeTotal && !distributionTotal ? '' : rows.reduce((state, row) => {
    const style = TRANSACTION_STAGE_STYLES[row.key] || TRANSACTION_STAGE_STYLES.otp
    const start = state.cursor
    const end = start + Number(row.percentage || 0)
    return {
      cursor: end,
      parts: [...state.parts, `var(--color-${style.dotClass.replace('bg-', '')}) ${start}% ${end}%`],
    }
  }, { cursor: 0, parts: [] }).parts.join(', ')
  return (
    <section className={`${dashboardCardClass} ${compact ? 'px-4 py-4' : dashboardCardPadding} flex ${compact ? 'min-h-[174px]' : 'min-h-[270px]'} flex-col`}>
      <h2 className="text-[1.08rem] font-semibold text-textStrong">Active Transactions</h2>
      <div className={`${compact ? 'mt-4 gap-3 sm:grid-cols-[96px_minmax(0,1fr)] xl:grid-cols-[96px_minmax(0,1fr)] 2xl:grid-cols-[104px_minmax(0,1fr)]' : 'mt-5 gap-4 sm:grid-cols-[150px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[150px_minmax(0,1fr)]'} grid flex-1 items-center`}>
        <div className={`${compact ? 'h-[96px] w-[96px] 2xl:h-[104px] 2xl:w-[104px]' : 'h-[150px] w-[150px]'} relative mx-auto rounded-full`} style={{ background: gradient ? `conic-gradient(${gradient})` : 'conic-gradient(var(--color-bg-muted) 0% 100%)' }}>
          <div className={`${compact ? 'inset-[23px] 2xl:inset-[25px]' : 'inset-[34px]'} absolute grid place-items-center rounded-full bg-white text-center shadow-inner`}>
            <div>
              <p className={`${compact ? 'text-[1.15rem]' : 'text-[1.55rem]'} font-semibold leading-none text-textStrong`}>{formatCount(activeTotal)}</p>
              <p className="mt-1 text-xs font-semibold text-textMuted">Active</p>
            </div>
          </div>
        </div>
        <div className={`${compact ? 'gap-2' : 'gap-3'} grid min-w-0 content-center`}>
          {rows.map((row) => {
            const style = TRANSACTION_STAGE_STYLES[row.key] || TRANSACTION_STAGE_STYLES.otp
            return (
              <div key={row.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dotClass}`} />
                <span className="truncate font-semibold text-textBody">{row.label}</span>
                <span className="font-semibold text-textStrong tabular-nums">{formatPercent(row.percentage)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function AgentSnapshotPanel({ rows = [] }) {
  const navigate = useNavigate()
  const topRows = rows.slice(0, 4)
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.05rem] font-semibold text-[#101828]">Agent Snapshot</h2>
          <p className="mt-1 text-sm text-[#667085]">Pipeline ownership and conversion signals.</p>
        </div>
        <button type="button" onClick={() => navigate('/agents')} className="h-9 shrink-0 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">
          View agents
        </button>
      </div>

      <div className="mt-4 grid flex-1 auto-rows-fr gap-3">
        {topRows.length ? topRows.map((agent, index) => (
          <button
            key={`${agent.agentId || agent.agentName}-${index}`}
            type="button"
            onClick={() => agent.agentId ? navigate(`/agents/${agent.agentId}`) : navigate('/agents')}
            className="grid h-full min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] px-4 py-3 text-left transition hover:border-[#bfd0e4] hover:bg-white"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#101828]">{agent.agentName}</p>
              <p className="mt-1 text-xs font-medium text-[#667085]">
                {formatCount(agent.activeDeals)} active · {formatCount(agent.registeredCount)} registered
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#101828]">{formatCurrency(agent.pipelineValue, { compact: true })}</p>
              <p className="mt-1 text-xs font-medium text-[#667085]">{formatPercent(agent.conversionRate)} conversion</p>
            </div>
          </button>
        )) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#667085]">
            No agent performance data yet.
          </div>
        )}
      </div>
    </section>
  )
}

function TopPerformersThisMonthPanel({ rows = [] }) {
  const navigate = useNavigate()
  const topRows = [...rows]
    .sort((left, right) => Number(right.pipelineValue || 0) - Number(left.pipelineValue || 0))
    .slice(0, 4)
  const leaderValue = Math.max(1, ...topRows.map((agent) => Number(agent.pipelineValue || 0)))

  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.05rem] font-semibold text-[#101828]">Top Performers This Month</h2>
          <p className="mt-1 text-sm text-[#667085]">Ranked by active pipeline value.</p>
        </div>
        <button type="button" onClick={() => navigate('/agency/agents')} className="h-9 shrink-0 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">
          View agents
        </button>
      </div>

      <div className="mt-4 grid flex-1 auto-rows-fr gap-3">
        {topRows.length ? topRows.map((agent, index) => {
          const progress = Math.max(5, Math.round((Number(agent.pipelineValue || 0) / leaderValue) * 100))
          return (
            <button
              key={`${agent.agentId || agent.agentName}-top-${index}`}
              type="button"
              onClick={() => agent.agentId ? navigate(`/agents/${agent.agentId}`) : navigate('/agency/agents')}
              className="grid h-full min-h-[76px] grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] px-4 py-3 text-left transition hover:border-[#bfd0e4] hover:bg-white"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fff7e8] text-xs font-semibold text-[#a16207]">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#101828]">{agent.agentName}</span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#e5edf6]">
                  <span className="block h-full rounded-full bg-[#c1842e]" style={{ width: `${progress}%` }} />
                </span>
              </span>
              <span className="text-right text-sm font-semibold text-[#101828]">{formatCurrency(agent.pipelineValue, { compact: true })}</span>
            </button>
          )
        }) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#667085]">
            No performer data yet.
          </div>
        )}
      </div>
    </section>
  )
}

function InsightToneIcon({ tone }) {
  const toneClasses = {
    blue: 'bg-[#edf5ff] text-[#1769d1]',
    green: 'bg-[#ecfdf3] text-[#16894f]',
    amber: 'bg-[#fff7ea] text-[#9a5b13]',
    red: 'bg-[#fff2f0] text-[#b42318]',
  }
  const Icon = tone === 'red' || tone === 'amber' ? AlertTriangle : tone === 'green' ? CheckCircle2 : Target
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClasses[tone] || toneClasses.blue}`}>
      <Icon size={16} />
    </span>
  )
}

function PrincipalInsightCards({ title, copy, rows = [] }) {
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[300px] flex-col`}>
      <div>
        <h2 className="text-[1.08rem] font-semibold text-[#101828]">{title}</h2>
        <p className="mt-1 text-sm text-[#667085]">{copy}</p>
      </div>
      <div className="mt-5 grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2">
        {rows.length ? rows.map((row) => (
          <article key={row.key} className="grid min-h-[104px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] px-4 py-3">
            <InsightToneIcon tone={row.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-5 text-[#344054]">{row.label}</p>
              <p className="mt-1 text-xs font-medium leading-4 text-[#667085]">{row.detail}</p>
            </div>
            <span className="text-[1.45rem] font-semibold leading-none tracking-[-0.035em] text-[#101828] tabular-nums">{formatCount(row.value)}</span>
          </article>
        )) : (
          <div className="col-span-full flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#667085]">
            No insight data for this date range.
          </div>
        )}
      </div>
    </section>
  )
}

function AgentPerformanceCoachingTable({ rows = [] }) {
  const navigate = useNavigate()
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.08rem] font-semibold text-[#101828]">Agent Performance & Coaching</h2>
          <p className="mt-1 text-sm text-[#667085]">Principal view of ownership, conversion, and intervention points.</p>
        </div>
        <button type="button" onClick={() => navigate('/agents')} className="h-9 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">
          View agents
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="text-[0.72rem] uppercase tracking-[0.04em] text-[#667085]">
            <tr className="border-b border-[#edf2f7]">
              <th className="py-3 font-semibold">Agent</th>
              <th className="py-3 font-semibold">Pipeline</th>
              <th className="py-3 font-semibold">Deals</th>
              <th className="py-3 font-semibold">Buyer Leads</th>
              <th className="py-3 font-semibold">Mandates</th>
              <th className="py-3 font-semibold">Conversion</th>
              <th className="py-3 font-semibold">Attention</th>
              <th className="py-3 font-semibold text-right">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((agent, index) => (
              <tr
                key={`${agent.agentId || agent.agentName}-${index}`}
                onClick={() => agent.agentId ? navigate(`/agents/${agent.agentId}`) : navigate('/agents')}
                className="cursor-pointer border-b border-[#edf2f7] last:border-0 hover:bg-[#f8fafc]"
              >
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf5ff] text-xs font-semibold text-[#1769d1]">{agent.agentName.slice(0, 2).toUpperCase()}</span>
                    <span className="font-semibold text-[#101828]">{agent.agentName}</span>
                  </div>
                </td>
                <td className="py-3 text-[#344054]">{formatCurrency(agent.pipelineValue, { compact: true })}</td>
                <td className="py-3 text-[#344054]">{formatCount(agent.activeDeals)}</td>
                <td className="py-3 text-[#344054]">{formatCount(agent.buyerLeads)}</td>
                <td className="py-3 text-[#344054]">{formatCount(agent.mandates)}</td>
                <td className="py-3 text-[#344054]">{formatPercent(agent.conversionRate)}</td>
                <td className="py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                    agent.atRiskCount || agent.noActivityCount || agent.overdueTasks
                      ? 'bg-[#fff2f0] text-[#b42318]'
                      : 'bg-[#edfdf3] text-[#16894f]'
                  }`}>
                    {formatCount((agent.atRiskCount || 0) + (agent.noActivityCount || 0) + (agent.overdueTasks || 0))}
                  </span>
                </td>
                <td className="py-3 text-right text-[#344054]">{agent.nextAction}</td>
              </tr>
            )) : (
              <tr><td colSpan="8" className="h-[160px] text-center text-sm text-[#667085]">No agent performance data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TransactionFocusPanel({ commandRows = [], alertRows = [] }) {
  const commandByKey = new Map(commandRows.map((row) => [row.key, row]))
  const alertByKey = new Map(alertRows.map((row) => [row.key, row]))
  const focusRows = [
    { key: 'delayed', label: 'Delayed', count: commandByKey.get('delayed')?.count || 0, tone: 'amber' },
    { key: 'at_risk', label: 'At Risk', count: commandByKey.get('at_risk')?.count || 0, tone: 'red' },
    { key: 'bond_approval', label: 'Awaiting Bond', count: alertByKey.get('bond_approval')?.count || 0, tone: 'blue' },
    { key: 'attorney_followup', label: 'Attorney Follow-Up', count: alertByKey.get('attorney_followup')?.count || 0, tone: 'purple' },
  ]
  const toneClasses = {
    amber: 'bg-[#fff7ea] text-[#9a5b13]',
    red: 'bg-[#fff2f0] text-[#b42318]',
    blue: 'bg-[#edf5ff] text-[#1769d1]',
    purple: 'bg-[#f3efff] text-[#7657d8]',
  }

  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <div>
        <h2 className="text-[1.08rem] font-semibold text-[#101828]">Operational Focus</h2>
        <p className="mt-1 text-sm text-[#667085]">Work that needs manager attention.</p>
      </div>
      <div className="mt-5 grid flex-1 auto-rows-fr gap-3">
        {focusRows.map((row) => (
          <div key={row.key} className="flex min-h-[58px] items-center justify-between gap-3 rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] px-4 py-3">
            <span className="min-w-0 truncate text-sm font-semibold text-[#344054]">{row.label}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${toneClasses[row.tone] || toneClasses.blue}`}>
              {formatCount(row.count)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function TransactionFlowRail({ rows = [] }) {
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding}`}>
      <h2 className="text-[1.08rem] font-semibold text-[#101828]">Transaction Flow</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-5">
        {rows.map((stage, index) => (
          <article key={stage.key} className="relative min-h-[132px] rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] p-4">
            {index < rows.length - 1 ? <span className="absolute right-[-18px] top-1/2 z-10 hidden h-px w-8 bg-[#cfdbe8] md:block" /> : null}
            <p className="text-sm font-semibold text-[#101828]">{stage.label}</p>
            <p className="mt-3 text-[1.7rem] font-semibold leading-none text-[#101828] tabular-nums">{formatCount(stage.count)}</p>
            <p className="mt-2 text-xs font-medium text-[#667085]">{formatPercent(stage.percentage)} of active</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function TransactionAlertsPanel({ rows = [] }) {
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <h2 className="text-[1.08rem] font-semibold text-[#101828]">Transaction Alerts</h2>
      <div className="mt-4 grid flex-1 auto-rows-fr gap-3">
        {rows.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] px-4 py-3">
            <span className="text-sm font-semibold text-[#344054]">{item.label}</span>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${item.count ? 'bg-[#fff7ea] text-[#9a5b13]' : 'bg-[#edfdf3] text-[#16894f]'}`}>{formatCount(item.count)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function RevenueHero({ data }) {
  const hero = data?.hero || {}
  const agents = Array.isArray(data?.topAgents) ? data.topAgents : Array.isArray(data?.byAgent) ? data.byAgent : []
  const hasTarget = hero.target !== null && hero.target !== undefined
  const targetPercent = hasTarget ? Math.max(0, Math.min(100, Number(hero.targetPercent || 0))) : 0
  const achievedValue = hasTarget ? hero.achieved : hero.revenueThisMonth
  const salesValueThisMonth = hero.salesValueThisMonth ?? data?.registeredValue ?? 0
  const trend = hero.trendVsLastMonth
  return (
    <section className="min-h-[430px] overflow-hidden rounded-2xl border border-white/20 bg-[linear-gradient(135deg,#4f46e5_0%,#2f80ed_52%,#69b7ff_100%)] p-4 text-white shadow-sm sm:p-5">
      <div className="flex min-h-[390px] flex-col justify-between gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_180px_minmax(210px,0.34fr)] lg:items-center xl:grid-cols-[minmax(0,1fr)_200px_260px]">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/75">Commission Revenue This Month</p>
            <p className="mt-4 text-[2.75rem] font-semibold leading-none text-white sm:text-[3.35rem]">{formatCurrency(hero.revenueThisMonth)}</p>
            <div className="mt-5 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Sales Value</p>
                <p className="mt-2 text-xl font-semibold leading-none text-white">{formatCurrency(salesValueThisMonth, { compact: true })}</p>
                <p className="mt-1 text-xs font-medium text-white/60">Registered sale value</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Commission Trend</p>
                <p className="mt-2 inline-flex items-center gap-1 text-xl font-semibold leading-none text-white">
                  {trend === null || trend === undefined ? '—' : `${trend > 0 ? '↗' : '↘'} ${Math.abs(Math.round(trend))}%`}
                </p>
                <p className="mt-1 text-xs font-medium text-white/60">vs last month</p>
              </div>
            </div>
          </div>

          <div className="grid place-items-center lg:place-items-end">
            <div
              className="grid h-[156px] w-[156px] place-items-center rounded-full"
              style={{ background: `conic-gradient(#ffffff ${targetPercent * 3.6}deg, rgba(255,255,255,0.28) 0deg)` }}
            >
              <div className="grid h-[116px] w-[116px] place-items-center rounded-full bg-white/15 text-center text-white shadow-inner backdrop-blur">
                <div>
                  <p className="text-[1.75rem] font-semibold leading-none text-white">{hasTarget ? formatPercent(targetPercent) : '—'}</p>
                  <p className="mt-1 text-[0.72rem] font-semibold text-white/75">{hasTarget ? 'of target' : 'no target'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/15 bg-white/10 p-4 text-white backdrop-blur">
            <div>
              <p className="text-xs font-semibold text-white/65">Target</p>
              <p className="mt-1 text-lg font-semibold text-white">{hasTarget ? formatCurrency(hero.target) : 'No target set'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/65">Achieved</p>
              <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(achievedValue)}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white/80" style={{ width: `${hasTarget ? targetPercent : 0}%` }} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-white backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-sm font-semibold text-white">Top Performing Agents</h2>
            <span className="text-xs font-semibold text-white/70">Commission</span>
          </div>
          {agents.length ? (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              {agents.slice(0, 5).map((agent, index) => (
                <article key={agent.agentId || agent.agentName} className="grid min-h-[86px] grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-white/15 bg-white/10 p-3 text-white">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xs font-semibold text-white">{agent.rank || index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{agent.agentName}</p>
                    <p className="mt-1 text-xs text-white/65">{formatCount(agent.count)} registrations</p>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="whitespace-nowrap text-sm font-semibold text-white">{formatCurrency(agent.commission, { compact: true })}</p>
                      <p className="whitespace-nowrap text-xs text-white/65">{formatCurrency(agent.salesValue, { compact: true })}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-white/20 px-4 py-6 text-center text-sm font-medium text-white/75">
              No revenue data for this date range.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function RevenueSourceCards({ rows = [] }) {
  const total = Math.max(1, rows.reduce((sum, source) => sum + Number(source.value || 0), 0))
  const sourceColors = ['#2f80ed', '#22a06b', '#f59e0b', '#7657d8']
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding}`}>
      <h2 className="text-[1.08rem] font-semibold text-[#101828]">Revenue by Source</h2>
      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
        {rows.length ? rows.map((source, index) => {
          const percentageOfTotal = Math.round((Number(source.value || 0) / total) * 100)
          return (
            <article key={source.key} className="flex min-h-[150px] flex-col justify-between rounded-2xl border border-[#edf2f7] bg-[#fbfdff] p-4">
              <p className="text-sm font-semibold text-[#344054]">{source.label}</p>
              <div>
                <p className="mt-3 text-[1.55rem] font-semibold leading-none text-[#101828]">{formatCurrency(source.value, { compact: true })}</p>
                <div className="mt-5 flex items-center justify-between gap-3 text-[0.7rem] font-semibold text-[#667085]">
                  <span>{percentageOfTotal}%</span>
                  <span>{formatCurrency(total, { compact: true })} total</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf2f7]">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(percentageOfTotal, Number(source.value || 0) > 0 ? 4 : 0)}%`, background: sourceColors[index % sourceColors.length] }} />
                </div>
              </div>
            </article>
          )
        }) : <EmptyPanel title="No revenue data for this period" />}
      </div>
    </section>
  )
}

function RevenueForecastCards({ forecast, layout = 'grid' }) {
  const cards = [
    { label: 'Expected Commission', value: forecast?.expectedCommission },
    { label: 'Likely Revenue', value: forecast?.likelyRevenue },
    { label: 'Committed Revenue', value: forecast?.committedRevenue },
  ]
  const stacked = layout === 'stacked'
  const iconConfig = [
    { Icon: CalendarDays, tone: 'bg-[#edf5ff] text-[#1769d1]' },
    { Icon: Target, tone: 'bg-[#ecfdf3] text-[#16894f]' },
    { Icon: ShieldAlert, tone: 'bg-[#eefbf6] text-[#0f766e]' },
  ]
  return (
    <section className={`${stacked ? 'grid h-full grid-cols-1 gap-3' : `${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[310px] flex-col`}`}>
      {!stacked ? <h2 className="text-[1.08rem] font-semibold text-[#101828]">Revenue Forecast</h2> : null}
      <div className={stacked ? 'contents' : 'mt-5 grid flex-1 grid-cols-1 gap-4 md:grid-cols-3'}>
        {cards.map((card, index) => {
          const Icon = iconConfig[index].Icon
          return (
            <article key={card.label} className={stacked ? `${dashboardCardClass} flex min-h-[92px] flex-col justify-center p-4` : 'flex min-h-[210px] flex-col justify-center rounded-2xl border border-[#edf2f7] bg-[#fbfdff] p-4'}>
              {!stacked ? <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconConfig[index].tone}`}><Icon size={16} /></span> : null}
              <p className="text-sm font-semibold text-[#344054]">{card.label}</p>
              <p className={`${stacked ? 'mt-2 text-[1.35rem]' : 'mt-3 text-[1.55rem]'} font-semibold leading-none tracking-[-0.025em] text-[#101828] tabular-nums`}>
                {formatCurrency(card.value, { compact: true })}
              </p>
              {!stacked ? <p className="mt-3 text-xs font-medium text-[#667085]">Live scoped forecast</p> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function CommissionForecastChart({ rows = [] }) {
  const maxValue = Math.max(1, ...rows.map((row) => Number(row.expectedCommission || 0)))
  return (
    <section className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[310px] flex-col`}>
      <h2 className="text-[1.08rem] font-semibold text-[#101828]">Commission Forecast <span className="text-sm font-medium text-[#667085]">(Next 3 Months)</span></h2>
      <div className="mt-6 flex flex-1 items-end gap-5 border-b border-[#d9e3ef] px-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-[178px] w-full items-end rounded-t-xl bg-[#eef2f7] px-4 pt-4">
              <div className="w-full rounded-t-lg bg-[#2f80ed] shadow-[0_10px_28px_rgba(47,128,237,0.22)]" style={{ height: `${Math.max(4, (Number(row.expectedCommission || 0) / maxValue) * 100)}%` }} />
            </div>
            <p className="text-xs font-semibold text-[#344054]">{row.label}</p>
            <p className="text-xs text-[#667085]">{formatCurrency(row.expectedCommission, { compact: true })} · {row.confidence}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function PipelineSalesOverview({ data, overviewMode, onOverviewModeChange }) {
  const activeTab = overviewMode || 'overview'
  return (
    <section className="space-y-4">
      <div className={`${dashboardCardClass} p-1.5`}>
        <div className="grid grid-cols-2 gap-1 text-sm font-semibold text-[#52657a] md:grid-cols-4" role="tablist" aria-label="Dashboard sections">
          {OVERVIEW_MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              role="tab"
              aria-selected={activeTab === mode.key}
              onClick={() => onOverviewModeChange(mode.key)}
              className={`min-h-[42px] rounded-xl px-3 transition ${activeTab === mode.key ? 'bg-[#101828] text-white shadow-sm' : 'hover:bg-[#f8fafc] hover:text-[#24364b]'}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(320px,4fr)]">
            <div className="min-w-0">
              <SalesFunnelOverview data={data.pipeline.salesFunnel || {}} />
            </div>
            <aside className="grid min-w-0 content-start gap-6">
              <ActiveTransactionDistribution data={data.transactions.health || {}} totalActive={data.kpis.activeTransactions} compact />
              <PipelineHealthPanel items={data.pipeline.health || []} compact />
            </aside>
          </div>
          <TransactionHealthOverview data={data.transactions.health || {}} />
          <ActiveTransactionsSlider rows={data.activeTransactions || []} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <AgentSnapshotPanel rows={data.agentPerformance || []} />
            <TopPerformersThisMonthPanel rows={data.agentPerformance || []} />
          </div>
        </div>
      ) : null}
      {activeTab === 'pipeline' ? (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <PipelineFunnelPanel rows={data.pipeline.funnel || []} />
            <PipelineHealthPanel items={data.pipeline.health || []} />
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <PrincipalInsightCards
              title="Buyer Lead Insights"
              copy="Where buyer demand needs matching or follow-up."
              rows={data.pipeline.buyerLeadInsights || []}
            />
            <PrincipalInsightCards
              title="Mandate Insights"
              copy="Seller stock quality and mandate movement."
              rows={data.pipeline.mandateInsights || []}
            />
          </div>
          <AgentPerformanceCoachingTable rows={data.pipeline.agentCoaching || []} />
        </>
      ) : null}
      {activeTab === 'transactions' ? (
        <>
          <TransactionFlowRail rows={data.transactions.flow || []} />
          <ActiveTransactionsSlider rows={data.activeTransactions || []} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <TransactionFocusPanel commandRows={data.transactions.commandCentre || []} alertRows={data.transactions.alerts || []} />
            <TransactionAlertsPanel rows={data.transactions.alerts || []} />
            <RecentActivityFeed rows={data.recentActivity} />
          </div>
        </>
      ) : null}
      {activeTab === 'revenue' ? (
        <>
          <RevenueHero data={data.revenue} />
          <RevenueSourceCards rows={data.revenue.sources || []} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <RevenueForecastCards forecast={data.revenue.forecast} />
            <CommissionForecastChart rows={data.revenue.forecastChart || []} />
          </div>
        </>
      ) : null}
    </section>
  )
}

const TRANSACTION_CATEGORY_STYLES = {
  development: {
    label: 'Development',
    border: 'border-t-[#1769d1]',
    icon: 'bg-[#edf5ff] text-[#1769d1]',
    progress: 'bg-[#1769d1]',
    pill: 'border-[#cfe0ff] bg-[#f3f8ff] text-[#1769d1]',
  },
  second_hand: {
    label: 'Second-Hand',
    border: 'border-t-[#475467]',
    icon: 'bg-[#f2f4f7] text-[#475467]',
    progress: 'bg-[#475467]',
    pill: 'border-[#d0d5dd] bg-[#f8fafc] text-[#475467]',
  },
  commercial: {
    label: 'Commercial',
    border: 'border-t-[#047857]',
    icon: 'bg-[#ecfdf3] text-[#047857]',
    progress: 'bg-[#047857]',
    pill: 'border-[#bfe9d2] bg-[#f0fdf4] text-[#047857]',
  },
}

const TRANSACTION_HEALTH_STYLES = {
  on_track: 'border-[#cde8d6] bg-[#eef9f2] text-[#237345]',
  attention: 'border-[#f4d7ab] bg-[#fff7ea] text-[#9a5b13]',
  blocked: 'border-[#f2c9c3] bg-[#fff2f0] text-[#a33a2d]',
  waiting: 'border-[#d8e0ea] bg-[#f8fafc] text-[#667085]',
}

function ActiveTransactionsSlider({ rows = [] }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const filteredRows = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.category === filter)),
    [filter, rows],
  )
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'development', label: 'Development' },
    { key: 'second_hand', label: 'Second-Hand' },
    { key: 'commercial', label: 'Commercial' },
  ]

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 px-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[1.08rem] font-semibold text-[#101828]">Active Transactions</h2>
        </div>
        <button type="button" onClick={() => navigate('/transactions')} className="h-9 w-fit rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#24364b] shadow-sm">
          View all transactions
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto px-1 pb-1">
        {filters.map((item) => {
          const active = filter === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active ? 'border-[#1769d1] bg-[#edf5ff] text-[#1769d1]' : 'border-[#d9e3ef] bg-white text-[#52657a] hover:border-[#b7c8db]'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        <div className="flex min-w-0 gap-4">
          {filteredRows.length ? filteredRows.map((row) => {
            const categoryStyle = TRANSACTION_CATEGORY_STYLES[row.category] || TRANSACTION_CATEGORY_STYLES.second_hand
            const healthStyle = TRANSACTION_HEALTH_STYLES[row.health?.key] || TRANSACTION_HEALTH_STYLES.waiting
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/transactions/${row.id}`)}
                className={`group flex w-[82vw] max-w-[380px] shrink-0 flex-col rounded-2xl border border-slate-200 border-t-4 ${categoryStyle.border} bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:w-[340px]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#101828]" title={row.propertyName}>{row.propertyName}</p>
                    <p className="mt-0.5 truncate text-xs text-[#667085]" title={row.developmentName}>{row.developmentName}</p>
                  </div>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${categoryStyle.icon}`}>
                    <BriefcaseBusiness size={15} />
                  </span>
                </div>

                <div className="mt-3 grid gap-1.5 text-xs text-[#52657a]">
                  <p className="truncate"><span className="font-semibold text-[#344054]">Buyer:</span> {row.buyerName}</p>
                  <p className="truncate"><span className="font-semibold text-[#344054]">Agent:</span> {row.assignedAgent}</p>
                </div>

                <div className="mt-4 rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#101828]" title={row.stage}>{row.stage}</p>
                      <p className="mt-1 text-xs text-[#667085]">{row.financeType} · {row.daysActive ?? 0} days active</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[0.68rem] font-semibold ${categoryStyle.pill}`}>
                      {categoryStyle.label}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[0.68rem] font-semibold text-[#667085]">
                      <span>Progress</span>
                      <span>{row.progressPercent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e5edf6]">
                      <span className={`block h-full rounded-full ${categoryStyle.progress}`} style={{ width: `${row.progressPercent}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-1">
                      {row.workflowSteps.map((step) => (
                        <span key={step.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                          <span className={`h-2 w-2 rounded-full ${step.state === 'complete' ? categoryStyle.progress : step.state === 'current' ? 'bg-[#101828]' : 'bg-[#d0d5dd]'}`} />
                          <span className="max-w-full truncate text-[0.58rem] font-semibold text-[#8a9aac]">{step.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-start justify-between gap-3">
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${healthStyle}`}>
                    {row.health?.label || 'Waiting'}
                  </span>
                  <p className="line-clamp-2 text-right text-xs font-semibold leading-5 text-[#52657a]" title={row.nextAction}>
                    {row.nextAction || 'Next action pending'}
                  </p>
                </div>
              </button>
            )
          }) : (
            <div className={`${dashboardCardClass} flex min-h-[180px] min-w-full items-center justify-center border-dashed px-4 py-8 text-center text-sm text-[#667085]`}>
              No active transactions match this filter.
            </div>
          )}
        </div>
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
        <button type="button" disabled title="Coming soon" className="h-9 cursor-not-allowed rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#8a9aac] opacity-70 shadow-sm">View all</button>
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
      <button type="button" disabled title="Coming soon" className="mt-4 inline-flex cursor-not-allowed items-center gap-2 text-sm font-semibold text-[#8a9aac]">
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
        <button type="button" disabled title="Coming soon" className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#8a9aac] opacity-70 shadow-sm">
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
      <button type="button" disabled title="Coming soon" className="mt-4 inline-flex cursor-not-allowed items-center gap-2 text-sm font-semibold text-[#8a9aac]">
        View all activity <ArrowRight size={14} />
      </button>
    </section>
  )
}

function PrincipalDashboard({ agencyId = '', workspaceId = '', canViewAllTransactions: canViewAllTransactionsOverride }) {
  const { profile, currentMembership, workspaceRole, workspaceType } = useWorkspace()
  const [dateRange, setDateRange] = useState('this_month')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => String(workspaceId || 'all').trim() || 'all')
  const [overviewMode, setOverviewMode] = useState('overview')
  const [resolvedAgencyId, setResolvedAgencyId] = useState(agencyId)
  const [agencyResolutionComplete, setAgencyResolutionComplete] = useState(Boolean(agencyId))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const profileCanViewAllTransactions = useMemo(
    () =>
      canAccessPrincipalExperience({
        appRole: profile?.role,
        membershipRole: resolveWorkspaceRole(currentMembership || {
          workspace_role: workspaceRole,
          organisation_role: profile?.organisationRole,
          role: profile?.membershipRole || profile?.role,
          app_role: profile?.role,
          workspace_type: workspaceType,
        }, { appRole: profile?.role, workspaceType }),
      }),
    [currentMembership, profile?.membershipRole, profile?.organisationRole, profile?.role, workspaceRole, workspaceType],
  )
  const canViewAllTransactions =
    typeof canViewAllTransactionsOverride === 'boolean' ? canViewAllTransactionsOverride : profileCanViewAllTransactions

  useEffect(() => {
    let active = true
    async function resolveAgency() {
      if (agencyId) {
        setResolvedAgencyId(agencyId)
        setAgencyResolutionComplete(true)
        return
      }
      setAgencyResolutionComplete(false)
      try {
        const context = await fetchOrganisationSettings()
        if (active) setResolvedAgencyId(String(context?.organisation?.id || '').trim())
      } catch {
        if (active) setResolvedAgencyId('')
      } finally {
        if (active) setAgencyResolutionComplete(true)
      }
    }
    void resolveAgency()
    return () => {
      active = false
    }
  }, [agencyId])

  const loadDashboard = useCallback(async () => {
    if (!resolvedAgencyId) {
      if (!agencyResolutionComplete) {
        setLoading(true)
        return
      }
      setError('Organisation context is required before loading dashboard totals.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await getPrincipalDashboardData({
        agencyId: resolvedAgencyId,
        workspaceId: selectedWorkspaceId,
        dateRangePreset: dateRange,
        overviewMode,
        canViewAllTransactions,
        actorId: profile?.id || profile?.userId || '',
        actorEmail: profile?.email || '',
      })
      setData(result)
      if (result?.filters?.selectedWorkspaceId && result.filters.selectedWorkspaceId !== selectedWorkspaceId) {
        setSelectedWorkspaceId(result.filters.selectedWorkspaceId)
      }
    } catch (loadError) {
      console.error('[PrincipalDashboard] load failed', loadError)
      setError(loadError?.message || 'We couldn’t load the principal dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [agencyResolutionComplete, canViewAllTransactions, dateRange, overviewMode, profile?.email, profile?.id, profile?.userId, resolvedAgencyId, selectedWorkspaceId])

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

  const workspaceOptions = useMemo(() => {
    const options = data?.filters?.availableWorkspaces
    if (Array.isArray(options) && options.length) return options.map((item) => ({ value: item.id, label: item.label || item.name || 'Workspace' }))
    return [{ value: 'all', label: 'All Workspaces' }]
  }, [data?.filters?.availableWorkspaces])
  const lastUpdated = useMemo(() => formatTimestamp(data?.meta?.lastUpdatedAt), [data?.meta?.lastUpdatedAt])
  const isInitialLoading = loading && !data
  const isRefreshing = loading && data

  return (
    <main className="principal-dashboard min-h-screen bg-[#f8fafc] text-[#101828]">
      <div className="mx-auto flex w-full max-w-none flex-col gap-5 px-2 py-5 sm:px-3 lg:px-4">
        <PrincipalDashboardHeader
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          selectedWorkspaceId={selectedWorkspaceId}
          onWorkspaceChange={setSelectedWorkspaceId}
          workspaceOptions={workspaceOptions}
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

        {isInitialLoading ? <DashboardSkeleton /> : null}

        {data ? (
          <div className={`space-y-5 transition-opacity ${isRefreshing ? 'opacity-60' : 'opacity-100'}`} aria-busy={isRefreshing}>
            <PrincipalKpiRow data={data} />
            <PipelineSalesOverview data={data} overviewMode={overviewMode} onOverviewModeChange={setOverviewMode} />
            <p className="pb-2 text-center text-xs text-[#667085]">
              <Loader2 size={12} className="mr-1 inline-block" />
              Data last updated: {lastUpdated || 'just now'}
            </p>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default PrincipalDashboard
