import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coins,
  Download,
  FileText,
  Gauge,
  MoreHorizontal,
  TrendingUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { getNetworkIntelligenceDashboard } from '../../services/bondNetworkIntelligenceService'

const KPI_ICONS = {
  file: FileText,
  check: CheckCircle2,
  clock: Clock3,
  coins: Coins,
  alert: AlertTriangle,
  trend: TrendingUp,
  gauge: Gauge,
}

const STATUS_CLASS = {
  Success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  Watch: 'bg-amber-50 text-amber-700 ring-amber-100',
  Risk: 'bg-red-50 text-red-700 ring-red-100',
  Opportunity: 'bg-blue-50 text-blue-700 ring-blue-100',
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatAxisCurrency(value) {
  const amount = normalizeNumber(value)
  if (amount >= 1000000) return `R${Math.round((amount / 1000000) * 10) / 10}m`
  if (amount >= 1000) return `R${Math.round(amount / 1000)}k`
  return `R${Math.round(amount)}`
}

function formatTooltipValue(series, value) {
  if (series.key === 'revenue') return formatAxisCurrency(value)
  if (series.key === 'approvalRate') return `${Math.round(normalizeNumber(value) * 10) / 10}%`
  if (series.key === 'responseTime') return `${Math.round(normalizeNumber(value) * 10) / 10}d`
  return Math.round(normalizeNumber(value)).toLocaleString('en-ZA')
}

function EmptyIntelligenceState() {
  return (
    <div className="rounded-[16px] border border-dashed border-[#d7e2ee] bg-white p-8 text-center shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
      <p className="text-sm font-semibold text-[#142132]">Not enough historical data yet.</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#64748b]">
        Network intelligence will populate as applications, approvals, response times and revenue events are recorded.
      </p>
    </div>
  )
}

function IntelligenceKpiStrip({ items = [] }) {
  return (
    <section className="rounded-[16px] border border-[#dfe7ef] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
      <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item, index) => {
          const Icon = KPI_ICONS[item.iconKey] || TrendingUp
          const positive = item.movementDirection !== 'negative'
          return (
            <article key={item.key} className={`min-w-0 px-0 py-4 md:px-5 xl:py-0 ${index > 0 ? 'xl:border-l xl:border-[#e3ebf3]' : ''}`}>
              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#f1f6fb] text-[#17324d] ring-1 ring-[#e1eaf3]">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">{item.label}</p>
                  <p className="mt-2 truncate text-[27px] font-semibold leading-none tracking-[-0.01em] text-[#111827]">{item.value}</p>
                  <p className={`mt-3 text-xs font-semibold ${positive ? 'text-[#177245]' : 'text-[#b42318]'}`}>
                    {item.movement}
                  </p>
                  <span className="mt-4 inline-flex min-w-[124px] justify-center rounded-[10px] bg-[#ecfdf3] px-3 py-1.5 text-xs font-semibold text-[#027a48]">
                    {item.signal}
                  </span>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function TrendChart({ trend = {} }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const labels = trend.labels || []
  const series = trend.series || []
  const width = 980
  const height = 360
  const padding = { top: 26, right: 88, bottom: 54, left: 76 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const leftValues = series.filter((row) => row.axis !== 'right').flatMap((row) => row.values.map((point) => normalizeNumber(point.value)))
  const rightValues = series.filter((row) => row.axis === 'right').flatMap((row) => row.values.map((point) => normalizeNumber(point.value)))
  const leftMax = Math.max(100, ...leftValues, 1)
  const rightMax = Math.max(...rightValues, 1)
  const activeIndex = hoverIndex ?? Math.max(labels.length - 1, 0)

  const pointFor = (row, point, index) => {
    const max = row.axis === 'right' ? rightMax : leftMax
    const x = padding.left + (labels.length <= 1 ? 0 : (index / (labels.length - 1)) * plotWidth)
    const y = padding.top + plotHeight - (normalizeNumber(point.value) / max) * plotHeight
    return { x, y }
  }

  const handleMove = (event) => {
    if (!labels.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left) / bounds.width
    const index = Math.max(0, Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1))))
    setHoverIndex(index)
  }

  return (
    <section className="rounded-[16px] border border-[#dfe7ef] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#111827]">Network Momentum Over Time</h3>
          <p className="mt-1 text-sm text-[#64748b]">12 month movement across key performance indicators.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['30 Days', '90 Days', '12 Months'].map((item) => (
            <button key={item} type="button" className={`h-10 rounded-[10px] border px-4 text-sm font-semibold ${item === '12 Months' ? 'border-[#08245c] bg-[#08245c] text-white' : 'border-[#d8e2ec] bg-white text-[#17324d] hover:bg-[#f8fafc]'}`}>
              {item}
            </button>
          ))}
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d8e2ec] bg-white text-[#17324d] hover:bg-[#f8fafc]" aria-label="More chart options">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2">
        {series.map((row) => (
          <span key={row.key} className="inline-flex items-center gap-2 text-sm font-semibold text-[#17324d]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
            {row.label}
          </span>
        ))}
      </div>

      <div className="relative overflow-x-auto [scrollbar-width:thin]">
        <svg
          className="min-w-[920px]"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Network momentum over time"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = padding.top + plotHeight - (tick / 100) * plotHeight
            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e6eef6" strokeDasharray={tick === 0 ? '0' : '4 4'} />
                <text x={padding.left - 18} y={y + 4} textAnchor="end" className="fill-[#64748b] text-[11px] font-semibold">{tick}</text>
              </g>
            )
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = padding.top + plotHeight - tick * plotHeight
            return <text key={tick} x={width - padding.right + 18} y={y + 4} className="fill-[#64748b] text-[11px] font-semibold">{formatAxisCurrency(rightMax * tick)}</text>
          })}
          <text x={padding.left} y={18} className="fill-[#2563eb] text-[11px] font-bold">Operational Axis</text>
          <text x={width - padding.right + 8} y={18} className="fill-[#f97316] text-[11px] font-bold">Revenue Axis</text>

          {series.map((row) => {
            const points = row.values.map((point, index) => {
              const coordinates = pointFor(row, point, index)
              return `${coordinates.x},${coordinates.y}`
            }).join(' ')
            return (
              <g key={row.key}>
                <polyline points={points} fill="none" stroke={row.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {row.values.map((point, index) => {
                  const coordinates = pointFor(row, point, index)
                  return <circle key={`${row.key}-${point.label}-${index}`} cx={coordinates.x} cy={coordinates.y} r={activeIndex === index ? 4.2 : 2.6} fill="#fff" stroke={row.color} strokeWidth="2" />
                })}
              </g>
            )
          })}

          {labels.map((label, index) => {
            const x = padding.left + (labels.length <= 1 ? 0 : (index / (labels.length - 1)) * plotWidth)
            return <text key={`${label}-${index}`} x={x} y={height - 18} textAnchor="middle" className="fill-[#64748b] text-[12px] font-semibold">{label}</text>
          })}

          {labels.length ? (
            <line
              x1={padding.left + (labels.length <= 1 ? 0 : (activeIndex / (labels.length - 1)) * plotWidth)}
              x2={padding.left + (labels.length <= 1 ? 0 : (activeIndex / (labels.length - 1)) * plotWidth)}
              y1={padding.top}
              y2={padding.top + plotHeight}
              stroke="#cbd5e1"
              strokeDasharray="4 4"
            />
          ) : null}
        </svg>

        {labels.length ? (
          <div className="pointer-events-none absolute right-5 top-28 w-[220px] rounded-[14px] border border-[#dfe7ef] bg-white/95 p-4 text-sm shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
            <p className="font-semibold text-[#111827]">{labels[activeIndex]}</p>
            <div className="mt-3 space-y-2">
              {series.map((row) => (
                <p key={row.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-2 text-[#64748b]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="truncate">{row.label.replace(/\s*\([^)]*\)/g, '')}</span>
                  </span>
                  <strong className="shrink-0 text-[#111827]">{formatTooltipValue(row, row.values[activeIndex]?.value)}</strong>
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function IntelligenceSignals({ signals = [] }) {
  return (
    <section className="rounded-[16px] border border-[#dfe7ef] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#111827]">Key Intelligence Signals</h3>
        <button type="button" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">View all signals</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {signals.map((signal) => {
          const Icon = KPI_ICONS[signal.iconKey] || TrendingUp
          return (
            <article key={signal.key} className="min-h-[166px] rounded-[14px] border border-[#e4ecf4] bg-[#fbfdff] p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#17324d] ring-1 ring-[#dfe7ef]">
                <Icon size={18} />
              </span>
              <p className="mt-4 text-sm font-semibold leading-5 text-[#111827]">{signal.title}</p>
              <p className="mt-2 text-xs leading-5 text-[#64748b]">{signal.description}</p>
              <span className={`mt-4 inline-flex rounded-[9px] px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_CLASS[signal.status] || STATUS_CLASS.Opportunity}`}>
                {signal.status}
              </span>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default function NetworkIntelligencePanel({ source = {}, className = '' }) {
  const dashboard = useMemo(() => getNetworkIntelligenceDashboard(source), [source])

  return (
    <section className={`space-y-6 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Network Intelligence</p>
          <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.01em] text-[#111827]">Network Intelligence</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475569]">
            Real-time operational momentum, trend signals and performance intelligence across the bond network.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d8e2ec] bg-white px-3 text-sm font-semibold text-[#17324d] shadow-[0_6px_16px_rgba(15,23,42,0.035)]">
            <CalendarDays size={15} />
            12 Months
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d8e2ec] bg-white px-3 text-sm font-semibold text-[#17324d] shadow-[0_6px_16px_rgba(15,23,42,0.035)]">
            <Download size={15} />
            Export
          </button>
        </div>
      </header>
      {!dashboard.hasData ? <EmptyIntelligenceState /> : (
        <>
          <IntelligenceKpiStrip items={dashboard.kpis} />
          <TrendChart trend={dashboard.trends} />
          <IntelligenceSignals signals={dashboard.signals} />
        </>
      )}
    </section>
  )
}
