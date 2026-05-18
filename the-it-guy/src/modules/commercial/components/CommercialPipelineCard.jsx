import { ArrowRight, MoreHorizontal } from 'lucide-react'
import CommercialStatusPill from './CommercialStatusPill'
import CommercialStageMoveMenu from './CommercialStageMoveMenu'

function CommercialPipelineCard({
  title,
  eyebrow,
  status,
  tone = 'blue',
  details = [],
  stage,
  stages = [],
  moving = false,
  onOpen,
  onStageChange,
}) {
  const toneClass = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'

  return (
    <article
      className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:border-[#b7cbdd] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${toneClass}`}>{eyebrow}</span> : null}
          <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 tracking-[-0.025em] text-[#102236]">{title}</h3>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50"
          onClick={(event) => {
            event.stopPropagation()
            onOpen?.()
          }}
          aria-label="View record"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      <dl className="mt-4 grid gap-2">
        {details.map((detail) => (
          <div key={detail.label} className="flex items-start justify-between gap-3 text-xs">
            <dt className="shrink-0 text-slate-400">{detail.label}</dt>
            <dd className="min-w-0 text-right font-semibold text-slate-700">{detail.value || '-'}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <CommercialStatusPill value={status || 'active'} />
        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1267a3]" onClick={onOpen}>
          Details
          <ArrowRight size={13} />
        </button>
      </div>

      <div className="mt-3">
        <CommercialStageMoveMenu value={stage} stages={stages} disabled={moving} onChange={onStageChange} />
      </div>
    </article>
  )
}

export default CommercialPipelineCard
