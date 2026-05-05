import {
  DataTableCard,
  InsightCard,
  IntelligenceKpiCard,
  IntelligencePageHeader,
  IntelligenceShell,
} from './components'
import { agentIntelligenceMockData } from './agentIntelligenceMockData'
import { formatCurrency, formatPercent } from './formatters'

function NetworkPage() {
  const { sharedFilters, network } = agentIntelligenceMockData

  return (
    <IntelligenceShell>
      <IntelligencePageHeader
        title="Agent Intelligence Network"
        description="Track partner impact across originators, attorneys, and referral channels to improve conversion and speed."
        filters={sharedFilters}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {network.kpis.map((kpi) => (
          <IntelligenceKpiCard
            key={kpi.label}
            label={kpi.label}
            value={
              kpi.type === 'percent'
                ? formatPercent(kpi.value)
                : typeof kpi.value === 'number'
                  ? kpi.value
                  : kpi.value
            }
            subtext="Partner network intelligence window"
            tone="indigo"
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataTableCard
          title="Bond Originator Performance"
          columns={['Originator', 'Applications', 'Approvals', 'Avg Approval Time', 'Success Rate']}
          rows={network.bondOriginators.map((row) => [row.originator, row.applications, row.approvals, row.avgApprovalTime, `${row.successRate}%`])}
        />

        <DataTableCard
          title="Attorney Performance"
          columns={['Attorney / Firm', 'Active Transfers', 'Avg Transfer Time', 'Bottlenecks', 'Registration Rate']}
          rows={network.attorneys.map((row) => [row.firm, row.activeTransfers, row.avgTransferTime, row.bottlenecks, `${row.registrationRate}%`])}
        />
      </section>

      <DataTableCard
        title="Referral Sources"
        columns={['Partner', 'Leads Received', 'Deals Created', 'Conversion Rate', 'Revenue Influenced']}
        rows={network.referralSources.map((row) => [
          row.partner,
          row.leads,
          row.deals,
          formatPercent(row.conversion),
          formatCurrency(row.revenue),
        ])}
      />

      <InsightCard title="Network Insights">
        {network.insights.map((item) => (
          <div key={item} className="rounded-xl border border-[#dce6f2] bg-[#fbfdff] px-3.5 py-3 text-[0.86rem] text-[#355068]">
            {item}
          </div>
        ))}
      </InsightCard>
    </IntelligenceShell>
  )
}

export default NetworkPage
