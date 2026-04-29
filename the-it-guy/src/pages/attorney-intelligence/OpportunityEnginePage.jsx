import { Building2, Compass, Link2, MapPinned, TrendingUp, Users } from 'lucide-react'
import {
  AiInsightPanel,
  AreaHeatTile,
  IntelligenceShell,
  MetricBar,
  MiniAvatar,
  OpportunityScoreBadge,
  SoftCtaButton,
} from './components'
import { formatCurrency, formatPercent } from './formatters'
import { attorneyOpportunityData, mockAgents, mockAreas, mockDevelopments } from './mockData'

function OpportunityEnginePage() {
  const leadAgent = mockAgents[0]
  const leadDevelopment = mockDevelopments[0]
  const leadArea = mockAreas[0]

  const marketComparison = [
    { label: 'Your Firm', value: leadArea.marketShare, tone: 'blue' },
    { label: 'Top Firms', value: leadArea.topFirmShare, tone: 'green' },
    { label: 'Market Average', value: 5.2, tone: 'amber' },
  ]

  return (
    <IntelligenceShell
      title="Opportunity Engine"
      subtitle="Identify agents, developments, and areas where your firm can win new transfer work."
    >
      <section className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
        <h2 className="text-[1.22rem] font-semibold tracking-[-0.03em] text-[#142132]">AI Opportunity Map</h2>
        <p className="mt-2 text-[0.95rem] leading-7 text-[#607389]">
          Bridge combines listing activity, transaction behaviour, and market share data to show where your firm can grow.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-[#d9e6f3] bg-[#f7fbff] px-4 py-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6e849f]">Potential Transactions</p>
            <p className="mt-1.5 text-[1.55rem] font-semibold tracking-[-0.04em] text-[#142132]">38/month</p>
          </article>
          <article className="rounded-2xl border border-[#d9e6f3] bg-[#f7fbff] px-4 py-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6e849f]">Estimated Monthly Revenue</p>
            <p className="mt-1.5 text-[1.55rem] font-semibold tracking-[-0.04em] text-[#142132]">{formatCurrency(attorneyOpportunityData.monthlyOpportunityValue)}</p>
          </article>
          <article className="rounded-2xl border border-[#cae8d7] bg-[#f2fbf6] px-4 py-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#2f7f58]">Opportunity Confidence</p>
            <p className="mt-1.5 text-[1.55rem] font-semibold tracking-[-0.04em] text-[#1f5d3e]">84%</p>
          </article>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {mockAreas.map((area) => (
            <AreaHeatTile key={area.id} area={area} />
          ))}
        </div>
      </section>

      <section className="grid gap-5">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Agent Opportunity</h2>
              <p className="mt-2 text-[0.95rem] leading-7 text-[#607389]">High-volume listing agent with no current legal relationship.</p>
            </div>
            <OpportunityScoreBadge score={leadAgent.opportunityScore} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4">
              <div className="flex items-center gap-3">
                <MiniAvatar label={leadAgent.avatar} />
                <div>
                  <p className="text-[1rem] font-semibold text-[#1f3348]">{leadAgent.name}</p>
                  <p className="text-[0.84rem] text-[#668098]">{leadAgent.agency} • {leadAgent.area}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <MetricBar label="Active Listings" value={leadAgent.activeListings} percent={100} helper="Live inventory in territory" />
                <MetricBar label="Est. Monthly Transactions" value={leadAgent.estimatedMonthlyTransactions} percent={76} helper="Bridge velocity estimate" tone="green" />
                <MetricBar label="Current Appointments" value={leadAgent.currentAppointments} percent={5} helper="With your firm" tone="amber" />
                <MetricBar label="Revenue Opportunity" value={`${formatCurrency(leadAgent.estimatedRevenueOpportunity)}/mo`} percent={91} helper="Potential if converted" />
              </div>

              <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#efddc5] bg-[#fffaf2] px-3 py-1 text-[0.74rem] font-semibold text-[#8b6324]">
                <Link2 size={12} /> High listing volume / No current legal relationship
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <SoftCtaButton label="View Listings" />
                <SoftCtaButton label="Connect With Agent" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {leadAgent.listings.map((listing) => (
                <article key={listing.id} className="rounded-2xl border border-[#dce6f2] bg-white p-3.5">
                  <p className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#6e849f]">{listing.status}</p>
                  <p className="mt-2 text-[0.95rem] font-semibold text-[#1f3348]">{listing.title}</p>
                  <p className="mt-1 text-[0.78rem] text-[#6c8299]">{listing.location}</p>
                  <p className="mt-2 text-[1.05rem] font-semibold text-[#142132]">{listing.price}</p>
                  <p className="mt-2 text-[0.76rem] leading-6 text-[#875f24]">No attorney relationship detected</p>
                </article>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Development Opportunity</h2>
              <p className="mt-2 text-[0.95rem] leading-7 text-[#607389]">Recurring transfer potential with a preferred attorney gap.</p>
            </div>
            <OpportunityScoreBadge score={leadDevelopment.opportunityScore} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[1rem] font-semibold text-[#1f3348]">{leadDevelopment.name}</p>
                  <p className="text-[0.84rem] text-[#668098]">{leadDevelopment.developer} • {leadDevelopment.area}</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#efddc5] bg-[#fffaf2] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#8b6324]">
                  Preferred Attorney Gap
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <MetricBar label="Units" value={leadDevelopment.units} percent={100} />
                <MetricBar label="Listings Active" value={leadDevelopment.listingsActive} percent={78} />
                <MetricBar label="Expected Transfers" value={`${leadDevelopment.expectedTransfersPerMonth}/mo`} percent={72} tone="green" />
                <MetricBar label="Revenue Opportunity" value={`${formatCurrency(leadDevelopment.estimatedRevenueOpportunity)}/mo`} percent={88} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <SoftCtaButton label="View Development" />
                <SoftCtaButton label="Request Introduction" />
              </div>
            </div>

            <div className="rounded-2xl border border-[#dce6f2] bg-white p-4">
              <h3 className="text-[0.9rem] font-semibold uppercase tracking-[0.1em] text-[#6e849f]">Pipeline Timeline</h3>
              <div className="mt-4 flex items-center justify-between gap-2">
                {['Launch', 'Sales', 'OTP', 'Transfer'].map((stage, index) => (
                  <div key={stage} className="flex min-w-0 flex-1 items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${index < 3 ? 'bg-[#3f78a8]' : 'bg-[#9db3c9]'}`} />
                    <span className="truncate text-[0.82rem] font-medium text-[#50677f]">{stage}</span>
                  </div>
                ))}
              </div>
              <AiInsightPanel
                copy="Bridge has detected strong sales activity but no preferred attorney assigned. Early relationship capture could secure recurring transfer work."
              />
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Area Opportunity</h2>
              <p className="mt-2 text-[0.95rem] leading-7 text-[#607389]">Market share gap in a high-volume corridor.</p>
            </div>
            <div className="text-right">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#6e849f]">Estimated Opportunity</p>
              <p className="mt-1 text-[1.5rem] font-semibold tracking-[-0.04em] text-[#142132]">{formatCurrency(leadArea.estimatedOpportunity)}/month</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4">
              <h3 className="text-[1rem] font-semibold text-[#1f3348]">{leadArea.name}</h3>
              <p className="mt-1 text-[0.83rem] text-[#6d8299]">
                {leadArea.activeListings} active listings • {leadArea.monthlyTransactions} monthly transactions
              </p>
              <div className="mt-4 space-y-2.5">
                {marketComparison.map((item) => (
                  <MetricBar
                    key={item.label}
                    label={item.label}
                    value={formatPercent(item.value)}
                    percent={(item.value / Math.max(leadArea.topFirmShare, 1)) * 100}
                    tone={item.tone}
                  />
                ))}
              </div>
              <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#efddc5] bg-[#fffaf2] px-3 py-1 text-[0.74rem] font-semibold text-[#8b6324]">
                <TrendingUp size={12} /> Gap: {formatPercent(leadArea.gap)}
              </div>
            </div>

            <div className="rounded-2xl border border-[#dce6f2] bg-white p-4">
              <h3 className="text-[0.92rem] font-semibold uppercase tracking-[0.1em] text-[#6e849f]">Heat Corridor</h3>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {leadArea.suburbs.map((suburb, index) => (
                  <div
                    key={suburb}
                    className={`rounded-xl border px-3.5 py-3 text-[0.85rem] font-medium ${
                      index < 2
                        ? 'border-[#c9e8d6] bg-[#f3fdf7] text-[#236744]'
                        : 'border-[#dce6f2] bg-[#f7fbff] text-[#355f88]'
                    }`}
                  >
                    {suburb}
                  </div>
                ))}
              </div>
              <AiInsightPanel
                copy="Your firm is underrepresented in a high-volume residential corridor with strong listing-to-transfer activity."
                ctaLabel="View Area Strategy"
              />
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
        <h2 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">Recommended Next Actions</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Users, text: 'Connect with 3 high-volume agents' },
            { icon: Building2, text: 'Target 2 developments without preferred attorney' },
            { icon: MapPinned, text: 'Increase presence in Pretoria East' },
            { icon: Compass, text: 'Reduce referral concentration risk' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <article key={item.text} className="rounded-2xl border border-[#dce7f2] bg-[#f9fcff] p-4">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7e5f3] bg-white text-[#355f88]">
                  <Icon size={14} />
                </span>
                <p className="mt-3 text-[0.88rem] font-semibold leading-6 text-[#22374d]">{item.text}</p>
              </article>
            )
          })}
        </div>
      </section>
    </IntelligenceShell>
  )
}

export default OpportunityEnginePage
