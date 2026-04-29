import { Network } from 'lucide-react'
import {
  AiInsightPanel,
  IntelligenceKpiCard,
  IntelligenceShell,
  MetricBar,
  MiniAvatar,
} from './components'
import { formatCurrency, formatPercent } from './formatters'
import { mockPartners } from './mockData'

function PartnerNodeMap({ nodes }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {nodes.map((node) => {
        const tone =
          node.type === 'firm'
            ? 'border-[#cde8d9] bg-[#f2fcf7] text-[#1f5d3e]'
            : node.strength === 'strong'
              ? 'border-[#d6e6f7] bg-[#f5faff] text-[#355f88]'
              : node.strength === 'medium'
                ? 'border-[#e5eaf2] bg-[#f9fbff] text-[#51677f]'
                : 'border-[#ecdcc0] bg-[#fffaf2] text-[#8b6324]'

        return (
          <article key={node.id} className={`rounded-2xl border p-4 ${tone}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.86rem] font-semibold uppercase tracking-[0.08em]">{node.type.replace('_', ' ')}</p>
              <span className="text-[0.76rem] font-semibold">{node.value}</span>
            </div>
            <p className="mt-2 text-[1rem] font-semibold">{node.label}</p>
            <div className="mt-2 h-2 rounded-full bg-white/70">
              <span className="block h-full rounded-full bg-current" style={{ width: `${Math.max(8, Math.min(100, node.value || 0))}%`, opacity: 0.72 }} />
            </div>
          </article>
        )
      })}
    </div>
  )
}

function PartnerIntelligencePage() {
  return (
    <IntelligenceShell
      title="Partner Intelligence"
      subtitle="Understand which partners drive value and who should be targeted next."
    >
      <section className="grid gap-4 xl:grid-cols-4">
        <IntelligenceKpiCard
          label="Top Partner Value"
          value={formatCurrency(mockPartners.topPartnerValue)}
          subtext="Highest contributing relationship in active network"
        />
        <IntelligenceKpiCard
          label="Referral Concentration"
          value={formatPercent(mockPartners.referralConcentration)}
          subtext="Share of work from top three relationships"
          tone="amber"
        />
        <IntelligenceKpiCard
          label="New Partner Matches"
          value={mockPartners.newPartnerMatches}
          subtext="AI-matched introductions this quarter"
        />
        <IntelligenceKpiCard
          label="Partner Growth Potential"
          value={`${formatCurrency(mockPartners.partnerGrowthPotential)}/month`}
          subtext="Estimated incremental transfer revenue"
          tone="green"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Relationship Map</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d8e5f3] bg-[#f6faff] px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#5b738f]">
              <Network size={13} /> Live network view
            </span>
          </div>
          <p className="mt-2 text-[0.92rem] leading-7 text-[#607389]">
            Transaction network centered on your firm, with node size mapped to value and color mapped to relationship strength.
          </p>
          <div className="mt-4">
            <PartnerNodeMap nodes={mockPartners.networkNodes} />
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Referral Risk</h2>
          <p className="mt-2 text-[0.92rem] leading-7 text-[#607389]">58% of your work comes from 3 partners.</p>

          <div className="mt-4 rounded-2xl border border-[#ecdcc0] bg-[#fffaf2] p-4">
            <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#8b6324]">Risk Level</p>
            <p className="mt-1 text-[1.25rem] font-semibold text-[#7f5922]">Medium / High</p>
            <div className="mt-3 h-3 rounded-full bg-[#f1e2c8]">
              <span className="block h-full rounded-full bg-[#b17c30]" style={{ width: `${mockPartners.referralConcentration}%` }} />
            </div>
            <p className="mt-2 text-[0.82rem] text-[#805a24]">Concentration: {formatPercent(mockPartners.referralConcentration)}</p>
          </div>

          <AiInsightPanel
            copy="Diversify partner base by targeting 5 high-volume agents in Pretoria East and Boksburg."
            ctaLabel="View Diversification Plan"
          />
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">Top Current Partners</h2>
          <p className="mt-2 text-[0.9rem] text-[#61768d]">Volume, value, and reliability across your strongest relationships.</p>
          <div className="mt-4 space-y-3">
            {mockPartners.topCurrentPartners.map((item) => (
              <article key={item.name} className="rounded-2xl border border-[#dce6f2] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.94rem] font-semibold text-[#1f3348]">{item.name}</p>
                    <p className="text-[0.8rem] text-[#667f98]">{item.type}</p>
                  </div>
                  <span className="text-[0.88rem] font-semibold text-[#142132]">{formatCurrency(item.value)}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MetricBar label="Volume" value={item.volume} percent={Math.min(100, item.volume * 2.2)} />
                  <MetricBar label="Value" value={formatCurrency(item.value)} percent={Math.min(100, item.value / 450000)} tone="blue" />
                  <MetricBar label="Reliability" value={`${item.reliability}%`} percent={item.reliability} tone="green" />
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <h2 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">Missing High-Value Partners</h2>
          <p className="mt-2 text-[0.9rem] text-[#61768d]">Recommended partners not currently connected to your firm.</p>
          <div className="mt-4 space-y-3">
            {mockPartners.missingHighValuePartners.map((item) => (
              <article key={item.name} className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MiniAvatar label={item.avatar} tone="purple" />
                    <div className="min-w-0">
                      <p className="truncate text-[0.94rem] font-semibold text-[#1f3348]">{item.name}</p>
                      <p className="text-[0.8rem] text-[#667f98]">{item.type} • {item.volume} tx/mo</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-[#d6e6f7] bg-[#f5faff] px-2.5 py-0.5 text-[0.72rem] font-semibold text-[#355f88]">
                    Match {item.match}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MetricBar label="Opportunity" value={`${formatCurrency(item.estimatedOpportunity)}/mo`} percent={item.match} />
                  <MetricBar label="Partner Volume" value={item.volume} percent={Math.min(100, item.volume * 5)} tone="green" />
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>
    </IntelligenceShell>
  )
}

export default PartnerIntelligencePage
