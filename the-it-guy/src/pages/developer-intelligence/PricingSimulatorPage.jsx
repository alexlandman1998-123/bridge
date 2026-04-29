import { AiRecommendationPanel, IntelligenceShell, InsightCard, MetricRow } from './components'
import { formatCurrency } from './formatters'
import { pricingSimulator } from './mockData'

function SliderMock({ label, value }) {
  return (
    <div className="rounded-xl border border-[#dce7f3] bg-white px-4 py-3">
      <div className="flex items-center justify-between text-[0.84rem]">
        <span className="font-medium text-[#264057]">{label}</span>
        <span className="font-semibold text-[#142132]">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#e2ebf5]">
        <span className="block h-full w-[62%] rounded-full bg-[#3c78a8]" />
      </div>
    </div>
  )
}

function DeveloperIntelligencePricingSimulatorPage() {
  return (
    <IntelligenceShell
      sectionTitle="Pricing Simulator"
      sectionSubtitle="Simulate conversion, sell-through, and revenue impact before changing pricing strategy."
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <InsightCard title="Pricing Controls (Simulation)">
          <SliderMock label="Price adjust" value="-5%" />
          <SliderMock label="Deposit requirement" value="8%" />
          <SliderMock label="Phase 1 unit release" value="22 units" />
          <div className="rounded-xl border border-[#dce7f3] bg-[#f7fbff] px-3.5 py-3 text-[0.84rem] text-[#4a6280]">
            These controls are mock sliders for presentation mode. Live model integration is not enabled in beta preview.
          </div>
        </InsightCard>

        <InsightCard title="Scenario Outcomes">
          {pricingSimulator.scenarios.map((scenario) => (
            <article key={scenario.name} className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.9rem] font-semibold text-[#1f3348]">{scenario.name}</p>
                <span className="rounded-full border border-[#d8e5f3] bg-[#f7fbff] px-2 py-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#5f7893]">
                  {scenario.adjustment}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <MetricRow label="Conversion" value={scenario.conversion} helper="Predicted close rate" percent={Number(String(scenario.conversion).replace('%', ''))} color="bg-[#2f8a63]" />
                <MetricRow label="Time to sell" value={scenario.sellOut} helper="Projected sell-through" percent={scenario.name === 'Recommended' ? 72 : scenario.name === 'Current plan' ? 58 : 41} color="bg-[#3c78a8]" />
                <MetricRow label="Revenue impact" value={formatCurrency(scenario.revenue)} helper="Estimated gross realization" percent={scenario.name === 'Recommended' ? 78 : scenario.name === 'Current plan' ? 73 : 69} color="bg-[#6f4dcf]" />
                <MetricRow label="Risk level" value={scenario.risk} helper="Portfolio volatility" percent={scenario.risk === 'Low' ? 22 : scenario.risk === 'Moderate' ? 51 : 81} color={scenario.risk === 'Low' ? 'bg-[#2f8a63]' : scenario.risk === 'Moderate' ? 'bg-[#b57a2f]' : 'bg-[#a24848]'} />
              </div>
            </article>
          ))}
        </InsightCard>
      </section>

      <AiRecommendationPanel
        confidence={87}
        recommendations={[
          'Recommended scenario produces the strongest revenue with faster sell-through',
          'Maintain price band within R1.25M – R1.4M for best conversion',
          'Release smaller units first to accelerate early cash flow',
          'Avoid premium uplift in current affordability cycle',
        ]}
      />
    </IntelligenceShell>
  )
}

export default DeveloperIntelligencePricingSimulatorPage
