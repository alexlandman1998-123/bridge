import { AlertTriangle, CheckCircle2, ChevronDown, Circle, CircleDot, Clock3 } from 'lucide-react'
import { useState } from 'react'

function getJourneyStatusBannerClasses(type) {
  if (type === 'action_required') return 'border-[#f1d8b2] bg-[#fff9ef] text-[#8f5a13]'
  if (type === 'waiting_external') return 'border-[#d9e4ef] bg-[#f6faff] text-[#365570]'
  return 'border-[#d5e8dd] bg-[#f4fbf7] text-[#2f7a52]'
}

function getStepToneClasses(status) {
  if (status === 'complete') {
    return {
      card: 'border-[#deebdf] bg-[#f9fdf9]',
      container: 'hover:border-[#cfe4d6] hover:bg-[#f3fbf6]',
      iconWrap: 'border-[#d3e8da] bg-[#eff9f2] text-[#2f7a51]',
      title: 'text-[#1f5f40]',
      icon: CheckCircle2,
      statusLabel: 'Completed',
      statusLabelClass: 'text-[#2f7a51]',
    }
  }
  if (status === 'current') {
    return {
      card: 'border-[#bfd7eb] bg-[#f7fbff] shadow-[0_10px_22px_rgba(15,23,42,0.06)]',
      container: 'hover:border-[#b4cee4] hover:bg-[#f4f9ff]',
      iconWrap: 'border-[#bfd4e9] bg-white text-[#2f5478]',
      title: 'text-[#142132]',
      icon: CircleDot,
      statusLabel: 'In Progress',
      statusLabelClass: 'text-[#35546c]',
    }
  }
  if (status === 'blocked') {
    return {
      card: 'border-[#efd9c6] bg-[#fff9f3]',
      container: 'hover:border-[#ebcfb4] hover:bg-[#fff5ec]',
      iconWrap: 'border-[#ecd3bd] bg-white text-[#ad6424]',
      title: 'text-[#7f4a19]',
      icon: AlertTriangle,
      statusLabel: 'Not Ready',
      statusLabelClass: 'text-[#8f5a13]',
    }
  }
  return {
    card: 'border-[#e3ebf3] bg-white',
    container: 'hover:border-[#d2deea] hover:bg-[#fbfdff]',
    iconWrap: 'border-[#dde7f1] bg-[#fbfdff] text-[#7b8ca2]',
    title: 'text-[#2e4459]',
    icon: Circle,
    statusLabel: 'Upcoming',
    statusLabelClass: 'text-[#64748b]',
  }
}

function getSubstepToneClasses(status) {
  if (status === 'complete') return 'text-[#2f7a51]'
  if (status === 'current') return 'text-[#35546c]'
  return 'text-[#7b8ca2]'
}

function getRoleToneClasses(role) {
  const normalizedRole = String(role || '').trim().toLowerCase()
  if (normalizedRole.includes('attorney') || normalizedRole.includes('conveyancer')) {
    return 'border-[#dcd4f6] bg-[#f7f5ff] text-[#52408b]'
  }
  if (normalizedRole.includes('agent') || normalizedRole.includes('sales')) {
    return 'border-[#cfe2f1] bg-[#f3f9ff] text-[#2e5b82]'
  }
  if (normalizedRole.includes('developer') || normalizedRole.includes('ops')) {
    return 'border-[#d8e6d7] bg-[#f3fbf2] text-[#2f6b45]'
  }
  if (normalizedRole.includes('bond') || normalizedRole.includes('finance')) {
    return 'border-[#f0ddc8] bg-[#fff7ef] text-[#8e5d25]'
  }
  return 'border-[#dde7f1] bg-white text-[#64748b]'
}

export function PurchaseJourneyCard({
  progressPercent,
  currentStageLabel,
  nextStageLabel,
  journeyStatus,
  steps,
  expandedStepId,
  onToggleStep,
}) {
  const [learnMoreByStepId, setLearnMoreByStepId] = useState({})

  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)] xl:p-6">
      <header className="mb-5 space-y-1.5">
        <h2 className="text-[1.38rem] font-semibold tracking-[-0.03em] text-[#142132]">Your Purchase Journey</h2>
        <p className="text-sm leading-6 text-[#6b7d93]">See where you are now, what is complete, and what happens next.</p>
      </header>

      <article className="rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm leading-6 text-[#5f7288]">
            <strong className="font-semibold text-[#1f3449]">{progressPercent}% complete</strong>
            <span className="mx-2 text-[#9cb0c5]">•</span>
            <span>Current: {currentStageLabel}</span>
            <span className="mx-2 text-[#9cb0c5]">•</span>
            <span>Next: {nextStageLabel}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e4ebf3] xl:max-w-[260px]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#3f78b1_0%,#2f8a64_100%)] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </article>

      <div className={`mt-4 flex items-start gap-3 rounded-[14px] border px-4 py-3 ${getJourneyStatusBannerClasses(journeyStatus?.type)}`}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0 opacity-75" />
        <div>
          <strong className="block text-sm font-semibold">{journeyStatus?.label || 'On Track'}</strong>
          <p className="mt-1 text-sm leading-6">{journeyStatus?.message || 'Your transaction is progressing as expected.'}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {steps.map((step) => {
          const isExpanded = expandedStepId === step.id
          const tone = getStepToneClasses(step.status)
          const StepIcon = tone.icon

          return (
            <article key={step.id} className={`rounded-[16px] border transition ${tone.card}`}>
              <button
                type="button"
                onClick={() => onToggleStep(step.id)}
                aria-expanded={isExpanded}
                className={`flex w-full cursor-pointer items-start gap-3.5 p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8d8e7] ${tone.container}`}
              >
                <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${tone.iconWrap}`}>
                  <StepIcon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${tone.title}`}>{step.label}</span>
                    <span className={`text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${tone.statusLabelClass}`}>
                      {tone.statusLabel}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#5f7288]">{step.shortDescription}</span>
                  {step.timeframe ? (
                    <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#7b8ca2]">
                      <Clock3 size={12} />
                      {step.timeframe}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dbe5ef] bg-white text-[#64748b] transition ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                >
                  <ChevronDown size={14} />
                </span>
              </button>

              {isExpanded ? (
                <div className="border-t border-[#e8eef5] px-4 pb-4 pt-3">
                  <div className="space-y-4">
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">What&apos;s happening now</h4>
                      <p className="mt-1.5 text-sm leading-6 text-[#324559]">{step.whatHappensNow}</p>
                    </section>

                    {step.substeps?.length ? (
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Progress in this stage</h4>
                        <ul className="mt-2 space-y-1.5">
                          {step.substeps.map((substep) => (
                            <li key={substep.id} className={`text-sm leading-6 ${getSubstepToneClasses(substep.status)}`}>
                              • {substep.label}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Your role</h4>
                      <p className="mt-1.5 text-sm leading-6 text-[#324559]">{step.clientAction}</p>
                    </section>

                    {step.learnMore ? (
                      <section>
                        <button
                          type="button"
                          onClick={() =>
                            setLearnMoreByStepId((previous) => ({
                              ...previous,
                              [step.id]: !previous[step.id],
                            }))
                          }
                          className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          {learnMoreByStepId[step.id] ? 'Hide details' : 'Learn more'}
                        </button>
                        {learnMoreByStepId[step.id] ? (
                          <p className="mt-2 text-sm leading-6 text-[#566b82]">{step.learnMore}</p>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function LatestUpdatesCard({
  updates,
  commentDraft,
  saving,
  onCommentDraftChange,
  onCommentSubmit,
}) {
  return (
    <aside className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)] xl:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1.28rem] font-semibold tracking-[-0.03em] text-[#142132]">Latest Updates</h3>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Recent activity and messages from your transaction team.</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
          {updates.length ? `${updates.length} updates` : 'No updates'}
        </span>
      </header>

      <div className="space-y-3">
        {updates.length ? (
          updates.map((item) => (
            <article key={item.id} className="rounded-[14px] border border-[#e1e9f2] bg-[#fbfdff] px-4 py-3 transition hover:border-[#cad9e8] hover:bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-semibold text-[#142132]">{item.authorName}</strong>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${getRoleToneClasses(item.authorRole)}`}
                  >
                    {item.authorRole}
                  </span>
                </div>
                <p className="text-xs text-[#7b8ca2]">{item.timestampLabel}</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#324559]">{item.message}</p>
            </article>
          ))
        ) : (
          <div className="rounded-[14px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-4 text-sm leading-6 text-[#6b7d93]">
            <p className="font-semibold text-[#35546c]">No updates yet</p>
            <p className="mt-1">Your transaction updates will appear here as your team shares progress.</p>
          </div>
        )}
      </div>

      <form onSubmit={onCommentSubmit} className="mt-4 rounded-[14px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Ask your team</label>
        <textarea
          value={commentDraft}
          onChange={(event) => onCommentDraftChange(event.target.value)}
          rows={3}
          placeholder="Ask a question or share an update..."
          className="mt-2 w-full rounded-[12px] border border-[#dbe5ef] bg-white px-3 py-2.5 text-sm leading-6 text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={saving || !String(commentDraft || '').trim()}
            className="inline-flex items-center justify-center rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
          >
            {saving ? 'Posting...' : 'Post Update'}
          </button>
        </div>
      </form>
    </aside>
  )
}

export default function ClientJourneySection(props) {
  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <PurchaseJourneyCard {...props} />
      <LatestUpdatesCard {...props} />
    </section>
  )
}
