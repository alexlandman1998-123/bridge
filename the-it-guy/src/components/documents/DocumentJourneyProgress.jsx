import { AlertTriangle, Check, Circle } from 'lucide-react'

function StageIcon({ status }) {
  if (status === 'complete') return <Check size={15} aria-hidden="true" />
  if (status === 'attention') return <AlertTriangle size={15} aria-hidden="true" />
  return <Circle size={12} fill={status === 'current' ? 'currentColor' : 'none'} aria-hidden="true" />
}

export function DocumentJourneyProgress({ model = null, compact = false }) {
  if (model?.contract !== 'arch9-document-journey-progress-v1') return null
  return (
    <section data-testid="document-journey-progress" aria-label="Document journey" className="rounded-[20px] border border-[#d7e3ef] bg-white p-4 shadow-[0_12px_32px_rgba(24,48,76,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.11em] text-[#7389a2]">Document journey</p>
          <h2 className="mt-1 text-base font-bold text-[#142132]">{model.title}</h2>
          {!compact ? <p className="mt-1 text-xs text-[#607387]">{model.summary}</p> : null}
        </div>
        <span className="text-xs font-bold text-[#35546c]">{model.progressPercent}%</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e5edf5]" aria-hidden="true">
        <div className="h-full rounded-full bg-[#12385f] transition-[width]" style={{ width: `${model.progressPercent}%` }} />
      </div>
      <ol className={`mt-4 grid gap-2 ${model.stages.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-5'}`}>
        {model.stages.map((stage) => {
          const current = stage.isCurrent
          const style = stage.status === 'complete'
            ? 'border-[#cde6d7] bg-[#f0faf4] text-[#276b46]'
            : stage.status === 'attention'
              ? 'border-[#efcfca] bg-[#fff3f1] text-[#92372b]'
              : current
                ? 'border-[#b9d0e5] bg-[#edf5fc] text-[#244f76]'
                : 'border-[#e1e8f0] bg-[#fafcfe] text-[#718398]'
          return (
            <li key={stage.id} aria-current={current ? 'step' : undefined} className={`flex items-center gap-2 rounded-[12px] border px-3 py-2.5 ${style}`}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80"><StageIcon status={stage.status} /></span>
              <span className="min-w-0">
                <span className="block text-xs font-bold">{stage.label}</span>
                {!compact ? <span className="mt-0.5 block text-[0.68rem] leading-4 opacity-80">{stage.description}</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
