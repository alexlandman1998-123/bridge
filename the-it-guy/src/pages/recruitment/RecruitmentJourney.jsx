import { CheckCircle2 } from 'lucide-react'
import { recruitmentStages, stageLabel } from './recruitmentModel'
import { reopenRecruitmentStage } from './recruitmentReviewModel'

const journeyStages = recruitmentStages.flatMap((stage) => {
  if (stage[0] === 'onboarding_complete') return []
  return stage[0] === 'application_submitted' && !recruitmentStages.some(([key]) => key === 'documents_uploaded') ? [stage, ['documents_uploaded', 'Documents Uploaded']] : [stage]
})

export default function RecruitmentJourney({ lead }) {
  const hasDocuments = (lead.documents_json || []).some((document) => typeof document?.path === 'string' && document.path.trim())
  const journeyStage = (status) => status === 'onboarding_complete' ? 'contract_signed'
    : status === 'application_submitted' && hasDocuments ? 'documents_uploaded' : status
  const currentIndex = journeyStages.findIndex(([key]) => key === journeyStage(lead.status))
  const closed = lead.status === 'closed_lost'
  const stoppedIndex = closed ? journeyStages.findIndex(([key]) => key === journeyStage(reopenRecruitmentStage(lead))) : -1
  const reachedIndex = closed ? stoppedIndex : currentIndex
  return <section aria-label="Agent journey" className="-mx-6 -mt-6 overflow-hidden border-b border-[#edf3f8]">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf3f8] px-6 py-5 sm:px-8">
      <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d839b]">Agent Journey</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">{journeyStages[currentIndex]?.[1] || stageLabel(lead.status)}</h2>
      </div>
      <span className="rounded-full border border-[#cbdcf5] bg-[#eef5ff] px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#24568f]">
        {closed ? 'Closed' : lead.status === 'legacy_joined' ? 'Historical record' : lead.status === 'agent_activated' ? 'Complete' : 'Current Stage'}
      </span>
    </div>
    <div className="overflow-x-auto px-5 py-7 sm:px-8" tabIndex={0} role="region" aria-label="Agent journey stages">
      <ol className="grid min-w-[1120px] grid-cols-8 gap-0">
        {journeyStages.map(([key, label], index) => {
          const current = index === currentIndex
          const missingDocuments = key === 'documents_uploaded' && index < reachedIndex && !hasDocuments
          const completed = index < reachedIndex && !missingDocuments
          const stopped = closed && index === stoppedIndex
          const dotClass = current
            ? 'border-[#2f7b9e] bg-white text-[#245f86] shadow-[0_0_0_7px_rgba(47,123,158,0.12)]'
            : completed ? 'border-[#2f7b9e] bg-[#2f7b9e] text-white' : 'border-[#cad7e5] bg-white text-[#8fa1b4]'
          return <li key={key} className="relative px-2">
            {index < journeyStages.length - 1 && <span aria-hidden="true" className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[30px] h-0.5 ${completed ? 'bg-[#9bc7de]' : 'bg-[#dce6f1]'}`} />}
            <div className={`relative flex min-h-[116px] w-full flex-col items-center px-3 py-3 text-center ${current ? 'rounded-[18px] border border-[#cfe0ee] bg-[#f4f9fc] shadow-[0_10px_22px_rgba(31,54,78,0.06)]' : ''}`}>
              <div aria-current={current ? 'step' : undefined} className="flex flex-col items-center">
                <span className={`z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold ${dotClass}`}>
                  {completed ? <CheckCircle2 aria-label="Completed" className="h-4 w-4" /> : index + 1}
                </span>
                <p className="mt-3 max-w-[150px] text-sm font-semibold leading-5 text-[#203a54]">{label}</p>
              </div>
              <p className="mt-1 text-xs font-semibold text-[#6d839b]">{current ? lead.status === 'agent_activated' ? 'Complete' : 'Current Stage' : completed ? 'Complete' : stopped ? 'Stopped here' : missingDocuments ? 'Not uploaded' : currentIndex < 0 ? 'Not reached' : 'Upcoming'}</p>
              {current && lead.status !== 'agent_activated' && <span className="mt-2 rounded-full bg-[#dfeef7] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[#245f86]">Live</span>}
            </div>
          </li>
        })}
      </ol>
    </div>
  </section>
}
