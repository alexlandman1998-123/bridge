import { AlertTriangle, Building2, MapPinned, Sparkles, Users } from 'lucide-react'
import {
  AiInsightPanel,
  IntelligenceKpiCard,
  IntelligenceShell,
  OpportunityScoreBadge,
  SoftCtaButton,
} from './components'
import { formatCurrency, formatPercent } from './formatters'
import { attorneyOpportunityData } from './mockData'

function DashboardPage() {
  const topKpis = [
    {
      label: 'Market Share by Volume',
      value: formatPercent(attorneyOpportunityData.marketShareVolume),
      subtext: 'Up 0.8% across assigned regions',
    },
    {
      label: 'Market Share by Value',
      value: formatPercent(attorneyOpportunityData.marketShareValue),
      subtext: 'R184M transfer value tracked',
    },
    {
      label: 'Predicted Registrations',
      value: attorneyOpportunityData.predictedRegistrations,
      subtext: 'Next 30 days, 91% confidence',
      tone: 'green',
    },
    {
      label: 'Revenue Forecast',
      value: formatCurrency(attorneyOpportunityData.revenueForecast),
      subtext: 'Based on active transfer pipeline',
      tone: 'blue',
    },
    {
      label: 'Missed Opportunity',
      value: formatCurrency(attorneyOpportunityData.missedOpportunity),
      subtext: 'Estimated monthly opportunity in network',
      tone: 'amber',
    },
  ]

  return (
    <IntelligenceShell
      title="Dashboard"
      subtitle="High-trust visibility into market position, risk, and growth opportunities."
    >
      <section className="grid gap-4 xl:grid-cols-5">
        {topKpis.map((kpi) => (
          <IntelligenceKpiCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">AI Growth Snapshot</h2>
              <p className="mt-2 max-w-2xl text-[0.95rem] leading-7 text-[#607389]">
                Bridge has identified 38 potential transactions per month in your active market where your firm is currently not appointed.
              </p>
            </div>
            <OpportunityScoreBadge score={attorneyOpportunityData.confidenceScore} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-[#d8e5f3] bg-[#f7fbff] px-4 py-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6a8099]">Potential Monthly Transactions</p>
              <p className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#142132]">38</p>
            </article>
            <article className="rounded-2xl border border-[#d8e5f3] bg-[#f7fbff] px-4 py-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6a8099]">Opportunity Value</p>
              <p className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#142132]">{formatCurrency(attorneyOpportunityData.monthlyOpportunityValue)}</p>
              <p className="text-[0.76rem] text-[#67819d]">/ month</p>
            </article>
            <article className="rounded-2xl border border-[#cde8d9] bg-[#f2fbf6] px-4 py-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#2f7f58]">Confidence Score</p>
              <p className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#1f5d3e]">84%</p>
            </article>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d6e6f6] bg-[#f5faff] px-3 py-1 text-[0.76rem] font-semibold text-[#365f88]">
              <MapPinned size={13} /> Underexposed in Pretoria East
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d6e6f6] bg-[#f5faff] px-3 py-1 text-[0.76rem] font-semibold text-[#365f88]">
              <Users size={13} /> 12 high-value agents identified
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#ecdcc0] bg-[#fff8ef] px-3 py-1 text-[0.76rem] font-semibold text-[#8b6324]">
              <Building2 size={13} /> 4 active developments without preferred attorney
            </span>
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Today's Priority Signals</h2>
          <div className="mt-4 space-y-2.5">
            {[
              { text: '7 transfers at risk of delay', tone: 'danger' },
              { text: '3 agency relationships showing growth potential', tone: 'warning' },
              { text: '1 new development opportunity detected', tone: 'neutral' },
              { text: 'Pipeline gap projected in 45 days', tone: 'warning' },
            ].map((item) => (
              <div
                key={item.text}
                className={`rounded-xl border px-3.5 py-3 text-[0.9rem] font-medium ${
                  item.tone === 'danger'
                    ? 'border-[#efcaca] bg-[#fff4f4] text-[#9c3d3c]'
                    : item.tone === 'warning'
                      ? 'border-[#ecdcc0] bg-[#fffaf2] text-[#875f24]'
                      : 'border-[#d8e5f3] bg-[#f7fbff] text-[#355f88]'
                }`}
              >
                {item.text}
              </div>
            ))}
          </div>

          <AiInsightPanel
            title="AI Escalation"
            copy="File velocity indicates a probable intake shortfall in six weeks unless new partner inflow improves this month."
          />
        </article>
      </section>

      <section className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Top Growth Opportunities</h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#d8e5f3] bg-[#f7fbff] px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#5b738f]">
            <Sparkles size={13} /> Prioritized by AI
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {[
            {
              title: 'Agent Opportunity',
              value: formatCurrency(480000),
              detail: 'Melissa van Rensburg • 25 listings • Score 91/100',
              icon: Users,
            },
            {
              title: 'Development Opportunity',
              value: formatCurrency(620000),
              detail: 'Brookstone Heights • 18 expected transfers/month • Score 88/100',
              icon: Building2,
            },
            {
              title: 'Area Opportunity',
              value: formatCurrency(740000),
              detail: 'Pretoria East share gap 6.3% • Score 89/100',
              icon: AlertTriangle,
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <article key={item.title} className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4 transition hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6e849f]">{item.title}</p>
                    <p className="mt-1.5 text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.value}/month</p>
                  </div>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8e5f3] bg-white text-[#355f88]">
                    <Icon size={16} />
                  </span>
                </div>
                <p className="mt-2 text-[0.84rem] leading-6 text-[#61768f]">{item.detail}</p>
                <div className="mt-3">
                  <SoftCtaButton label="View Opportunity" />
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </IntelligenceShell>
  )
}

export default DashboardPage
