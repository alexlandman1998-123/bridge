import { CheckCircle2 } from 'lucide-react'
import { memo } from 'react'

function BuyerJourneyOverviewPanel({ currentStageLabel = 'Buyer Timeline', stages = [], onStageSelect }) {
  return (
    <section
      className="overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_16px_42px_rgba(31,54,78,0.06)]"
      data-testid="buyer-journey-overview"
      data-render-boundary="buyer-journey"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf3f8] px-6 py-5 sm:px-8">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d839b]">Buyer Journey</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">
            {currentStageLabel}
          </h2>
        </div>
        <span className="rounded-full border border-[#cbdcf5] bg-[#eef5ff] px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#24568f]">
          Current Stage
        </span>
      </div>

      <div className="overflow-x-auto px-5 py-7 sm:px-8" data-testid="buyer-journey-rail">
        <ol
          className="grid min-w-[980px] gap-0"
          style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(140px, 1fr))` }}
        >
          {stages.map((step, index) => {
            const isCurrent = step.state === 'current'
            const isCompleted = step.state === 'completed'
            const dotClass = isCurrent
              ? 'border-[#2f7b9e] bg-white text-[#245f86] shadow-[0_0_0_7px_rgba(47,123,158,0.12)]'
              : isCompleted
                ? 'border-[#2f7b9e] bg-[#2f7b9e] text-white'
                : 'border-[#cad7e5] bg-white text-[#8fa1b4]'
            const lineClass = isCompleted || isCurrent ? 'bg-[#9bc7de]' : 'bg-[#dce6f1]'
            return (
              <li key={step.key} className="relative px-2">
                {index < stages.length - 1 ? (
                  <span className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[18px] h-0.5 ${lineClass}`} aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  onClick={() => onStageSelect(step.key)}
                  className={`relative flex min-h-[116px] w-full flex-col items-center text-center transition ${isCurrent ? 'rounded-[18px] border border-[#cfe0ee] bg-[#f4f9fc] px-3 py-3 shadow-[0_10px_22px_rgba(31,54,78,0.06)]' : 'px-2 py-3 hover:rounded-[18px] hover:bg-[#f8fbfd]'}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className={`z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold ${dotClass}`}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <p className="mt-3 max-w-[150px] text-sm font-semibold leading-5 text-[#203a54]">{step.label}</p>
                  <p className="mt-1 max-w-[150px] truncate text-xs font-semibold text-[#6d839b]" title={step.detail || (isCurrent ? 'Current Stage' : isCompleted ? 'Complete' : 'Upcoming')}>
                    {step.detail || (isCurrent ? 'Current Stage' : isCompleted ? 'Complete' : 'Upcoming')}
                  </p>
                  {isCurrent ? (
                    <span className="mt-2 rounded-full bg-[#dfeef7] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[#245f86]">Live</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

export default memo(BuyerJourneyOverviewPanel)
