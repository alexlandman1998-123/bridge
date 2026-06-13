import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  Landmark,
  LineChart,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react'

const cardClass = 'rounded-[20px] border border-[#dfe7f0] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.055)]'
const cardPadding = 'p-4 sm:p-5'
const scrollClass = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

const toneStyles = {
  blue: {
    bubble: 'bg-[#edf5ff] text-[#1769d1]',
    text: 'text-[#1769d1]',
    stroke: '#5d8df2',
    soft: 'bg-[#edf5ff] text-[#1769d1]',
    dot: '#1769d1',
  },
  green: {
    bubble: 'bg-[#ecfdf3] text-[#16894f]',
    text: 'text-[#16894f]',
    stroke: '#50c48f',
    soft: 'bg-[#ecfdf3] text-[#16894f]',
    dot: '#18a765',
  },
  orange: {
    bubble: 'bg-[#fff4e5] text-[#df7b14]',
    text: 'text-[#df7b14]',
    stroke: '#f59e48',
    soft: 'bg-[#fff7ea] text-[#9a5b13]',
    dot: '#f59e0b',
  },
  purple: {
    bubble: 'bg-[#f3efff] text-[#7657d8]',
    text: 'text-[#7657d8]',
    stroke: '#9b6cff',
    soft: 'bg-[#f3efff] text-[#7657d8]',
    dot: '#8b5cf6',
  },
  red: {
    bubble: 'bg-[#fff2f0] text-[#c83b36]',
    text: 'text-[#c83b36]',
    stroke: '#ef6f6a',
    soft: 'bg-[#fff2f0] text-[#b42318]',
    dot: '#ef4444',
  },
  slate: {
    bubble: 'bg-[#f1f5f9] text-[#475569]',
    text: 'text-[#475569]',
    stroke: '#94a3b8',
    soft: 'bg-[#f8fafc] text-[#52657a]',
    dot: '#94a3b8',
  },
}

const defaultStageIcons = {
  lead: Users,
  leads: Users,
  mandate: FileText,
  mandates: FileText,
  viewing: UserRound,
  viewings: UserRound,
  offer: BriefcaseBusiness,
  offers: BriefcaseBusiness,
  otp: ShieldCheck,
  acceptedOtps: ShieldCheck,
  finance: Landmark,
  transfer: WalletCards,
  registration: FileCheck2,
  registrations: FileCheck2,
  complete: CheckCircle2,
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, toNumber(value)))
}

function getTone(tone) {
  return toneStyles[tone] || toneStyles.blue
}

function buildInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (parts.map((part) => part[0]).join('') || 'BR').slice(0, 2).toUpperCase()
}

function TrendPill({ value, label = 'vs last month', inverse = false }) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return <span className="text-[0.72rem] font-medium text-[#8a9aac]">No trend yet</span>
  }
  const numeric = Number(value)
  const positive = numeric >= 0
  const good = inverse ? !positive : positive
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 text-[0.72rem] font-semibold ${good ? 'text-[#16894f]' : 'text-[#c83b36]'}`}>
      <Icon size={12} />
      <span>{Math.abs(Math.round(numeric))}%</span>
      <span className="truncate font-medium text-[#7b8ca2]">{label}</span>
    </span>
  )
}

function Sparkline({ points = [], stroke = '#5d8df2' }) {
  const values = (Array.isArray(points) ? points : []).map(toNumber).filter((value) => Number.isFinite(value))
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min)
  const coordinates = values.map((value, index) => {
    const x = values.length > 1 ? (index / (values.length - 1)) * 100 : 0
    const y = 80 - ((value - min) / span) * 54
    return `${x},${y}`
  })
  const polyline = coordinates.join(' ')
  const path = `M0 88 L${coordinates.join(' L')} L100 88 Z`

  return (
    <svg viewBox="0 0 100 92" className="h-[44px] w-full overflow-visible" role="img" aria-label="Trend sparkline">
      <path d={path} fill={stroke} opacity="0.08" />
      <polyline fill="none" points={polyline} stroke={stroke} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EmptyState({ title, action }) {
  return (
    <div className="flex min-h-[156px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-[#344054]">{title}</p>
      {action ? <p className="mt-1 text-xs leading-5 text-[#667085]">{action}</p> : null}
    </div>
  )
}

export function MobileDashboardShell({ children, className = '' }) {
  return (
    <section className={`premium-dashboard-shell space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${className}`}>
      {children}
    </section>
  )
}

export function DashboardKpiCard({
  icon = LineChart,
  label,
  value,
  trend = null,
  trendLabel = 'vs last month',
  inverseTrend = false,
  sparkline = [],
  tone = 'blue',
}) {
  const style = getTone(tone)
  const KpiIcon = icon
  return (
    <article className={`${cardClass} flex min-h-[166px] w-[76vw] max-w-[320px] shrink-0 snap-start flex-col justify-between p-4 sm:w-auto sm:max-w-none sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${style.bubble}`}>
          <KpiIcon size={18} />
        </span>
        <TrendPill value={trend} label={trendLabel} inverse={inverseTrend} />
      </div>
      <div className="mt-3 min-w-0">
        <p className="truncate text-[0.82rem] font-semibold text-[#52657a]">{label}</p>
        <p className="mt-2 text-[2rem] font-semibold leading-none tracking-normal text-[#101828] tabular-nums">{value}</p>
      </div>
      <div className="mt-3 min-h-[44px]">
        <Sparkline points={sparkline} stroke={style.stroke} />
      </div>
    </article>
  )
}

export function DashboardKpiStrip({ items = [] }) {
  return (
    <section className={`-mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4 ${scrollClass}`}>
      {items.map(({ key, ...item }) => (
        <DashboardKpiCard key={key || item.label} {...item} />
      ))}
    </section>
  )
}

export function TransactionHealthCard({
  total = 0,
  movingNormally = 0,
  attentionRequired = 0,
  criticalDelays = 0,
  averageRegistrationTime = null,
  averageRegistrationTrend = null,
  onViewAll,
}) {
  const safeTotal = Math.max(0, toNumber(total))
  const normal = Math.max(0, toNumber(movingNormally))
  const attention = Math.max(0, toNumber(attentionRequired))
  const critical = Math.max(0, toNumber(criticalDelays))
  const denominator = Math.max(1, safeTotal || normal + attention + critical)
  const segments = [
    { key: 'normal', label: 'Moving Normally', count: normal, color: '#19b974', percentage: Math.round((normal / denominator) * 100) },
    { key: 'attention', label: 'Attention Required', count: attention, color: '#f59e0b', percentage: Math.round((attention / denominator) * 100) },
    { key: 'critical', label: 'Critical Delays', count: critical, color: '#ef4444', percentage: Math.round((critical / denominator) * 100) },
  ]
  let cursor = 0
  const gradientStops = segments.map((segment) => {
    const start = cursor
    const width = safeTotal ? (segment.count / denominator) * 100 : 0
    cursor += width
    return `${segment.color} ${start}% ${cursor}%`
  })
  const gradient = safeTotal ? `conic-gradient(${gradientStops.join(', ')}, #e8eef6 ${cursor}% 100%)` : 'conic-gradient(#e8eef6 0% 100%)'

  return (
    <section className={`${cardClass} ${cardPadding} flex min-h-[338px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">Transaction Health</h2>
          <p className="mt-1 text-sm text-[#667085]">Active transaction movement and delay risk.</p>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View all
          </button>
        ) : null}
      </div>

      <div className="mt-6 grid flex-1 gap-6 md:grid-cols-[190px_minmax(0,1fr)] md:items-center">
        <div className="mx-auto grid h-[172px] w-[172px] place-items-center rounded-full" style={{ background: gradient }}>
          <div className="grid h-[112px] w-[112px] place-items-center rounded-full bg-white text-center shadow-inner">
            <div>
              <p className="text-[1.8rem] font-semibold leading-none text-[#101828] tabular-nums">{safeTotal}</p>
              <p className="mt-1 text-xs font-medium text-[#667085]">Total</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {segments.map((segment) => (
            <div key={segment.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#203247]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  <span className="truncate">{segment.label}</span>
                </p>
                <p className="mt-1 text-xs text-[#667085]">{segment.count} transactions</p>
              </div>
              <span className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">{segment.percentage}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#667085]">
          <Clock3 size={15} />
          Average Registration Time
        </span>
        <span className="text-[1rem] font-semibold text-[#101828]">
          {averageRegistrationTime === null || averageRegistrationTime === undefined ? 'No dated history' : `${Math.round(toNumber(averageRegistrationTime))} days`}
        </span>
        <TrendPill value={averageRegistrationTrend} label="vs last month" inverse />
      </div>
    </section>
  )
}

export function PerformanceCard({ title = 'Agency Performance', metrics = [], onViewReport }) {
  return (
    <section className={`${cardClass} ${cardPadding} flex min-h-[338px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2>
          <p className="mt-1 text-sm text-[#667085]">Conversion and growth signals.</p>
        </div>
        {onViewReport ? (
          <button type="button" onClick={onViewReport} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View report
          </button>
        ) : null}
      </div>
      <div className="mt-6 grid flex-1 content-center gap-6">
        {metrics.length ? metrics.map((metric) => {
          const style = getTone(metric.tone || 'blue')
          const percent = clampPercent(metric.percentage ?? metric.value)
          return (
            <article key={metric.key || metric.label}>
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#203247]">{metric.label}</p>
                  <p className="mt-2 text-[1.65rem] font-semibold leading-none text-[#101828] tabular-nums">{metric.value}</p>
                </div>
                <TrendPill value={metric.trend} label={metric.trendLabel || 'vs last month'} />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef6]">
                <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: style.stroke }} />
              </div>
            </article>
          )
        }) : <EmptyState title="No performance data yet" action="Conversion metrics will appear once leads and transactions are linked." />}
      </div>
    </section>
  )
}

export function TransactionFlow({ stages = [], onViewPipeline }) {
  return (
    <section className={`${cardClass} ${cardPadding}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">Transaction Flow</h2>
          <p className="mt-1 text-sm text-[#667085]">Lead to registration progression.</p>
        </div>
        {onViewPipeline ? (
          <button type="button" onClick={onViewPipeline} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View full pipeline
          </button>
        ) : null}
      </div>
      <div className={`mt-6 -mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-2 lg:mx-0 lg:grid lg:grid-cols-8 lg:overflow-visible lg:px-0 ${scrollClass}`}>
        {stages.map((stage, index) => {
          const style = getTone(stage.tone || ['blue', 'blue', 'slate', 'orange', 'green', 'slate', 'purple', 'green'][index] || 'blue')
          const Icon = stage.icon || defaultStageIcons[stage.key] || Target
          return (
            <article key={stage.key || stage.label} className="relative flex min-h-[152px] w-[136px] shrink-0 snap-start flex-col items-center justify-between rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-4 text-center lg:w-auto">
              {index < stages.length - 1 ? (
                <span className="absolute right-[-18px] top-[35px] z-10 hidden h-px w-8 bg-[#c8d3df] lg:block" />
              ) : null}
              <span className={`grid h-11 w-11 place-items-center rounded-full ${style.bubble}`}>
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.78rem] font-semibold text-[#203247]">{stage.label}</p>
                <p className="mt-2 text-[1.35rem] font-semibold leading-none text-[#101828] tabular-nums">{stage.count}</p>
                <p className="mt-2 text-[0.7rem] font-semibold text-[#667085]">{stage.percentage}</p>
              </div>
              <span className="h-1 w-full rounded-full bg-[#e1e9f3]">
                <span className="block h-full rounded-full" style={{ width: `${clampPercent(stage.rawPercentage ?? stage.percentage)}%`, backgroundColor: style.stroke }} />
              </span>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function AttentionRequiredCard({ rows = [], summary = null, onViewAll, title = 'Attention Required' }) {
  return (
    <section className={`${cardClass} ${cardPadding} flex min-h-[340px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2>
          <p className="mt-1 text-sm text-[#667085]">Risk buckets that need movement.</p>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View all
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex-1 divide-y divide-[#edf2f7] overflow-hidden rounded-[16px] border border-[#edf2f7] bg-[#fbfdff]">
        {rows.length ? rows.map((row) => {
          const style = getTone(row.tone || 'blue')
          const Icon = row.icon || AlertTriangle
          return (
            <button
              key={row.key || row.label}
              type="button"
              onClick={row.onClick}
              className="grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3.5 text-left transition hover:bg-white"
            >
              <span className={`grid h-9 w-9 place-items-center rounded-full ${style.soft}`}>
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#203247]">{row.label}</span>
                <span className="mt-0.5 block truncate text-xs text-[#667085]">{row.reason}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[1.1rem] font-semibold text-[#101828] tabular-nums">{row.count}</span>
                <ChevronRight size={16} className="text-[#8a9aac]" />
              </span>
            </button>
          )
        }) : <EmptyState title="No attention items" action="All scoped transactions are currently moving." />}
      </div>
      {summary ? (
        <div className="mt-4 flex items-start gap-3 rounded-[14px] bg-[#fff2f0] px-3 py-3 text-[#b42318]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="text-sm font-semibold leading-5">{summary}</p>
        </div>
      ) : null}
    </section>
  )
}

export function TopPerformersCard({ performers = [], onViewLeaderboard, title = 'Top Performers' }) {
  return (
    <section className={`${cardClass} ${cardPadding} flex min-h-[340px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2>
          <p className="mt-1 text-sm text-[#667085]">Leaderboard by production and conversion.</p>
        </div>
        {onViewLeaderboard ? (
          <button type="button" onClick={onViewLeaderboard} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View leaderboard
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex-1 divide-y divide-[#edf2f7]">
        {performers.length ? performers.slice(0, 3).map((performer, index) => (
          <article key={performer.id || performer.name || index} className="grid grid-cols-[28px_40px_minmax(0,1fr)] items-center gap-3 py-4">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[0.72rem] font-semibold ${index === 0 ? 'bg-[#f8b327] text-white' : index === 1 ? 'bg-[#cbd5e1] text-white' : 'bg-[#d78b54] text-white'}`}>
              {performer.rank || index + 1}
            </span>
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[#edf5ff] text-xs font-semibold text-[#1769d1]">
              {performer.avatarUrl ? <img src={performer.avatarUrl} alt="" className="h-full w-full object-cover" /> : buildInitials(performer.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#203247]">{performer.name}</span>
              <span className="mt-2 grid grid-cols-3 gap-2 text-[0.72rem] text-[#667085]">
                <span><strong className="block text-sm text-[#101828]">{performer.commission}</strong>Commission</span>
                <span><strong className="block text-sm text-[#101828]">{performer.deals}</strong>{performer.dealsLabel || 'Deals'}</span>
                <span><strong className="block text-sm text-[#101828]">{performer.conversion}</strong>Conversion</span>
              </span>
              <span className="mt-2 inline-flex">
                <TrendPill value={performer.trend} label={performer.trendLabel || 'vs last month'} />
              </span>
            </span>
          </article>
        )) : <EmptyState title="No performer data yet" action="Performance will populate once scoped deals or registrations exist." />}
      </div>
    </section>
  )
}

export function CommissionForecastCard({ rows = [], chartPoints = [], onViewForecast, title = 'Commission Forecast' }) {
  const values = chartPoints.length ? chartPoints : rows.map((row) => row.rawValue)
  return (
    <section className={`${cardClass} ${cardPadding} flex min-h-[340px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2>
          <p className="mt-1 text-sm text-[#667085]">Expected commission by registration timing.</p>
        </div>
        {onViewForecast ? (
          <button type="button" onClick={onViewForecast} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View full forecast
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid flex-1 content-start gap-3">
        {rows.length ? rows.map((row) => (
          <article key={row.key || row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#edf2f7] pb-3 last:border-b-0">
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[#52657a]">{row.label}</span>
              <span className="mt-1 block text-[1.35rem] font-semibold leading-none text-[#101828] tabular-nums">{row.value}</span>
            </span>
            <TrendPill value={row.trend} label={row.trendLabel || 'forecast'} />
          </article>
        )) : <EmptyState title="No forecast data yet" action="Dated expected commissions will appear here." />}
      </div>
      <div className="mt-4 min-h-[86px] rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
        <Sparkline points={values} stroke="#2f80ed" />
      </div>
    </section>
  )
}

export function UpcomingRegistrationsCard({
  count = 0,
  expectedCommission = '',
  dailyBreakdown = [],
  onViewAll,
}) {
  const hasBreakdown = dailyBreakdown.some((day) => toNumber(day.count) > 0 || toNumber(day.commission) > 0)
  return (
    <section className={`${cardClass} ${cardPadding} min-h-[300px]`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">Upcoming Registrations</h2>
          <p className="mt-1 text-sm text-[#667085]">Near-term expected registration dates.</p>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View all
          </button>
        ) : null}
      </div>
      {hasBreakdown || toNumber(count) > 0 ? (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_1px_minmax(0,1fr)] sm:items-center">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#edf5ff] text-[#1769d1]">
                <CalendarDays size={20} />
              </span>
              <span>
                <span className="block text-xs font-semibold text-[#667085]">Next 7 Days</span>
                <span className="mt-1 block text-[1.8rem] font-semibold leading-none text-[#101828] tabular-nums">{count}</span>
                <span className="mt-1 block text-xs text-[#667085]">Expected registrations</span>
              </span>
            </div>
            <span className="hidden h-16 w-px bg-[#edf2f7] sm:block" />
            <div>
              <p className="text-xs font-semibold text-[#667085]">Expected Commission</p>
              <p className="mt-2 text-[1.5rem] font-semibold leading-none text-[#101828]">{expectedCommission}</p>
            </div>
          </div>
          <div className={`mt-6 flex gap-3 overflow-x-auto pb-1 ${scrollClass}`}>
            {dailyBreakdown.map((day) => (
              <article key={day.key || day.label} className="min-w-[72px] flex-1 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#f1f5f9] text-[0.72rem] font-semibold text-[#52657a]">{day.initials || day.shortLabel}</span>
                <p className="mt-2 text-[0.72rem] font-medium text-[#667085]">{day.label}</p>
                <p className="mt-1 text-[1rem] font-semibold text-[#101828] tabular-nums">{day.count}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5">
          <EmptyState title="No registrations dated in the next 7 days" action="Expected registrations will appear once transactions have target dates." />
        </div>
      )}
    </section>
  )
}

export function RecentActivityCard({ rows = [], onViewAll, title = 'Recent Activity' }) {
  const iconByType = {
    document_uploaded: FileText,
    registration_confirmed: CheckCircle2,
    otp_signed: ShieldCheck,
    new_mandate: FileText,
    offer_accepted: BriefcaseBusiness,
    bond_approved: Landmark,
    transfer_lodged: WalletCards,
    transaction: BriefcaseBusiness,
    lead: Users,
    appointment: CalendarDays,
    listing: BriefcaseBusiness,
  }
  return (
    <section className={`${cardClass} ${cardPadding} flex min-h-[300px] flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2>
          <p className="mt-1 text-sm text-[#667085]">Latest operational movement.</p>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-semibold text-[#123c69]">
            View all
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex-1 divide-y divide-[#edf2f7]">
        {rows.length ? rows.map((item) => {
          const Icon = iconByType[item.type] || CheckCircle2
          const style = getTone(item.tone || 'green')
          return (
            <article key={item.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className={`grid h-9 w-9 place-items-center rounded-full ${style.soft}`}>
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#203247]">{item.title}</span>
                {item.subtitle ? <span className="mt-0.5 block truncate text-xs text-[#667085]">{item.subtitle}</span> : null}
              </span>
              <span className="shrink-0 text-xs font-medium text-[#667085]">{item.time}</span>
            </article>
          )
        }) : <EmptyState title="No recent activity yet" action="Workflow, document, and transaction activity will appear here." />}
      </div>
    </section>
  )
}

export function RecentTransactionsCard({ rows = [], onOpenTransaction, title = 'Recent Transactions' }) {
  return (
    <section className={`${cardClass} ${cardPadding}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.02rem] font-semibold text-[#101828]">{title}</h2>
          <p className="mt-1 text-sm text-[#667085]">Scoped transactions with stage, value, and risk.</p>
        </div>
      </div>
      <div className={`mt-4 -mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 ${scrollClass}`}>
        {rows.length ? rows.slice(0, 6).map((row) => {
          const riskTone = row.risk === 'critical' ? 'red' : row.risk === 'attention' ? 'orange' : 'green'
          const style = getTone(riskTone)
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpenTransaction?.(row)}
              className="flex min-h-[224px] w-[82vw] max-w-[360px] shrink-0 snap-start flex-col rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] p-4 text-left transition hover:border-[#c8d3df] hover:bg-white lg:w-auto lg:max-w-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#101828]">{row.title}</p>
                  <p className="mt-1 truncate text-xs text-[#667085]">{row.subtitle}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${style.soft}`}>{row.riskLabel}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <span>
                  <span className="block text-[0.68rem] font-semibold uppercase text-[#7b8ca2]">Stage</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-[#203247]">{row.stage}</span>
                </span>
                <span>
                  <span className="block text-[0.68rem] font-semibold uppercase text-[#7b8ca2]">Value</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-[#203247]">{row.value}</span>
                </span>
                <span>
                  <span className="block text-[0.68rem] font-semibold uppercase text-[#7b8ca2]">Commission</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-[#203247]">{row.commission}</span>
                </span>
                <span>
                  <span className="block text-[0.68rem] font-semibold uppercase text-[#7b8ca2]">Days in Stage</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-[#203247]">{row.daysInStage}</span>
                </span>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-3">
                <span className="line-clamp-1 text-xs font-medium text-[#667085]">{row.nextAction}</span>
                <ArrowRight size={15} className="shrink-0 text-[#52657a]" />
              </div>
            </button>
          )
        }) : (
          <div className="min-w-full">
            <EmptyState title="No recent transactions yet" action="Transactions will appear once assigned or opened." />
          </div>
        )}
      </div>
    </section>
  )
}
