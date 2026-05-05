import {
  DataTableCard,
  IntelligenceKpiCard,
  IntelligencePageHeader,
  IntelligenceShell,
  MockChartCard,
  ProgressBarMetric,
} from './components'
import { agentIntelligenceMockData } from './agentIntelligenceMockData'
import { formatInteger, formatPercent } from './formatters'

function MarketPage() {
  const { sharedFilters, market } = agentIntelligenceMockData

  return (
    <IntelligenceShell>
      <IntelligencePageHeader
        title="Agent Intelligence Market"
        description="Understand area-level demand, buyer mix, and where your market share can grow fastest."
        filters={sharedFilters}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {market.position.map((item) => (
          <IntelligenceKpiCard
            key={item.label}
            label={item.label}
            value={item.type === 'percent' ? formatPercent(item.value) : formatInteger(item.value)}
            subtext="Current selected market context"
            tone="blue"
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <MockChartCard title="Market Share Visual">
          <div className="space-y-2.5">
            {market.marketShareVisual.map((metric) => {
              const percent = metric.type === 'percent' ? (metric.your / metric.market) * 100 : (metric.your / metric.market) * 100
              return (
                <ProgressBarMetric
                  key={metric.label}
                  label={metric.label}
                  value={metric.type === 'percent' ? `${formatPercent(metric.your)} vs ${formatPercent(metric.market)}` : `${formatInteger(metric.your)} / ${formatInteger(metric.market)}`}
                  percent={percent}
                  helper="Your contribution vs market"
                />
              )
            })}
          </div>
        </MockChartCard>

        <MockChartCard title="Buyer Demographics">
          <div className="space-y-2.5">
            {market.buyerDemographics.map((item) => (
              <ProgressBarMetric
                key={item.label}
                label={item.label}
                value={formatPercent(item.value, 0)}
                percent={item.value}
                tone="indigo"
              />
            ))}
          </div>
        </MockChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MockChartCard title="Buyer Age Groups">
          <div className="space-y-2.5">
            {market.buyerAges.map((item) => (
              <ProgressBarMetric key={item.label} label={item.label} value={formatPercent(item.percent, 0)} percent={item.percent} tone="green" />
            ))}
          </div>
        </MockChartCard>

        <MockChartCard title="Demand by Property Type">
          <div className="space-y-2.5">
            {market.propertyTypeDemand.map((item) => (
              <ProgressBarMetric key={item.label} label={item.label} value={formatPercent(item.percent, 0)} percent={item.percent} />
            ))}
          </div>
        </MockChartCard>

        <MockChartCard title="Demand by Price Band">
          <div className="space-y-2.5">
            {market.priceBandDemand.map((item) => (
              <ProgressBarMetric key={item.label} label={item.label} value={formatPercent(item.percent, 0)} percent={item.percent} tone="amber" />
            ))}
          </div>
        </MockChartCard>
      </section>

      <DataTableCard
        title="Area Lead vs Transaction Position"
        columns={['Metric', 'Area Total', 'Your Total']}
        rows={[
          ['Leads', formatInteger(1240), formatInteger(86)],
          ['Transactions', formatInteger(92), formatInteger(7)],
          ['Market Share', '100%', formatPercent(7.6)],
        ]}
      />
    </IntelligenceShell>
  )
}

export default MarketPage
