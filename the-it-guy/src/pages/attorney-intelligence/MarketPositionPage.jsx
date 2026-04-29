import { Medal } from 'lucide-react'
import {
  AiInsightPanel,
  IntelligenceKpiCard,
  IntelligenceShell,
  MetricBar,
  SoftCtaButton,
  TrendPill,
} from './components'
import { formatPercent } from './formatters'
import { mockAreas } from './mockData'

const ranking = [
  { name: 'Firm A', share: 9.8 },
  { name: 'Firm B', share: 8.6 },
  { name: 'Firm C', share: 7.2 },
  { name: 'Firm D', share: 6.1 },
  { name: 'Firm E', share: 5.5 },
  { name: 'Firm F', share: 4.9 },
  { name: 'Your Firm', share: 4.4, isYou: true },
]

const transactionTypePosition = [
  { label: 'Residential Transfers', value: 61, share: 6.2 },
  { label: 'New Development Transfers', value: 39, share: 4.8 },
  { label: 'Private Sales', value: 33, share: 5.4 },
  { label: 'Commercial Transfers', value: 19, share: 3.1 },
]

function MarketPositionPage() {
  return (
    <IntelligenceShell
      title="Market Position"
      subtitle="Track your firm’s competitive position by value, volume, area, and transaction type."
    >
      <section className="grid gap-4 xl:grid-cols-4">
        <IntelligenceKpiCard label="Local Rank" value="#7" subtext="Among active firms in your current operating corridor" />
        <IntelligenceKpiCard label="Provincial Rank" value="#34" subtext="Across simulated provincial transfer market" />
        <IntelligenceKpiCard label="Market Share by Volume" value="4.4%" subtext="Up 0.8% versus prior period" tone="green" />
        <IntelligenceKpiCard label="Market Share by Value" value="5.1%" subtext="Strong value concentration on key partners" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Competitive Ranking</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d8e5f3] bg-[#f7fbff] px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#5b738f]">
              <Medal size={13} /> Leaderboard
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {ranking.map((item, index) => (
              <div
                key={item.name}
                className={`rounded-xl border px-3.5 py-3 ${item.isYou ? 'border-[#cbe6d8] bg-[#f1fbf6]' : 'border-[#dce6f2] bg-white'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-[0.92rem] font-semibold ${item.isYou ? 'text-[#1f5d3e]' : 'text-[#22374d]'}`}>
                    {index + 1}. {item.name}
                  </p>
                  <p className={`text-[0.92rem] font-semibold ${item.isYou ? 'text-[#1f5d3e]' : 'text-[#142132]'}`}>{formatPercent(item.share)}</p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#e3ecf6]">
                  <span className={`block h-full rounded-full ${item.isYou ? 'bg-[#2f8a63]' : 'bg-[#4f7da6]'}`} style={{ width: `${Math.max(6, item.share * 9)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Market Share by Area</h2>
          <p className="mt-2 text-[0.9rem] text-[#607389]">Opportunity level and directional movement by market node.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {mockAreas.map((area) => (
              <article key={area.id} className="rounded-xl border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.9rem] font-semibold text-[#1f3348]">{area.name}</p>
                  <TrendPill value={area.trend === 'up' ? '+0.6%' : '+0.1%'} direction={area.trend === 'up' ? 'up' : 'down'} />
                </div>
                <p className="mt-1 text-[1.1rem] font-semibold text-[#142132]">{formatPercent(area.marketShare)}</p>
                <p className="mt-1 text-[0.78rem] text-[#6c8299]">{area.opportunityLevel}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Transaction Type Position</h2>
          <div className="mt-4 space-y-3">
            {transactionTypePosition.map((item) => (
              <MetricBar
                key={item.label}
                label={item.label}
                value={`${item.value} matters • ${formatPercent(item.share)}`}
                percent={item.share * 10}
                tone={item.share > 5 ? 'green' : 'blue'}
              />
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <AiInsightPanel
            title="AI Competitive Insight"
            copy="Your firm performs strongly in Boksburg but is underrepresented in Pretoria East, where listing volume and new development activity are accelerating."
            ctaLabel="Open Opportunity Engine"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-[#dce6f2] bg-[#f9fcff] p-4">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#6d839d]">Competitive Momentum</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-[#142132]">+1.2%</p>
              <p className="mt-1 text-[0.82rem] text-[#607389]">Share movement over trailing 90 days</p>
            </article>
            <article className="rounded-xl border border-[#dce6f2] bg-[#f9fcff] p-4">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#6d839d]">Priority Region</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-[#142132]">Pretoria East</p>
              <p className="mt-1 text-[0.82rem] text-[#607389]">Highest gap-to-volume ratio detected</p>
            </article>
          </div>
          <div className="mt-4">
            <SoftCtaButton label="Open Opportunity Engine" />
          </div>
        </article>
      </section>
    </IntelligenceShell>
  )
}

export default MarketPositionPage
