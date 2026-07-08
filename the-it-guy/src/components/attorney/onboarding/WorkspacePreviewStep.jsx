import { AlertCircle, ArrowRight, CheckCircle2, Monitor } from 'lucide-react'
import AttorneyFirmLivePreview from './AttorneyFirmLivePreview'

function WorkspacePreviewStep({
  preview = null,
  readiness = null,
  progressPercent = 0,
  activationGuard = null,
  onNavigateToStep,
}) {
  const isBlocked = Boolean(activationGuard && !activationGuard.canActivate)

  return (
    <div className="attorney-preview-step">
      <div className={`attorney-preview-step-status ${isBlocked ? 'is-blocked' : 'is-ready'}`}>
        <span aria-hidden="true">
          {isBlocked ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
        </span>
        <div>
          <em>
            <Monitor size={14} aria-hidden="true" />
            Final workspace preview
          </em>
          <strong>{isBlocked ? 'Resolve launch gates before activation' : 'Preview is ready for activation'}</strong>
          <p>
            {isBlocked
              ? activationGuard.message || 'Resolve required setup items before activating the workspace.'
              : 'Review the client-facing surfaces, matter routing, brand system, and team access before opening operations.'}
          </p>
        </div>
        {isBlocked && activationGuard.stepKey ? (
          <button
            type="button"
            className="attorney-dossier-hero-action"
            onClick={() => onNavigateToStep?.(activationGuard.stepKey)}
          >
            <ArrowRight size={15} aria-hidden="true" />
            {activationGuard.actionLabel || 'Fix required gate'}
          </button>
        ) : null}
      </div>

      <AttorneyFirmLivePreview
        preview={preview}
        progressPercent={progressPercent}
        readiness={readiness}
        variant="stage"
      />
    </div>
  )
}

export default WorkspacePreviewStep
