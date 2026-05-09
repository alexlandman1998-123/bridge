function AttorneyOnboardingLayout({
  steps = [],
  currentStepIndex = 0,
  title = 'Attorney Firm Onboarding',
  subtitle = '',
  children,
  onBack,
  onNext,
  onConfirm,
  canBack = false,
  canNext = true,
  nextLabel = 'Continue',
  backLabel = 'Back',
  confirmLabel = 'Confirm Setup',
  isFinalStep = false,
  isSubmitting = false,
  errorMessage = '',
}) {
  return (
    <section className="page" style={{ maxWidth: '1120px' }}>
      <div className="panel card-tier-standard" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {subtitle ? (
            <p className="status-message" style={{ margin: 0 }}>
              {subtitle}
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gap: '1.25rem',
            gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
            alignItems: 'start',
          }}
        >
          <aside className="panel card-tier-soft" style={{ padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
            {steps.map((step, index) => {
              const isActive = index === currentStepIndex
              const isComplete = index < currentStepIndex
              return (
                <div
                  key={step.key || step.label || index}
                  style={{
                    display: 'grid',
                    gap: '0.1rem',
                    padding: '0.45rem 0.55rem',
                    borderRadius: '0.7rem',
                    border: isActive ? '1px solid rgba(22, 103, 179, 0.35)' : '1px solid transparent',
                    background: isActive ? 'rgba(22, 103, 179, 0.08)' : isComplete ? 'rgba(18, 183, 106, 0.08)' : 'transparent',
                  }}
                >
                  <span className="status-message" style={{ margin: 0, fontWeight: 700, color: isActive ? '#11497b' : '#4f5f79' }}>
                    {index + 1}. {step.label}
                  </span>
                  {step.description ? (
                    <span className="status-message" style={{ margin: 0, fontSize: '0.82rem' }}>
                      {step.description}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </aside>

          <div style={{ display: 'grid', gap: '0.95rem', minWidth: 0 }}>
            <div>{children}</div>

            {errorMessage ? (
              <p className="status-message" style={{ margin: 0, color: '#b42318' }}>
                {errorMessage}
              </p>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="header-secondary-cta"
                onClick={onBack}
                disabled={!canBack || isSubmitting}
              >
                {backLabel}
              </button>

              {isFinalStep ? (
                <button
                  type="button"
                  className="header-primary-cta"
                  onClick={onConfirm}
                  disabled={!canNext || isSubmitting}
                >
                  {isSubmitting ? 'Completing setup…' : confirmLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className="header-primary-cta"
                  onClick={onNext}
                  disabled={!canNext || isSubmitting}
                >
                  {nextLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AttorneyOnboardingLayout
