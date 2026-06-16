import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  FileText,
  Landmark,
  LineChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import AppointmentDashboardSection from '../appointments/dashboard/AppointmentDashboardSection'
import ActivePipelineCarousel from '../pipeline/ActivePipelineCarousel'
import { formatCurrencyCompactZAR } from '../../services/residentialDashboardService'

const shellClass = 'space-y-4'
const cardClass = 'rounded-[20px] border border-[#dfe7f0] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.055)]'
const sectionClass = 'rounded-[20px] border border-[#dfe7f0] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.055)]'

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

function buildSparklinePath(points = []) {
  const values = (Array.isArray(points) ? points : []).map(toNumber).filter((value) => Number.isFinite(value))
  if (!values.length) return { line: '', area: '', dots: [] }
  const max = Math.max(1, ...values)
  const min = Math.min(...values)
  const spread = Math.max(1, max - min)
  const dots = values.map((value, index) => {
    const x = values.length > 1 ? (index / (values.length - 1)) * 100 : 0
    const y = 76 - ((value - min) / spread) * 44
    return { x, y, value }
  })
  const line = dots.map((dot, index) => `${index === 0 ? 'M' : 'L'} ${dot.x} ${dot.y}`).join(' ')
  const area = `${line} L 100 84 L 0 84 Z`
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
  return <section className={`${shellClass} ${className}`}>{children}</section>
}

export function ResidentialDashboardModeToggle({ value = 'sales', onChange }) {
  const options = [
    { key: 'sales', label: 'Residential Sales' },
    { key: 'leasing', label: 'Residential Leasing' },
  ]

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
  return (
    <article className={`${cardClass} flex min-h-[136px] flex-col justify-between p-4 sm:p-4.5`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${style.bubble}`}>
          <IconComponent size={18} />
        </span>
        <TrendPill value={trend} />
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-[0.82rem] font-semibold text-[#52657a]">{label}</p>
        <p className="mt-2 text-[1.85rem] font-semibold leading-none tracking-[-0.03em] text-[#101828] tabular-nums">{value}</p>
        {emptyCopy ? <p className="mt-1 text-[0.74rem] text-[#7b8ca2]">{emptyCopy}</p> : null}
      </div>
      <div className="mt-3 min-h-[38px]">
        {line ? (
          <svg viewBox="0 0 100 84" className="h-[44px] w-full overflow-visible" role="img" aria-label={`${label} trend sparkline`}>
            <defs>
              <linearGradient id={`spark-${label.replace(/\s+/g, '-').toLowerCase()}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={style.stroke} stopOpacity="0.18" />
                <stop offset="100%" stopColor={style.stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#spark-${label.replace(/\s+/g, '-').toLowerCase()})`} opacity="0.8" />
            <polyline fill="none" points={dots.map((dot) => `${dot.x},${dot.y}`).join(' ')} stroke={style.stroke} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
            {dots.map((dot, index) => (
              <circle key={`${label}-spark-${index}`} cx={dot.x} cy={dot.y} r="1.7" fill="#ffffff" stroke={style.stroke} strokeWidth="1.2" />
            ))}
          </svg>
        ) : (
          <div className="flex h-[44px] items-center justify-center text-[0.72rem] text-[#8a9aac]">No trend yet</div>
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

  return (
    <section className={`${sectionClass} flex h-full min-h-[332px] flex-col p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || 'Transaction Health'}</h3>
          <p className="mt-1 text-sm text-[#667085]">Active transaction movement and delay risk.</p>
        </div>
        <span className="rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">
          {scope === 'agent' ? 'Personal scope' : 'Agency scope'}
        </span>
      </div>

      <div className="mt-6 grid flex-1 gap-6 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
        <div className="mx-auto grid h-[172px] w-[172px] place-items-center rounded-full" style={{ background: gradient }}>
          <div className="grid h-[110px] w-[110px] place-items-center rounded-full bg-white text-center shadow-inner">
            <div>
              <p className="text-[1.8rem] font-semibold leading-none text-[#101828] tabular-nums">{Math.max(0, Math.round(data?.total || 0))}</p>
              <p className="mt-1 text-xs font-medium text-[#667085]">Total</p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {segments.length ? segments.map((segment) => {
            const tone = toneStyles[segment.tone] || toneStyles.blue
            return (
              <div key={segment.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#203247]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.stroke }} />
                    <span className="truncate">{segment.label}</span>
                  </p>
                  <p className="mt-1 text-xs text-[#7b8ca2]">{Math.max(0, Math.round(segment.percentage || 0))}%</p>
                </div>
                <span className="text-sm font-semibold text-[#101828] tabular-nums">{Math.max(0, Math.round(segment.count || 0))}</span>
              </div>
            )
          }) : (
            <div className="rounded-[16px] border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-5 text-sm text-[#667085]">
              No active transaction health data yet.
            </div>
          )}
        </div>
      </div>
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
    <section className={`${sectionClass} flex h-full min-h-[332px] flex-col p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || (scope === 'agent' ? 'My Performance' : 'Agency Performance')}</h3>
          <p className="mt-1 text-sm text-[#667085]">{data?.subtitle || 'Lead to contract conversion rate over time.'}</p>
        </div>
        <div className="rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">
          {currentValue === null ? 'No trend yet' : `${currentValue}% current conversion`}
        </div>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-between">
        <div className="flex-1">
          <svg viewBox="0 0 100 84" className="h-[180px] w-full overflow-visible" role="img" aria-label="Performance trend">
            <defs>
              <linearGradient id="performanceGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#4f86e8" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#4f86e8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {line ? <path d={area} fill="url(#performanceGradient)" opacity="0.85" /> : null}
            {line ? <polyline fill="none" points={dots.map((dot) => `${dot.x},${dot.y}`).join(' ')} stroke="#4f86e8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {dots.map((dot, index) => (
              <circle key={`performance-dot-${index}`} cx={dot.x} cy={dot.y} r="1.7" fill="#ffffff" stroke="#4f86e8" strokeWidth="1.2" />
            ))}
          </svg>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(data?.series || []).slice(0, 3).map((point, index) => (
            <div key={`performance-metric-${index}`} className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] px-3 py-2.5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Month {index + 1}</p>
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
            <p className="mt-1 text-sm text-[#667085]">Residential leasing dashboard is ready.</p>
          </div>
        </div>
        <div className="mt-5">
          <EmptyState title="Residential leasing dashboard is ready." copy={data.emptyCopy} />
        </div>
      </section>
    )
  }

  const stages = Array.isArray(data?.stages) ? data.stages : []
  const total = Math.max(1, stages.reduce((sum, item) => sum + toNumber(item.count), 0))

  return (
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || (scope === 'agent' ? 'My Transaction Flow' : 'Transaction Flow')}</h3>
          <p className="mt-1 text-sm text-[#667085]">Sales flow from new listings through settlement and registration.</p>
        </div>
        <div className="rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#52657a]">
          Overall conversion {data?.overallConversionRate === null || data?.overallConversionRate === undefined ? 'No trend yet' : `${Math.round(data.overallConversionRate)}%`}
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-5">
        {stages.map((stage, index) => {
          const tone = toneStyles[stage.tone] || toneStyles.blue
          return (
            <div key={stage.key} className="flex min-h-[140px] flex-col rounded-[18px] border border-[#dfe7f0] bg-[#fbfdff] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{stage.label}</p>
                  <p className="mt-2 text-[1.35rem] font-semibold tracking-[-0.03em] text-[#101828] tabular-nums">{Math.max(0, Math.round(stage.count || 0))}</p>
                </div>
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-[12px] ${tone.bubble}`}>
                  {index < 2 ? <Sparkles size={16} /> : <LineChart size={16} />}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf2f7]">
                <div className="h-full rounded-full" style={{ width: `${clamp((stage.count / total) * 100, 6, 100)}%`, background: tone.stroke }} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#667085]">
                <span>{Math.max(0, Math.round(stage.percentage || 0))}%</span>
                <span>R{formatCurrencyCompactZAR(stage.value || stage.totalValue || 0).replace(/^R/, '')}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ResidentialActiveTransactionsCarousel({ title, rows = [], scope = 'principal', onViewAll, onOpenRecord }) {
  const records = rows.slice(0, 8).map((row) => ({
    id: row.id,
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

  return (
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <ActivePipelineCarousel
        title={title}
        subtitle={scope === 'agent' ? 'Track your active deals and progress.' : 'Track active deals and their progress.'}
        mode="residential_sales"
        records={records}
        onViewAll={onViewAll}
        onOpenRecord={onOpenRecord}
        summary={{
          primary: `${rows.length} transaction${rows.length === 1 ? '' : 's'} in progress`,
          secondary: `Total pipeline value: ${formatCurrencyCompactZAR(totalPipelineValue)}`,
          actionLabel: 'View all pipeline',
          onAction: onViewAll,
        }}
        viewAllLabel="View all transactions"
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
    <section className={`${sectionClass} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold text-[#101828]">{data?.title || 'Top Performers'}</h3>
          <p className="mt-1 text-sm text-[#667085]">Top agents by selected period.</p>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-[16px] border border-[#e4edf6]">
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
    <section className={`${sectionClass} flex h-full min-h-[332px] flex-col p-4 sm:p-5`}>
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
        <svg viewBox="0 0 100 84" className="h-[170px] w-full overflow-visible" role="img" aria-label="Commission forecast">
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
      <div className="mt-4 space-y-2">
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
