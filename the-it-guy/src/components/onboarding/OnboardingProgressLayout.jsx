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
  className = '',
  panelClassName = '',
  onStepChange = null,
  stepNavigationDisabled = false,
  children,
}) {
  const activeIndex = resolveIndex(steps, activeStep)

  return (
    <section className={`page onboarding-progress-page ${className}`.trim()}>
      <article className={`panel card-tier-standard onboarding-progress-panel ${panelClassName}`.trim()}>
        <div className="onboarding-progress-heading">
          <p>Onboarding</p>
          <h1>{title}</h1>
          {description ? <span>{description}</span> : null}
        </div>
        <ol className="onboarding-progress-steps" aria-label="Setup progress" style={{ '--step-count': steps.length }}>
          {steps.map((step, index) => {
            const isDone = index < activeIndex
            const isActive = index === activeIndex
            const className = isActive
              ? 'is-active'
              : isDone
                ? 'is-done'
                : ''
            return (
              <li key={step.key} className={className}>
                {onStepChange ? (
                  <button
                    type="button"
                    aria-label={step.label}
                    aria-current={isActive ? 'step' : undefined}
                    disabled={stepNavigationDisabled}
                    onClick={() => onStepChange(index)}
                  >
                    <span className="onboarding-step-number" aria-hidden="true">{isDone ? '✓' : index + 1}</span>
                    <span className="onboarding-step-label">{step.label}</span>
                  </button>
                ) : step.label}
              </li>
            )
          })}
        </ol>
        {children}
      </article>
    </section>
  )
}
