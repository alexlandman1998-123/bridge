import {
  DataTableCard,
  InsightCard,
  IntelligencePageHeader,
  IntelligenceShell,
  MockChartCard,
  ProgressBarMetric,
} from './components'
import { agentIntelligenceMockData } from './agentIntelligenceMockData'
import { formatCurrency, formatPercent } from './formatters'

function PricingPage() {
  const { sharedFilters, pricing } = agentIntelligenceMockData

  return (
    <IntelligenceShell>
      <IntelligencePageHeader
        title="Agent Intelligence Pricing"
        description="Price listings with stronger confidence using demand signals, benchmark performance, and buyer response patterns."
        filters={sharedFilters}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <MockChartCard title="Property Pricing Assistant">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Object.entries(pricing.assistant.inputs).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-[#dce7f3] bg-white px-3 py-2.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#70839b]">{key.replace(/([A-Z])/g, ' $1')}</p>
                <p className="mt-1 text-[0.86rem] font-semibold text-[#1f344b]">{value}</p>
              </div>
            ))}
          </div>
        </MockChartCard>

        <MockChartCard title="Pricing Output">
          <ProgressBarMetric label="Suggested Listing Range" value={pricing.assistant.output.range} percent={82} tone="green" helper="Model output for selected property profile" />
          <ProgressBarMetric label="Expected Buyer Interest" value={pricing.assistant.output.buyerInterest} percent={76} tone="green" />
          <ProgressBarMetric label="Estimated Time on Market" value={pricing.assistant.output.timeOnMarket} percent={58} tone="amber" />
          <ProgressBarMetric label="Pricing Confidence" value={`${pricing.assistant.output.confidence}%`} percent={pricing.assistant.output.confidence} tone="indigo" />
        </MockChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <MockChartCard title="Price Band Performance">
          <div className="space-y-2.5">
            {pricing.priceBandPerformance.map((item) => (
              <ProgressBarMetric key={item.label} label={item.label} value={item.value} percent={72} helper={item.helper} />
            ))}
          </div>
        </MockChartCard>

        <InsightCard title="Pricing Warnings">
          {pricing.warnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-[#ecdcc0] bg-[#fffaf2] px-3.5 py-3 text-[0.86rem] text-[#7f5c23]">
              {warning}
            </div>
          ))}
        </InsightCard>
      </section>

      <DataTableCard
        title="Listing vs Selling Price"
        columns={['Listing', 'Asking Price', 'Final Offer', 'Difference %', 'Days on Market']}
        rows={pricing.listingVsSelling.map((row) => [
          row.listing,
          formatCurrency(row.asking),
          formatCurrency(row.finalOffer),
          formatPercent(row.difference),
          row.daysOnMarket,
        ])}
      />
    </IntelligenceShell>
  )
}

export default PricingPage
