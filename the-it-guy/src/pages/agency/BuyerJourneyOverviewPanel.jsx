import { CheckCircle2 } from 'lucide-react'
import { memo } from 'react'

const STAGE_LABELS = {
  buyer_onboarding_sent: 'Onboarding sent',
  buyer_onboarding_submitted: 'Onboarding submitted',
  offer: 'OTP signed',
  transaction: 'Transaction created',
  buyer_documents_uploaded: 'Documents uploaded',
}

const STATUS_LABELS = {
  'Not reached': 'Contact needed',
  'Not sent': 'Pending',
  'Awaiting submission': 'Pending',
  'Not uploaded': 'Pending',
  'Not started': 'Pending',
  'Not booked': 'Not scheduled',
  'Checking requirements': 'Checking…',
  'Signed OTP recorded': 'Signed',
}

function BuyerJourneyOverviewPanel({ currentStageLabel = 'Buyer Timeline', stages = [], onStageSelect, onTransactionSetup }) {
  const currentStage = stages.find(step => step.state === 'current')
  const heading = STAGE_LABELS[currentStage?.key] || currentStageLabel
  return (
    <section
      className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_16px_42px_rgba(31,54,78,0.06)]"
      data-testid="buyer-journey-overview"
      data-render-boundary="buyer-journey"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf3f8] px-6 py-5 sm:px-8">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d839b]">Buyer Journey</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">
            {heading}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {onTransactionSetup ? <button type="button" onClick={onTransactionSetup} className="rounded-full border border-[#cbdcf5] bg-white px-3 py-1 text-xs font-semibold text-[#24568f]">Transaction setup</button> : null}
        <span className="rounded-full border border-[#cbdcf5] bg-[#eef5ff] px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#24568f]">
          Current step
        </span>
        </div>
      </div>

      <div className="min-w-0 max-w-full overflow-x-auto px-5 py-7 sm:px-8" data-testid="buyer-journey-rail">
        <ol
          className="grid gap-0"
          style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(0, 1fr))`, minWidth: `${Math.max(stages.length, 1) * 104}px` }}
        >
          {stages.map((step, index) => {
            const isCurrent = step.state === 'current'
            const isCompleted = step.state === 'completed'
            const label = STAGE_LABELS[step.key] || step.label
            const detail = STATUS_LABELS[step.detail] || step.detail || (isCompleted ? 'Complete' : 'Pending')
            const dotClass = isCurrent
              ? 'border-[#2f7b9e] bg-white text-[#245f86] shadow-[0_0_0_7px_rgba(47,123,158,0.12)]'
              : isCompleted
                ? 'border-[#2f7b9e] bg-[#2f7b9e] text-white'
                : 'border-[#cad7e5] bg-white text-[#8fa1b4]'
            const lineClass = isCompleted || isCurrent ? 'bg-[#9bc7de]' : 'bg-[#dce6f1]'
            return (
              <li key={step.key} className="relative min-w-0 px-2">
                {index < stages.length - 1 ? (
                  <span className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[18px] h-0.5 ${lineClass}`} aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  onClick={() => onStageSelect(step.key)}
                  className={`relative flex min-h-[116px] min-w-0 w-full flex-col items-center text-center transition ${isCurrent ? 'rounded-[18px] border border-[#cfe0ee] bg-[#f4f9fc] px-3 py-3 shadow-[0_10px_22px_rgba(31,54,78,0.06)]' : 'px-2 py-3 hover:rounded-[18px] hover:bg-[#f8fbfd]'}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${step.label}: ${detail}`}
                  title={step.label}
                >
                  <span className={`z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold ${dotClass}`}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <p className="mt-3 flex min-h-10 max-w-full break-words items-center justify-center text-sm font-semibold leading-5 text-[#203a54]">{label}</p>
                  <p className="mt-1 max-w-[150px] truncate text-xs font-medium text-[#6d839b]" title={detail}>
                    {detail}
                  </p>
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
