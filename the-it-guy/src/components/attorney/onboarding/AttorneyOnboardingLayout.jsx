import { ArrowLeft, ArrowRight, CheckCircle2, Save } from 'lucide-react'

function AttorneyOnboardingLayout({
  steps = [],
  currentStepIndex = 0,
  title = 'Attorney Firm Onboarding',
  subtitle = '',
  children,
  onBack,
  onNext,
  onConfirm,
  onSaveDraft,
  canBack = false,
  canNext = true,
  nextLabel = 'Continue',
  backLabel = 'Back',
  confirmLabel = 'Confirm Setup',
  isFinalStep = false,
  isSubmitting = false,
  draftSavedAt = '',
  errorMessage = '',
}) {
  const progressPercent = steps.length ? Math.round(((currentStepIndex + 1) / steps.length) * 100) : 0

  return (
    <section className="page" style={{ maxWidth: '1120px' }}>
      <div className="ui-panel" style={{ display: 'grid', gap: '1rem', padding: '1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {subtitle ? (
            <p className="status-message" style={{ margin: 0 }}>
              {subtitle}
            </p>
          ) : null}
          <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem' }}>
              <span className="status-message" style={{ fontWeight: 700 }}>Step {currentStepIndex + 1} of {steps.length}</span>
              <span className="status-message">{progressPercent}% complete</span>
            </div>
            <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'rgba(21, 42, 72, 0.12)' }}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #274c69, #3f7298)',
                  transition: 'width 220ms ease',
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '1.25rem',
            gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
            alignItems: 'start',
          }}
        >
          <aside className="ui-panel-muted" style={{ padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
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

            <div className="attorney-onboarding-actions">
              <div className="attorney-onboarding-actions-group">
                <button
                  type="button"
                  className="ui-button-secondary"
                  onClick={onBack}
                  disabled={!canBack || isSubmitting}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  {backLabel}
                </button>
                {onSaveDraft ? (
                  <button
                    type="button"
                    className="ui-button-secondary"
                    onClick={onSaveDraft}
                    disabled={isSubmitting}
                  >
                    <Save size={16} aria-hidden="true" />
                    Save Draft
                  </button>
                ) : null}
              </div>

              <div className="attorney-onboarding-primary-action">
                {isFinalStep ? (
                  <button
                    type="button"
                    className="ui-button-primary"
                    onClick={onConfirm}
                    disabled={!canNext || isSubmitting}
                  >
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {isSubmitting ? 'Completing setup…' : confirmLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ui-button-primary"
                    onClick={onNext}
                    disabled={!canNext || isSubmitting}
                  >
                    <ArrowRight size={16} aria-hidden="true" />
                    {nextLabel}
                  </button>
                )}
                {draftSavedAt ? <span className="status-message">Draft saved {draftSavedAt}</span> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AttorneyOnboardingLayout
