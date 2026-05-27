import BondSectionCard from './BondSectionCard'

export default function BondPerformanceSnapshot({ items = [] }) {
  return (
    <BondSectionCard
      eyebrow="Performance Snapshot"
      title="How the bond desk is performing"
      description="A quick read on approval strength, velocity, value, and the lenders helping you move fastest."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {items.map((item) => (
          <article key={item.key} className="rounded-[20px] border border-[#e3ebf5] bg-[#fbfdff] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">{item.label}</p>
            <p className="mt-3 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.value}</p>
            <p className="mt-2 text-sm text-[#60758d]">{item.comparison}</p>
          </article>
        ))}
      </div>
    </BondSectionCard>
  )
}
