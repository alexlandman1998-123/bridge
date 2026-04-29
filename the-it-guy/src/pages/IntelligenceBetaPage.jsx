import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Building2,
  ChevronRight,
  CircleAlert,
  Download,
  FileStack,
  Gauge,
  GitCompareArrows,
  Landmark,
  Lightbulb,
  Radar,
  Scale,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Users2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

function IntelligenceKpiCard({ title, value, subtext, icon: Icon, tone = 'blue' }) {
  const toneClass =
    tone === 'green'
      ? 'from-[#f3fcf8] to-[#f9fffc] border-[#d6ebdf]'
      : tone === 'amber'
        ? 'from-[#fffaf2] to-[#fffdf8] border-[#ece1cb]'
        : tone === 'indigo'
          ? 'from-[#f6f7ff] to-[#fcfcff] border-[#dfe2fa]'
          : 'from-[#f3f8ff] to-[#fbfdff] border-[#d7e5f4]'
  return (
    <article className={`rounded-[22px] border bg-gradient-to-br p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-[#6e8298]">{title}</p>
          <p className="mt-2 text-[1.7rem] font-semibold leading-none tracking-[-0.04em] text-[#142132]">{value}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d6e4f3] bg-white/80 text-[#375f86]">
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-3 text-[0.86rem] leading-6 text-[#6b7d93]">{subtext}</p>
    </article>
  )
}

function StatusBadge({ label, tone = 'neutral' }) {
  const className =
    tone === 'danger'
      ? 'border-[#efc9c8] bg-[#fff4f4] text-[#b54645]'
      : tone === 'warning'
        ? 'border-[#edd8b4] bg-[#fff9ef] text-[#a37627]'
        : tone === 'success'
          ? 'border-[#cae8d7] bg-[#f2fbf6] text-[#2b7c55]'
          : 'border-[#d9e5f2] bg-[#f7fafe] text-[#536b86]'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${className}`}>{label}</span>
}

function IntelligenceInsightCard({ title, copy, icon: Icon, children, footer, className = '' }) {
  return (
    <article className={`rounded-[24px] border border-[#dce6f2] bg-white/75 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-[1px] ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h3>
          <p className="mt-2 text-[0.93rem] leading-7 text-[#6b7d93]">{copy}</p>
        </div>
        {Icon ? (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8e5f3] bg-[#f7fafe] text-[#375f86]">
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </article>
  )
}

function MetricBar({ label, valueLabel, percent, tone = 'blue' }) {
  const color = tone === 'green' ? '#2f8a63' : tone === 'amber' ? '#b17c30' : '#3f78a8'
  return (
    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.95rem] font-medium text-[#233448]">{label}</p>
        <p className="shrink-0 text-[0.95rem] font-semibold text-[#142132]">{valueLabel}</p>
      </div>
      <div className="mt-2.5 h-1.5 rounded-full bg-[#dfe8f3]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, percent))}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function FeasibilityMetricTile({ label, value, helper }) {
  return (
    <article className="rounded-2xl border border-[#dbe6f2] bg-white/80 px-4 py-4 backdrop-blur-sm">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#70849d]">{label}</p>
      <p className="mt-2 text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{value}</p>
      <p className="mt-1.5 text-[0.83rem] text-[#61748b]">{helper}</p>
    </article>
  )
}

function DemandSignalRow({ label, valueLabel, percent, tone = 'blue' }) {
  const toneStyles =
    tone === 'green'
      ? { bar: 'bg-[#2f8a63]', text: 'text-[#2f8a63]' }
      : tone === 'amber'
        ? { bar: 'bg-[#b17c30]', text: 'text-[#9b6c28]' }
        : { bar: 'bg-[#3f78a8]', text: 'text-[#3f78a8]' }
  return (
    <div className="rounded-xl border border-[#dbe6f2] bg-white/75 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#24384d]">{label}</p>
        <p className={`shrink-0 text-sm font-semibold ${toneStyles.text}`}>{valueLabel}</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#dfe8f2]">
        <span className={`block h-full rounded-full ${toneStyles.bar}`} style={{ width: `${Math.max(6, Math.min(100, percent))}%` }} />
      </div>
    </div>
  )
}

function FeasibilityModal({ open, entered, onClose }) {
  if (!open) return null

  return (
    <div
      className={`fixed inset-0 z-[120] bg-[#0f1729]/55 px-3 py-3 backdrop-blur-[3px] transition-opacity duration-200 sm:px-5 sm:py-5 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="AI Development Feasibility"
        className={`mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[30px] border border-[#d8e5f3] bg-[linear-gradient(180deg,#f7fbff_0%,#eef5fd_100%)] shadow-[0_40px_110px_rgba(15,23,42,0.35)] transition-all duration-200 ${
          entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.985] opacity-0'
        }`}
      >
        <header className="border-b border-[#d7e4f2] bg-white/70 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#d8e5f3] bg-[#f6faff] px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#5c728d]">
                <Sparkles size={13} />
                Based on live data
              </p>
              <h2 className="mt-3 text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132] sm:text-[1.85rem]">
                AI Development Feasibility
              </h2>
              <p className="mt-1.5 max-w-3xl text-[0.92rem] leading-7 text-[#61748b]">
                Evaluate development opportunities using real-time market behaviour, demand signals, and predictive modelling.
              </p>
            </div>
            <div className="flex shrink-0 items-start gap-3">
              <article className="rounded-2xl border border-[#cde7d8] bg-[linear-gradient(180deg,#f3fdf7_0%,#eefaf3_100%)] px-4 py-3 text-right shadow-[0_12px_24px_rgba(47,138,99,0.16)]">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#327f58]">Feasibility Score</p>
                <p className="mt-1 text-[2rem] font-semibold leading-none tracking-[-0.05em] text-[#1f5d3e]">82 / 100</p>
                <p className="mt-1 text-[0.82rem] font-semibold text-[#2f8a63]">Strong Opportunity</p>
              </article>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e5f3] bg-white/85 text-[#4f647b] transition hover:bg-white"
                aria-label="Close feasibility modal"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-6">
            <section className="rounded-2xl border border-[#dbe6f2] bg-white/75 p-4 backdrop-blur">
              <div className="flex flex-wrap gap-2.5">
                {[
                  'Area: Pretoria East',
                  'Land Size: 4,200m²',
                  'Project Type: Residential',
                  'Estimated Units: 48',
                ].map((item) => (
                  <span key={item} className="inline-flex items-center rounded-full border border-[#d6e4f1] bg-[#f7fbff] px-3 py-1.5 text-[0.78rem] font-semibold text-[#476487]">
                    {item}
                  </span>
                ))}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-[#dce6f2] bg-white/80 p-5 backdrop-blur">
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Market Behaviour (Live)</h3>
                <div className="mt-4 grid gap-2.5">
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-[#d7e7f4] bg-[#f7fbff] px-3.5 py-3">
                    <p className="text-sm leading-6 text-[#24384d]">2-bed units under R1.35M are converting 34% faster</p>
                    <span className="shrink-0 text-sm font-semibold text-[#2f8a63]">↑ 34%</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-[#efddc5] bg-[#fffaf2] px-3.5 py-3">
                    <p className="text-sm leading-6 text-[#24384d]">Deals above R1.6M showing 28% fall-through rate</p>
                    <span className="shrink-0 text-sm font-semibold text-[#b17c30]">↓ 28%</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-[#efddc5] bg-[#fffaf2] px-3.5 py-3">
                    <p className="text-sm leading-6 text-[#24384d]">Buyer affordability tightening in last 30 days</p>
                    <span className="shrink-0 text-sm font-semibold text-[#b17c30]">Detected</span>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-[#dce6f2] bg-white/80 p-5 backdrop-blur">
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Demand vs Supply</h3>
                <div className="mt-4 grid gap-2.5">
                  <DemandSignalRow label="2-bed" valueLabel="High Demand / Low Supply" percent={88} tone="green" />
                  <DemandSignalRow label="3-bed" valueLabel="Stable Demand" percent={62} tone="blue" />
                  <DemandSignalRow label="Luxury Units" valueLabel="Oversupplied" percent={31} tone="amber" />
                </div>
              </article>

              <article className="rounded-2xl border border-[#dce6f2] bg-white/80 p-5 backdrop-blur">
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Pricing Intelligence</h3>
                <div className="mt-4 grid gap-2.5">
                  <div className="rounded-xl border border-[#d7e7f4] bg-[#f7fbff] px-3.5 py-3">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#67809b]">Optimal Range</p>
                    <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#1f3852]">R1.25M – R1.4M</p>
                  </div>
                  <div className="rounded-xl border border-[#efddc5] bg-[#fffaf2] px-3.5 py-3">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#9b6c28]">Current Plan</p>
                    <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#7c5720]">R1.5M (Above market)</p>
                  </div>
                  <div className="rounded-xl border border-[#cae8d7] bg-[#f3fbf7] px-3.5 py-3">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#2f8a63]">Recommended Adjustment</p>
                    <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#1f5d3e]">-5%</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="rounded-2xl border border-[#dce6f2] bg-white/80 p-5 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <Gauge size={16} className="text-[#3f78a8]" />
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">AI Revenue & Absorption Projection</h3>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FeasibilityMetricTile label="Estimated Revenue" value="R62.4M" helper="Predicted from live conversion behaviour" />
                <FeasibilityMetricTile label="Absorption Rate" value="6–8 units / month" helper="Detected from area demand velocity" />
                <FeasibilityMetricTile label="Time to Sell Out" value="7 months" helper="Predicted timeline at current pricing mix" />
                <FeasibilityMetricTile label="Conversion Rate" value="68%" helper="Based on current market behaviour" />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_1.3fr]">
              <article className="rounded-2xl border border-[#ecd4c0] bg-[linear-gradient(180deg,#fffaf5_0%,#fff7f0_100%)] p-5">
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Risk Factors Detected</h3>
                <div className="mt-4 grid gap-2.5">
                  {[
                    'No bulk services detected — add infrastructure cost',
                    'Overexposure to bond-dependent buyers',
                    'Pricing above current absorption threshold',
                  ].map((item, index) => (
                    <div
                      key={item}
                      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
                        index === 0
                          ? 'border-[#eecbc8] bg-[#fff4f4]'
                          : 'border-[#efddc5] bg-[#fffaf2]'
                      }`}
                    >
                      <CircleAlert size={15} className={index === 0 ? 'mt-0.5 text-[#b54645]' : 'mt-0.5 text-[#b17c30]'} />
                      <p className={`text-sm leading-6 ${index === 0 ? 'text-[#8f4342]' : 'text-[#7f5c23]'}`}>{item}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-[#d8e6f3] bg-[linear-gradient(125deg,#f5fafe_0%,#f0f8ff_42%,#edf5ff_100%)] p-5 shadow-[0_18px_38px_rgba(63,120,168,0.14)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">AI Recommendations</h3>
                  <span className="inline-flex items-center rounded-full border border-[#cce0f3] bg-white/90 px-3 py-1 text-[0.75rem] font-semibold text-[#335f86]">
                    Confidence Score: 89%
                  </span>
                </div>
                <div className="mt-4 grid gap-2.5">
                  {[
                    'Reduce pricing by 4–6% to improve conversion',
                    'Increase allocation of 2-bed units by 20%',
                    'Phase release to prioritise smaller units',
                    'Consider alternative segment for Phase 2',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-2.5 rounded-xl border border-[#d3e3f2] bg-white/85 px-3.5 py-3 text-sm leading-6 text-[#26405a]">
                      <Sparkles size={14} className="mt-1 shrink-0 text-[#3f78a8]" />
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </div>
        </div>

        <footer className="border-t border-[#d7e4f2] bg-white/75 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.82rem] text-[#61748b]">Simulated intelligence preview. Data shown for demonstration purposes only.</p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-[13px] border border-[#d3e2f1] bg-white px-4 py-2 text-sm font-semibold text-[#284864] transition hover:bg-[#f8fbff]"
              >
                <Download size={15} />
                Export Feasibility Report
              </button>
              <button
                type="button"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-[13px] border border-[#d3e2f1] bg-white px-4 py-2 text-sm font-semibold text-[#284864] transition hover:bg-[#f8fbff]"
              >
                <Save size={15} />
                Save Scenario
              </button>
              <button
                type="button"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-[13px] border border-[#2f5f86] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition hover:bg-[#2f4b62]"
              >
                <GitCompareArrows size={15} />
                Compare Alternative Site
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  )
}

const DEVELOPER_DATA = {
  kpis: [
    {
      title: 'Predicted Sales Next 30 Days',
      value: '24 Units',
      subtext: '87% confidence based on current deal velocity',
      icon: TrendingUp,
      tone: 'blue',
    },
    {
      title: 'Revenue Forecast',
      value: 'R38.4M',
      subtext: 'Projected from active pipeline and buyer behaviour',
      icon: BarChart3,
      tone: 'indigo',
    },
    {
      title: 'Market Share by Value',
      value: '6.8%',
      subtext: 'Up 1.2% in Pretoria East',
      icon: Radar,
      tone: 'green',
    },
    {
      title: 'At-Risk Deals',
      value: '9',
      subtext: 'Pricing and finance delays detected',
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      title: 'Growth Opportunity',
      value: 'R112M',
      subtext: 'Undersupplied 2-bed segment identified',
      icon: Sparkles,
      tone: 'green',
    },
  ],
  assistant: [
    'Adjust Phase 2 pricing by 3–5% to improve absorption',
    'Prioritise 2-bed stock in next release',
    'Reduce dependency on top 2 agencies',
    'Explore Boksburg sectional title opportunity',
  ],
}

const ATTORNEY_DATA = {
  kpis: [
    {
      title: 'Predicted Registrations Next 30 Days',
      value: '31',
      subtext: '91% confidence based on current file progress',
      icon: Scale,
      tone: 'blue',
    },
    {
      title: 'Revenue Forecast',
      value: 'R2.7M',
      subtext: 'Projected from active transfer pipeline',
      icon: BarChart3,
      tone: 'indigo',
    },
    {
      title: 'Market Share by Volume',
      value: '4.4%',
      subtext: 'Up 0.8% across assigned regions',
      icon: Radar,
      tone: 'green',
    },
    {
      title: 'At-Risk Transfers',
      value: '7',
      subtext: 'FICA and guarantee delays detected',
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      title: 'New Partner Opportunities',
      value: '12',
      subtext: 'High-performing agents identified in network',
      icon: Users2,
      tone: 'green',
    },
  ],
  assistant: [
    'Prioritise 7 at-risk transfers today',
    'Follow up on guarantee delays',
    'Rebalance workload across transfer team',
    'Connect with 3 high-volume agents this week',
  ],
}

function DeveloperContent() {
  return (
    <>
      <IntelligenceInsightCard
        title="AI Development Strategy"
        copy="Bridge AI analyses live transaction behaviour to recommend what to build, where to build, and how to price it."
        icon={BrainCircuit}
        footer={<StatusBadge label="Confidence Score: 89%" tone="success" />}
      >
        <div className="grid gap-2.5">
          {[
            'Build more 2-bed units under R1.35M in Pretoria East',
            'Reduce exposure to bond-heavy buyer segments in Phase 2',
            'Release smaller units first to accelerate early cash flow',
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3.5 py-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#3f78a8]" />
              <p className="text-[0.92rem] leading-6 text-[#26384c]">{item}</p>
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Market Demand & Supply Gaps"
        copy="Live demand signals show where the market is undersupplied and which products are converting fastest."
        icon={TrendingUp}
      >
        <div className="grid gap-2.5">
          <MetricBar label="2-bed units" valueLabel="High demand / Low supply" percent={88} tone="green" />
          <MetricBar label="3-bed units" valueLabel="Stable demand / Moderate supply" percent={64} />
          <MetricBar label="Units above R1.8M" valueLabel="Slowing conversion" percent={35} tone="amber" />
          <MetricBar label="Cash buyers (selected nodes)" valueLabel="Increasing" percent={73} tone="green" />
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Business Risk Detection"
        copy="Bridge detects risks before they appear in retrospective reports."
        icon={AlertTriangle}
      >
        <div className="grid gap-2.5">
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#ebc9c9] bg-[#fff5f5] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#8b4242]">62% of sales pipeline dependent on 2 agencies</p>
            <StatusBadge label="At Risk" tone="danger" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#edd8b4] bg-[#fffaf2] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#7f5c23]">Finance delays increased by 14% this month</p>
            <StatusBadge label="Detected" tone="warning" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#edd8b4] bg-[#fffaf2] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#7f5c23]">Deals above R1.6M showing higher fall-through risk</p>
            <StatusBadge label="Watch" tone="warning" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#ebc9c9] bg-[#fff5f5] px-3.5 py-2.5">
            <p className="text-[0.9rem] text-[#8b4242]">Phase 3 pricing may exceed current absorption levels</p>
            <StatusBadge label="At Risk" tone="danger" />
          </div>
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Growth & Network Opportunities"
        copy="Bridge identifies partners, suppliers, and areas that can unlock growth."
        icon={Lightbulb}
        footer={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[12px] border border-[#d4e3f2] bg-[#f5fafe] px-3.5 py-2 text-[0.86rem] font-semibold text-[#2f5f8b]"
          >
            View Recommended Partners <ChevronRight size={15} />
          </button>
        }
      >
        <div className="grid gap-2.5">
          {[
            '5 high-performing agencies recommended for Pretoria East',
            '3 bond originators showing faster approval performance',
            'Supplier opportunity: introduce preferred transfer support partner',
            'Growth node detected: Boksburg sectional title market',
          ].map((item) => (
            <div key={item} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3.5 py-3 text-[0.9rem] text-[#26384c]">
              {item}
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>
    </>
  )
}

function AttorneyContent() {
  return (
    <>
      <IntelligenceInsightCard
        title="Autonomous Transaction Engine"
        copy="Bridge AI monitors every transfer, triggers next steps, and escalates only when human attention is required."
        icon={Activity}
        footer={<StatusBadge label="AI Operating Layer Active" tone="success" />}
      >
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {[
            ['42', 'active files monitored'],
            ['18', 'automatic client follow-ups triggered'],
            ['9', 'document requests issued'],
            ['5', 'files escalated for review'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3 py-3">
              <p className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{value}</p>
              <p className="mt-1 text-[0.8rem] leading-5 text-[#5f738a]">{label}</p>
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Predictive Registration Engine"
        copy="Bridge predicts expected registration dates based on live file progress, partner response time, and transaction patterns."
        icon={ShieldCheck}
      >
        <div className="grid gap-2.5">
          <MetricBar label="Registrations predicted in next 30 days" valueLabel="31" percent={91} tone="green" />
          <MetricBar label="Likely to register within 10 business days" valueLabel="14 files" percent={74} />
          <MetricBar label="At risk of missing expected registration date" valueLabel="7 files" percent={36} tone="amber" />
          <MetricBar label="Average confidence score" valueLabel="91%" percent={91} tone="green" />
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Revenue & Market Position"
        copy="Bridge forecasts revenue and tracks the firm’s market position by value and volume."
        icon={Landmark}
      >
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ['Projected revenue this month', 'R2.7M'],
            ['Market share by volume', '4.4%'],
            ['Market share by value', '5.1%'],
            ['Development transfers increased', '18%'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3 py-3">
              <p className="text-[0.78rem] uppercase tracking-[0.09em] text-[#71859d]">{label}</p>
              <p className="mt-1 text-[1.22rem] font-semibold tracking-[-0.02em] text-[#142132]">{value}</p>
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>

      <IntelligenceInsightCard
        title="Partner Growth Engine"
        copy="Bridge identifies new business opportunities through the transaction network."
        icon={Building2}
        footer={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[12px] border border-[#d4e3f2] bg-[#f5fafe] px-3.5 py-2 text-[0.86rem] font-semibold text-[#2f5f8b]"
          >
            View Growth Opportunities <ChevronRight size={15} />
          </button>
        }
      >
        <div className="grid gap-2.5">
          {[
            '12 high-value agent connections recommended',
            '4 developers with growing transaction volume identified',
            '2 under-served areas showing legal service demand',
            'Referral concentration risk detected: 58% from 3 partners',
          ].map((item) => (
            <div key={item} className="rounded-[14px] border border-[#dce7f3] bg-[#f9fcff] px-3.5 py-3 text-[0.9rem] text-[#26384c]">
              {item}
            </div>
          ))}
        </div>
      </IntelligenceInsightCard>
    </>
  )
}

export default function IntelligenceBetaPage() {
  const { role } = useWorkspace()
  const isAttorney = role === 'attorney'
  const personaData = useMemo(() => (isAttorney ? ATTORNEY_DATA : DEVELOPER_DATA), [isAttorney])
  const personaTitle = isAttorney ? 'Attorney Intelligence Preview' : 'Developer Intelligence Preview'
  const [isFeasibilityMounted, setIsFeasibilityMounted] = useState(false)
  const [isFeasibilityVisible, setIsFeasibilityVisible] = useState(false)

  useEffect(() => {
    if (!isFeasibilityMounted) return undefined
    const timeout = window.setTimeout(() => setIsFeasibilityVisible(true), 12)
    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setIsFeasibilityVisible(false)
        window.setTimeout(() => setIsFeasibilityMounted(false), 180)
      }
    }
    window.addEventListener('keydown', onEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('keydown', onEscape)
      document.body.style.overflow = ''
    }
  }, [isFeasibilityMounted])

  const openFeasibilityModal = () => {
    setIsFeasibilityMounted(true)
  }

  const closeFeasibilityModal = () => {
    setIsFeasibilityVisible(false)
    window.setTimeout(() => setIsFeasibilityMounted(false), 180)
  }

  return (
    <section className="space-y-5">
      <header className="rounded-[24px] border border-[#d7e4f2] bg-[linear-gradient(135deg,#f4f8fd_0%,#fbfdff_45%,#f7fbff_100%)] px-5 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)] md:px-7">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-[#142132]">Intelligence (Beta)</h1>
              <p className="mt-2 max-w-[980px] text-[0.98rem] leading-7 text-[#5f738a]">
                Autonomous, predictive, revenue-driven intelligence powered by live transaction data across the property ecosystem.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[#d7e4f2] bg-white/80 px-3 py-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.09em] text-[#46698d]">
              Preview Mode — simulated data for demonstration
            </span>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d7e4f2] bg-white/70 px-3 py-1.5 text-[0.8rem] font-medium text-[#53708f]">
            <Sparkles size={14} />
            {personaTitle}
          </div>
          <div>
            <button
              type="button"
              onClick={openFeasibilityModal}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-[#2f5f86] bg-[#35546c] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.15)] transition hover:bg-[#2f4b62]"
            >
              <FileStack size={15} />
              Feasibility Tool
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {personaData.kpis.map((item) => (
          <IntelligenceKpiCard key={item.title} {...item} />
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          {isAttorney ? <AttorneyContent /> : <DeveloperContent />}
        </div>

        <aside className="rounded-[24px] border border-[#dce6f2] bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafe_100%)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7e4f2] bg-white text-[#365e86]">
              <BrainCircuit size={15} />
            </span>
            <h2 className="text-[1.03rem] font-semibold tracking-[-0.02em] text-[#152538]">Bridge AI Recommendations</h2>
          </div>
          <div className="mt-4 grid gap-2.5">
            {personaData.assistant.map((item) => (
              <div key={item} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3 text-[0.9rem] leading-6 text-[#24394f]">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#3f78a8]" />
                  <p>{item}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className="rounded-[16px] border border-[#dde7f3] bg-[#f8fbff] px-4 py-3 text-[0.82rem] text-[#61758d]">
        Simulated intelligence preview. Data shown for demonstration purposes only.
      </footer>

      <FeasibilityModal
        open={isFeasibilityMounted}
        entered={isFeasibilityVisible}
        onClose={closeFeasibilityModal}
      />
    </section>
  )
}
