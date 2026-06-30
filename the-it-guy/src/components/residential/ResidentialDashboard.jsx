import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  Landmark,
  LineChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import AppointmentDashboardSection from '../appointments/dashboard/AppointmentDashboardSection'
import ActivePipelineCarousel from '../pipeline/ActivePipelineCarousel'
import { formatCurrencyCompactZAR } from '../../services/residentialDashboardService'

const shellClass = 'space-y-5 lg:space-y-6'
const cardClass = 'rounded-[20px] border border-[#dfe7f0] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)]'
const sectionClass = 'rounded-[20px] border border-[#dfe7f0] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)]'
const countFormat = new Intl.NumberFormat('en-ZA')

const toneStyles = {
  blue: { bubble: 'bg-[#edf5ff] text-[#1769d1]', stroke: '#4f86e8', soft: 'bg-[#edf5ff] text-[#1769d1]' },
  green: { bubble: 'bg-[#ecfdf3] text-[#16894f]', stroke: '#1aa86b', soft: 'bg-[#ecfdf3] text-[#16894f]' },
  orange: { bubble: 'bg-[#fff4e5] text-[#df7b14]', stroke: '#f59e0b', soft: 'bg-[#fff7ea] text-[#9a5b13]' },
  purple: { bubble: 'bg-[#f3efff] text-[#7657d8]', stroke: '#8b5cf6', soft: 'bg-[#f3efff] text-[#7657d8]' },
  red: { bubble: 'bg-[#fff2f0] text-[#c83b36]', stroke: '#ef4444', soft: 'bg-[#fff2f0] text-[#b42318]' },
  slate: { bubble: 'bg-[#f1f5f9] text-[#475569]', stroke: '#94a3b8', soft: 'bg-[#f8fafc] text-[#52657a]' },
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function formatCount(value) {
  return countFormat.format(Math.max(0, Math.round(toNumber(value))))
}

function buildSparklinePath(points = []) {
  const values = (Array.isArray(points) ? points : []).map(toNumber).filter((value) => Number.isFinite(value))
  if (!values.length) return { line: '', area: '', dots: [] }
  const chartValues = values.length > 1 ? values : [values[0], values[0]]
  const max = Math.max(1, ...values)
  const min = Math.min(...values)
  const spread = max - min
  const flat = spread === 0
  const dots = chartValues.map((value, index) => {
    const x = 4 + (chartValues.length > 1 ? (index / (chartValues.length - 1)) * 92 : 0)
    const y = flat ? 48 : 68 - ((value - min) / spread) * 46
    return { x, y, value }
  })
  const line = dots.map((dot, index) => `${index === 0 ? 'M' : 'L'} ${dot.x} ${dot.y}`).join(' ')
  const area = `${line} L 96 78 L 4 78 Z`
  return { line, area, dots }
}

function TrendPill({ value, label = 'vs previous period', inverse = false }) {
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

function EmptyState({ title, copy }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-[#344054]">{title}</p>
      {copy ? <p className="mt-1 max-w-[28rem] text-xs leading-5 text-[#667085]">{copy}</p> : null}
    </div>
  )
}

export function ResidentialDashboardShell({ children, className = '' }) {
  return <section className={`${shellClass} min-w-0 ${className}`}>{children}</section>
}

export function ResidentialDashboardModeToggle({ value = 'sales', onChange }) {
  const options = [
    { key: 'sales', label: 'Residential Sales' },
  ]

  if (options.length <= 1) return null

  return (
    <div className="inline-flex items-center rounded-full border border-[#d6dfeb] bg-[#f7f9fc] p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      {options.map((option) => {
        const active = value === option.key
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange?.(option.key)}
            className={`rounded-full px-4 py-2 text-[0.78rem] font-semibold transition ${
              active ? 'bg-[#163247] text-white shadow-[0_8px_16px_rgba(22,50,71,0.18)]' : 'bg-white text-[#5b7087] hover:bg-[#fbfdff]'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function ResidentialKpiCard({ icon, label, value, trend, sparkline = [], tone = 'blue', emptyCopy = '' }) {
  const IconComponent = icon || LineChart
  const style = toneStyles[tone] || toneStyles.blue
  const { line, area, dots } = buildSparklinePath(sparkline)
  const gradientId = `spark-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
  return (
    <article className={`${cardClass} flex min-h-[172px] flex-col overflow-hidden p-4 sm:p-5`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[16px] ${style.bubble}`}>
          <IconComponent size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.86rem] font-semibold text-[#344054]">{label}</p>
          <p className="mt-2 text-[1.9rem] font-semibold leading-none tracking-[-0.035em] text-[#101828] tabular-nums">{value}</p>
          <div className="mt-2"><TrendPill value={trend} label="vs previous 30 days" /></div>
        </div>
      </div>
      <div className="mt-4 min-w-0">
        {emptyCopy ? <p className="mt-1 text-[0.74rem] text-[#7b8ca2]">{emptyCopy}</p> : null}
        {line ? (
          <svg viewBox="0 0 100 84" preserveAspectRatio="none" className="h-[64px] w-full overflow-visible" role="img" aria-label={`${label} trend sparkline`}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={style.stroke} stopOpacity="0.18" />
                <stop offset="100%" stopColor={style.stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="4" x2="96" y1="78" y2="78" stroke="#e8eef5" strokeWidth="1" />
            <path d={area} fill={`url(#${gradientId})`} opacity="0.95" />
            <path d={line} fill="none" stroke={style.stroke} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {dots.length ? (
              <circle cx={dots[dots.length - 1].x} cy={dots[dots.length - 1].y} r="2.1" fill="#ffffff" stroke={style.stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            ) : null}
          </svg>
        ) : (
          <div className="flex h-[64px] items-center justify-center rounded-[16px] bg-[#f8fafc] text-[0.72rem] text-[#8a9aac]">No trend yet</div>
        )}
      </div>
    </article>
  )
}

export function ResidentialTransactionHealth({ data, scope = 'principal' }) {
  if (data?.emptyState) {
    return (
      <section className={sectionClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[1rem] font-semibold text-[#101828]">{data.title || 'Transaction Health'}</h3>
            <p className="mt-1 text-sm text-[#667085]">Active transaction movement and delay risk.</p>
          </div>
        </div>
        <div className="mt-5">
          <EmptyState title="No leasing health data yet" copy={data.emptyCopy} />
        </div>
      </section>
    )
  }

  const segments = Array.isArray(data?.segments) ? data.segments : []
  const denominator = Math.max(1, segments.reduce((sum, item) => sum + toNumber(item.count), 0) || toNumber(data?.total))
  const gradientState = segments
    .filter((segment) => toNumber(segment.count) > 0)
    .reduce((state, segment) => {
      const width = (toNumber(segment.count) / denominator) * 100
      const start = state.cursor
      const nextCursor = start + width
      const tone = toneStyles[segment.tone] || toneStyles.blue
      state.stops.push(`${tone.stroke} ${start}% ${nextCursor}%`)
      state.cursor = nextCursor
      return state
    }, { cursor: 0, stops: [] })
  const gradientStops = gradientState.stops
  const cursor = gradientState.cursor
  const gradient = gradientStops.length ? `conic-gradient(${gradientStops.join(', ')}, #e8eef6 ${cursor}% 100%)` : 'conic-gradient(#e8eef6 0% 100%)'

  const attentionCount = toNumber(data?.attentionRequired) + toNumber(data?.criticalDelays)

  return (
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || 'Transaction Health'}</h3>
          <p className="mt-1 text-sm text-[#667085]">Active transaction movement and delay risk.</p>
        </div>
        <span className="rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">
          {scope === 'agent' ? 'Personal scope' : 'Agency scope'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[142px_minmax(0,1fr)] md:items-start">
        <div className="mx-auto grid h-[136px] w-[136px] place-items-center rounded-full" style={{ background: gradient }}>
          <div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-white text-center shadow-inner">
            <div>
              <p className="text-[1.55rem] font-semibold leading-none text-[#101828] tabular-nums">{Math.max(0, Math.round(data?.total || 0))}</p>
              <p className="mt-1 text-xs font-medium text-[#667085]">Total</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-[16px] border border-[#e4edf6]">
          <div className="grid grid-cols-[minmax(0,1fr)_70px_78px] bg-[#f8fafc] px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
            <span>Stage</span>
            <span className="text-right">Deals</span>
            <span className="text-right">% Total</span>
          </div>
          {segments.length ? segments.map((segment) => {
            const tone = toneStyles[segment.tone] || toneStyles.blue
            return (
              <div key={segment.key} className="grid grid-cols-[minmax(0,1fr)_70px_78px] items-center border-t border-[#edf2f7] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#203247]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.stroke }} />
                    <span className="truncate">{segment.label}</span>
                  </p>
                </div>
                <span className="text-right text-sm font-semibold text-[#101828] tabular-nums">{Math.max(0, Math.round(segment.count || 0))}</span>
                <span className="text-right text-sm font-semibold text-[#52657a] tabular-nums">{Math.max(0, Math.round(segment.percentage || 0))}%</span>
              </div>
            )
          }) : (
            <div className="rounded-[16px] border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-5 text-sm text-[#667085]">
              No active transaction health data yet.
            </div>
          )}
        </div>
      </div>
      {attentionCount > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] border border-[#dbeafe] bg-[#f8fbff] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px] bg-[#edf5ff] text-[#1769d1]"><Clock3 size={15} /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#203247]">{formatCount(attentionCount)} deal{attentionCount === 1 ? '' : 's'} need attention</p>
              <p className="truncate text-xs text-[#667085]">Delayed or blocked items may require follow-up.</p>
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-[#1769d1]" />
        </div>
      ) : null}
    </section>
  )
}

export function ResidentialPerformanceChart({ data, scope = 'principal' }) {
  if (data?.emptyState) {
    return (
      <section className={sectionClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[1rem] font-semibold text-[#101828]">{data.title}</h3>
            <p className="mt-1 text-sm text-[#667085]">{data.subtitle}</p>
          </div>
        </div>
        <div className="mt-5">
          <EmptyState title="No leasing performance yet" copy={data.emptyCopy} />
        </div>
      </section>
    )
  }

  const series = Array.isArray(data?.series) ? data.series : []
  const { line, area, dots } = buildSparklinePath(series)
  const currentValue = Number.isFinite(Number(data?.currentValue)) ? Math.round(Number(data.currentValue)) : null

  return (
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || (scope === 'agent' ? 'My Performance' : 'Agency Performance')}</h3>
          <p className="mt-1 text-sm text-[#667085]">{data?.subtitle || 'Lead to contract conversion rate over time.'}</p>
        </div>
        <div className="rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">
          {currentValue === null ? 'No trend yet' : `${currentValue}% current conversion`}
        </div>
      </div>

      <div className="mt-4">
        <div className="h-[154px] rounded-[16px] border border-[#edf2f7] bg-[linear-gradient(180deg,#fbfdff_0%,#ffffff_100%)] px-3 py-3 sm:h-[168px]">
          <svg viewBox="0 0 100 84" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Performance trend">
            <defs>
              <linearGradient id="performanceGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#4f86e8" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#4f86e8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[26, 50, 74].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e8eef6" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />)}
            {line ? <path d={area} fill="url(#performanceGradient)" opacity="0.85" /> : null}
            {line ? <path d={line} fill="none" stroke="#4f86e8" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
            {dots.map((dot, index) => (
              <circle key={`performance-dot-${index}`} cx={dot.x} cy={dot.y} r="1.35" fill="#ffffff" stroke="#4f86e8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(data?.series || []).slice(-4).map((point, index) => (
            <div key={`performance-metric-${index}`} className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] px-3 py-2">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Period {index + 1}</p>
              <p className="mt-1 text-[1rem] font-semibold text-[#142132] tabular-nums">{Math.max(0, Math.round(toNumber(point)))}%</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ResidentialTransactionFlow({ data, scope = 'principal' }) {
  if (data?.emptyState) {
    return (
      <section className={`${sectionClass} p-4 sm:p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[1rem] font-semibold text-[#101828]">{data.title}</h3>
            <p className="mt-1 text-sm text-[#667085]">{data.emptyTitle || 'No active transactions yet.'}</p>
          </div>
        </div>
        <div className="mt-5">
          <EmptyState title={data.emptyTitle || 'No active transactions yet.'} copy={data.emptyCopy} />
        </div>
      </section>
    )
  }

  const stages = Array.isArray(data?.stages) ? data.stages : []

  return (
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || (scope === 'agent' ? 'My Transaction Flow' : 'Transaction Flow')}</h3>
          <p className="mt-1 text-sm text-[#667085]">Track where active transactions are sitting and where pipeline value is bunching up.</p>
        </div>
        <div className="rounded-[16px] border border-[#dde4ee] bg-[#f8fafc] px-3.5 py-2 text-right">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{data?.summaryLabel || 'Active Pipeline Overview'}</p>
          <p className="mt-1 text-sm font-semibold text-[#101828]">{data?.activeTransactionLabel || '0 Active Transactions'}</p>
          <p className="mt-0.5 text-xs text-[#667085]">{data?.pipelineValueLabel || 'R0 Pipeline Value'}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-flow-col auto-cols-[minmax(214px,1fr)] gap-3 overflow-x-auto pb-1 md:grid-flow-row md:auto-cols-auto md:grid-cols-2 xl:grid-cols-5 xl:overflow-visible xl:pb-0">
        {stages.map((stage) => {
          const tone = toneStyles[stage.tone] || toneStyles.blue
          return (
            <div key={stage.key} className="flex min-h-[126px] snap-start flex-col rounded-[16px] border border-[#dfe7f0] bg-[#fbfdff] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{stage.label}</p>
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#dde4ee] bg-white text-[#7b8ca2]"
                      title={stage.description || ''}
                      aria-label={stage.description || stage.label}
                    >
                      <Info size={11} />
                    </span>
                  </div>
                  <p className="mt-2 text-[1.55rem] font-semibold leading-none tracking-[-0.035em] text-[#101828] tabular-nums">{formatCount(stage.count)}</p>
                  <p className="mt-1.5 text-[0.9rem] font-semibold text-[#203247]">{stage.formattedValue || formatCurrencyCompactZAR(stage.value || 0)}</p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${tone.soft}`}>
                  {Math.max(0, Math.round(stage.percentage || 0))}%
                </span>
              </div>

              <div className="mt-auto h-2 overflow-hidden rounded-full bg-[#edf2f7]">
                <div className="h-full rounded-full" style={{ width: `${clamp(toNumber(stage.percentage), 0, 100)}%`, background: tone.stroke }} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#667085]">
                <span>Share of active pipeline</span>
                <span className="font-semibold text-[#203247]">{Math.max(0, Math.round(stage.percentage || 0))}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ResidentialActiveTransactionsCarousel({ title, rows = [], scope = 'principal', onViewAll, onOpenRecord }) {
  const records = rows.slice(0, 8).map((row, index) => ({
    id: row.id || row.key || `${index}-${row.address || row.property || row.title || 'transaction'}`,
    title: row.address || row.property || row.title || 'Transaction',
    subtitle: row.area || row.assignedAgent || 'Residential active deal',
    value: row.valueRaw || 0,
    valueLabel: row.value || formatCurrencyCompactZAR(row.valueRaw || 0),
    ownerName: row.ownerName || row.assignedAgent || 'Unassigned',
    ownerRoleLabel: row.ownerRoleLabel || 'Agent',
    daysInStage: row.daysInStage || 0,
    stageKey: row.stageKey,
    statusLabel: row.status || 'Active',
    clientLabel: row.clientLabel || 'Buyer',
    clientName: row.clientName || 'Buyer pending',
    imageUrl: row.imageUrl || row.propertyImage,
  }))
  const totalPipelineValue = rows.reduce((sum, row) => sum + toNumber(row.valueRaw || row.value), 0)
  const recordById = new Map(records.map((record) => [record.id, record]))

  return (
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <ActivePipelineCarousel
        title={title}
        subtitle={scope === 'agent' ? 'Track your active deals and progress.' : 'Track active deals and their progress.'}
        mode="residential_sales"
        records={records}
        onViewAll={onViewAll}
        onOpenRecord={(recordId) => onOpenRecord?.(recordById.get(recordId) || recordId)}
        viewAllLabel="View all"
        summary={{
          primary: `${rows.length} transaction${rows.length === 1 ? '' : 's'} in progress`,
          secondary: `${formatCurrencyCompactZAR(totalPipelineValue)} total pipeline value`,
        }}
        emptyState={<EmptyState title="No active transactions" copy="Active transactions will appear here once deals move into progress." />}
      />
    </section>
  )
}

export function ResidentialAttentionRequired({ data, scope = 'principal' }) {
  if (data?.emptyState) {
    return (
      <section className={`${sectionClass} p-4 sm:p-5`}>
        <h3 className="text-[1rem] font-semibold text-[#101828]">{data.title}</h3>
        <div className="mt-5">
          <EmptyState title="No attention required" copy={data.emptyCopy} />
        </div>
      </section>
    )
  }

  const items = Array.isArray(data?.items) ? data.items : []
  const icons = [AlertTriangle, Clock3, FileText, Landmark, BriefcaseBusiness]
  return (
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || (scope === 'agent' ? 'My Attention Required' : 'Attention Required')}</h3>
          <p className="mt-1 text-sm text-[#667085]">High-signal items only. No noisy generic tasks.</p>
        </div>
      </div>
      <div className="mt-4 divide-y divide-[#edf2f7]">
        {items.slice(0, 5).map((item, index) => {
          const Icon = icons[index % icons.length]
          const tone = toneStyles[item.tone] || toneStyles.slate
          return (
            <div key={item.key || index} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone.bubble}`}>
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#101828]">{item.label}</p>
                <p className="mt-0.5 truncate text-xs text-[#667085]">{item.reason}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.soft}`}>{Math.max(0, Math.round(item.count || 0))}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ResidentialTopPerformers({ data, scope = 'principal' }) {
  if (scope === 'agent' || data?.hidden) return null
  if (data?.emptyState) {
    return (
      <section className={`${sectionClass} p-4 sm:p-5`}>
        <h3 className="text-[1rem] font-semibold text-[#101828]">{data.title}</h3>
        <div className="mt-5">
          <EmptyState title="No top performer data yet" copy={data.emptyCopy} />
        </div>
      </section>
    )
  }

  const items = Array.isArray(data?.items) ? data.items : []
  return (
    <section className={`${sectionClass} flex h-full min-h-[320px] flex-col p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || 'Top Performers'}</h3>
          <p className="mt-1 text-sm text-[#667085]">Top agents by selected period.</p>
        </div>
      </div>
      <div className="mt-4 flex-1 overflow-hidden rounded-[16px] border border-[#e4edf6]">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">
            <tr>
              <th className="px-4 py-3 font-semibold">Agent</th>
              <th className="px-4 py-3 font-semibold">Deals</th>
              <th className="px-4 py-3 font-semibold">Commission</th>
              <th className="px-4 py-3 font-semibold">Trend</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 5).map((item) => (
              <tr key={item.id || item.name} className="border-t border-[#edf2f7]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#edf5ff] text-[0.72rem] font-semibold text-[#1769d1]">
                      {(item.name || 'AG').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-[#101828]">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[#101828] tabular-nums">{Math.max(0, Math.round(item.deals || 0))}</td>
                <td className="px-4 py-3 text-sm text-[#101828] tabular-nums">{formatCurrencyCompactZAR(item.commission || 0)}</td>
                <td className="px-4 py-3 text-sm">
                  <TrendPill value={item.trend} label="vs previous period" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ResidentialCommissionForecast({ data, scope = 'principal' }) {
  if (data?.emptyState) {
    return (
      <section className={`${sectionClass} p-4 sm:p-5`}>
        <h3 className="text-[1rem] font-semibold text-[#101828]">{data.title}</h3>
        <div className="mt-5">
          <EmptyState title="No commission forecast yet" copy={data.emptyCopy} />
        </div>
      </section>
    )
  }

  const { line, area, dots } = buildSparklinePath(data?.series || [])
  return (
    <section className={`${sectionClass} flex h-full min-h-[320px] flex-col p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || (scope === 'agent' ? 'My Commission Forecast' : 'Commission Forecast')}</h3>
          <p className="mt-1 text-sm text-[#667085]">Expected commission within the selected range.</p>
        </div>
        <span className="rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">
          {formatCurrencyCompactZAR(data?.currentValue || 0)}
        </span>
      </div>
      <div className="mt-4 flex-1">
        <svg viewBox="0 0 100 84" preserveAspectRatio="none" className="h-[132px] w-full overflow-visible" role="img" aria-label="Commission forecast">
          <defs>
            <linearGradient id="forecastGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {line ? <path d={area} fill="url(#forecastGradient)" opacity="0.85" /> : null}
          {line ? <polyline fill="none" points={dots.map((dot) => `${dot.x},${dot.y}`).join(' ')} stroke="#8b5cf6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {dots.map((dot, index) => (
            <circle key={`forecast-dot-${index}`} cx={dot.x} cy={dot.y} r="1.7" fill="#ffffff" stroke="#8b5cf6" strokeWidth="1.2" />
          ))}
        </svg>
      </div>
      <div className="mt-3 space-y-2">
        {(data?.rows || []).slice(0, 3).map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-[#101828]">{row.label}</p>
              <p className="text-xs text-[#667085]">{row.trendLabel || 'vs previous period'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#101828]">{formatCurrencyCompactZAR(row.value || 0)}</p>
              <TrendPill value={row.trend} label={row.trendLabel || 'vs previous period'} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ResidentialAppointments({
  module,
  organisationId,
  userId,
  userEmail,
  includeAll,
  canManage,
  refreshKey,
  scope = 'principal',
  onViewCalendar = null,
  onOpenCalendar = null,
  onManageAppointment = null,
  onOpenAppointment = null,
  onScheduleAppointment = null,
}) {
  return (
    <AppointmentDashboardSection
      module={module}
      organisationId={organisationId}
      userId={userId}
      userEmail={userEmail}
      includeAll={includeAll}
      canManage={canManage}
      variant="compact"
      heading={scope === 'agent' ? 'My Appointments' : 'Appointments'}
      subheading="Upcoming appointments, confirmations, and reschedules."
      onViewCalendar={onViewCalendar || undefined}
      onOpenCalendar={onOpenCalendar || undefined}
      onManageAppointment={onManageAppointment || undefined}
      onOpenAppointment={onOpenAppointment || undefined}
      onScheduleAppointment={onScheduleAppointment || undefined}
      refreshKey={refreshKey}
    />
  )
}

export function ResidentialCommandCenterGrid({
  model,
  scope = 'principal',
  mode = 'sales',
  kpiIcons = [],
  organisationId = '',
  userId = '',
  userEmail = '',
  includeAllAppointments = false,
  canManageAppointments = false,
  appointmentRefreshKey = '',
  onViewTransactions,
  onOpenTransaction,
  onViewCalendar,
  onOpenCalendar,
  onManageAppointment,
  onOpenAppointment,
  onScheduleAppointment,
}) {
  if (!model) return null
  const fallbackIcons = [ArrowRight, BriefcaseBusiness, LineChart, Landmark, Users]
  const showTopPerformers = scope !== 'agent' && !model.topPerformers?.hidden
  return (
    <ResidentialDashboardShell>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {model.kpis.map((item, index) => {
          const Icon = kpiIcons[index] || fallbackIcons[index] || FileText
          return (
            <ResidentialKpiCard
              key={item.key}
              icon={Icon}
              label={item.label}
              value={item.compactValue || item.value}
              trend={item.trend}
              sparkline={item.sparkline}
              tone={item.tone}
              emptyCopy=""
            />
          )
        })}
      </div>

      <ResidentialActiveTransactionsCarousel
        title={model.activeTransactions.title}
        rows={model.activeTransactions.rows}
        scope={scope}
        onViewAll={onViewTransactions}
        onOpenRecord={onOpenTransaction}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ResidentialTransactionHealth data={model.transactionHealth} scope={scope} mode={mode} />
        <ResidentialPerformanceChart data={model.performance} scope={scope} mode={mode} />
      </div>

      <ResidentialTransactionFlow data={model.transactionFlow} scope={scope} mode={mode} />

      <div className={`grid gap-4 ${showTopPerformers ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
        {showTopPerformers ? <ResidentialTopPerformers data={model.topPerformers} scope={scope} /> : null}
        <ResidentialCommissionForecast data={model.commissionForecast} scope={scope} />
      </div>

      <div className="min-w-0">
        <ResidentialAppointments
          module={scope === 'agent' ? 'agent' : 'principal'}
          organisationId={organisationId}
          userId={userId}
          userEmail={userEmail}
          includeAll={includeAllAppointments}
          canManage={canManageAppointments}
          refreshKey={appointmentRefreshKey}
          scope={scope}
          onViewCalendar={onViewCalendar}
          onOpenCalendar={onOpenCalendar}
          onManageAppointment={onManageAppointment}
          onOpenAppointment={onOpenAppointment}
          onScheduleAppointment={onScheduleAppointment}
        />
      </div>
    </ResidentialDashboardShell>
  )
}
