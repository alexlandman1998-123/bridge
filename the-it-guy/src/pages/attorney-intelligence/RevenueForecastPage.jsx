import { BarChart3, Sparkles } from 'lucide-react'
import {
  AiInsightPanel,
  IntelligenceKpiCard,
  IntelligenceShell,
  MetricBar,
  RevenueBarChart,
  SoftCtaButton,
} from './components'
import { formatCurrency } from './formatters'
import { mockRevenueForecast } from './mockData'

function RevenueForecastPage() {
  const maxPipelineCount = Math.max(...mockRevenueForecast.funnel.map((item) => item.count), 1)
  const potentialRevenue = mockRevenueForecast.currentMonthForecast + mockRevenueForecast.revenueGap

  return (
    <IntelligenceShell
      title="Revenue Forecast"
      subtitle="Predict revenue from active transactions and model growth opportunities before they happen."
    >
      <section className="grid gap-4 xl:grid-cols-4">
        <IntelligenceKpiCard
          label="Current Month Forecast"
          value={formatCurrency(mockRevenueForecast.currentMonthForecast)}
          subtext="Projected from active transfer pipeline"
        />
        <IntelligenceKpiCard
          label="Next 90 Days"
          value={formatCurrency(mockRevenueForecast.next90Days)}
          subtext="Rolling forecast across active + predicted files"
          tone="green"
        />
        <IntelligenceKpiCard
          label="Pipeline Coverage"
          value={`${mockRevenueForecast.pipelineCoverage.toFixed(1)}x`}
          subtext="Coverage ratio against baseline monthly target"
        />
        <IntelligenceKpiCard
          label="Revenue Gap"
          value={`${formatCurrency(mockRevenueForecast.revenueGap)}/month`}
          subtext="Addressable gap with current identified opportunities"
          tone="amber"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Revenue Forecast Chart</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d8e5f3] bg-[#f6faff] px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#5b738f]">
              <BarChart3 size={13} /> Forecast Trend
            </span>
          </div>
          <div className="mt-4">
            <RevenueBarChart items={mockRevenueForecast.lineItems} />
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Pipeline Conversion Funnel</h2>
          <p className="mt-2 text-[0.9rem] text-[#607389]">Instruction Received → Docs Collected → Lodgement → Registration</p>

          <div className="mt-4 space-y-3">
            {mockRevenueForecast.funnel.map((stage) => (
              <MetricBar
                key={stage.stage}
                label={stage.stage}
                value={`${stage.count} files`}
                percent={(stage.count / maxPipelineCount) * 100}
                tone={stage.delayRisk === 'high' ? 'amber' : stage.delayRisk === 'medium' ? 'blue' : 'green'}
                helper={stage.delayRisk === 'high' ? 'Drop-off risk detected' : stage.delayRisk === 'medium' ? 'Monitor response timing' : 'Healthy progression'}
              />
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Revenue Gap Analysis</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[#dce6f2] bg-white p-4">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#6d839d]">Current projected revenue</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-[#142132]">{formatCurrency(mockRevenueForecast.currentMonthForecast)}</p>
            </div>
            <div className="rounded-2xl border border-[#cae8d7] bg-[#f2fbf6] p-4">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#2f7f58]">Potential with opportunities</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-[#1f5d3e]">{formatCurrency(potentialRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-[#ecdcc0] bg-[#fffaf2] p-4">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#8b6324]">Gap</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-[#7f5922]">{formatCurrency(mockRevenueForecast.revenueGap)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#dce6f2] bg-white p-3.5">
            <p className="text-[0.82rem] font-medium text-[#1f3348]">Before / After Revenue</p>
            <div className="mt-2 space-y-2">
              <div>
                <div className="flex items-center justify-between text-[0.76rem] text-[#6e849f]"><span>Current</span><span>{formatCurrency(mockRevenueForecast.currentMonthForecast)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-[#e2ebf5]"><span className="block h-full rounded-full bg-[#4f7da6]" style={{ width: '68%' }} /></div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[0.76rem] text-[#6e849f]"><span>Potential</span><span>{formatCurrency(potentialRevenue)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-[#e2ebf5]"><span className="block h-full rounded-full bg-[#2f8a63]" style={{ width: '100%' }} /></div>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <AiInsightPanel
            title="AI Revenue Recommendations"
            copy="Bridge has prioritized targeted actions with the highest near-term revenue impact."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {mockRevenueForecast.recommendations.map((item) => (
              <article key={item} className="rounded-2xl border border-[#dce6f2] bg-[#f9fcff] p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d8e5f3] bg-white text-[#355f88]">
                    <Sparkles size={12} />
                  </span>
                  <p className="text-[0.86rem] font-medium leading-6 text-[#22374d]">{item}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <SoftCtaButton label="Export Forecast" />
            <SoftCtaButton label="Model Scenarios" />
          </div>
        </article>
      </section>
    </IntelligenceShell>
  )
}

export default RevenueForecastPage
