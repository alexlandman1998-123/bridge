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
  LayoutGrid,
  LineChart,
  LogOut,
  Loader2,
  PieChart,
  Settings,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const dateLabel = data?.filters?.dateRange?.label || 'This Month'
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <PrincipalKpiCard icon={PieChart} label="Pipeline Value" value={formatCurrency(kpis.pipelineValue, { compact: true })} trend={kpis.trends.pipelineValue} />
      <PrincipalKpiCard icon={Users} label="Active Transactions" value={formatCount(kpis.activeTransactions)} trend={kpis.trends.activeTransactions} tone="green" />
      <PrincipalKpiCard icon={BriefcaseBusiness} label="Expected Commission" value={kpis.expectedCommission === null ? '—' : formatCurrency(kpis.expectedCommission, { compact: true })} trend={kpis.trends.expectedCommission} tone="orange" />
      <PrincipalKpiCard icon={CalendarDays} label={`Closing ${dateLabel}`} value={formatCount(kpis.closingThisMonth)} trend={kpis.trends.closingThisMonth} tone="purple" />
      <PrincipalKpiCard icon={Target} label="Lead → Deal Conversion" value={formatPercent(kpis.leadToDealConversion)} trend={kpis.trends.leadToDealConversion} tone="green" />
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

function RevenueAgentCard({ data }) {
  const rows = Array.isArray(data?.byAgent) ? data.byAgent : []
  return (
    <div className={`${dashboardCardClass} ${dashboardCardPadding} flex h-full min-h-[340px] flex-col`}>
      <p className="text-sm font-semibold text-[#101828]">Revenue by Agent</p>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((agent) => (
          <div key={agent.agentId || agent.agentName} className="flex items-center justify-between gap-3 rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#101828]">{agent.agentName}</p>
              <p className="mt-0.5 text-xs text-[#667085]">{formatCount(agent.count)} registrations</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#101828]">{formatCurrency(agent.commission, { compact: true })}</p>
              <p className="mt-0.5 text-xs text-[#667085]">{formatCurrency(agent.salesValue, { compact: true })}</p>
            </div>
          </div>
        )) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#667085]">
            No revenue data for this date range.
          </div>
        )}
      </div>
    </div>
  )
}

function PipelineSalesOverview({ data, overviewMode, onOverviewModeChange }) {
  const dateLabel = data?.filters?.dateRange?.label || 'This Month'
  const metrics = [
    { label: `Registered ${dateLabel}`, value: formatCount(data.pipeline.registeredThisMonth), trend: null },
    { label: 'Pending Registration', value: formatCount(data.pipeline.pendingRegistration), trend: null },
    { label: 'Avg. Deal Value', value: data.pipeline.avgDealValue === null ? '—' : formatCurrency(data.pipeline.avgDealValue, { compact: true }), trend: null },
    { label: 'Win Rate', value: formatPercent(data.pipeline.winRate), trend: null },
  ]
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 px-1 md:flex-row md:items-center md:justify-between">
        <h2 className="text-[1.08rem] font-semibold text-[#101828]">Pipeline & Sales Overview</h2>
        <div className="inline-flex h-9 w-fit rounded-xl border border-[#d9e3ef] bg-[#f8fafc] p-1 text-xs font-semibold text-[#52657a]" role="tablist" aria-label="Overview mode">
          {OVERVIEW_MODES.map((mode) => {
            const active = overviewMode === mode.key
            return (
              <button
                key={mode.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onOverviewModeChange(mode.key)}
                className={`rounded-lg px-3 py-1.5 transition ${active ? 'bg-white text-[#1769d1] shadow-sm' : 'hover:text-[#24364b]'}`}
              >
                {mode.label}
              </button>
            )
          })}
        </div>
      </div>
      {overviewMode === 'pipeline' ? (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
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
        </>
      ) : null}
      {overviewMode === 'transactions' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <TransactionsOverviewChart data={data.transactions} />
          <TransactionsSummaryCard data={data.transactions} />
        </div>
      ) : null}
      {overviewMode === 'revenue' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <RevenueOverviewChart data={data.revenue} />
          <RevenueAgentCard data={data.revenue} />
        </div>
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
          <p className="mt-1 text-sm text-[#667085]">Live operational movement across active deals.</p>
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
  const [overviewMode, setOverviewMode] = useState('pipeline')
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

        {!loading && data?.meta?.isEmpty ? <DashboardEmptyState onRetry={loadDashboard} onNavigate={navigate} filtered={Boolean(data?.meta?.hasAnyRecords)} /> : null}

        {data && !data.meta?.isEmpty ? (
          <div className={`space-y-5 transition-opacity ${isRefreshing ? 'opacity-60' : 'opacity-100'}`} aria-busy={isRefreshing}>
            <PrincipalKpiRow data={data} />
            <PipelineSalesOverview data={data} overviewMode={overviewMode} onOverviewModeChange={setOverviewMode} />
            <ActiveTransactionsSlider rows={data.activeTransactions || []} />
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <AgentPerformanceTable rows={data.agentPerformance} />
              <AttentionRequiredCard attention={data.attentionRequired} />
            </section>
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <LeadIntelligenceTable rows={data.leadIntelligence} />
              <RecentActivityFeed rows={data.recentActivity} />
            </section>
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
