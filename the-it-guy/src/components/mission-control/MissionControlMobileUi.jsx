import {
  Activity,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  DollarSign,
  FileCheck2,
  FileText,
  Grid2x2,
  HeartPulse,
  Home,
  LayoutGrid,
  LineChart,
  MoreHorizontal,
  PieChart,
  Search,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { MissionControlCarousel } from './MissionControlUi'
import { cn } from '../../lib/utils'
import { formatMissionControlCount } from '../../services/missionControlSnapshotModel'

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 2,
  notation: 'compact',
  compactDisplay: 'short',
})

function formatCurrencyCompact(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return CURRENCY_FORMATTER.format(numeric).replace(/\s/g, '')
}

function formatPercentDelta(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  if (numeric === 0) return '0% vs 30d'
  return `${numeric > 0 ? '+' : ''}${Math.round(numeric)}% vs 30d`
}

function formatPercentChange(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  const percent = Math.abs(numeric) <= 1 ? numeric * 100 : numeric
  if (percent === 0) return '0%'
  return `${percent > 0 ? '+' : ''}${Math.round(percent)}%`
}

function formatChangeLabel(value, fallback = '') {
  return formatPercentDelta(value) || fallback
}

function formatMetricValue(value) {
  if (value === null || value === undefined) return '—'
  return formatMissionControlCount(value)
}

function formatDashboardValue(value, valueType = '') {
  if (value === null || value === undefined) return '—'
  if (valueType === 'currency') return formatCurrencyCompact(value)
  return formatMetricValue(value)
}

function getToneStyles(tone = 'blue') {
  const tones = {
    blue: {
      badge: 'bg-[#edf4ff] text-[#2a5bd7]',
      soft: 'bg-[#f5f9ff]',
      line: '#3b82f6',
      fill: 'rgba(59,130,246,0.12)',
      pill: 'bg-[#edf4ff] text-[#2a5bd7]',
    },
    green: {
      badge: 'bg-[#ebfff4] text-[#1f8a4c]',
      soft: 'bg-[#f3fff8]',
      line: '#22a15f',
      fill: 'rgba(34,161,95,0.12)',
      pill: 'bg-[#ebfff4] text-[#1f8a4c]',
    },
    purple: {
      badge: 'bg-[#f5efff] text-[#8a42e8]',
      soft: 'bg-[#faf7ff]',
      line: '#9b5cf6',
      fill: 'rgba(155,92,246,0.12)',
      pill: 'bg-[#f4ecff] text-[#8a42e8]',
    },
    orange: {
      badge: 'bg-[#fff5e9] text-[#d9821f]',
      soft: 'bg-[#fffaf4]',
      line: '#f59e0b',
      fill: 'rgba(245,158,11,0.12)',
      pill: 'bg-[#fff4e7] text-[#d9821f]',
    },
    red: {
      badge: 'bg-[#fff0f0] text-[#df4e4e]',
      soft: 'bg-[#fff8f8]',
      line: '#ef4444',
      fill: 'rgba(239,68,68,0.12)',
      pill: 'bg-[#fff0f0] text-[#df4e4e]',
    },
  }

  return tones[tone] || tones.blue
}

function renderMetricIcon(icon = '', className = '') {
  switch (icon) {
    case 'transactions':
      return <BriefcaseBusiness className={className} />
    case 'registrations':
      return <FileCheck2 className={className} />
    case 'revenue':
      return <DollarSign className={className} />
    case 'organisations':
      return <Building2 className={className} />
    case 'building':
      return <Building2 className={className} />
    case 'users':
      return <Users className={className} />
    case 'bank':
      return <LayoutGrid className={className} />
    case 'trend':
      return <TrendingUp className={className} />
    default:
      return <Grid2x2 className={className} />
  }
}

function getNetworkHealthTone(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'critical') return 'red'
  if (normalized === 'attention') return 'orange'
  return 'green'
}

function getAttentionTone(severity = '') {
  const normalized = String(severity || '').toLowerCase()
  if (normalized === 'critical') return 'red'
  if (normalized === 'warning') return 'orange'
  return 'green'
}

function renderActivityIcon(type = '', tone = 'blue', className = '') {
  const normalized = String(type || '').toLowerCase()
  if (normalized.includes('registration') || normalized.includes('joined') || normalized.includes('complete')) return <CircleCheckBig className={className} />
  if (normalized.includes('signed')) return <FileCheck2 className={className} />
  if (normalized.includes('upload') || normalized.includes('document')) return <FileText className={className} />
  if (normalized.includes('invite')) return <UserPlus className={className} />
  if (tone === 'red' || tone === 'orange') return <CircleAlert className={className} />
  return <Bell className={className} />
}

function Sparkline({ values = [], tone = 'blue', className = '' }) {
  const styles = getToneStyles(tone)
  const width = 320
  const height = 88
  const padding = 8
  const normalizedValues = Array.isArray(values) ? values.filter((value) => Number.isFinite(Number(value))) : []

  if (normalizedValues.length < 2) {
    return (
      <div className={cn('h-[88px] rounded-[18px] bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.82)_100%)]', className)} aria-hidden="true" />
    )
  }

  const minValue = Math.min(...normalizedValues)
  const maxValue = Math.max(...normalizedValues)
  const valueRange = maxValue - minValue || 1
  const stepX = (width - padding * 2) / Math.max(normalizedValues.length - 1, 1)

  const points = normalizedValues.map((value, index) => {
    const x = padding + index * stepX
    const y = height - padding - ((value - minValue) / valueRange) * (height - padding * 2)
    return `${x},${y}`
  })

  const areaPoints = [`${padding},${height - padding}`, ...points, `${width - padding},${height - padding}`].join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('h-[88px] w-full', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`mission-control-fill-${tone}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={styles.fill} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#mission-control-fill-${tone})`} />
      <polyline
        fill="none"
        stroke={styles.line}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        points={points.join(' ')}
      />
    </svg>
  )
}

function MobileSurface({ children, className = '' }) {
  return (
    <div className={cn('rounded-[22px] border border-[#e7edf5] bg-white shadow-[0_14px_32px_rgba(15,23,42,0.05)]', className)}>
      {children}
    </div>
  )
}

export function MissionControlMobileHeader({ initials = 'HQ', avatarUrl = '', alertsCount = 0, displayName = 'Account' }) {
  const badgeLabel = alertsCount > 99 ? '99+' : String(Math.max(alertsCount, 0))

  return (
    <div className="flex items-center justify-between gap-4">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-[1.7rem] font-semibold tracking-[-0.05em] text-[#0f172a]" aria-label="Go to Arch9 home">
        <span>ARCH</span>
        <span className="text-[#ef5350]">9</span>
        <span className="text-[1.55rem] font-medium text-[#667085]">HQ</span>
      </Link>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4ebf3] bg-white text-[#0f172a] shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
          aria-label={`Notifications${alertsCount ? `, ${alertsCount} unread` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {alertsCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-semibold text-white">
              {badgeLabel}
            </span>
          ) : null}
        </button>

        <Link
          to="/settings/account"
          className="relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[#dfe7f0] bg-[#0f172a] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
          aria-label={`Open account settings for ${displayName}`}
        >
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true">{initials}</span>}
          <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#22c55e]" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

export function MissionControlMobileDashboardHero({ dashboard }) {
  const healthTone = getNetworkHealthTone(dashboard?.networkHealth?.status)
  const healthStyles = getToneStyles(healthTone)
  const healthStatus = String(dashboard?.networkHealth?.status || 'healthy')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.98rem] font-medium text-[#667085]">Good morning, {dashboard?.greetingName || 'Alex'}</p>
          <h1 className="mt-2 text-[2.35rem] font-semibold leading-none text-[#0f172a]">
            {formatMetricValue(dashboard?.headline?.value)} {dashboard?.headline?.label || 'Active Transactions'}
          </h1>
          <p className="mt-3 text-[0.98rem] leading-6 text-[#667085]">{dashboard?.headline?.subtitle || 'Across the Arch9 ecosystem'}</p>
        </div>
      </div>

      <MobileSurface className="px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full', healthStyles.soft)}>
              <HeartPulse className={cn('h-5 w-5', healthStyles.badge.split(' ')[1])} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.72rem] font-semibold uppercase text-[#667085]">Network Health</p>
              <p className="mt-1 text-[0.94rem] font-semibold text-[#0f172a]">{dashboard?.networkHealth?.alertCount || 0} active alerts</p>
            </div>
          </div>
          <span className={cn('inline-flex shrink-0 rounded-full px-3 py-1.5 text-[0.78rem] font-semibold', healthStyles.pill)}>
            {dashboard?.networkHealth?.score ?? '—'}% {healthStatus}
          </span>
        </div>
      </MobileSurface>
    </div>
  )
}

export function MissionControlKpiGrid({ items = [] }) {
  if (!items.length) return <MobileSurface className="px-4 py-4 text-sm text-[#667085]">No KPI data available yet.</MobileSurface>

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const toneStyles = getToneStyles(item?.tone)
        const changeLabel = formatPercentChange(item?.changePct)

        return (
          <MobileSurface key={item.key} className="min-h-[154px] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', toneStyles.soft)}>
                {renderMetricIcon(item?.icon, cn('h-4 w-4', toneStyles.badge.split(' ')[1]))}
              </span>
              {changeLabel ? <span className={cn('rounded-full px-2 py-1 text-[0.7rem] font-semibold', toneStyles.pill)}>{changeLabel}</span> : null}
            </div>
            <p className="mt-4 text-[1.75rem] font-semibold leading-none text-[#0f172a]">{formatDashboardValue(item?.value, item?.valueType)}</p>
            <p className="mt-2 text-[0.88rem] font-semibold leading-5 text-[#102033]">{item?.label || 'Metric'}</p>
            {item?.helper ? <p className="mt-2 line-clamp-2 text-[0.78rem] leading-4 text-[#667085]">{item.helper}</p> : null}
          </MobileSurface>
        )
      })}
    </div>
  )
}

export function MissionControlAttentionList({ items = [] }) {
  if (!items.length) return <MobileSurface className="px-4 py-4 text-sm text-[#667085]">No attention items right now.</MobileSurface>

  return (
    <MobileSurface className="overflow-hidden">
      <div className="divide-y divide-[#edf2f7]">
        {items.map((item) => {
          const tone = getAttentionTone(item?.severity)
          const toneStyles = getToneStyles(tone)

          return (
            <div key={item.key} className="flex items-center gap-3 px-4 py-3.5">
              <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full', toneStyles.soft)}>
                {tone === 'green' ? <CircleCheckBig className="h-4 w-4 text-[#1f8a4c]" /> : <CircleAlert className={cn('h-4 w-4', toneStyles.badge.split(' ')[1])} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-semibold text-[#0f172a]">{item?.label || 'Attention item'}</p>
                <p className="mt-1 truncate text-[0.8rem] text-[#667085]">{item?.helper || 'No action needed.'}</p>
              </div>
              <p className="text-[1.35rem] font-semibold leading-none text-[#0f172a]">{formatMetricValue(item?.value)}</p>
            </div>
          )
        })}
      </div>
    </MobileSurface>
  )
}

export function MissionControlDistributionCard({ distribution }) {
  const items = distribution?.items || []
  const total = Number(distribution?.uniqueTransactionsTotal || 0)

  if (!items.length) return <MobileSurface className="px-4 py-4 text-sm text-[#667085]">No transaction distribution available yet.</MobileSurface>

  return (
    <MobileSurface className="px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f9ff] text-[#2a5bd7]">
            <PieChart className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[0.72rem] font-semibold uppercase text-[#667085]">Unique Total</p>
            <p className="mt-1 text-[1.45rem] font-semibold leading-none text-[#0f172a]">{formatMetricValue(total)}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const toneStyles = getToneStyles(item?.tone)
          const percent = total > 0 ? Math.round((Number(item?.value || 0) / total) * 100) : 0

          return (
            <div key={item.key}>
              <div className="flex items-center justify-between gap-3 text-[0.86rem]">
                <span className="font-medium text-[#102033]">{item.label}</span>
                <span className="font-semibold text-[#0f172a]">{formatMetricValue(item.value)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf2f7]">
                <div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: toneStyles.line }} />
              </div>
            </div>
          )
        })}
      </div>
    </MobileSurface>
  )
}

export function MissionControlAverageRegistrationCard({ metric }) {
  const changeLabel = formatPercentChange(metric?.changePct)

  return (
    <MobileSurface className="px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ebfff4] text-[#1f8a4c]">
            <Clock3 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.72rem] font-semibold uppercase text-[#667085]">Average Registration Time</p>
            <p className="mt-2 text-[2rem] font-semibold leading-none text-[#0f172a]">
              {metric?.days === null || metric?.days === undefined ? '—' : `${formatMetricValue(metric.days)} days`}
            </p>
          </div>
        </div>
        {changeLabel ? <span className="rounded-full bg-[#ebfff4] px-3 py-1 text-[0.78rem] font-semibold text-[#1f8a4c]">{changeLabel}</span> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[16px] bg-[#f8fafc] px-3 py-3">
          <p className="text-[0.72rem] font-semibold uppercase text-[#667085]">Previous</p>
          <p className="mt-1 text-[1.1rem] font-semibold text-[#0f172a]">{metric?.previousDays ? `${formatMetricValue(metric.previousDays)} days` : '—'}</p>
        </div>
        <div className="rounded-[16px] bg-[#f8fafc] px-3 py-3">
          <p className="text-[0.72rem] font-semibold uppercase text-[#667085]">Benchmark</p>
          <p className="mt-1 text-[1.1rem] font-semibold text-[#0f172a]">{metric?.benchmarkDays ? `${formatMetricValue(metric.benchmarkDays)} days` : '—'}</p>
        </div>
      </div>
      {metric?.helper ? <p className="mt-3 text-[0.84rem] text-[#667085]">{metric.helper}</p> : null}
    </MobileSurface>
  )
}

export function MissionControlTrendSection({ trends, activeRange = '30d', onRangeChange }) {
  const ranges = [
    { key: '30d', label: '30 Days' },
    { key: '6m', label: '6 Months' },
    { key: '12m', label: '12 Months' },
  ]
  const items = trends?.ranges?.[activeRange] || []

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 rounded-[18px] border border-[#e7edf5] bg-white p-1">
        {ranges.map((range) => (
          <button
            key={range.key}
            type="button"
            className={cn(
              'rounded-[14px] px-2 py-2 text-[0.78rem] font-semibold transition',
              activeRange === range.key ? 'bg-[#0f172a] text-white' : 'text-[#667085]',
            )}
            onClick={() => onRangeChange?.(range.key)}
          >
            {range.label}
          </button>
        ))}
      </div>

      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => {
            const values = (item?.data || []).map((point) => point.value)
            const latest = values[values.length - 1]
            const toneStyles = getToneStyles(item?.tone)

            return (
              <MobileSurface key={item.key} className="px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', toneStyles.soft)}>
                      <Activity className={cn('h-4 w-4', toneStyles.badge.split(' ')[1])} />
                    </span>
                    <p className="text-[0.95rem] font-semibold text-[#0f172a]">{item.label}</p>
                  </div>
                  <p className="text-[1.15rem] font-semibold text-[#0f172a]">{formatDashboardValue(latest, item?.valueType)}</p>
                </div>
                <div className="mt-3 overflow-hidden rounded-[16px] bg-[#fbfcff]">
                  <Sparkline values={values} tone={item?.tone} className="h-[72px]" />
                </div>
              </MobileSurface>
            )
          })}
        </div>
      ) : (
        <MobileSurface className="px-4 py-4 text-sm text-[#667085]">No trend data available for this period.</MobileSurface>
      )}
    </div>
  )
}

export function MissionControlHeroCarousel({ snapshot }) {
  const healthTone = snapshot?.platformHealth?.criticalAttentionItems > 0 ? 'orange' : 'green'
  const healthStyles = getToneStyles(healthTone)
  const revenueStyles = getToneStyles('purple')

  return (
    <MissionControlCarousel className="space-y-3" ariaLabel="Mission Control mobile hero cards">
      <MobileSurface className="min-h-[310px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn('inline-flex h-12 w-12 items-center justify-center rounded-full', healthStyles.soft)}>
              <HeartPulse className="h-5 w-5 text-[#1f8a4c]" />
            </span>
            <div>
              <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#1f8a4c]">Platform Health</p>
              <p className="mt-1 text-sm text-[#667085]">Founder signal</p>
            </div>
          </div>
          <span className={cn('inline-flex rounded-full px-3 py-1 text-[0.74rem] font-semibold', healthStyles.pill)}>
            {snapshot?.platformHealth?.status || 'Live'}
          </span>
        </div>

        <div className="mt-5 flex items-end gap-2">
          <p className="text-[3.05rem] font-semibold leading-none tracking-[-0.07em] text-[#0f172a]">{snapshot?.platformHealth?.score ?? '—'}</p>
          <p className="mb-2 text-[1.65rem] font-medium tracking-[-0.04em] text-[#667085]">/100</p>
        </div>

        <div className="mt-4 overflow-hidden rounded-[18px] bg-[linear-gradient(180deg,#fbfefd_0%,#ffffff_100%)]">
          <Sparkline values={snapshot?.platformHealth?.sparkline || []} tone={healthTone} />
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-[#edf2f7] rounded-[18px] border border-[#edf2f7] bg-[#fcfdff]">
          <div className="px-3 py-3">
            <p className="text-[1.55rem] font-semibold tracking-[-0.04em] text-[#0f172a]">{formatMetricValue(snapshot?.platformHealth?.activeTransactions)}</p>
            <p className="mt-1 text-[0.8rem] leading-4 text-[#667085]">Active Transactions</p>
            <p className="mt-2 text-[0.78rem] font-semibold text-[#2563eb]">{formatChangeLabel(snapshot?.platformHealth?.activeTransactionsChangePct30d, '')}</p>
          </div>
          <div className="px-3 py-3">
            <p className="text-[1.55rem] font-semibold tracking-[-0.04em] text-[#0f172a]">{formatMetricValue(snapshot?.platformHealth?.registrations30d)}</p>
            <p className="mt-1 text-[0.8rem] leading-4 text-[#667085]">Registrations (30d)</p>
            <p className="mt-2 text-[0.78rem] font-semibold text-[#2563eb]">{formatChangeLabel(snapshot?.platformHealth?.registrations30dChangePct, '')}</p>
          </div>
          <div className="px-3 py-3">
            <p className="text-[1.55rem] font-semibold tracking-[-0.04em] text-[#0f172a]">{formatMetricValue(snapshot?.platformHealth?.attentionItems)}</p>
            <p className="mt-1 text-[0.8rem] leading-4 text-[#667085]">Attention Items</p>
            <p className="mt-2 text-[0.78rem] font-semibold text-[#ef4444]">
              {snapshot?.platformHealth?.criticalAttentionItems ? `${snapshot.platformHealth.criticalAttentionItems} Critical` : ''}
            </p>
          </div>
        </div>
      </MobileSurface>

      <MobileSurface className="min-h-[310px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn('inline-flex h-12 w-12 items-center justify-center rounded-full', revenueStyles.soft)}>
              <LineChart className="h-5 w-5 text-[#8a42e8]" />
            </span>
            <div>
              <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#8a42e8]">Revenue (MTD)</p>
              <p className="mt-1 text-sm text-[#667085]">Current month</p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[2.5rem] font-semibold leading-none tracking-[-0.06em] text-[#0f172a]">{formatCurrencyCompact(snapshot?.revenueMtd?.amount)}</p>

        <div className="mt-4 overflow-hidden rounded-[18px] bg-[linear-gradient(180deg,#fcf9ff_0%,#ffffff_100%)]">
          <Sparkline values={snapshot?.revenueMtd?.sparkline || []} tone="purple" />
        </div>

        <div className="mt-4 rounded-[18px] border border-[#edf2f7] bg-[#fcfdff] px-4 py-4">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#8a42e8]">Forecast</p>
          <p className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#0f172a]">{formatCurrencyCompact(snapshot?.revenueMtd?.forecast)}</p>
          <p className="mt-2 text-[0.88rem] font-semibold text-[#8a42e8]">{formatChangeLabel(snapshot?.revenueMtd?.changePct30d, '')}</p>
        </div>
      </MobileSurface>
    </MissionControlCarousel>
  )
}

export function MissionControlMetricTile({ item }) {
  const toneStyles = getToneStyles(item?.tone)

  return (
    <MobileSurface className="min-w-[144px] px-4 py-4">
      <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', toneStyles.soft)}>
        {renderMetricIcon(item?.icon, cn('h-4 w-4', toneStyles.badge.split(' ')[1]))}
      </span>
      <p className="mt-4 text-[2rem] font-semibold leading-none tracking-[-0.06em] text-[#0f172a]">{formatMetricValue(item?.value)}</p>
      <p className="mt-2 text-sm text-[#667085]">{item?.label || 'Metric'}</p>
      <p className="mt-2 text-[0.86rem] font-semibold text-[#2563eb]">{formatChangeLabel(item?.changePct30d, '')}</p>
    </MobileSurface>
  )
}

export function MissionControlActivityFeed({ items = [] }) {
  if (!items.length) {
    return <MobileSurface className="px-4 py-4 text-sm text-[#667085]">No recent activity.</MobileSurface>
  }

  return (
    <MobileSurface className="overflow-hidden">
      <div className="divide-y divide-[#edf2f7]">
        {items.map((item) => {
          const toneStyles = getToneStyles(item?.tone)

          return (
            <div key={item.id} className="flex items-start gap-3 px-4 py-4">
              <span className={cn('mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full', toneStyles.soft)}>
                {renderActivityIcon(item?.type, item?.tone, cn('h-4 w-4', toneStyles.badge.split(' ')[1]))}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-[#0f172a]">{item.title}</p>
                    <p className="mt-1 truncate text-[0.9rem] text-[#475467]">{item.primaryText || item.description}</p>
                    {item.secondaryText || item.organisationName ? <p className="mt-1 truncate text-[0.84rem] text-[#667085]">{item.secondaryText || item.organisationName}</p> : null}
                  </div>
                  <p className="shrink-0 pt-0.5 text-[0.78rem] font-medium text-[#667085]">{item.timestampLabel}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </MobileSurface>
  )
}

export function MissionControlBottomNav({ alertsCount = 0 }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', to: '/command-center', icon: Home, match: ['/command-center'] },
    { key: 'ecosystem', label: 'Ecosystem', to: '/reports', icon: Building2, match: ['/reports'] },
    { key: 'alerts', label: 'Alerts', to: '/command-center#attention-required', icon: Bell, match: ['/command-center#attention-required'] },
    { key: 'search', label: 'Search', to: '/search', icon: Search, match: ['/search'] },
    { key: 'more', label: 'More', to: '/settings', icon: MoreHorizontal, match: ['/settings'] },
  ]
  const badgeLabel = alertsCount > 99 ? '99+' : String(Math.max(alertsCount, 0))

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5ebf3] bg-[rgba(255,255,255,0.96)] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-18px_36px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-[480px] items-end justify-between gap-2">
        {items.map((item) => {
          const Icon = item.icon
          const showBadge = item.key === 'alerts' && alertsCount > 0

          return (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.key === 'dashboard'}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2 text-[0.74rem] font-medium transition',
                  isActive ? 'text-[#2563eb]' : 'text-[#667085]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative inline-flex h-8 w-8 items-center justify-center">
                    <Icon className={cn('h-[1.15rem] w-[1.15rem]', isActive ? 'text-[#2563eb]' : 'text-[#667085]')} />
                    {showBadge ? (
                      <span className="absolute -right-2 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-semibold text-white">
                        {badgeLabel}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

export function MissionControlCompactBanner({ title = 'Mission Control could not refresh right now', message = '' }) {
  return (
    <MobileSurface className="border-[#fde2d2] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7ed_100%)] px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#d97706] shadow-[0_8px_20px_rgba(180,114,31,0.08)]">
          <CircleAlert className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[0.92rem] font-semibold text-[#0f172a]">{title}</p>
          <p className="mt-1 text-sm leading-6 text-[#7c5c32]">{message || 'The live HQ snapshot is unavailable in this environment.'}</p>
        </div>
      </div>
    </MobileSurface>
  )
}

export function MissionControlSectionHeading({ title, actionLabel = '', actionTo = '', className = '' }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 className="text-[1.35rem] font-semibold tracking-[-0.04em] text-[#0f172a]">{title}</h2>
      {actionLabel && actionTo ? (
        <Link to={actionTo} className="inline-flex items-center gap-1 text-sm font-medium text-[#2563eb]">
          <span>{actionLabel}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  )
}
