import { ONBOARDING_STEPS } from '../../constants/onboardingStatuses'

const DEFAULT_STEPS = [
  { key: ONBOARDING_STEPS.createAccount, label: 'Account' },
  { key: ONBOARDING_STEPS.createOrJoinWorkspace, label: 'Workspace' },
  { key: ONBOARDING_STEPS.onboardingReview, label: 'Review' },
  { key: ONBOARDING_STEPS.onboardingComplete, label: 'Done' },
]

function resolveIndex(steps, activeStep) {
  const index = steps.findIndex((step) => step.key === activeStep)
  return index >= 0 ? index : 1
}

export default function OnboardingProgressLayout({
  title = 'Finish setup',
  description = '',
  activeStep = ONBOARDING_STEPS.createOrJoinWorkspace,
  steps = DEFAULT_STEPS,
  children,
}) {
  const activeIndex = resolveIndex(steps, activeStep)

  return (
    <section className="page">
      <article className="panel card-tier-standard" style={{ display: 'grid', gap: '1rem' }}>
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Onboarding</p>
          <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</h1>
          {description ? <p className="max-w-3xl text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
        <ol className="grid gap-2 sm:grid-cols-4">
          {steps.map((step, index) => {
            const isDone = index < activeIndex
            const isActive = index === activeIndex
            const className = isActive
              ? 'border-[#2f6f9f] bg-[#f0f7fc] text-[#163b5a]'
              : isDone
                ? 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'
                : 'border-[#dde4ee] bg-white text-[#60758d]'
            return (
              <li key={step.key} className={`rounded-[12px] border px-3 py-2 text-sm font-semibold ${className}`}>
                {step.label}
              </li>
            )
          })}
        </ol>
        {children}
      </article>
    </section>
  )
}
