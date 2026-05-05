import {
  InsightCard,
  IntelligenceKpiCard,
  IntelligencePageHeader,
  IntelligenceShell,
  MockChartCard,
  PipelineFunnel,
  ProgressBarMetric,
} from './components'
import { agentIntelligenceMockData } from './agentIntelligenceMockData'
import { formatCurrency, formatInteger, formatPercent } from './formatters'

function resolveKpiValue(kpi) {
  if (kpi.valueType === 'percent') {
    return formatPercent(kpi.value)
  }

  if (/value|commission/i.test(kpi.label)) {
    return formatCurrency(kpi.value)
  }

  return formatInteger(kpi.value)
}

function OverviewPage() {
  const { sharedFilters, overview } = agentIntelligenceMockData

  return (
    <IntelligenceShell>
      <IntelligencePageHeader
        title="Agent Intelligence Overview"
        description="Track your market position, pipeline health, and growth opportunities from one place."
        filters={sharedFilters}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overview.kpis.map((kpi) => (
          <IntelligenceKpiCard
            key={kpi.label}
            label={kpi.label}
            value={resolveKpiValue(kpi)}
            subtext={kpi.subtext}
            tone={kpi.tone}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <InsightCard title="Next Best Actions">
          {overview.nextBestActions.map((item) => (
            <div key={item} className="rounded-xl border border-[#dce6f2] bg-[#fbfdff] px-3.5 py-3 text-[0.88rem] text-[#355068]">
              {item}
            </div>
          ))}
        </InsightCard>

        <InsightCard title="Market Snapshot">
          {overview.marketSnapshot.map((item) => (
            <ProgressBarMetric
              key={item.label}
              label={item.label}
              value={item.value}
              helper={item.helper}
              percent={78}
              tone="indigo"
            />
          ))}
        </InsightCard>
      </section>

      <MockChartCard title="Pipeline Health: Lead → Viewing → Offer → OTP → Transfer → Registered">
        <PipelineFunnel stages={overview.pipelineHealth} />
      </MockChartCard>
    </IntelligenceShell>
  )
}

export default OverviewPage
