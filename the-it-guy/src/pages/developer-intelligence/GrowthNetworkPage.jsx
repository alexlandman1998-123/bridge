import { Building2, CircleDollarSign, Users } from 'lucide-react'
import { IntelligenceShell, InsightCard, MetricRow, ScoreBadge, SoftCtaButton } from './components'
import { formatCurrency } from './formatters'
import { growthNetwork } from './mockData'

function Avatar({ text }) {
  return <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(140deg,#3e6d94_0%,#294966_100%)] text-[0.72rem] font-semibold text-white">{text}</span>
}

function DeveloperIntelligenceGrowthNetworkPage() {
  return (
    <IntelligenceShell
      sectionTitle="Growth Network"
      sectionSubtitle="Find partner relationships that unlock faster conversion and recurring deal flow."
    >
      <section className="grid gap-5 xl:grid-cols-3">
        <InsightCard title="Top Agents">
          {growthNetwork.topAgents.map((agent) => (
            <article key={agent.name} className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar text={agent.avatar} />
                  <div className="min-w-0">
                    <p className="truncate text-[0.88rem] font-semibold text-[#1f3348]">{agent.name}</p>
                    <p className="text-[0.76rem] text-[#6d839d]">{agent.volume} deals/month potential</p>
                  </div>
                </div>
                <p className="text-[0.84rem] font-semibold text-[#142132]">{formatCurrency(agent.value)}</p>
              </div>
            </article>
          ))}
        </InsightCard>

        <InsightCard title="Top Originators">
          {growthNetwork.topOriginators.map((originator) => (
            <article key={originator.name} className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
              <p className="text-[0.88rem] font-semibold text-[#1f3348]">{originator.name}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <MetricRow label="Approval" value={originator.approvalRate} percent={Number(originator.approvalRate.replace('%', ''))} color="bg-[#2f8a63]" />
                <MetricRow label="Avg days" value={originator.avgApprovalDays} percent={Math.max(10, 100 - originator.avgApprovalDays * 4)} color="bg-[#3c78a8]" />
              </div>
              <p className="mt-2 text-[0.8rem] font-semibold text-[#355068]">Potential value {formatCurrency(originator.value)}</p>
            </article>
          ))}
        </InsightCard>

        <InsightCard title="Recommended Partners">
          {growthNetwork.recommendedPartners.map((partner) => (
            <article key={partner.name} className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.88rem] font-semibold text-[#1f3348]">{partner.name}</p>
                <ScoreBadge score={partner.score} />
              </div>
              <p className="mt-2 text-[0.8rem] text-[#607389]">{partner.reason}</p>
            </article>
          ))}
        </InsightCard>
      </section>

      <section className="rounded-3xl border border-[#d8e5f3] bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-[#dce7f3] bg-[#fbfdff] p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e5f3] bg-white text-[#355f88]"><Users size={17} /></div>
            <h3 className="mt-3 text-[1.05rem] font-semibold text-[#162538]">Agent Flywheel</h3>
            <p className="mt-1 text-[0.9rem] text-[#607389]">Prioritise top residential agents to increase weekly opportunity intake.</p>
            <div className="mt-3"><SoftCtaButton label="Activate Agent Plan" /></div>
          </article>
          <article className="rounded-2xl border border-[#dce7f3] bg-[#fbfdff] p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e5f3] bg-white text-[#355f88]"><Building2 size={17} /></div>
            <h3 className="mt-3 text-[1.05rem] font-semibold text-[#162538]">Development Partnerships</h3>
            <p className="mt-1 text-[0.9rem] text-[#607389]">Target projects with high activity and weak incumbent developer relationships.</p>
            <div className="mt-3"><SoftCtaButton label="Open Partner Targets" /></div>
          </article>
          <article className="rounded-2xl border border-[#dce7f3] bg-[#fbfdff] p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e5f3] bg-white text-[#355f88]"><CircleDollarSign size={17} /></div>
            <h3 className="mt-3 text-[1.05rem] font-semibold text-[#162538]">Revenue Acceleration</h3>
            <p className="mt-1 text-[0.9rem] text-[#607389]">Combine agent and originator strategy to shorten cycle time and improve conversion.</p>
            <div className="mt-3"><SoftCtaButton label="Launch Revenue Plan" /></div>
          </article>
        </div>
      </section>
    </IntelligenceShell>
  )
}

export default DeveloperIntelligenceGrowthNetworkPage
