import { AlertTriangle, Building2, MapPinned, Users } from 'lucide-react'
import {
  IntelligenceShell,
  IntelligenceKpiCard,
  InsightCard,
  OpportunityCard,
  ScoreBadge,
  TrendBullet,
} from './components'
import { formatCurrency, formatPercent } from './formatters'
import { developerIntelligenceOverview } from './mockData'

function DeveloperIntelligenceDashboardPage() {
  const topKpis = [
    {
      label: 'Market Share',
      value: formatPercent(developerIntelligenceOverview.marketShare),
      subtext: 'Current transaction share in active corridors',
    },
    {
      label: 'Revenue Forecast',
      value: formatCurrency(developerIntelligenceOverview.revenueForecast),
      subtext: 'Predicted from current conversion and velocity',
    },
    {
      label: 'Active Developments',
      value: developerIntelligenceOverview.activeDevelopments,
      subtext: 'Projects currently tracked in intelligence layer',
      tone: 'green',
    },
    {
      label: 'At Risk Deals',
      value: developerIntelligenceOverview.atRiskDeals,
      subtext: 'Pricing and finance delays detected this cycle',
      tone: 'amber',
    },
    {
      label: 'Opportunity Value',
      value: `${formatCurrency(developerIntelligenceOverview.opportunityValueMonthly)}/mo`,
      subtext: 'Untapped value available in your network',
      tone: 'blue',
    },
  ]

  return (
    <IntelligenceShell
      sectionTitle="Dashboard"
      sectionSubtitle="Developer control center for opportunity capture and portfolio growth."
    >
      <section className="rounded-3xl border border-[#d8e5f3] bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <p className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#6a819c]">AI Summary</p>
        <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#142132]">You are capturing 6.8% of your market</h2>
        <p className="mt-1 text-[1.04rem] leading-7 text-[#59718a]">{formatCurrency(developerIntelligenceOverview.opportunityValueMonthly)}/month opportunity identified</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {topKpis.map((kpi) => (
          <IntelligenceKpiCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">AI Market Snapshot</h3>
              <p className="mt-2 max-w-2xl text-[0.95rem] leading-7 text-[#607389]">
                Bridge has identified 64 potential monthly transactions in your active regions.
              </p>
            </div>
            <ScoreBadge score={developerIntelligenceOverview.confidenceScore} label="Confidence" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-[#d8e5f3] bg-[#f7fbff] px-4 py-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6a8099]">Transactions / Month</p>
              <p className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#142132]">{developerIntelligenceOverview.potentialTransactionsMonthly}</p>
            </article>
            <article className="rounded-2xl border border-[#d8e5f3] bg-[#f7fbff] px-4 py-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6a8099]">Opportunity Value</p>
              <p className="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-[#142132]">{formatCurrency(developerIntelligenceOverview.opportunityValueMonthly)}</p>
              <p className="text-[0.76rem] text-[#67819d]">/ month</p>
            </article>
            <article className="rounded-2xl border border-[#cde8d9] bg-[#f2fbf6] px-4 py-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#2f7f58]">Confidence</p>
              <p className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#1f5d3e]">87%</p>
            </article>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <TrendBullet text="High demand for 2-bed units under R1.35M" trend="up" />
            <TrendBullet text="Pricing mismatch detected in premium stock" trend="down" />
          </div>
        </article>

        <InsightCard title="AI Alerts">
          <TrendBullet text="Pricing mismatch detected" trend="down" />
          <TrendBullet text="High demand for 2-bed units" trend="up" />
          <TrendBullet text="Finance delays increasing" trend="down" />
          <TrendBullet text="Underexposure in Boksburg" trend="up" />
        </InsightCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <OpportunityCard
          title="Agent Opportunity"
          value={`${formatCurrency(480000)}/month`}
          detail="Melissa van Rensburg • 25 listings • 0% current involvement"
          icon={Users}
        />
        <OpportunityCard
          title="Development Opportunity"
          value={`${formatCurrency(620000)}/month`}
          detail="Brookstone Heights • 31 active listings • high demand segment"
          icon={Building2}
        />
        <OpportunityCard
          title="Area Opportunity"
          value={`${formatCurrency(740000)}/month`}
          detail="Pretoria East • 142 listings • market share gap detected"
          icon={MapPinned}
        />
      </section>
    </IntelligenceShell>
  )
}

export default DeveloperIntelligenceDashboardPage
