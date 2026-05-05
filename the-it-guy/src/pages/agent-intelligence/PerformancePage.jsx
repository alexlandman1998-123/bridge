import {
  DataTableCard,
  InsightCard,
  IntelligenceKpiCard,
  IntelligencePageHeader,
  IntelligenceShell,
  MockChartCard,
  ProgressBarMetric,
} from './components'
import { agentIntelligenceMockData } from './agentIntelligenceMockData'
import { formatCurrency, formatPercent } from './formatters'

function PerformancePage() {
  const { sharedFilters, performance } = agentIntelligenceMockData

  return (
    <IntelligenceShell>
      <IntelligencePageHeader
        title="Agent Intelligence Performance"
        description="Measure sales output, conversion quality, and earnings potential across areas and lead sources."
        filters={sharedFilters}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {performance.kpis.map((kpi) => (
          <IntelligenceKpiCard
            key={kpi.label}
            label={kpi.label}
            value={
              kpi.type === 'percent'
                ? formatPercent(kpi.value)
                : /value|commission/i.test(kpi.label)
                  ? formatCurrency(kpi.value)
                  : kpi.value
            }
            subtext="Performance benchmark window"
            tone="blue"
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataTableCard
          title="Performance by Area"
          columns={['Area', 'Leads', 'Deals', 'Conversion %', 'Sales Value', 'Commission']}
          rows={performance.byArea.map((row) => [
            row.area,
            row.leads,
            row.deals,
            formatPercent(row.conversion),
            formatCurrency(row.salesValue),
            formatCurrency(row.commission),
          ])}
        />

        <MockChartCard title="Performance by Lead Source">
          <div className="space-y-2.5">
            {performance.byLeadSource.map((row) => (
              <ProgressBarMetric
                key={row.source}
                label={row.source}
                value={`${row.deals} deals • ${formatPercent(row.conversion)}`}
                percent={row.conversion * 3.5}
                tone="green"
                helper={`${row.leads} leads captured`}
              />
            ))}
          </div>
        </MockChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <MockChartCard title="Earnings Projection">
          <ProgressBarMetric label="Current projected commission" value={formatCurrency(performance.earningsProjection.current)} percent={68} tone="blue" />
          <ProgressBarMetric label="If conversion improves by 3%" value={formatCurrency(performance.earningsProjection.improved)} percent={82} tone="green" />
          <ProgressBarMetric label="Potential uplift" value={formatCurrency(performance.earningsProjection.uplift)} percent={41} tone="amber" />
        </MockChartCard>

        <div className="grid gap-4 md:grid-cols-2">
          <InsightCard title="Strengths">
            {performance.strengths.map((item) => (
              <div key={item} className="rounded-xl border border-[#cae8d7] bg-[#f2fbf6] px-3.5 py-3 text-[0.86rem] text-[#2f7f58]">
                {item}
              </div>
            ))}
          </InsightCard>
          <InsightCard title="Weaknesses">
            {performance.weaknesses.map((item) => (
              <div key={item} className="rounded-xl border border-[#efcaca] bg-[#fff4f4] px-3.5 py-3 text-[0.86rem] text-[#8f4443]">
                {item}
              </div>
            ))}
          </InsightCard>
        </div>
      </section>
    </IntelligenceShell>
  )
}

export default PerformancePage
