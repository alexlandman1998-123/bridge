import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react'
import { IntelligenceShell, InsightCard, MetricRow, SimpleDonut } from './components'
import { portfolioPerformance } from './mockData'

function RiskPill({ risk }) {
  const toneClass = risk === 'Low' ? 'border-[#cae8d7] bg-[#f2fbf6] text-[#2f7f58]' : risk === 'Medium' ? 'border-[#ecdcbf] bg-[#fff8ef] text-[#8b6324]' : 'border-[#efcaca] bg-[#fff4f4] text-[#9a3e3d]'
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.08em] ${toneClass}`}>{risk} risk</span>
}

function DeveloperIntelligencePortfolioPerformancePage() {
  const avgSellThrough = Math.round(
    portfolioPerformance.developments.reduce((sum, row) => sum + row.sellThrough, 0) /
      Math.max(1, portfolioPerformance.developments.length),
  )

  return (
    <IntelligenceShell
      sectionTitle="Portfolio Performance"
      sectionSubtitle="Monitor active developments against forecast and detect risk early."
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <InsightCard title="Portfolio Snapshot">
          <div className="flex items-center justify-center">
            <SimpleDonut value={avgSellThrough} total={100} centerLabel={`${avgSellThrough}%`} size={220} />
          </div>
          <MetricRow label="Active developments" value={portfolioPerformance.developments.length} helper="Monitored in intelligence layer" />
          <MetricRow label="Average sell-through" value={`${avgSellThrough}%`} helper="Across active portfolio" percent={avgSellThrough} color="bg-[#2f8a63]" />
          <MetricRow label="Risk alerts" value="4 detected" helper="Requires decision attention" percent={44} color="bg-[#b57a2f]" />
        </InsightCard>

        <InsightCard title="Development Performance Matrix">
          <div className="space-y-3">
            {portfolioPerformance.developments.map((development) => (
              <article key={development.name} className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.9rem] font-semibold text-[#1f3348]">{development.name}</p>
                  <RiskPill risk={development.risk} />
                </div>
                <p className="mt-0.5 text-[0.76rem] uppercase tracking-[0.08em] text-[#6d839d]">{development.stage}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <MetricRow label="Sell-through" value={`${development.sellThrough}%`} percent={development.sellThrough} color="bg-[#3c78a8]" />
                  <MetricRow label="Forecast" value={`${development.forecast}%`} percent={development.forecast} color="bg-[#6f4dcf]" />
                </div>
              </article>
            ))}
          </div>
        </InsightCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-[#dce6f2] bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#cde8d9] bg-[#f2fbf6] text-[#2f7f58]"><CheckCircle2 size={17} /></div>
          <h3 className="mt-3 text-[1.05rem] font-semibold text-[#162538]">Healthy Projects</h3>
          <p className="mt-1 text-[0.9rem] text-[#607389]">3 developments ahead of forecast.</p>
        </article>
        <article className="rounded-2xl border border-[#dce6f2] bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ecdcbf] bg-[#fff8ef] text-[#8b6324]"><Clock3 size={17} /></div>
          <h3 className="mt-3 text-[1.05rem] font-semibold text-[#162538]">Watchlist Projects</h3>
          <p className="mt-1 text-[0.9rem] text-[#607389]">2 developments tracking below expected velocity.</p>
        </article>
        <article className="rounded-2xl border border-[#dce6f2] bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#efcaca] bg-[#fff4f4] text-[#9a3e3d]"><AlertTriangle size={17} /></div>
          <h3 className="mt-3 text-[1.05rem] font-semibold text-[#162538]">Immediate Risks</h3>
          <p className="mt-1 text-[0.9rem] text-[#607389]">Finance latency and premium pricing pressure detected.</p>
        </article>
      </section>
    </IntelligenceShell>
  )
}

export default DeveloperIntelligencePortfolioPerformancePage
