import { BrainCircuit, ChevronUp, LockKeyhole, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { propertyIntelligenceDemoData } from '../../data/propertyIntelligenceDemoData'

const CHART_WIDTH = 720
const CHART_HEIGHT = 260
const CHART_PADDING = 28
const PANEL_CLASS = 'rounded-lg border border-[#d8dde5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] lg:p-6'
const SOFT_PANEL_CLASS = 'rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-5 lg:p-6'
const DARK_PANEL_CLASS = 'rounded-lg bg-[#111827] p-5 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] lg:p-6'
const LABEL_CLASS = 'text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.14em] text-[#667085]'
const VALUE_CLASS = 'mt-3 break-words text-[clamp(1.55rem,2.1vw,2.35rem)] font-semibold leading-none text-[#111827]'

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function buildLinePath(values = []) {
  const rows = normalizeArray(values).map(Number).filter((value) => Number.isFinite(value))
  if (rows.length < 2) return ''

  const min = Math.min(...rows)
  const max = Math.max(...rows)
  const range = max - min || 1
  const usableWidth = CHART_WIDTH - CHART_PADDING * 2
  const usableHeight = CHART_HEIGHT - CHART_PADDING * 2

  return rows
    .map((value, index) => {
      const x = CHART_PADDING + (index / (rows.length - 1)) * usableWidth
      const y = CHART_PADDING + (1 - (value - min) / range) * usableHeight
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function TrendIcon({ direction = 'up' }) {
  if (direction === 'down') return <TrendingDown size={16} aria-hidden="true" />
  if (direction === 'flat') return <Minus size={16} aria-hidden="true" />
  return <TrendingUp size={16} aria-hidden="true" />
}

function SectionHeader({ eyebrow, title, copy }) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{eyebrow}</p> : null}
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{title}</h2>
      {copy ? <p className="max-w-3xl text-sm leading-6 text-[#667085]">{copy}</p> : null}
    </div>
  )
}

function MetricCell({ label, value }) {
  return (
    <div className="border-t border-[#273241] pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#98a2b3]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal text-white">{value}</p>
    </div>
  )
}

function ExecutiveHero({ data }) {
  return (
    <section className="overflow-hidden rounded-lg bg-[#101720] text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="grid gap-10 p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:p-10">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{data.meta.mode}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-normal text-white">{data.meta.title}</h1>
            <p className="mt-4 text-lg leading-8 text-[#cbd5e1]">{data.meta.snapshotTitle}</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{data.hero.primaryMetric.label}</p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <span className="text-8xl font-semibold leading-none tracking-normal text-white">{data.hero.primaryMetric.value}</span>
              <span className="pb-3 text-3xl font-semibold text-[#cbd5e1]">{data.hero.primaryMetric.suffix}</span>
            </div>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-sm font-semibold text-[#d5e7d8]">
              <ChevronUp size={16} aria-hidden="true" />
              {data.hero.primaryMetric.trend}
            </p>
          </div>
        </div>
        <div className="grid content-end gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.hero.metrics.map((metric) => (
            <MetricCell key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      </div>
    </section>
  )
}

function MarketDemandHero({ metrics }) {
  return (
    <section className="overflow-hidden rounded-lg bg-[#101720] text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="grid gap-10 p-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)] lg:p-10">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">Market Intelligence</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-normal text-white">{metrics.title}</h1>
            <p className="mt-4 text-lg leading-8 text-[#cbd5e1]">{metrics.subtitle}</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{metrics.primaryMetric.label}</p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <span className="text-8xl font-semibold leading-none tracking-normal text-white">{metrics.primaryMetric.value}</span>
              <span className="pb-3 text-3xl font-semibold text-[#cbd5e1]">{metrics.primaryMetric.suffix}</span>
            </div>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-sm font-semibold text-[#d5e7d8]">
              <ChevronUp size={16} aria-hidden="true" />
              {metrics.primaryMetric.change}
            </p>
          </div>
        </div>
        <div className="grid content-end gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.metrics.map((metric) => (
            <MetricCell key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ForecastHero({ metrics }) {
  return (
    <section className="overflow-hidden rounded-lg bg-[#101720] text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="grid gap-10 p-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)] lg:p-10">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{metrics.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-normal text-white">{metrics.title}</h1>
            <p className="mt-4 text-lg leading-8 text-[#cbd5e1]">{metrics.subtitle}</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{metrics.primaryMetric.label}</p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <span className="text-8xl font-semibold leading-none tracking-normal text-white">{metrics.primaryMetric.value}</span>
              <span className="pb-3 text-2xl font-semibold text-[#cbd5e1]">{metrics.primaryMetric.descriptor}</span>
            </div>
            <p className="mt-5 inline-flex rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-sm font-semibold text-[#d5e7d8]">
              {metrics.primaryMetric.horizon}
            </p>
          </div>
        </div>
        <div className="grid content-end gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.metrics.map((metric) => (
            <MetricCell key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      </div>
    </section>
  )
}

function BankIntelligenceHero({ metrics }) {
  return (
    <section className="overflow-hidden rounded-lg bg-[#101720] text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="grid gap-10 p-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)] lg:p-10">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{metrics.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-normal text-white">{metrics.title}</h1>
            <p className="mt-4 text-lg leading-8 text-[#cbd5e1]">{metrics.subtitle}</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{metrics.primaryMetric.label}</p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <span className="text-8xl font-semibold leading-none tracking-normal text-white">{metrics.primaryMetric.value}</span>
              <span className="pb-3 text-3xl font-semibold text-[#cbd5e1]">{metrics.primaryMetric.suffix}</span>
            </div>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-sm font-semibold text-[#d5e7d8]">
              <ChevronUp size={16} aria-hidden="true" />
              {metrics.primaryMetric.change}
            </p>
          </div>
        </div>
        <div className="grid content-end gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.metrics.map((metric) => (
            <MetricCell key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      </div>
    </section>
  )
}

function AiBriefing({ briefing }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-white">
            <BrainCircuit size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">Generated Intelligence</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">{briefing.title}</h2>
          </div>
        </div>
        <span className="inline-flex w-fit rounded-full border border-[#d8dde5] bg-[#f8fafc] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#475467]">
          {briefing.badge}
        </span>
      </div>
      <div className="mt-7 grid gap-4 text-lg leading-8 text-[#344054]">
        {briefing.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

function buildForecastLinePath(values = [], xStart, xEnd, yMin, yMax) {
  const rows = normalizeArray(values).map(Number).filter((value) => Number.isFinite(value))
  if (rows.length < 2) return ''

  const range = yMax - yMin || 1
  return rows
    .map((value, index) => {
      const x = xStart + (index / (rows.length - 1)) * (xEnd - xStart)
      const y = CHART_PADDING + (1 - (value - yMin) / range) * (CHART_HEIGHT - CHART_PADDING * 2)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function ForecastProjectionChart({ forecast }) {
  const allValues = forecast.series.flatMap((series) => [...series.historical, ...series.forecast]).map(Number).filter((value) => Number.isFinite(value))
  const yMin = Math.min(...allValues)
  const yMax = Math.max(...allValues)
  const splitX = 500

  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader title={forecast.title} copy={forecast.subtitle} />
        <div className="flex gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">
          <span>{forecast.historicalLabel}</span>
          <span>{forecast.splitLabel}</span>
        </div>
      </div>
      <div className="mt-8 overflow-hidden rounded-lg bg-[#f7f8fa]">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={forecast.title} className="h-[360px] w-full">
          {[0, 1, 2, 3].map((line) => (
            <line
              key={line}
              x1={CHART_PADDING}
              x2={CHART_WIDTH - CHART_PADDING}
              y1={CHART_PADDING + line * ((CHART_HEIGHT - CHART_PADDING * 2) / 3)}
              y2={CHART_PADDING + line * ((CHART_HEIGHT - CHART_PADDING * 2) / 3)}
              stroke="#d8dde5"
              strokeWidth="1"
            />
          ))}
          <line x1={splitX} x2={splitX} y1={CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="#667085" strokeDasharray="5 6" strokeWidth="1.4" />
          <text x={CHART_PADDING} y={CHART_PADDING - 8} fill="#667085" fontSize="12" fontWeight="700">{forecast.historicalLabel}</text>
          <text x={splitX + 14} y={CHART_PADDING - 8} fill="#667085" fontSize="12" fontWeight="700">{forecast.splitLabel}</text>
          {forecast.series.map((series, index) => {
            const historicalPath = buildForecastLinePath(series.historical, CHART_PADDING, splitX, yMin, yMax)
            const forecastPath = buildForecastLinePath([series.historical.at(-1), ...series.forecast], splitX, CHART_WIDTH - CHART_PADDING, yMin, yMax)
            const strokeWidth = index === 0 ? 4 : 2.2
            const opacity = index === 0 ? 1 : 0.42
            return (
              <g key={series.label}>
                <path d={historicalPath} fill="none" stroke="#111827" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} opacity={opacity} />
                <path d={forecastPath} fill="none" stroke="#111827" strokeDasharray="7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} opacity={opacity} />
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {forecast.series.map((series) => (
          <article key={series.label} className="border-t border-[#d8dde5] pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{series.label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#111827]">{series.currentValue}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProvinceForecastTable({ forecasts }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{forecasts.title}</h2>
      <div className="mt-6 overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">
              {forecasts.columns.map((column) => (
                <th key={column} className="px-4 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecasts.rows.map((row) => (
              <tr key={row.province} className={`${row.leader ? 'bg-[#eef2f6]' : 'bg-[#f8fafc]'} text-sm text-[#344054]`}>
                <td className="rounded-l-lg px-4 py-4 font-semibold text-[#111827]">{row.province}</td>
                <td className="px-4 py-4">{row.currentScore}</td>
                <td className="px-4 py-4 font-semibold text-[#28684a]">{row.forecastGrowth}</td>
                <td className="rounded-r-lg px-4 py-4 font-semibold">{row.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function QuadrantGrid({ matrix }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{matrix.title}</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {matrix.quadrants.map((quadrant) => (
          <article key={quadrant.label} className="min-h-[180px] rounded-lg border border-[#d8dde5] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <h3 className="text-xl font-semibold text-[#111827]">{quadrant.label}</h3>
            <div className="mt-5 flex flex-wrap gap-2">
              {quadrant.items.map((item) => (
                <span key={item} className="rounded-full border border-[#d8dde5] bg-[#f8fafc] px-3 py-1 text-sm font-semibold text-[#344054]">{item}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function PropertyTypeForecast({ forecast }) {
  return (
    <section className={PANEL_CLASS}>
      <SectionHeader title={forecast.title} copy={forecast.subtitle} />
      <div className="mt-6 grid gap-4">
        {forecast.rows.map((row) => (
          <article key={row.propertyType} className="rounded-lg bg-[#f8fafc] p-4">
            <div className="flex items-start justify-between gap-4">
              <p className="font-semibold text-[#111827]">{row.propertyType}</p>
              <p className={`shrink-0 text-xl font-semibold ${row.direction === 'down' ? 'text-[#b54708]' : 'text-[#28684a]'}`}>{row.change}</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="flex justify-between gap-3 text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.1em] text-[#667085]"><span>{forecast.columns[1]}</span><span>{row.currentDemand}</span></div>
                <div className="mt-2 h-2 rounded-full bg-[#e4e7ec]"><div className="h-2 rounded-full bg-[#667085]" style={{ width: `${row.currentDemand}%` }} /></div>
              </div>
              <div className="min-w-0">
                <div className="flex justify-between gap-3 text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.1em] text-[#667085]"><span>{forecast.columns[2]}</span><span>{row.forecastDemand}</span></div>
                <div className="mt-2 h-2 rounded-full bg-[#e4e7ec]"><div className="h-2 rounded-full bg-[#111827]" style={{ width: `${row.forecastDemand}%` }} /></div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function BuyerSegmentForecast({ forecast }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{forecast.title}</h2>
      <div className="mt-7 grid gap-4">
        {forecast.rows.map((row) => (
          <div key={row.segment} className="grid gap-3 md:grid-cols-[210px_minmax(0,1fr)_80px] md:items-center">
            <p className="font-semibold text-[#111827]">{row.segment}</p>
            <div className="h-3 overflow-hidden rounded-full bg-[#e4e7ec]">
              <div className="h-full rounded-full bg-[#111827]" style={{ width: `${row.score}%` }} />
            </div>
            <p className={`text-right text-xl font-semibold ${row.growth.startsWith('-') ? 'text-[#b54708]' : 'text-[#28684a]'}`}>{row.growth}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ForecastInsightCard({ insights }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-white">
            <BrainCircuit size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{insights.eyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">{insights.title}</h2>
          </div>
        </div>
        <div className="text-left lg:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{insights.confidenceLabel}</p>
          <p className="mt-1 text-3xl font-semibold text-[#111827]">{insights.confidence}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{insights.badge}</p>
        </div>
      </div>
      <div className="mt-7 grid gap-4 text-lg leading-8 text-[#344054]">
        {insights.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

function ForecastTimeline({ timeline }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{timeline.title}</h2>
      <div className="mt-8 grid gap-5 xl:grid-cols-4">
        {timeline.items.map((item, index) => (
          <article key={item.horizon} className="relative border-t border-[#111827] pt-5">
            <span className="absolute -top-2 left-0 h-4 w-4 rounded-full border-2 border-[#111827] bg-white" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">{item.horizon}</p>
            <h3 className="mt-4 text-xl font-semibold leading-8 text-[#111827]">{item.event}</h3>
            <p className="mt-3 text-sm font-semibold text-[#667085]">{timeline.sequenceLabel} {index + 1}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ForecastGauge({ metric }) {
  const value = Number(metric.value || 0)
  const rotation = -90 + (Math.max(0, Math.min(100, value)) / 100) * 180
  return (
    <article className="min-w-0 rounded-lg bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <p className="min-h-[2.4rem] text-sm font-semibold leading-5 text-[#111827]">{metric.label}</p>
      <div className="relative mt-4 h-20">
        <div className="absolute inset-x-2 bottom-0 h-16 rounded-t-full border-[10px] border-b-0 border-[#e4e7ec]" />
        <div className="absolute inset-x-2 bottom-0 h-16 rounded-t-full border-[10px] border-b-0 border-[#111827] [clip-path:inset(0_0_0_0)]" style={{ opacity: value / 100 }} />
        <div className="absolute bottom-0 left-1/2 h-1 w-14 origin-left rounded-full bg-[#111827]" style={{ transform: `rotate(${rotation}deg)` }} />
        <div className="absolute bottom-[-6px] left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#111827]" />
      </div>
      <p className="mt-2 text-[clamp(1.6rem,2.1vw,2.25rem)] font-semibold leading-none text-[#111827]">{metric.value}%</p>
    </article>
  )
}

function ForecastConfidenceEngine({ confidence }) {
  return (
    <section className={SOFT_PANEL_CLASS}>
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{confidence.title}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
        {confidence.metrics.map((metric) => (
          <ForecastGauge key={metric.label} metric={metric} />
        ))}
      </div>
    </section>
  )
}

function ForecastExecutiveSummary({ summary }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{summary.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">{summary.title}</h2>
        </div>
        <div className="text-left lg:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{summary.badge}</p>
          <p className="mt-2 text-sm font-semibold text-[#344054]">{summary.confidenceLabel}: {summary.confidence}</p>
        </div>
      </div>
      <div className="mt-7 grid gap-4 text-lg leading-8 text-[#344054]">
        {summary.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

function BankPerformanceLeaderboard({ rankings }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-3xl font-semibold tracking-normal text-[#111827]">{rankings.title}</h2>
      <div className="mt-7 overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">
              {rankings.columns.map((column) => (
                <th key={column} className="px-4 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankings.rows.map((row) => (
              <tr key={row.bank} className={`${row.rank === 1 ? 'bg-[#eef2f6]' : 'bg-[#f8fafc]'} text-sm text-[#344054]`}>
                <td className="rounded-l-lg px-4 py-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#111827] text-sm font-semibold text-white">{row.rank}</span>
                </td>
                <td className="px-4 py-5 text-lg font-semibold text-[#111827]">{row.bank}</td>
                <td className="px-4 py-5 font-semibold text-[#28684a]">{row.approvalRate}</td>
                <td className="px-4 py-5">{row.averageSla}</td>
                <td className="px-4 py-5 font-semibold">{row.averageLoanValue}</td>
                <td className="rounded-r-lg px-4 py-5 font-semibold">{row.marketShare}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MultiSeriesTrendChart({ chart }) {
  const allValues = chart.series.flatMap((series) => series.data).map(Number).filter((value) => Number.isFinite(value))
  const yMin = Math.min(...allValues)
  const yMax = Math.max(...allValues)

  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{chart.subtitle}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">{chart.title}</h2>
        </div>
        <div className="text-left lg:text-right">
          <p className="text-3xl font-semibold text-[#111827]">{chart.currentValue}</p>
          <p className="mt-1 text-sm font-semibold text-[#28684a]">{chart.growth}</p>
        </div>
      </div>
      <div className="mt-8 overflow-hidden rounded-lg bg-[#f7f8fa]">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={chart.title} className="h-[360px] w-full">
          {[0, 1, 2, 3].map((line) => (
            <line
              key={line}
              x1={CHART_PADDING}
              x2={CHART_WIDTH - CHART_PADDING}
              y1={CHART_PADDING + line * ((CHART_HEIGHT - CHART_PADDING * 2) / 3)}
              y2={CHART_PADDING + line * ((CHART_HEIGHT - CHART_PADDING * 2) / 3)}
              stroke="#d8dde5"
              strokeWidth="1"
            />
          ))}
          {chart.series.map((series, index) => {
            const path = buildForecastLinePath(series.data, CHART_PADDING, CHART_WIDTH - CHART_PADDING, yMin, yMax)
            return (
              <path
                key={series.label}
                d={path}
                fill="none"
                stroke="#111827"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={index === 0 ? 4 : 2.4}
                opacity={index === 0 ? 1 : 0.42}
              />
            )
          })}
        </svg>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {chart.series.map((series) => (
          <article key={series.label} className="border-t border-[#d8dde5] pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{series.label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#111827]">{series.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function SlaMonitoringPanel({ data }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <SectionHeader title={data.title} copy={data.subtitle} />
      <div className="mt-7 grid gap-5">
        {data.rows.map((row) => (
          <article key={row.bank} className="grid gap-4 border-t border-[#eef1f4] pt-4 md:grid-cols-[140px_minmax(0,1fr)_120px_110px] md:items-center">
            <p className="text-lg font-semibold text-[#111827]">{row.bank}</p>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#e4e7ec]">
              <div className="h-full rounded-full bg-[#111827]" style={{ width: `${row.score}%` }} />
            </div>
            <p className="font-semibold text-[#111827]">{row.averageResponse}</p>
            <p className={`text-sm font-semibold ${row.trend === 'Slowing' ? 'text-[#b54708]' : 'text-[#28684a]'}`}>{row.trend}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function MarketShareDistribution({ distribution }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <SectionHeader title={distribution.title} copy={distribution.subtitle} />
      <div className="mt-7 grid gap-5">
        {distribution.rows.map((row) => (
          <div key={row.bank} className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)_90px_90px] md:items-center">
            <p className="font-semibold text-[#111827]">{row.bank}</p>
            <div className="h-3 overflow-hidden rounded-full bg-[#e4e7ec]">
              <div className="h-full rounded-full bg-[#111827]" style={{ width: `${row.marketShare}%` }} />
            </div>
            <p className="text-right text-xl font-semibold text-[#111827]">{row.marketShare}%</p>
            <p className={`inline-flex items-center justify-end gap-1 text-sm font-semibold ${row.direction === 'down' ? 'text-[#b54708]' : 'text-[#28684a]'}`}>
              <TrendIcon direction={row.direction} />
              {row.trend}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function BankOpportunityMatrix({ matrix }) {
  return (
    <aside className="rounded-lg bg-[#111827] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{matrix.subtitle}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{matrix.title}</h2>
      <div className="mt-7 grid gap-5">
        {matrix.items.map((item) => (
          <article key={item.bank} className="border-t border-[#273241] pt-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold text-white">{item.bank}</h3>
              <span className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-[#111827]">{item.opportunityScore}</span>
            </div>
            <p className="mt-4 text-sm font-semibold text-[#cbd5e1]">{item.insight}</p>
          </article>
        ))}
      </div>
    </aside>
  )
}

function AiBankRecommendations({ recommendations }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-white">
          <BrainCircuit size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{recommendations.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">{recommendations.title}</h2>
        </div>
      </div>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {recommendations.items.map((item) => (
          <article key={item.recommendation} className="rounded-lg bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <p className="text-lg leading-8 text-[#344054]">{item.recommendation}</p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{recommendations.confidenceLabel}</p>
            <p className="mt-2 text-2xl font-semibold text-[#111827]">{item.confidence}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function BorrowerProfileAnalysis({ insights }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{insights.title}</h2>
      <div className="mt-7 grid gap-4 lg:grid-cols-5">
        {insights.rows.map((row) => (
          <article key={row.segment} className="rounded-lg bg-[#f8fafc] p-5">
            <h3 className="text-lg font-semibold leading-7 text-[#111827]">{row.segment}</h3>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="border-t border-[#d8dde5] pt-3">
                <dt className="text-[#667085]">{insights.columns[1]}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[#111827]">{row.approvalRate}</dd>
              </div>
              <div className="border-t border-[#d8dde5] pt-3">
                <dt className="text-[#667085]">{insights.columns[2]}</dt>
                <dd className="mt-1 font-semibold text-[#111827]">{row.averageLoanValue}</dd>
              </div>
              <div className="border-t border-[#d8dde5] pt-3">
                <dt className="text-[#667085]">{insights.columns[3]}</dt>
                <dd className="mt-1 font-semibold text-[#111827]">{row.averageApprovalTime}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function DevelopmentFinanceInsights({ insights }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <SectionHeader title={insights.title} copy={insights.subtitle} />
      <div className="mt-7 overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">
              {insights.columns.map((column) => (
                <th key={column} className="px-4 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {insights.rows.map((row) => (
              <tr key={row.development} className="bg-[#f8fafc] text-sm text-[#344054]">
                <td className="rounded-l-lg px-4 py-4 text-lg font-semibold text-[#111827]">{row.development}</td>
                <td className="px-4 py-4 font-semibold text-[#28684a]">{row.bondTakeUpRate}</td>
                <td className="px-4 py-4 font-semibold">{row.approvalRate}</td>
                <td className="rounded-r-lg px-4 py-4 font-semibold">{row.averageBondValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function LenderHealthIndex({ health }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <SectionHeader title={health.title} copy={health.subtitle} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {health.rows.map((row) => (
          <article key={row.bank} className="rounded-lg bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold text-[#111827]">{row.bank}</h3>
              <span className="text-3xl font-semibold text-[#111827]">{row.health}</span>
            </div>
            <dl className="mt-6 grid gap-3 text-sm">
              {['growth', 'approval', 'sla'].map((key) => (
                <div key={key}>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#667085]">{health.scoreLabels[key]}</dt>
                    <dd className="font-semibold text-[#111827]">{row[key]}</dd>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[#e4e7ec]">
                    <div className="h-1.5 rounded-full bg-[#111827]" style={{ width: `${row[key]}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function PartnerNetworkMap({ mapData }) {
  return (
    <section className="rounded-lg bg-[#101720] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{mapData.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{mapData.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cbd5e1]">{mapData.subtitle}</p>
        </div>
        <p className="w-fit rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">{mapData.activityLabel}</p>
      </div>
      <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-hidden rounded-lg border border-[#273241] bg-[#121b27]">
          <svg viewBox="0 0 100 90" role="img" aria-label={mapData.title} className="h-[540px] w-full">
            <defs>
              <radialGradient id="partner-network-glow">
                <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.68" />
                <stop offset="42%" stopColor="#9fb6cc" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#9fb6cc" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="partner-map-fill" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#263344" />
                <stop offset="100%" stopColor="#17212d" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="90" fill="#101720" />
            <path
              d="M17 70 L22 58 L18 48 L24 35 L36 23 L51 18 L64 22 L74 31 L84 45 L83 58 L73 69 L58 76 L42 80 L28 78 Z"
              fill="url(#partner-map-fill)"
              stroke="#3b4858"
              strokeWidth="0.7"
            />
            <path d="M27 67 L36 61 L50 61 L61 56 L72 58" fill="none" stroke="#3b4858" strokeWidth="0.35" opacity="0.65" />
            <path d="M43 25 L46 39 L57 48 L65 66" fill="none" stroke="#3b4858" strokeWidth="0.35" opacity="0.65" />
            {mapData.regions.map((region) => (
              <g key={region.region}>
                <circle cx={region.x} cy={region.y} r={Math.max(6, region.intensity / 8)} fill="url(#partner-network-glow)" />
                <circle cx={region.x} cy={region.y} r="2.3" fill="#f8fafc" stroke="#101720" strokeWidth="0.5" />
                <text x={region.x + 3.2} y={region.y - 2.6} fill="#e5ebf2" fontSize="2.8" fontWeight="700">{region.region}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="grid gap-3">
          {mapData.regions.map((region) => (
            <article key={region.region} className="rounded-lg border border-[#273241] bg-[#17212d] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{region.region}</h3>
                  <p className="mt-1 text-sm font-semibold text-[#d5e7d8]">{region.activity}</p>
                </div>
                <span className="text-2xl font-semibold text-white">{region.intensity}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {mapData.categories.map((category) => (
                  <div key={category.key}>
                    <dt className="text-[#98a2b3]">{category.label}</dt>
                    <dd className="mt-1 font-semibold text-white">{region[category.key].toLocaleString('en-ZA')}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function EcosystemRankingTable({ table }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{table.title}</h2>
      <div className="mt-6 overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">
              {table.columns.map((column) => (
                <th key={column} className="px-4 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={row.id} className={`${rowIndex === 0 ? 'bg-[#eef2f6]' : 'bg-[#f8fafc]'} text-sm text-[#344054]`}>
                {row.values.map((value, columnIndex) => (
                  <td
                    key={`${row.id}-${table.columns[columnIndex]}`}
                    className={`${columnIndex === 0 ? 'rounded-l-lg text-lg font-semibold text-[#111827]' : 'font-semibold'} ${columnIndex === row.values.length - 1 ? 'rounded-r-lg text-[#111827]' : ''} px-4 py-4`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PartnerOpportunityEngine({ opportunities }) {
  return (
    <section className="rounded-lg bg-[#111827] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{opportunities.eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{opportunities.title}</h2>
      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {opportunities.items.map((item) => (
          <article key={item.partner} className="border-t border-[#273241] pt-5">
            <h3 className="text-xl font-semibold text-white">{item.partner}</h3>
            <dl className="mt-5 grid gap-4 text-sm">
              {item.metrics.map((metric) => (
                <div key={metric.label} className="flex justify-between gap-4">
                  <dt className="text-[#98a2b3]">{metric.label}</dt>
                  <dd className="font-semibold text-white">{metric.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function EmergingLeaders({ leaders }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{leaders.title}</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {leaders.cards.map((card) => (
          <article key={card.label} className="border-t border-[#d8dde5] pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">{card.label}</p>
            <h3 className="mt-4 text-xl font-semibold leading-8 text-[#111827]">{card.partner}</h3>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{card.growthLabel}</p>
            <p className="mt-1 text-3xl font-semibold text-[#28684a]">{card.growth}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function EcosystemNetworkVisual({ network }) {
  const nodeLookup = new Map(network.nodes.map((node) => [node.id, node]))

  return (
    <section className="rounded-lg bg-[#101720] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{network.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{network.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cbd5e1]">{network.subtitle}</p>
        </div>
        <p className="w-fit rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">{network.flowLabel}</p>
      </div>
      <div className="mt-8 overflow-hidden rounded-lg border border-[#273241] bg-[#121b27]">
        <svg viewBox="0 0 100 100" role="img" aria-label={network.title} className="h-[540px] w-full">
          <defs>
            <radialGradient id="ecosystem-node-glow">
              <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#9fb6cc" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="#101720" />
          {network.links.map((link) => {
            const source = nodeLookup.get(link.source)
            const target = nodeLookup.get(link.target)
            if (!source || !target) return null
            return (
              <line
                key={`${link.source}-${link.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="#7d8da3"
                strokeWidth="0.45"
                strokeDasharray={target.primary || source.primary ? '2 2' : '0'}
                opacity={target.primary || source.primary ? 0.72 : 0.44}
              />
            )
          })}
          {network.nodes.map((node) => (
            <g key={node.id}>
              <circle cx={node.x} cy={node.y} r={node.primary ? 15 : 11} fill="url(#ecosystem-node-glow)" />
              <circle cx={node.x} cy={node.y} r={node.primary ? 7.2 : 5.2} fill={node.primary ? '#f8fafc' : '#17212d'} stroke="#d8dde5" strokeWidth="0.65" />
              <text
                x={node.x}
                y={node.primary ? node.y + 13 : node.y + 10}
                textAnchor="middle"
                fill={node.primary ? '#ffffff' : '#dbe4ee'}
                fontSize={node.primary ? '3.2' : '2.9'}
                fontWeight="700"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}

function CapacityLoadMap({ mapData }) {
  return (
    <section className="rounded-lg bg-[#101720] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{mapData.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{mapData.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cbd5e1]">{mapData.subtitle}</p>
        </div>
        <p className="w-fit rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">{mapData.categoryLabel}</p>
      </div>
      <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-hidden rounded-lg border border-[#273241] bg-[#121b27]">
          <svg viewBox="0 0 100 90" role="img" aria-label={mapData.title} className="h-[540px] w-full">
            <defs>
              <radialGradient id="capacity-pressure-glow">
                <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.7" />
                <stop offset="36%" stopColor="#9fb6cc" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#9fb6cc" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="capacity-map-fill" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#263344" />
                <stop offset="100%" stopColor="#17212d" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="90" fill="#101720" />
            <path
              d="M17 70 L22 58 L18 48 L24 35 L36 23 L51 18 L64 22 L74 31 L84 45 L83 58 L73 69 L58 76 L42 80 L28 78 Z"
              fill="url(#capacity-map-fill)"
              stroke="#3b4858"
              strokeWidth="0.7"
            />
            <path d="M27 67 L36 61 L50 61 L61 56 L72 58" fill="none" stroke="#3b4858" strokeWidth="0.35" opacity="0.65" />
            <path d="M43 25 L46 39 L57 48 L65 66" fill="none" stroke="#3b4858" strokeWidth="0.35" opacity="0.65" />
            {mapData.provinces.map((province) => (
              <g key={province.province}>
                <circle cx={province.x} cy={province.y} r={Math.max(6, province.pressure / 7)} fill="url(#capacity-pressure-glow)" />
                <circle cx={province.x} cy={province.y} r="2.4" fill="#f8fafc" stroke="#101720" strokeWidth="0.5" />
                <text x={province.x + 3.1} y={province.y - 2.5} fill="#e5ebf2" fontSize="2.7" fontWeight="700">{province.province}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="grid gap-3">
          {mapData.provinces.map((province) => (
            <article key={province.province} className="rounded-lg border border-[#273241] bg-[#17212d] p-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-white">{province.province}</h3>
                <span className="text-2xl font-semibold text-white">{province.pressure}</span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                {mapData.categories.map((category) => (
                  <div key={category.key}>
                    <dt className="text-[#98a2b3]">{category.label}</dt>
                    <dd className="mt-1 font-semibold text-white">{province[category.key]}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function CapacityRankingTable({ table }) {
  return (
    <section className={PANEL_CLASS}>
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{table.title}</h2>
      <div className="mt-6 overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-[0.68rem] font-semibold uppercase leading-4 tracking-[0.12em] text-[#667085]">
              {table.columns.map((column) => (
                <th key={column} className="px-3 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id} className={`${row.risk === 'critical' ? 'bg-[#fff4ed]' : row.risk === 'monitoring' ? 'bg-[#fffaeb]' : 'bg-[#f8fafc]'} text-sm text-[#344054]`}>
                {row.values.map((value, columnIndex) => (
                  <td
                    key={`${row.id}-${table.columns[columnIndex]}`}
                    className={`${columnIndex === 0 ? 'rounded-l-lg text-base font-semibold text-[#111827]' : 'font-semibold'} ${columnIndex === row.values.length - 1 ? 'rounded-r-lg text-[#111827]' : ''} px-3 py-4`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ConsultantUtilisation({ utilisation }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{utilisation.title}</h2>
      <div className="mt-7 grid gap-5">
        {utilisation.rows.map((row) => (
          <article key={row.consultant} className="grid gap-4 border-t border-[#eef1f4] pt-4 md:grid-cols-[150px_120px_minmax(0,1fr)_120px] md:items-center">
            <p className="text-lg font-semibold text-[#111827]">{row.consultant}</p>
            <p className="font-semibold text-[#344054]">{row.activeApplications}</p>
            <div>
              <div className="flex justify-between text-xs font-semibold uppercase tracking-[0.12em] text-[#667085]">
                <span>{utilisation.columns[2]}</span>
                <span>{row.capacity}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e4e7ec]">
                <div className="h-full rounded-full bg-[#111827]" style={{ width: `${row.capacity}%` }} />
              </div>
            </div>
            <p className={`text-sm font-semibold ${row.forecastRisk === 'High' ? 'text-[#b54708]' : row.forecastRisk === 'Medium' ? 'text-[#946300]' : 'text-[#28684a]'}`}>{row.forecastRisk}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function SlaRiskMonitor({ riskData }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <SectionHeader title={riskData.title} copy={riskData.subtitle} />
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {riskData.rows.map((row) => (
          <article key={row.branch} className="rounded-lg bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold text-[#111827]">{row.branch}</h3>
              <span className={`text-3xl font-semibold ${row.estimatedImpact === 'Critical' ? 'text-[#b54708]' : row.estimatedImpact === 'High' ? 'text-[#946300]' : 'text-[#28684a]'}`}>{row.riskScore}</span>
            </div>
            <dl className="mt-6 grid gap-4 text-sm">
              <div className="border-t border-[#eef1f4] pt-3">
                <dt className="text-[#667085]">{riskData.columns[2]}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[#111827]">{row.probability}</dd>
              </div>
              <div className="border-t border-[#eef1f4] pt-3">
                <dt className="text-[#667085]">{riskData.columns[3]}</dt>
                <dd className="mt-1 font-semibold text-[#111827]">{row.estimatedImpact}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function ResourceOptimisation({ recommendations }) {
  return (
    <section className={DARK_PANEL_CLASS}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{recommendations.eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{recommendations.title}</h2>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {recommendations.recommendations.map((item) => (
          <article key={item.action} className="border-t border-[#273241] pt-5">
            <h3 className="text-xl font-semibold leading-8 text-white">{item.action}</h3>
            <dl className="mt-5 grid gap-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#98a2b3]">{recommendations.expectedSlaImprovementLabel}</dt>
                <dd className="font-semibold text-[#d5e7d8]">{item.expectedSlaImprovement}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#98a2b3]">{recommendations.confidenceLabel}</dt>
                <dd className="font-semibold text-white">{item.confidence}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function VolumeForecastImpact({ impact }) {
  return (
    <section className={PANEL_CLASS}>
      <SectionHeader title={impact.title} copy={impact.subtitle} />
      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-4">
        {impact.metrics.map((metric) => (
          <article key={metric.label} className="border-t border-[#d8dde5] pt-5">
            <p className={LABEL_CLASS}>{metric.label}</p>
            <p className={VALUE_CLASS}>{metric.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function CapacityHeatmap({ heatmap }) {
  const colorByPressure = {
    healthy: 'bg-[#eaf6ee] text-[#28684a]',
    monitoring: 'bg-[#fffaeb] text-[#946300]',
    critical: 'bg-[#fff4ed] text-[#b54708]',
  }

  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <SectionHeader title={heatmap.title} copy={heatmap.subtitle} />
      <div className="mt-6 flex flex-wrap gap-3">
        {heatmap.legend.map((item) => (
          <span key={item.key} className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${colorByPressure[item.key]}`}>{item.label}</span>
        ))}
      </div>
      <div className="mt-7 overflow-x-auto [scrollbar-width:thin]">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[160px_repeat(5,1fr)] gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">
            <span />
            {heatmap.columns.map((column) => (
              <span key={column} className="px-3 py-2">{column}</span>
            ))}
          </div>
          <div className="mt-2 grid gap-2">
            {heatmap.rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[160px_repeat(5,1fr)] gap-2">
                <p className="rounded-lg bg-white px-3 py-4 font-semibold text-[#111827]">{row.label}</p>
                {row.pressure.map((pressure, index) => (
                  <div key={`${row.label}-${heatmap.columns[index]}`} className={`rounded-lg px-3 py-4 text-center text-sm font-semibold ${colorByPressure[pressure]}`}>
                    {heatmap.legend.find((item) => item.key === pressure)?.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function BottleneckAnalysis({ analysis }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <SectionHeader title={analysis.title} copy={analysis.subtitle} />
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {analysis.items.map((item) => (
          <article key={item.area} className="border-t border-[#d8dde5] pt-5">
            <h3 className="text-xl font-semibold text-[#111827]">{item.area}</h3>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{item.constraintLabel}</p>
            <p className="mt-2 text-lg font-semibold text-[#111827]">{item.constraint}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ExecutiveDecisionBoard({ board }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{board.title}</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {board.cards.map((card) => (
          <article key={card.action} className="rounded-lg bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <h3 className="text-xl font-semibold leading-8 text-[#111827]">{card.action}</h3>
            <dl className="mt-6 grid gap-4 text-sm">
              <div className="border-t border-[#eef1f4] pt-3">
                <dt className="text-[#667085]">{card.impactLabel}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[#111827]">{card.impact}</dd>
              </div>
              <div className="border-t border-[#eef1f4] pt-3">
                <dt className="text-[#667085]">{board.confidenceLabel}</dt>
                <dd className="mt-1 font-semibold text-[#28684a]">{card.confidence}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function IntelligenceFeed({ feed }) {
  return (
    <section className="rounded-lg bg-[#101720] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{feed.chronologyLabel}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{feed.title}</h2>
        </div>
        <span className="h-2.5 w-2.5 rounded-full bg-[#d5e7d8] shadow-[0_0_28px_rgba(213,231,216,0.72)]" />
      </div>
      <div className="mt-8 grid gap-4">
        {feed.items.map((item, index) => (
          <article key={`${item.type}-${item.title}`} className="grid gap-5 border-t border-[#273241] pt-5 lg:grid-cols-[120px_minmax(0,1fr)_220px] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#98a2b3]">{item.type}</p>
              <p className="mt-3 text-sm font-semibold text-[#cbd5e1]">{feed.sequenceLabel} {index + 1}</p>
            </div>
            <div>
              <h3 className="text-2xl font-semibold leading-9 text-white">{item.title}</h3>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">{item.metricLabel}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{item.metricValue}</p>
            </div>
            <div className="rounded-lg border border-[#273241] bg-[#17212d] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">{feed.confidenceLabel}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{item.confidence}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function RecommendedActions({ actions }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <h2 className="text-3xl font-semibold tracking-normal text-[#111827]">{actions.title}</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {actions.cards.map((card) => (
          <article key={card.action} className="rounded-lg bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <h3 className="text-xl font-semibold leading-8 text-[#111827]">{card.action}</h3>
            <dl className="mt-6 grid gap-4 text-sm">
              <div className="border-t border-[#eef1f4] pt-3">
                <dt className="text-[#667085]">{card.metricLabel}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[#111827]">{card.metricValue}</dd>
              </div>
              <div className="border-t border-[#eef1f4] pt-3">
                <dt className="text-[#667085]">{actions.confidenceLabel}</dt>
                <dd className="mt-1 font-semibold text-[#28684a]">{card.confidence}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function SignalDetectionGrid({ signals }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{signals.title}</h2>
      <div className="mt-7 grid gap-4">
        {signals.cards.map((card) => (
          <article key={`${card.signal}-${card.subject || card.confidence}`} className="border-t border-[#d8dde5] pt-5">
            <h3 className="text-lg font-semibold leading-7 text-[#111827]">{card.signal}</h3>
            {card.subject ? <p className="mt-2 text-2xl font-semibold text-[#111827]">{card.subject}</p> : null}
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{signals.confidenceLabel}</p>
            <p className="mt-1 text-2xl font-semibold text-[#28684a]">{card.confidence}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function BridgeWouldDoToday({ plan }) {
  return (
    <section className="rounded-lg bg-[#111827] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <h2 className="text-3xl font-semibold tracking-normal text-white">{plan.title}</h2>
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {plan.priorities.map((item) => (
          <article key={item.priority} className="border-t border-[#273241] pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#98a2b3]">{item.priority}</p>
            <h3 className="mt-4 text-2xl font-semibold leading-9 text-white">{item.action}</h3>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">{item.benefitLabel}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{item.benefit}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function DigitalTwinVisual({ network }) {
  const nodeLookup = new Map(network.nodes.map((node) => [node.id, node]))

  return (
    <section className="rounded-lg bg-[#101720] p-5 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">{network.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{network.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cbd5e1]">{network.subtitle}</p>
        </div>
        <p className="w-fit rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">{network.flowLabel}</p>
      </div>
      <div className="mt-6 overflow-hidden rounded-lg border border-[#273241] bg-[#121b27]">
        <svg viewBox="0 0 100 100" role="img" aria-label={network.title} className="h-[360px] w-full 2xl:h-[500px]">
          <defs>
            <radialGradient id="digital-twin-node-glow">
              <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#9fb6cc" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="#101720" />
          {network.links.map((link, index) => {
            const source = nodeLookup.get(link.source)
            const target = nodeLookup.get(link.target)
            if (!source || !target) return null
            const midX = (source.x + target.x) / 2
            const midY = (source.y + target.y) / 2
            return (
              <g key={`${link.source}-${link.target}`}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#7d8da3"
                  strokeWidth="0.48"
                  strokeDasharray={target.primary || source.primary ? '2 2' : '0'}
                  opacity={target.primary || source.primary ? 0.74 : 0.46}
                />
                <circle cx={midX} cy={midY} r="1.05" fill="#f8fafc" opacity={index % 2 === 0 ? 0.82 : 0.48}>
                  <animate attributeName="opacity" values="0.2;0.95;0.2" dur={`${2.4 + index * 0.18}s`} repeatCount="indefinite" />
                </circle>
              </g>
            )
          })}
          {network.nodes.map((node) => (
            <g key={node.id}>
              <circle cx={node.x} cy={node.y} r={node.primary ? 16 : 11} fill="url(#digital-twin-node-glow)" />
              <circle cx={node.x} cy={node.y} r={node.primary ? 7.5 : 5.3} fill={node.primary ? '#f8fafc' : '#17212d'} stroke="#d8dde5" strokeWidth="0.7" />
              <text
                x={node.x}
                y={node.primary ? node.y + 13.5 : node.y + 10}
                textAnchor="middle"
                fill={node.primary ? '#ffffff' : '#dbe4ee'}
                fontSize={node.primary ? '3.2' : '2.85'}
                fontWeight="700"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}

function SimulationControlPanel({ controls, selectedControls, onControlChange }) {
  return (
    <section className={`${PANEL_CLASS} self-start`}>
      <SectionHeader title={controls.title} copy={controls.subtitle} />
      <div className="mt-5 grid gap-4">
        {controls.groups.map((group) => {
          const selectedValue = selectedControls[group.key] || group.defaultValue
          const selectedIndex = Math.max(0, group.options.findIndex((option) => option.value === selectedValue))
          return (
            <div key={group.key} className="border-t border-[#eef1f4] pt-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-base font-semibold text-[#111827]">{group.label}</h3>
                <span className="rounded-md bg-[#111827] px-3 py-1 text-sm font-semibold text-white">{group.options[selectedIndex]?.label}</span>
              </div>
              <input
                type="range"
                min="0"
                max={group.options.length - 1}
                step="1"
                value={selectedIndex}
                onChange={(event) => onControlChange(group, group.options[Number(event.target.value)])}
                className="mt-4 h-2 w-full accent-[#111827]"
                aria-label={group.label}
              />
              <div className="mt-2 grid gap-2 text-[0.7rem] font-semibold uppercase leading-5 tracking-[0.06em] text-[#667085]" style={{ gridTemplateColumns: `repeat(${group.options.length}, minmax(0, 1fr))` }}>
                {group.options.map((option) => (
                  <span key={option.value} className="text-center">{option.label}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ProjectedOutcome({ outputs, activeSimulationKey }) {
  const output = outputs.outputs[activeSimulationKey] || outputs.outputs[Object.keys(outputs.outputs)[0]]
  return (
    <section className={`${SOFT_PANEL_CLASS} self-start`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#667085]">{output.label}</p>
          <h2 className="mt-2 text-[clamp(1.75rem,2.5vw,2.35rem)] font-semibold leading-tight tracking-normal text-[#111827]">{outputs.title}</h2>
        </div>
        <span className="w-fit rounded-full border border-[#d8dde5] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#667085]">
          Live scenario
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {output.metrics.map((metric) => (
          <article key={metric.label} className="min-w-0 rounded-lg bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <p className="min-h-[2.35rem] text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.12em] text-[#667085]">{metric.label}</p>
            <p className="mt-3 whitespace-nowrap text-[clamp(1.65rem,2vw,2.2rem)] font-semibold leading-none text-[#111827]">{metric.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function SimulationNarrative({ narratives, activeSimulationKey }) {
  const paragraphs = narratives.narratives[activeSimulationKey] || narratives.narratives[Object.keys(narratives.narratives)[0]]
  return (
    <section className={PANEL_CLASS}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-white">
            <BrainCircuit size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{narratives.generatedLabel}</p>
            <h2 className="mt-2 text-[clamp(1.65rem,2.3vw,2.25rem)] font-semibold leading-tight tracking-normal text-[#111827]">{narratives.title}</h2>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 text-base leading-7 text-[#344054]">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

function ExecutiveScenarioCards({ scenarios, activeSimulationKey, onSelect }) {
  return (
    <section className={PANEL_CLASS}>
      <h2 className="text-[clamp(1.75rem,2.4vw,2.35rem)] font-semibold leading-tight tracking-normal text-[#111827]">{scenarios.title}</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {scenarios.cards.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => onSelect(scenario.id)}
            className={`min-w-0 rounded-lg border p-4 text-left transition ${activeSimulationKey === scenario.id ? 'border-[#111827] bg-[#111827] text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)]' : 'border-[#d8dde5] bg-[#f8fafc] text-[#111827] hover:border-[#111827]'}`}
          >
            <h3 className={`text-[clamp(1.05rem,1.4vw,1.35rem)] font-semibold leading-7 ${activeSimulationKey === scenario.id ? 'text-white' : 'text-[#111827]'}`}>{scenario.title}</h3>
            <p className={`mt-3 text-sm leading-6 ${activeSimulationKey === scenario.id ? 'text-[#cbd5e1]' : 'text-[#667085]'}`}>{scenario.description}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

function ScenarioMetricPanel({ scenario, dark = false }) {
  return (
    <section className={`${dark ? 'bg-[#111827] text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]' : 'border border-[#d8dde5] bg-white text-[#111827] shadow-[0_18px_50px_rgba(15,23,42,0.05)]'} rounded-lg p-5 lg:p-6`}>
      <h2 className={`text-[clamp(1.6rem,2.3vw,2.3rem)] font-semibold leading-tight tracking-normal ${dark ? 'text-white' : 'text-[#111827]'}`}>{scenario.title}</h2>
      {scenario.subtitle ? <p className={`mt-3 text-sm leading-6 ${dark ? 'text-[#cbd5e1]' : 'text-[#667085]'}`}>{scenario.subtitle}</p> : null}
      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
        {scenario.metrics.map((metric) => (
          <article key={metric.label} className={`${dark ? 'border-[#273241]' : 'border-[#d8dde5]'} border-t pt-5`}>
            <p className={`text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.14em] ${dark ? 'text-[#98a2b3]' : 'text-[#667085]'}`}>{metric.label}</p>
            <p className={`mt-3 break-words text-[clamp(1.6rem,2.2vw,2.25rem)] font-semibold leading-tight ${dark ? 'text-white' : 'text-[#111827]'}`}>{metric.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function InterestRateImpact({ scenario }) {
  return (
    <section className={PANEL_CLASS}>
      <h2 className="text-[clamp(1.6rem,2.3vw,2.3rem)] font-semibold leading-tight tracking-normal text-[#111827]">{scenario.title}</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded-lg bg-[#f8fafc] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">{scenario.currentRateLabel}</p>
          <p className="mt-3 text-[clamp(2rem,3vw,2.8rem)] font-semibold text-[#111827]">{scenario.currentRate}</p>
        </article>
        <article className="rounded-lg bg-[#111827] p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#98a2b3]">{scenario.projectedRateLabel}</p>
          <p className="mt-3 text-[clamp(2rem,3vw,2.8rem)] font-semibold text-white">{scenario.projectedRate}</p>
        </article>
      </div>
      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-4">
        {scenario.effects.map((effect) => (
          <article key={effect.label} className="border-t border-[#d8dde5] pt-5">
            <p className={LABEL_CLASS}>{effect.label}</p>
            <p className="mt-3 break-words text-[clamp(1.55rem,2.1vw,2.25rem)] font-semibold leading-tight text-[#b54708]">{effect.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function MarketImpactScenario({ scenario }) {
  return (
    <section className={PANEL_CLASS}>
      <h2 className="text-[clamp(1.6rem,2.3vw,2.3rem)] font-semibold leading-tight tracking-normal text-[#111827]">{scenario.title}</h2>
      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
        {scenario.metrics.map((metric) => (
          <article key={metric.label} className="border-t border-[#d8dde5] pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">{metric.label}</p>
            <p className="mt-3 text-2xl font-semibold text-[#111827]">{metric.value}</p>
          </article>
        ))}
      </div>
      <div className="mt-7 grid gap-3">
        {scenario.regionalWinners.map((winner) => (
          <div key={winner.area} className="flex items-center justify-between rounded-lg bg-[#f8fafc] px-4 py-3">
            <span className="font-semibold text-[#111827]">{winner.area}</span>
            <span className="text-xl font-semibold text-[#28684a]">{winner.growth}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DemandHotspotMap({ hotspotData }) {
  return (
    <section className="rounded-lg bg-[#101720] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98a2b3]">Demand Heatmap</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{hotspotData.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cbd5e1]">{hotspotData.subtitle}</p>
        </div>
        <p className="w-fit rounded-full border border-[#344054] bg-[#17212d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">Demo heat layer</p>
      </div>
      <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-lg border border-[#273241] bg-[#121b27]">
          <svg viewBox="0 0 100 90" role="img" aria-label={hotspotData.title} className="h-[520px] w-full">
            <defs>
              <radialGradient id="market-hotspot-glow">
                <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.7" />
                <stop offset="38%" stopColor="#9fb6cc" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#9fb6cc" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="sa-map-fill" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#243142" />
                <stop offset="100%" stopColor="#17212d" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="90" fill="#101720" />
            <path
              d="M17 70 L22 58 L18 48 L24 35 L36 23 L51 18 L64 22 L74 31 L84 45 L83 58 L73 69 L58 76 L42 80 L28 78 Z"
              fill="url(#sa-map-fill)"
              stroke="#3b4858"
              strokeWidth="0.6"
            />
            <path d="M27 67 L36 61 L50 61 L61 56 L72 58" fill="none" stroke="#3b4858" strokeWidth="0.35" opacity="0.6" />
            <path d="M43 25 L46 39 L57 48 L65 66" fill="none" stroke="#3b4858" strokeWidth="0.35" opacity="0.6" />
            {hotspotData.areas.map((hotspot) => (
              <g key={hotspot.area}>
                <circle cx={hotspot.x} cy={hotspot.y} r={Math.max(5, hotspot.intensity / 9)} fill="url(#market-hotspot-glow)" />
                <circle cx={hotspot.x} cy={hotspot.y} r="2.1" fill="#f8fafc" stroke="#101720" strokeWidth="0.5" />
                <text x={hotspot.x + 2.8} y={hotspot.y - 2.4} fill="#e5ebf2" fontSize="2.6" fontWeight="700">{hotspot.area}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="grid gap-3">
          {hotspotData.areas.map((hotspot) => (
            <article key={hotspot.area} className="rounded-lg border border-[#273241] bg-[#17212d] p-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-white">{hotspot.area}</h3>
                <span className="text-2xl font-semibold text-white">{hotspot.demandScore}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[#98a2b3]">{hotspotData.labels.priceGrowth}</dt>
                  <dd className="mt-1 font-semibold text-[#d5e7d8]">{hotspot.priceGrowth}</dd>
                </div>
                <div>
                  <dt className="text-[#98a2b3]">{hotspotData.labels.buyerActivity}</dt>
                  <dd className="mt-1 font-semibold text-white">{hotspot.buyerActivity}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function IntelligenceTable({ table, variant = 'default' }) {
  const rows = normalizeArray(table.rows)
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{table.title}</h2>
      <div className="mt-6 overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[620px] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">
              {table.columns.map((column) => (
                <th key={column} className="px-4 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.area} className={`${variant === 'velocity' && row.highlight ? 'bg-[#eef2f6]' : 'bg-[#f8fafc]'} text-sm text-[#344054]`}>
                <td className="rounded-l-lg px-4 py-4 font-semibold text-[#111827]">{row.area}</td>
                <td className="px-4 py-4 font-semibold">{row.growth || row.averageDaysOnMarket}</td>
                <td className="px-4 py-4">{row.demand || row.trend}</td>
                <td className="rounded-r-lg px-4 py-4">{row.marketMomentum || (row.highlight ? 'High liquidity' : 'Measured liquidity')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BuyerDemandPanel({ demand }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <SectionHeader title={demand.title} copy={demand.subtitle} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {demand.items.map((item) => {
          const isDown = item.direction === 'down'
          return (
            <article key={item.label} className="rounded-lg bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-[#111827]">{item.label}</h3>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${isDown ? 'bg-[#fff4ed] text-[#b54708]' : 'bg-[#eef7f1] text-[#28684a]'}`}>
                  <TrendIcon direction={item.direction} />
                  {item.movement}
                </span>
              </div>
              <div className="mt-5 h-1.5 rounded-full bg-[#e4e7ec]">
                <div className="h-1.5 rounded-full bg-[#111827]" style={{ width: `${isDown ? 34 : 74}%` }} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function BuyerBehaviourSignals({ insights }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{insights.title}</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {insights.cards.map((card) => (
          <article key={card.label} className="border-t border-[#d8dde5] pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">{card.label}</p>
            <p className="mt-4 text-2xl font-semibold leading-8 text-[#111827]">{card.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function PropertyTypeDistribution({ distribution }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <SectionHeader title={distribution.title} copy={distribution.subtitle} />
      <div className="mt-7 grid gap-5">
        {distribution.items.map((item) => (
          <div key={item.label} className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_90px] md:items-center">
            <div className="flex items-center gap-2">
              <TrendIcon direction={item.trend} />
              <span className="font-semibold text-[#111827]">{item.label}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#e4e7ec]">
              <div className="h-full rounded-full bg-[#111827]" style={{ width: `${item.value}%` }} />
            </div>
            <p className="text-right text-xl font-semibold text-[#111827]">{item.value}%</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function MarketSignalFeed({ signals }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
      <h2 className="text-2xl font-semibold tracking-normal text-[#111827]">{signals.title}</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {signals.observations.map((signal) => (
          <article key={signal.title} className="rounded-lg bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <h3 className="text-lg font-semibold text-[#111827]">{signal.title}</h3>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">Confidence</p>
            <p className="mt-2 text-2xl font-semibold text-[#111827]">{signal.confidence}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function InvestmentOpportunityBoard({ opportunities }) {
  return (
    <aside className="rounded-lg bg-[#111827] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">Investment Research</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{opportunities.title}</h2>
      <div className="mt-7 grid gap-5">
        {opportunities.items.map((item) => (
          <article key={item.area} className="border-t border-[#273241] pt-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold text-white">{item.area}</h3>
              <span className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-[#111827]">{item.opportunityRating}</span>
            </div>
            <dl className="mt-5 grid gap-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#98a2b3]">Expected Demand Growth</dt>
                <dd className="font-semibold text-[#d5e7d8]">{item.expectedDemandGrowth}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#98a2b3]">Market Score</dt>
                <dd className="font-semibold text-white">{item.marketScore}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </aside>
  )
}

function MarketExecutiveSummary({ summary }) {
  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">Executive Summary</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">{summary.title}</h2>
        </div>
        <span className="inline-flex w-fit rounded-full border border-[#d8dde5] bg-[#f8fafc] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#475467]">
          {summary.badge}
        </span>
      </div>
      <div className="mt-7 grid gap-4 text-lg leading-8 text-[#344054]">
        {summary.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

function IntelligenceLineChart({ chart }) {
  const path = buildLinePath(chart.data)

  return (
    <section className="rounded-lg border border-[#d8dde5] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{chart.subtitle}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-normal text-[#111827]">{chart.title}</h3>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-3xl font-semibold text-[#111827]">{chart.currentValue}</p>
          <p className="mt-1 text-sm font-semibold text-[#28684a]">{chart.growth}</p>
        </div>
      </div>
      <div className="mt-8 overflow-hidden rounded-lg bg-[#f7f8fa]">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${chart.title} trend chart`} className="h-[260px] w-full">
          <defs>
            <linearGradient id={`${chart.title.replace(/\s+/g, '-')}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#111827" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#111827" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((line) => (
            <line
              key={line}
              x1={CHART_PADDING}
              x2={CHART_WIDTH - CHART_PADDING}
              y1={CHART_PADDING + line * ((CHART_HEIGHT - CHART_PADDING * 2) / 3)}
              y2={CHART_PADDING + line * ((CHART_HEIGHT - CHART_PADDING * 2) / 3)}
              stroke="#d8dde5"
              strokeWidth="1"
            />
          ))}
          <path d={`${path} L ${CHART_WIDTH - CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} L ${CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} Z`} fill={`url(#${chart.title.replace(/\s+/g, '-')}-area)`} />
          <path d={path} fill="none" stroke="#111827" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </svg>
      </div>
    </section>
  )
}

function ProvinceCard({ province }) {
  return (
    <article className="rounded-lg border border-[#d8dde5] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl font-semibold text-[#111827]">{province.province}</h3>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3f5f7] text-[#111827]">
          <TrendIcon direction={province.demandTrend} />
        </span>
      </div>
      <dl className="mt-6 grid gap-4">
        <div className="flex items-center justify-between border-t border-[#eef1f4] pt-3">
          <dt className="text-sm text-[#667085]">Market Score</dt>
          <dd className="text-2xl font-semibold text-[#111827]">{province.score}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-[#eef1f4] pt-3">
          <dt className="text-sm text-[#667085]">Demand</dt>
          <dd className="font-semibold text-[#111827]">{province.demand}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-[#eef1f4] pt-3">
          <dt className="text-sm text-[#667085]">Price Growth</dt>
          <dd className="font-semibold text-[#28684a]">{province.priceGrowth}</dd>
        </div>
      </dl>
    </article>
  )
}

function SignalCard({ signal }) {
  const isDown = signal.direction === 'down'

  return (
    <article className="rounded-lg border border-[#d8dde5] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold text-[#111827]">{signal.label}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${isDown ? 'bg-[#fff4ed] text-[#b54708]' : 'bg-[#eef7f1] text-[#28684a]'}`}>
          <TrendIcon direction={signal.direction} />
          {signal.movement}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#667085]">{signal.insight}</p>
    </article>
  )
}

function OpportunitiesPanel({ section, opportunities }) {
  return (
    <aside className="rounded-lg bg-[#111827] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">{section.eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{section.title}</h2>
      <div className="mt-7 grid gap-5">
        {opportunities.map((opportunity) => (
          <article key={opportunity.title} className="border-t border-[#273241] pt-5">
            <h3 className="text-xl font-semibold text-white">{opportunity.title}</h3>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">{opportunity.metricLabel}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{opportunity.metricValue}</p>
            <p className="mt-4 text-sm font-semibold text-[#d5e7d8]">Confidence: {opportunity.confidence}</p>
          </article>
        ))}
      </div>
    </aside>
  )
}

function FutureReleaseState({ message, label }) {
  return (
    <section className="rounded-lg border border-dashed border-[#c8ced8] bg-white p-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#f3f5f7] text-[#475467]">
        <LockKeyhole size={20} aria-hidden="true" />
      </span>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#6d7785]">{label}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-[#111827]">{message}</h2>
    </section>
  )
}

function OverviewContent({ data }) {
  return (
    <>
      <ExecutiveHero data={data} />

      <AiBriefing briefing={data.aiBriefing} />

      <section className="grid gap-6 xl:grid-cols-2">
        <IntelligenceLineChart chart={data.marketHealth.transactionVolume} />
        <IntelligenceLineChart chart={data.marketHealth.averagePrice} />
      </section>

      <section className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
        <SectionHeader
          eyebrow={data.sections.marketPulse.eyebrow}
          title={data.sections.marketPulse.title}
          copy={data.sections.marketPulse.copy}
        />
        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.provinces.map((province) => (
            <ProvinceCard key={province.province} province={province} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-[#d8dde5] bg-[#f8fafc] p-7">
          <SectionHeader
            eyebrow={data.sections.emergingSignals.eyebrow}
            title={data.sections.emergingSignals.title}
            copy={data.sections.emergingSignals.copy}
          />
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            {data.overviewMarketSignals.map((signal) => (
              <SignalCard key={signal.label} signal={signal} />
            ))}
          </div>
        </div>
        <OpportunitiesPanel section={data.sections.opportunities} opportunities={data.opportunities} />
      </section>
    </>
  )
}

function MarketIntelligenceContent({ data }) {
  return (
    <>
      <MarketDemandHero metrics={data.marketDemandMetrics} />

      <DemandHotspotMap hotspotData={data.hotspotLocations} />

      <section className="grid gap-6 xl:grid-cols-2">
        <IntelligenceTable table={data.growthAreas} />
        <IntelligenceTable table={data.salesVelocityAreas} variant="velocity" />
      </section>

      <BuyerDemandPanel demand={data.buyerDemandSignals} />

      <BuyerBehaviourSignals insights={data.buyerBehaviourInsights} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6">
          <PropertyTypeDistribution distribution={data.propertyTypeDistribution} />
          <MarketSignalFeed signals={data.marketIntelligenceSignals} />
        </div>
        <InvestmentOpportunityBoard opportunities={data.investmentOpportunities} />
      </section>

      <MarketExecutiveSummary summary={data.marketExecutiveSummary} />
    </>
  )
}

function ForecastingContent({ data }) {
  return (
    <>
      <ForecastHero metrics={data.marketForecastMetrics} />

      <ForecastProjectionChart forecast={data.forecastTrendData} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <ProvinceForecastTable forecasts={data.provinceForecasts} />
        <QuadrantGrid matrix={data.marketMomentumForecasts} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <PropertyTypeForecast forecast={data.propertyTypeForecasts} />
        <BuyerSegmentForecast forecast={data.buyerSegmentForecasts} />
      </section>

      <ForecastInsightCard insights={data.forecastInsights} />

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <QuadrantGrid matrix={data.forecastRiskMatrix} />
        <ForecastConfidenceEngine confidence={data.forecastConfidenceMetrics} />
      </section>

      <ForecastTimeline timeline={data.forecastTimeline} />

      <ForecastExecutiveSummary summary={data.forecastExecutiveSummary} />
    </>
  )
}

function BankIntelligenceContent({ data }) {
  return (
    <>
      <BankIntelligenceHero metrics={data.bankIntelligenceMetrics} />

      <BankPerformanceLeaderboard rankings={data.bankPerformanceRankings} />

      <MultiSeriesTrendChart chart={data.approvalTrendData} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-6">
          <SlaMonitoringPanel data={data.slaMonitoringData} />
          <MarketShareDistribution distribution={data.marketShareDistribution} />
        </div>
        <BankOpportunityMatrix matrix={data.bankOpportunityMatrix} />
      </section>

      <AiBankRecommendations recommendations={data.aiBankRecommendations} />

      <BorrowerProfileAnalysis insights={data.borrowerProfileInsights} />

      <DevelopmentFinanceInsights insights={data.developmentFinanceInsights} />

      <LenderHealthIndex health={data.lenderHealthScores} />

      <ForecastExecutiveSummary summary={data.bankExecutiveBriefing} />
    </>
  )
}

function PartnerIntelligenceContent({ data }) {
  return (
    <>
      <BankIntelligenceHero metrics={data.partnerIntelligenceMetrics} />

      <PartnerNetworkMap mapData={data.partnerNetworkMapData} />

      <section className="grid gap-6 xl:grid-cols-2">
        <EcosystemRankingTable table={data.agencyRankings} />
        <EcosystemRankingTable table={data.attorneyRankings} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <EcosystemRankingTable table={data.originatorRankings} />
        <EcosystemRankingTable table={data.developerPerformanceData} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <QuadrantGrid matrix={data.partnerHealthMatrix} />
        <EcosystemRankingTable table={data.regionalPerformanceMetrics} />
      </section>

      <PartnerOpportunityEngine opportunities={data.partnerOpportunityEngine} />

      <EmergingLeaders leaders={data.emergingPartnerMetrics} />

      <EcosystemNetworkVisual network={data.ecosystemNetworkData} />

      <ForecastExecutiveSummary summary={data.partnerExecutiveBriefing} />
    </>
  )
}

function CapacityPlanningContent({ data }) {
  return (
    <>
      <BankIntelligenceHero metrics={data.capacityMetrics} />

      <CapacityLoadMap mapData={data.nationalCapacityMap} />

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_520px]">
        <CapacityRankingTable table={data.branchCapacityData} />
        <ConsultantUtilisation utilisation={data.consultantUtilisationData} />
      </section>

      <SlaRiskMonitor riskData={data.slaRiskData} />

      <ResourceOptimisation recommendations={data.resourceOptimisationRecommendations} />

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_520px]">
        <EcosystemRankingTable table={data.hiringIntelligenceData} />
        <VolumeForecastImpact impact={data.volumeForecastImpact} />
      </section>

      <CapacityHeatmap heatmap={data.capacityHeatmapData} />

      <BottleneckAnalysis analysis={data.bottleneckAnalysis} />

      <ForecastExecutiveSummary summary={data.operationsExecutiveBriefing} />

      <ExecutiveDecisionBoard board={data.operationsDecisionBoard} />
    </>
  )
}

function AiRecommendationsContent({ data }) {
  return (
    <>
      <BankIntelligenceHero metrics={data.aiRecommendationMetrics} />

      <ForecastExecutiveSummary summary={data.executiveAiBriefing} />

      <IntelligenceFeed feed={data.intelligenceFeed} />

      <section className="grid gap-6 xl:grid-cols-2">
        <EcosystemRankingTable table={data.opportunityEngine} />
        <CapacityRankingTable table={data.riskEngine} />
      </section>

      <RecommendedActions actions={data.recommendedActions} />

      <EcosystemRankingTable table={data.revenueOpportunityEngine} />

      <section className="grid gap-6 xl:grid-cols-3">
        <SignalDetectionGrid signals={data.marketSignals} />
        <SignalDetectionGrid signals={data.bankSignals} />
        <SignalDetectionGrid signals={data.partnerSignals} />
      </section>

      <BridgeWouldDoToday plan={data.bridgeWouldDoToday} />

      <ForecastConfidenceEngine confidence={data.recommendationConfidence} />

      <ExecutiveDecisionBoard board={data.executiveDecisionBoard} />
    </>
  )
}

function ScenarioSimulatorContent({ data }) {
  const initialControls = Object.fromEntries(data.simulationControls.groups.map((group) => [group.key, group.defaultValue]))
  const [selectedControls, setSelectedControls] = useState(initialControls)
  const [activeSimulationKey, setActiveSimulationKey] = useState(data.simulationControls.defaultScenario)

  function handleControlChange(group, option) {
    setSelectedControls((current) => ({ ...current, [group.key]: option.value }))
    setActiveSimulationKey(option.simulationKey)
  }

  function handleScenarioSelect(scenarioId) {
    setActiveSimulationKey(scenarioId)
    setSelectedControls((current) => {
      const nextControls = { ...current }
      data.simulationControls.groups.forEach((group) => {
        const matchingOption = group.options.find((option) => option.simulationKey === scenarioId)
        if (matchingOption) nextControls[group.key] = matchingOption.value
      })
      return nextControls
    })
  }

  return (
    <>
      <BankIntelligenceHero metrics={data.simulationMetrics} />

      <DigitalTwinVisual network={data.digitalTwinNetwork} />

      <section className="grid items-start gap-6 2xl:grid-cols-[minmax(360px,0.42fr)_minmax(0,0.58fr)]">
        <SimulationControlPanel
          controls={data.simulationControls}
          selectedControls={selectedControls}
          onControlChange={handleControlChange}
        />
        <div className="grid content-start gap-6">
          <ProjectedOutcome outputs={data.simulationOutputs} activeSimulationKey={activeSimulationKey} />
          <SimulationNarrative narratives={data.simulationNarratives} activeSimulationKey={activeSimulationKey} />
        </div>
      </section>

      <ExecutiveScenarioCards
        scenarios={data.executiveScenarios}
        activeSimulationKey={activeSimulationKey}
        onSelect={handleScenarioSelect}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <ScenarioMetricPanel scenario={data.oobaPartnershipScenario} dark />
        <ScenarioMetricPanel scenario={data.nationalScaleScenario} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <InterestRateImpact scenario={data.interestRateScenarios} />
        <ScenarioMetricPanel scenario={data.capacityImpactScenarios} />
      </section>

      <MarketImpactScenario scenario={data.marketImpactScenarios} />

      <EcosystemRankingTable table={data.decisionSimulator} />

      <ScenarioMetricPanel scenario={data.bridge2030Vision} dark />

      <ForecastExecutiveSummary summary={data.strategicOutlook} />
    </>
  )
}

export default function BondPredictiveIntelligencePage() {
  const data = propertyIntelligenceDemoData
  const [activeTab, setActiveTab] = useState(data.meta.defaultTab || data.navigation[0]?.key || 'overview')
  const activeNavItem = data.navigation.find((item) => item.key === activeTab) || data.navigation[0]

  return (
    <main className="min-h-screen bg-[#eef1f4] px-4 py-8 text-[#111827] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-8">
        <header className="flex flex-col gap-5 border-b border-[#c8ced8] pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667085]">{data.meta.routeContext}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-normal text-[#111827]">{data.meta.title}</h1>
            <p className="mt-3 max-w-4xl text-lg leading-8 text-[#475467]">{data.meta.subtitle}</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-[#c8ced8] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#475467]">
            {data.meta.mode}
          </span>
        </header>

        <nav className="flex gap-2 overflow-x-auto rounded-lg border border-[#d8dde5] bg-white p-2 [scrollbar-width:thin]" aria-label="Property intelligence sections">
          {data.navigation.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`inline-flex h-11 shrink-0 items-center justify-center rounded-md px-4 text-sm font-semibold transition ${
                activeTab === item.key
                  ? 'bg-[#111827] text-white'
                  : 'text-[#475467] hover:bg-[#f3f5f7] hover:text-[#111827]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {activeNavItem?.key === 'overview' ? (
          <OverviewContent data={data} />
        ) : activeNavItem?.key === 'market-intelligence' ? (
          <MarketIntelligenceContent data={data} />
        ) : activeNavItem?.key === 'forecasting' ? (
          <ForecastingContent data={data} />
        ) : activeNavItem?.key === 'bank-intelligence' ? (
          <BankIntelligenceContent data={data} />
        ) : activeNavItem?.key === 'partner-intelligence' ? (
          <PartnerIntelligenceContent data={data} />
        ) : activeNavItem?.key === 'capacity-planning' ? (
          <CapacityPlanningContent data={data} />
        ) : activeNavItem?.key === 'ai-recommendations' ? (
          <AiRecommendationsContent data={data} />
        ) : activeNavItem?.key === 'scenario-simulator' ? (
          <ScenarioSimulatorContent data={data} />
        ) : (
          <FutureReleaseState label={activeNavItem?.label} message={data.meta.futureReleaseMessage} />
        )}
      </div>
    </main>
  )
}
