import { IntelligenceShell, InsightCard, MetricRow } from './components'
import { marketDemandData } from './mockData'

function DeveloperIntelligenceMarketDemandPage() {
  return (
    <IntelligenceShell
      sectionTitle="Market Demand"
      sectionSubtitle="Track what buyers want, what converts, and where demand outpaces supply."
    >
      <section className="grid gap-5 xl:grid-cols-3">
        <InsightCard title="Top Performing Unit Types" className="xl:col-span-1">
          {marketDemandData.unitTypePerformance.map((item) => (
            <MetricRow
              key={item.label}
              label={item.label}
              value={`${item.conversion}% conversion`}
              percent={item.demand}
              helper={`${item.demand}% demand strength`}
              color="bg-[#3c78a8]"
            />
          ))}
        </InsightCard>

        <InsightCard title="Price Band Performance" className="xl:col-span-1">
          {marketDemandData.priceBands.map((band) => (
            <MetricRow
              key={band.label}
              label={band.label}
              value={band.velocity}
              percent={band.demand}
              helper={`${band.demand}% demand index`}
              color={band.velocity === 'Very Fast' ? 'bg-[#2f8a63]' : band.velocity === 'Fast' ? 'bg-[#3c78a8]' : band.velocity === 'Moderate' ? 'bg-[#289585]' : 'bg-[#b57a2f]'}
            />
          ))}
        </InsightCard>

        <InsightCard title="Buyer Affordability Trends" className="xl:col-span-1">
          {marketDemandData.affordability.map((item) => (
            <MetricRow
              key={item.label}
              label={item.label}
              value={`${item.percent}%`}
              percent={item.percent}
              helper="Current buyer profile mix"
              color="bg-[#6f4dcf]"
            />
          ))}
          <div className="rounded-xl border border-[#dce7f3] bg-[#f7fbff] px-3.5 py-3 text-[0.84rem] text-[#4a6280]">
            Predicted: affordability pressure will increase in premium segments over the next 45 days.
          </div>
        </InsightCard>
      </section>

      <section className="rounded-3xl border border-[#d8e5f3] bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Demand Heat Grid</h2>
        <p className="mt-2 text-[0.92rem] leading-7 text-[#607389]">Visual demand signal by product segment and price sensitivity.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['2-bed under R1.35M', 'High Demand', 'bg-[#2f8a63]'],
            ['3-bed R1.4M–R1.7M', 'Stable Demand', 'bg-[#3c78a8]'],
            ['Studio / investor', 'Emerging', 'bg-[#289585]'],
            ['Luxury R1.8M+', 'Cooling', 'bg-[#b57a2f]'],
          ].map(([title, state, color]) => (
            <article key={title} className="rounded-2xl border border-[#dce7f3] bg-white p-4">
              <p className="text-[0.86rem] font-semibold text-[#1f3348]">{title}</p>
              <div className="mt-2 h-2 rounded-full bg-[#e2ebf5]">
                <span className={`block h-full rounded-full ${color}`} style={{ width: `${title.includes('2-bed') ? 90 : title.includes('Luxury') ? 31 : title.includes('3-bed') ? 66 : 54}%` }} />
              </div>
              <p className="mt-2 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#607389]">{state}</p>
            </article>
          ))}
        </div>
      </section>
    </IntelligenceShell>
  )
}

export default DeveloperIntelligenceMarketDemandPage
