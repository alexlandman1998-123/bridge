import { Building2, MapPinned, Users } from 'lucide-react'
import {
  AiRecommendationPanel,
  IntelligenceShell,
  InsightCard,
  ScoreBadge,
  SimpleDonut,
  SoftCtaButton,
} from './components'
import { formatCurrency, formatPercent } from './formatters'
import { developerIntelligenceOverview, mockAgents, mockAreas, mockDevelopments } from './mockData'

function DeveloperIntelligenceOpportunityEnginePage() {
  const leadAgent = mockAgents[0]
  const leadDevelopment = mockDevelopments[0]
  const leadArea = mockAreas[0]

  return (
    <IntelligenceShell
      sectionTitle="Opportunity Engine"
      sectionSubtitle="AI-ranked opportunities across agents, developments, and location corridors."
    >
      <section className="rounded-3xl border border-[#d8e5f3] bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <p className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#6a819c]">Opportunity Engine</p>
        <h2 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-[#142132]">
          Bridge has identified {formatCurrency(developerIntelligenceOverview.opportunityValueMonthly)}/month in untapped development opportunity
        </h2>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <ScoreBadge score={developerIntelligenceOverview.confidenceScore} label="Opportunity Confidence" />
          <span className="inline-flex rounded-full border border-[#d8e5f3] bg-[#f7fbff] px-3 py-1 text-[0.75rem] font-semibold text-[#5f7893]">
            {developerIntelligenceOverview.potentialTransactionsMonthly} potential transactions/month
          </span>
        </div>
      </section>

      <section className="grid gap-5">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e5f3] bg-[#f6faff] text-[#355f88]"><Users size={16} /></span>
                <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Agent Opportunity</h3>
              </div>
              <p className="mt-2 text-[0.92rem] leading-7 text-[#607389]">High listing volume with no developer relationship</p>
            </div>
            <ScoreBadge score={91} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4">
                <p className="text-[1.1rem] font-semibold text-[#162538]">{leadAgent.name}</p>
                <p className="text-[0.84rem] text-[#637a92]">{leadAgent.agency} • {leadAgent.area}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-[#dbe7f4] bg-white p-3">
                    <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#6d839d]">Listings</p>
                    <p className="mt-1 text-[1.35rem] font-semibold text-[#142132]">{leadAgent.activeListings}</p>
                  </div>
                  <div className="rounded-xl border border-[#dbe7f4] bg-white p-3">
                    <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#6d839d]">Involvement</p>
                    <p className="mt-1 text-[1.35rem] font-semibold text-[#142132]">{leadAgent.involvementPercent}%</p>
                  </div>
                  <div className="rounded-xl border border-[#cde8d9] bg-[#f2fbf6] p-3">
                    <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#2f7f58]">Opportunity</p>
                    <p className="mt-1 text-[1.1rem] font-semibold text-[#1f5d3e]">{formatCurrency(leadAgent.opportunityValue)}/mo</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {leadAgent.listings.map((listing) => (
                  <article key={listing.id} className="rounded-xl border border-[#dce6f2] bg-white p-3">
                    <p className="text-[0.84rem] font-semibold text-[#1f3348]">{listing.title}</p>
                    <p className="mt-1 text-[0.8rem] text-[#647991]">{listing.location}</p>
                    <p className="mt-1 text-[0.86rem] font-semibold text-[#142132]">{listing.price}</p>
                    <span className="mt-2 inline-flex rounded-full border border-[#ecdcc0] bg-[#fff8ef] px-2 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#8b6324]">
                      {listing.status}
                    </span>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4">
              <p className="text-[0.78rem] uppercase tracking-[0.1em] text-[#6d839d]">Opportunity Value</p>
              <p className="mt-1 text-[1.8rem] font-semibold tracking-[-0.04em] text-[#142132]">{formatCurrency(leadAgent.opportunityValue)}</p>
              <p className="text-[0.82rem] text-[#607389]">Monthly revenue potential</p>
              <div className="mt-4 space-y-2.5">
                <SoftCtaButton label="View Listings" />
                <SoftCtaButton label="Connect With Agent" />
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e5f3] bg-[#f6faff] text-[#355f88]"><Building2 size={16} /></span>
                <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Development Opportunity</h3>
              </div>
              <p className="mt-2 text-[0.92rem] leading-7 text-[#607389]">Strong demand, no competing development in segment</p>
            </div>
            <ScoreBadge score={88} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4">
              <p className="text-[1.1rem] font-semibold text-[#162538]">{leadDevelopment.name}</p>
              <p className="text-[0.84rem] text-[#637a92]">{leadDevelopment.developer} • {leadDevelopment.area}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-[#dbe7f4] bg-white p-3">
                  <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#6d839d]">Units</p>
                  <p className="mt-1 text-[1.35rem] font-semibold text-[#142132]">{leadDevelopment.units}</p>
                </div>
                <div className="rounded-xl border border-[#dbe7f4] bg-white p-3">
                  <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#6d839d]">Active Listings</p>
                  <p className="mt-1 text-[1.35rem] font-semibold text-[#142132]">{leadDevelopment.activeListings}</p>
                </div>
                <div className="rounded-xl border border-[#cde8d9] bg-[#f2fbf6] p-3">
                  <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#2f7f58]">Stage</p>
                  <p className="mt-1 text-[1.05rem] font-semibold text-[#1f5d3e]">{leadDevelopment.stage}</p>
                </div>
              </div>
            </div>

            <InsightCard title="Unit Mix">
              <div className="flex items-center justify-center">
                <SimpleDonut value={leadDevelopment.unitMix[0].percent} total={100} centerLabel={leadDevelopment.units} />
              </div>
              <div className="space-y-2">
                {leadDevelopment.unitMix.map((mix, index) => (
                  <div key={mix.label} className="rounded-xl border border-[#dce7f3] bg-white px-3 py-2 text-[0.84rem] text-[#355068]">
                    <div className="flex items-center justify-between gap-2">
                      <span>{mix.label}</span>
                      <span className="font-semibold text-[#142132]">{mix.percent}%</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-[#e2ebf5]">
                      <span className={`block h-full rounded-full ${index === 0 ? 'bg-[#3c78a8]' : index === 1 ? 'bg-[#289585]' : 'bg-[#2f8a63]'}`} style={{ width: `${mix.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </InsightCard>
          </div>

          <div className="mt-3 flex flex-wrap gap-2.5">
            <SoftCtaButton label="Run Feasibility" />
            <SoftCtaButton label="View Development" />
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e5f3] bg-[#f6faff] text-[#355f88]"><MapPinned size={16} /></span>
                <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Area Opportunity</h3>
              </div>
              <p className="mt-2 text-[0.92rem] leading-7 text-[#607389]">Low market share in high-volume area</p>
            </div>
            <ScoreBadge score={89} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <InsightCard title={leadArea.name}>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[#dbe7f4] bg-white p-3">
                  <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#6d839d]">Active Listings</p>
                  <p className="mt-1 text-[1.35rem] font-semibold text-[#142132]">{leadArea.listings}</p>
                </div>
                <div className="rounded-xl border border-[#dbe7f4] bg-white p-3">
                  <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#6d839d]">Market Share</p>
                  <p className="mt-1 text-[1.35rem] font-semibold text-[#142132]">{formatPercent(leadArea.marketShare)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
                <div className="flex items-center justify-between gap-2 text-[0.84rem]">
                  <span className="text-[#355068]">Opportunity value</span>
                  <span className="font-semibold text-[#142132]">{formatCurrency(leadArea.opportunityValue)}/month</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#e2ebf5]"><span className="block h-full rounded-full bg-[#3c78a8]" style={{ width: `${leadArea.heat}%` }} /></div>
              </div>
            </InsightCard>

            <InsightCard title="Suburb Heat Tiles">
              <div className="grid gap-2 sm:grid-cols-2">
                {leadArea.suburbs.map((suburb, index) => (
                  <div key={suburb} className="rounded-xl border border-[#dce7f3] bg-white px-3 py-2.5 text-[0.82rem] text-[#355068]">
                    <p className="font-semibold text-[#1f3348]">{suburb}</p>
                    <div className="mt-1 h-2 rounded-full bg-[#e2ebf5]"><span className="block h-full rounded-full bg-[#2f8a63]" style={{ width: `${Math.max(18, leadArea.heat - index * 12)}%` }} /></div>
                  </div>
                ))}
              </div>
            </InsightCard>
          </div>

          <div className="mt-3 flex flex-wrap gap-2.5">
            <SoftCtaButton label="View Area Strategy" />
          </div>
        </article>
      </section>

      <AiRecommendationPanel
        confidence={89}
        recommendations={[
          'Connect with 3 high-volume agents this week',
          'Run feasibility on Brookstone Heights expansion cluster',
          'Prioritize Pretoria East segment strategy',
          'Reduce premium stock pricing by 5% in next release',
        ]}
      />
    </IntelligenceShell>
  )
}

export default DeveloperIntelligenceOpportunityEnginePage
