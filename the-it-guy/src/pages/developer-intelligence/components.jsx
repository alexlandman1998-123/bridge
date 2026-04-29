import { BrainCircuit, ChevronRight, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react'
import { formatCurrency } from './formatters'

export function IntelligenceShell({ sectionTitle, sectionSubtitle, children, headerRight = null }) {
  return (
    <main className="space-y-6 rounded-[30px] border border-[#d9e5f2] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f4f8fd_48%,#edf3fa_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-[#142132] lg:text-[1.9rem]">Developer Intelligence (Beta)</h1>
          <p className="mt-2 max-w-3xl text-[0.95rem] leading-7 text-[#607389]">
            Autonomous, predictive, revenue-driven intelligence powered by live transaction data across the property ecosystem.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center rounded-full border border-[#d8e5f3] bg-[#f7fbff] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#5b738f]">
              Preview Mode — simulated data for demonstration
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cae8d7] bg-[#f2fcf7] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#2f7f58]">
              <BrainCircuit size={13} /> Bridge AI Active
            </span>
          </div>
        </div>

        <article className="w-full max-w-[300px] rounded-2xl border border-[#dbe8f5] bg-white/80 px-4 py-4 shadow-[0_14px_28px_rgba(15,23,42,0.07)] backdrop-blur sm:w-auto">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6d839d]">Intelligence Layer</p>
          <p className="mt-2 text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{sectionTitle}</p>
          <p className="mt-1 text-[0.83rem] leading-6 text-[#637a92]">{sectionSubtitle}</p>
          {headerRight}
        </article>
      </header>

      {children}

      <footer className="rounded-2xl border border-[#dce7f4] bg-white/80 px-4 py-3 text-[0.8rem] text-[#62768d]">
        Simulated intelligence preview. Data shown for demonstration purposes only.
      </footer>
    </main>
  )
}

export function IntelligenceKpiCard({ label, value, subtext, tone = 'blue' }) {
  const toneClass =
    tone === 'green'
      ? 'border-[#cfe9dc] bg-[linear-gradient(180deg,#f7fdf9_0%,#eff9f3_100%)]'
      : tone === 'amber'
        ? 'border-[#ecdcbf] bg-[linear-gradient(180deg,#fffdf8_0%,#fff7ed_100%)]'
        : 'border-[#dbe8f6] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)]'

  return (
    <article className={`rounded-2xl border px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-300 hover:scale-[1.01] ${toneClass}`}>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6d839d]">{label}</p>
      <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.05em] text-[#142132]">{value}</p>
      <p className="mt-2 text-[0.84rem] leading-6 text-[#61768d]">{subtext}</p>
    </article>
  )
}

export function ScoreBadge({ score, label = 'Opportunity Score' }) {
  const scoreClass = score >= 80 ? 'text-[#1f7a4f] bg-[#f1fcf6] border-[#cae8d7]' : score >= 60 ? 'text-[#8a6629] bg-[#fff9ef] border-[#ecdcbf]' : 'text-[#9a3e3d] bg-[#fff4f4] border-[#efcaca]'
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.08em] ${scoreClass}`}>
      {label}: {score}/100
    </span>
  )
}

export function OpportunityCard({ title, value, detail, ctaLabel = 'View Opportunity', icon: Icon }) {
  return (
    <article className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4 transition hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6e849f]">{title}</p>
          <p className="mt-1.5 text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">{value}</p>
        </div>
        {Icon ? (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8e5f3] bg-white text-[#355f88]">
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[0.84rem] leading-6 text-[#61768f]">{detail}</p>
      <div className="mt-3">
        <SoftCtaButton label={ctaLabel} />
      </div>
    </article>
  )
}

export function InsightCard({ title, children, className = '' }) {
  return (
    <article className={`rounded-2xl border border-[#dce6f2] bg-white/90 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] ${className}`}>
      <h3 className="text-[1.06rem] font-semibold tracking-[-0.02em] text-[#162538]">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </article>
  )
}

export function MetricRow({ label, value, helper = null, percent = null, color = 'bg-[#3c78a8]' }) {
  const clamped = typeof percent === 'number' ? Math.max(4, Math.min(100, percent)) : null
  return (
    <div className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.9rem] font-medium text-[#22374d]">{label}</span>
        <span className="text-[0.88rem] font-semibold text-[#142132]">{value}</span>
      </div>
      {clamped ? (
        <div className="mt-2 h-2 rounded-full bg-[#e2ebf5]">
          <span className={`block h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
        </div>
      ) : null}
      {helper ? <p className="mt-1.5 text-[0.75rem] text-[#6a7e95]">{helper}</p> : null}
    </div>
  )
}

export function TrendBullet({ text, trend = 'up' }) {
  const tone = trend === 'up' ? 'border-[#cae8d7] bg-[#f2fbf6] text-[#2f7f58]' : 'border-[#ecdcc0] bg-[#fff8ef] text-[#8b6324]'
  const Icon = trend === 'up' ? TrendingUp : TrendingDown
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[0.84rem] ${tone}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

export function AiRecommendationPanel({ recommendations, confidence }) {
  return (
    <section className="rounded-2xl border border-[#d9e5f2] bg-[linear-gradient(155deg,#ffffff_0%,#f2f7ff_65%,#edf3ff_100%)] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#355f88]">
          <Sparkles size={15} />
          <h4 className="text-[0.82rem] font-semibold uppercase tracking-[0.1em]">AI Recommendations</h4>
        </div>
        {typeof confidence === 'number' ? <ScoreBadge score={confidence} label="Confidence Score" /> : null}
      </div>
      <ul className="mt-3 space-y-2.5">
        {recommendations.map((recommendation) => (
          <li key={recommendation} className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3 text-[0.88rem] text-[#355068]">
            {recommendation}
          </li>
        ))}
      </ul>
    </section>
  )
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

export function SimpleDonut({ value, total = 100, color = '#3C78A8', size = 170, trackColor = '#dbe8f5', centerLabel = null }) {
  const safeTotal = Math.max(1, Number(total) || 1)
  const safeValue = Math.max(0, Math.min(safeTotal, Number(value) || 0))
  const pct = (safeValue / safeTotal) * 100
  const deg = Math.max(0, Math.min(360, (pct / 100) * 360))
  return (
    <div
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${deg}deg, ${trackColor} ${deg}deg 360deg)`,
      }}
    >
      <div className="absolute inset-[18%] flex items-center justify-center rounded-full bg-white shadow-inner">
        <span className="text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">{centerLabel ?? Math.round(safeValue)}</span>
      </div>
    </div>
  )
}

export function FeasibilityModal({ open, onClose, scenario }) {
  if (!open) {
    return null
  }

  const scoreToneClass = scenario.score >= 80 ? 'text-[#1f7a4f] border-[#cae8d7] bg-[#f2fbf6]' : scenario.score >= 60 ? 'text-[#8b6324] border-[#ecdcc0] bg-[#fff8ef]' : 'text-[#9a3e3d] border-[#efcaca] bg-[#fff4f4]'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#081423]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-[28px] border border-[#dbe7f4] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f5f9ff_52%,#edf3fa_100%)] p-6 shadow-[0_34px_80px_rgba(8,20,35,0.42)]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[1.8rem] font-semibold tracking-[-0.04em] text-[#142132]">AI Development Feasibility</h2>
            <p className="mt-2 max-w-3xl text-[0.94rem] leading-7 text-[#607389]">
              Evaluate development opportunities using real-time market behaviour, demand signals, and predictive modelling.
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6e4f2] bg-white text-[#57718d] transition hover:bg-[#f6faff]" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          <div className="flex flex-wrap gap-2.5">
            {[
              `Area: ${scenario.area}`,
              `Land Size: ${scenario.landSize}`,
              `Project Type: ${scenario.projectType}`,
              `Estimated Units: ${scenario.estimatedUnits}`,
            ].map((pill) => (
              <span key={pill} className="inline-flex rounded-full border border-[#d8e5f3] bg-white px-3 py-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#60758f]">
                {pill}
              </span>
            ))}
          </div>

          <article className={`rounded-2xl border px-4 py-4 ${scoreToneClass}`}>
            <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em]">Feasibility Score</p>
            <p className="mt-2 text-[2.1rem] font-semibold tracking-[-0.06em]">{scenario.score} / 100</p>
            <p className="text-[0.9rem] font-medium">{scenario.label}</p>
          </article>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-3">
          <InsightCard title="Market Behaviour (Live)">
            {scenario.marketBehaviour.map((item) => (
              <TrendBullet key={item.text} text={item.text} trend={item.trend === 'up' ? 'up' : 'down'} />
            ))}
          </InsightCard>

          <InsightCard title="Demand vs Supply">
            {scenario.demandSupply.map((item) => (
              <MetricRow key={item.label} label={item.label} value={item.state} percent={item.percent} />
            ))}
          </InsightCard>

          <InsightCard title="Pricing Intelligence">
            <MetricRow label="Optimal range" value={scenario.pricing.optimalRange} />
            <MetricRow label="Current plan" value={scenario.pricing.planned} helper="Above target market range" />
            <MetricRow label="Suggested adjustment" value={scenario.pricing.adjustment} helper="Reduce to improve conversion" percent={75} color="bg-[#2f8a63]" />
          </InsightCard>
        </section>

        <section className="mt-5 rounded-2xl border border-[#d9e5f3] bg-white/90 p-5 shadow-[0_14px_28px_rgba(15,23,42,0.06)]">
          <h3 className="text-[1.06rem] font-semibold tracking-[-0.02em] text-[#162538]">AI Revenue & Absorption Projection</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricRow label="Estimated Revenue" value={formatCurrency(scenario.projection.revenue)} helper="Based on current market behaviour" />
            <MetricRow label="Absorption Rate" value={scenario.projection.absorption} helper="Projected monthly velocity" />
            <MetricRow label="Time to Sell Out" value={scenario.projection.sellOut} helper="Estimated timeline" />
            <MetricRow label="Conversion Rate" value={scenario.projection.conversion} helper="Predicted from similar stock" percent={68} color="bg-[#2f8a63]" />
          </div>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <InsightCard title="Risk Factors Detected">
            {scenario.risks.map((risk) => (
              <div key={risk} className="rounded-xl border border-[#efcaca] bg-[#fff4f4] px-3.5 py-3 text-[0.86rem] text-[#8f4443]">
                {risk}
              </div>
            ))}
          </InsightCard>

          <AiRecommendationPanel recommendations={scenario.recommendations} confidence={scenario.confidenceScore} />
        </section>

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button type="button" className="rounded-full border border-[#c9dcec] bg-white px-4 py-2 text-[0.84rem] font-semibold text-[#355f88] transition hover:bg-[#f6faff]">Export Feasibility Report</button>
          <button type="button" className="rounded-full border border-[#c9dcec] bg-white px-4 py-2 text-[0.84rem] font-semibold text-[#355f88] transition hover:bg-[#f6faff]">Save Scenario</button>
          <button type="button" className="rounded-full border border-[#2f628d] bg-[#315f86] px-4 py-2 text-[0.84rem] font-semibold text-white shadow-[0_12px_26px_rgba(49,95,134,0.25)] transition hover:bg-[#2a5577]">Compare Alternative Site</button>
        </div>
      </div>
    </div>
  )
}
