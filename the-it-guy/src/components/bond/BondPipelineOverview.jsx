import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import BondSectionCard from './BondSectionCard'
import BondStatusBadge from './BondStatusBadge'

export default function BondPipelineOverview({
  items = [],
  rangeLabel = 'This Month',
}) {
  return (
    <BondSectionCard
      eyebrow="Pipeline Overview"
      title="Finance stages across the current bond book"
      description="Follow movement from first contact through submission, bank feedback, approval, and handoff into registration."
      action={
        <div className="flex flex-wrap items-center gap-3">
          <BondStatusBadge tone="neutral" label={rangeLabel} />
          <Link
            to="/bond/pipeline"
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#d9e3ef] bg-[#f7fbff] px-4 text-sm font-semibold text-[#17324d] transition hover:border-[#c2d3e6]"
          >
            View Full Pipeline
          </Link>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-10">
        {items.map((item, index) => (
          <Link
            key={item.key}
            to={item.href}
            className="rounded-[20px] border border-[#e3ebf5] bg-[#fbfdff] p-4 transition hover:-translate-y-[1px] hover:border-[#cddaea]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#17324d]">{item.label}</p>
              {index < items.length - 1 ? <ArrowRight size={14} className="hidden text-[#a0b1c4] xl:block" /> : null}
            </div>
            <p className="mt-4 text-[1.85rem] font-semibold tracking-[-0.04em] text-[#142132]">{item.count}</p>
            <p className="mt-2 text-sm leading-6 text-[#5f7287]">{item.totalBondValueLabel}</p>
            <div className="mt-4">
              <BondStatusBadge
                status={item.atRiskCount > 0 ? 'at_risk' : 'approved'}
                label={item.atRiskCount > 0 ? `${item.atRiskCount} stuck / at risk` : 'Healthy movement'}
              />
            </div>
          </Link>
        ))}
      </div>
    </BondSectionCard>
  )
}
