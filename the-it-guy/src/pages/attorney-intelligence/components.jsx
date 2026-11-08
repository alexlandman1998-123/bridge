import { ChevronRight, Sparkles, TrendingUp } from 'lucide-react'
import { formatCurrency } from './formatters'

export function IntelligenceShell({ title, subtitle, children }) {
  return <main className="intelligence-shell min-w-0 w-full space-y-6">
    <header className="ui-workspace-header">
      <div className="min-w-0">
        <h1>{title || 'Attorney intelligence'}</h1>
        {subtitle ? <p className="mt-2 text-sm leading-6 text-textMuted">{subtitle}</p> : null}
        <span className="mt-3 inline-flex rounded-full border border-[#d8e5f3] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#5b738f]">Preview · simulated data</span>
      </div>
    </header>
    {children}
  </main>
}

export function IntelligenceKpiCard({ label, value, subtext, tone = 'blue' }) {
  const toneClass =
    tone === 'green'
      ? 'border-[#cfe9dc] bg-[linear-gradient(180deg,#f7fdf9_0%,#eff9f3_100%)]'
      : tone === 'amber'
        ? 'border-[#ecdcbf] bg-[linear-gradient(180deg,#fffdf8_0%,#fff7ed_100%)]'
        : 'border-[#dbe8f6] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)]'

  return (
    <article className={`rounded-2xl border px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${toneClass}`}>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6d839d]">{label}</p>
      <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.05em] text-[#142132]">{value}</p>
      <p className="mt-2 text-[0.84rem] leading-6 text-[#61768d]">{subtext}</p>
    </article>
  )
}

export function OpportunityScoreBadge({ score }) {
  return (
    <span className="inline-flex shrink-0 items-center self-start whitespace-nowrap rounded-full border border-[#d6e7f9] bg-[#f4f9ff] px-3 py-1 text-[0.75rem] font-semibold leading-none text-[#346792]">
      Opportunity Score {score}/100
    </span>
  )
}

export function AiInsightPanel({ title = 'AI Insight', copy, ctaLabel = null }) {
  return (
    <section className="rounded-2xl border border-[#d9e5f2] bg-[linear-gradient(155deg,#ffffff_0%,#f2f7ff_65%,#edf3ff_100%)] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-2 text-[#355f88]">
        <Sparkles size={15} />
        <h4 className="text-[0.82rem] font-semibold uppercase tracking-[0.1em]">{title}</h4>
      </div>
      <p className="mt-2.5 text-[0.9rem] leading-7 text-[#495f77]">{copy}</p>
      {ctaLabel ? (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#c7daee] bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-[#355f88] transition hover:bg-[#f7fbff]"
        >
          {ctaLabel}
          <ChevronRight size={13} />
        </button>
      ) : null}
    </section>
  )
}

export function MetricBar({ label, value, percent, tone = 'blue', helper = null }) {
  const barClass = tone === 'green' ? 'bg-[#2f8a63]' : tone === 'amber' ? 'bg-[#ae7a2f]' : tone === 'purple' ? 'bg-[#6f4dcf]' : 'bg-[#3c78a8]'
  return (
    <div className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.9rem] font-medium text-[#22374d]">{label}</span>
        <span className="text-[0.88rem] font-semibold text-[#142132]">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#e2ebf5]">
        <span className={`block h-full rounded-full ${barClass}`} style={{ width: `${Math.max(4, Math.min(100, percent || 0))}%` }} />
      </div>
      {helper ? <p className="mt-1.5 text-[0.75rem] text-[#6a7e95]">{helper}</p> : null}
    </div>
  )
}

export function RankList({ items, valueKey = 'value', formatter = null }) {
  return (
    <div className="space-y-2.5">
      {items.map((item, index) => {
        const value = formatter ? formatter(item[valueKey], item) : item[valueKey]
        return (
          <article key={`${item.name}-${index}`} className="rounded-xl border border-[#dce6f2] bg-white px-3.5 py-3 transition hover:shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[0.9rem] font-semibold text-[#1e3349]">{index + 1}. {item.name}</p>
                {item.subtext ? <p className="mt-0.5 text-[0.76rem] text-[#6f849b]">{item.subtext}</p> : null}
              </div>
              <p className="shrink-0 text-[0.88rem] font-semibold text-[#142132]">{value}</p>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function RevenueBarChart({ items, valueKey = 'value' }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1)
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const raw = Number(item[valueKey] || 0)
        const width = (raw / maxValue) * 100
        return (
          <div key={item.month} className="rounded-xl border border-[#dbe6f2] bg-white px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.86rem] font-medium text-[#22374d]">{item.month}</p>
              <p className="text-[0.86rem] font-semibold text-[#142132]">{formatCurrency(raw)}</p>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-[#e2ebf5]">
              <span className="block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#6f90ab_100%)]" style={{ width: `${Math.max(8, width)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AreaHeatTile({ area }) {
  const levelTone =
    area.opportunityLevel === 'High'
      ? 'border-[#c8e8d6] bg-[#f3fdf7] text-[#216644]'
      : area.opportunityLevel === 'Medium'
        ? 'border-[#ecdcbf] bg-[#fffaf2] text-[#835c22]'
        : 'border-[#d6e4f3] bg-[#f6faff] text-[#355f88]'

  return (
    <article className="rounded-xl border border-[#dce7f2] bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.92rem] font-semibold text-[#1f3348]">{area.name}</h4>
        <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${levelTone}`}>
          {area.opportunityLevel}
        </span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[#e4ecf6]">
        <span className="block h-full rounded-full bg-[#4f7da6]" style={{ width: `${Math.max(8, Math.min(100, area.heat || 0))}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[0.75rem] text-[#6c8198]">
        <span>{area.monthlyTransactions} tx/mo</span>
        <span>{formatCurrency(area.estimatedOpportunity)}/mo</span>
      </div>
    </article>
  )
}

export function MiniAvatar({ label, tone = 'blue' }) {
  const toneClass = tone === 'green' ? 'from-[#3f8d69] to-[#2d6d4f]' : tone === 'purple' ? 'from-[#6f4dcf] to-[#4f38a5]' : 'from-[#4f7da6] to-[#2f4f72]'
  return <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${toneClass} text-[0.78rem] font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.18)]`}>{label}</span>
}

export function SoftCtaButton({ label }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-[#c9daec] bg-white px-3.5 py-1.5 text-[0.78rem] font-semibold text-[#355f88] transition hover:bg-[#f7fbff]"
    >
      {label}
      <ChevronRight size={13} />
    </button>
  )
}

export function TrendPill({ value, direction = 'up' }) {
  const tone = direction === 'up' ? 'text-[#2f8a63] bg-[#f2fbf6] border-[#cae8d7]' : 'text-[#b54645] bg-[#fff4f4] border-[#efcaca]'
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${tone}`}><TrendingUp size={11} className={direction === 'down' ? 'rotate-180' : ''} />{value}</span>
}
