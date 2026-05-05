import {
  DataTableCard,
  InsightCard,
  IntelligencePageHeader,
  IntelligenceShell,
  OpportunityCard,
} from './components'
import { agentIntelligenceMockData } from './agentIntelligenceMockData'
import { formatInteger } from './formatters'

function OpportunitiesPage() {
  const { sharedFilters, opportunities } = agentIntelligenceMockData

  return (
    <IntelligenceShell>
      <IntelligencePageHeader
        title="Agent Intelligence Opportunities"
        description="Identify where demand is strongest, where your share is weakest, and what to action next."
        filters={sharedFilters}
      />

      <section className="grid gap-4 xl:grid-cols-3">
        {opportunities.scoreCards.map((item) => (
          <OpportunityCard
            key={item.area}
            area={item.area}
            score={item.score}
            demand={item.demand}
            share={item.share}
            action={item.action}
          />
        ))}
      </section>

      <DataTableCard
        title="Underexposed Areas"
        columns={['Area', 'Market Leads', 'Your Leads', 'Gap', 'Suggested Action']}
        rows={opportunities.underexposedAreas.map((row) => [
          row.area,
          formatInteger(row.marketLeads),
          formatInteger(row.yourLeads),
          formatInteger(row.gap),
          row.action,
        ])}
      />

      <InsightCard title="Lost Opportunity Insights">
        {opportunities.lostInsights.map((item) => (
          <div key={item} className="rounded-xl border border-[#ecdcc0] bg-[#fffaf2] px-3.5 py-3 text-[0.86rem] text-[#7f5c23]">
            {item}
          </div>
        ))}
      </InsightCard>
    </IntelligenceShell>
  )
}

export default OpportunitiesPage
