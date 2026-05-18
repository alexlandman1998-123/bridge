import { Link } from 'react-router-dom'
import { formatCurrency } from '../commercialFormatters'

function CommercialPipelineSummary({ title, subtitle, stages = [], ctaTo, ctaLabel, showValue = false }) {
  const maxCount = Math.max(1, ...stages.map((stage) => Number(stage.count || 0)))

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
        </div>
        {ctaTo ? (
          <Link to={ctaTo} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0f5f9f] transition hover:bg-slate-50">
            {ctaLabel}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {stages.map((stage) => {
          const width = Math.max(4, (Number(stage.count || 0) / maxCount) * 100)
          return (
            <div key={stage.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-600">{stage.label}</span>
                <span className="font-semibold text-[#102236]">{stage.count}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f8d63,#0f5f9f)]" style={{ width: `${width}%` }} />
              </div>
              {showValue && Number(stage.value || 0) > 0 ? (
                <p className="mt-1 text-[11px] font-semibold text-slate-400">{formatCurrency(stage.value)} active value</p>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default CommercialPipelineSummary
