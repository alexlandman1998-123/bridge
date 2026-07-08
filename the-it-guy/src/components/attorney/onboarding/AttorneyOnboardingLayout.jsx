import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock3, Save, ShieldCheck } from 'lucide-react'
import AttorneyFirmLivePreview from './AttorneyFirmLivePreview'

const STATUS_META = {
  active: { label: 'In progress', icon: null },
  complete: { label: 'Ready', icon: Check },
  optional: { label: 'Optional', icon: Clock3 },
  recommended: { label: 'Recommended', icon: Clock3 },
  needs_attention: { label: 'Needs attention', icon: AlertCircle },
  pending: { label: 'Pending', icon: Circle },
}

function AttorneyOnboardingLayout({
  steps = [],
  currentStepIndex = 0,
  title = 'Attorney Firm Setup Studio',
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
  confirmLabel = 'Activate Workspace',
  confirmDisabledReason = '',
  isFinalStep = false,
  isSubmitting = false,
  draftSavedAt = '',
  errorMessage = '',
  preview = null,
  readiness = null,
  stepStatuses = {},
  onStepSelect,
}) {
  const progressPercent = steps.length ? Math.round(((currentStepIndex + 1) / steps.length) * 100) : 0
  const readinessPercent = typeof readiness?.percent === 'number' ? readiness.percent : progressPercent
  const readinessItems = Array.isArray(readiness?.items) ? readiness.items : []
  const currentStep = steps[currentStepIndex] || {}
  const taskTitle = isFinalStep ? 'Prepare to activate your firm workspace' : 'Shape your firm workspace'
  const taskDescription = currentStep.label
    ? `${currentStep.label}${currentStep.description ? ` - ${currentStep.description}` : ''}`
    : currentStep.description || ''

  return (
    <section className="attorney-setup-studio">
      <div className="attorney-setup-topbar">
        <div className="attorney-setup-title-block">
          <span className="attorney-setup-kicker">
            <ShieldCheck size={14} aria-hidden="true" />
            Attorney onboarding
          </span>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="attorney-setup-progress-card" aria-label="Onboarding progress">
          <span>{readinessPercent}%</span>
          <strong>{readiness?.label || 'Workspace configured'}</strong>
          {readiness?.nextAction ? <em>{readiness.nextAction}</em> : null}
          <div className="attorney-setup-progress-track">
            <span style={{ width: `${readinessPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="attorney-setup-shell">
        <aside className="attorney-setup-rail" aria-label="Attorney setup steps">
          <div className="attorney-setup-rail-head">
            <span>Setup Studio</span>
            <strong>{currentStepIndex + 1} / {steps.length}</strong>
          </div>
          <div className="attorney-setup-step-list">
            {steps.map((step, index) => {
              const isActive = index === currentStepIndex
              const stepState = stepStatuses[step.key] || {}
              const rawStatus = stepState.status || (index < currentStepIndex ? 'complete' : 'pending')
              const visualStatus = isActive ? 'active' : rawStatus
              const meta = STATUS_META[visualStatus] || STATUS_META.pending
              const StatusIcon = meta.icon
              return (
                <button
                  type="button"
                  key={step.key || step.label || index}
                  className={`attorney-setup-step is-${visualStatus} ${isActive ? 'is-active' : ''}`}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => onStepSelect?.(index)}
                  disabled={!onStepSelect || isSubmitting}
                >
                  <span className="attorney-setup-step-node" aria-hidden="true">
                    {isActive ? String(index + 1) : StatusIcon ? <StatusIcon size={14} /> : <Circle size={8} />}
                  </span>
                  <span className="attorney-setup-step-copy">
                    <strong>{step.label}</strong>
                    {step.description ? <span>{step.description}</span> : null}
                    <em>{stepState.label || meta.label}</em>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="attorney-setup-rail-note">
            <strong>{readiness?.headline || 'Firm workspace'}</strong>
            <span>{readiness?.summary || 'Branding, workflows, team access, and client-facing surfaces are prepared together.'}</span>
            {readinessItems.length ? (
              <div className="attorney-setup-readiness-list">
                {readinessItems.slice(0, 4).map((item) => (
                  <span key={item.key} className={`is-${item.state}`}>
                    {item.state === 'complete' || item.state === 'optional' ? <Check size={12} aria-hidden="true" /> : <AlertCircle size={12} aria-hidden="true" />}
                    {item.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="attorney-setup-workbench">
          <div className="attorney-setup-workbench-head">
            <span>Step {currentStepIndex + 1} of {steps.length}</span>
            <h2>{taskTitle}</h2>
            {taskDescription ? <p>{taskDescription}</p> : null}
          </div>
          <div className="attorney-setup-content">{children}</div>
        </main>

        <AttorneyFirmLivePreview preview={preview} progressPercent={readinessPercent} readiness={readiness} />
      </div>

      {errorMessage ? (
        <p className="attorney-setup-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="attorney-setup-actionbar">
        <div className="attorney-setup-actionbar-left">
          <button
            type="button"
            className="attorney-setup-secondary-action"
            onClick={onBack}
            disabled={!canBack || isSubmitting}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {backLabel}
          </button>
          {onSaveDraft ? (
            <button
              type="button"
              className="attorney-setup-secondary-action"
              onClick={onSaveDraft}
              disabled={isSubmitting}
            >
              <Save size={16} aria-hidden="true" />
              Save Draft
            </button>
          ) : null}
        </div>

        <div className="attorney-setup-actionbar-right">
          {isFinalStep && confirmDisabledReason ? (
            <span className="attorney-setup-confirm-note" role="status">
              <AlertCircle size={14} aria-hidden="true" />
              {confirmDisabledReason}
            </span>
          ) : draftSavedAt ? <span>Draft saved {draftSavedAt}</span> : <span>Autosave-ready studio</span>}
          {isFinalStep ? (
            <button
              type="button"
              className="attorney-setup-primary-action"
              onClick={onConfirm}
              disabled={!canNext || isSubmitting}
            >
              <CheckCircle2 size={17} aria-hidden="true" />
              {isSubmitting ? 'Activating workspace...' : confirmLabel}
            </button>
          ) : (
            <button
              type="button"
              className="attorney-setup-primary-action"
              onClick={onNext}
              disabled={!canNext || isSubmitting}
            >
              {nextLabel}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export default AttorneyOnboardingLayout
