import {
  DataTableCard,
  InsightCard,
  IntelligencePageHeader,
  IntelligenceShell,
  MockChartCard,
  PipelineFunnel,
  ProgressBarMetric,
} from './components'
import { agentIntelligenceMockData } from './agentIntelligenceMockData'

function PipelinePage() {
  const { sharedFilters, pipeline } = agentIntelligenceMockData

  return (
    <IntelligenceShell>
      <IntelligencePageHeader
        title="Agent Intelligence Pipeline"
        description="See where leads convert, where deals stall, and which stages need immediate intervention."
        filters={sharedFilters}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <MockChartCard title="Pipeline Funnel">
          <PipelineFunnel stages={pipeline.stages} />
        </MockChartCard>

        <MockChartCard title="Deals by Stage">
          <div className="space-y-2.5">
            {pipeline.dealsByStage.map((item) => (
              <ProgressBarMetric key={item.label} label={item.label} value={item.value} percent={(item.value / 86) * 100} tone="indigo" />
            ))}
          </div>
        </MockChartCard>
      </section>

      <DataTableCard
        title="Stalled Deals"
        columns={['Client', 'Property', 'Stage', 'Days Inactive', 'Risk Level', 'Suggested Action']}
        rows={pipeline.stalledDeals.map((row) => [
          row.client,
          row.property,
          row.stage,
          row.inactiveDays,
          row.risk,
          row.action,
        ])}
      />

      <InsightCard title="Stage Bottlenecks">
        {pipeline.bottlenecks.map((item) => (
          <div key={item} className="rounded-xl border border-[#efcaca] bg-[#fff4f4] px-3.5 py-3 text-[0.86rem] text-[#8f4443]">
            {item}
          </div>
        ))}
      </InsightCard>
    </IntelligenceShell>
  )
}

export default PipelinePage
