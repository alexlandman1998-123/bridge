const COMPLETE_STATUSES = new Set(['complete', 'completed', 'done', 'registered', 'closed'])
const CURRENT_STATUSES = new Set(['current', 'active', 'in_progress', 'in-progress', 'blocked', 'action_required', 'action-required'])

function normalizeStatus(value = '') {
  return String(value || '').trim().toLowerCase()
}
function clampPercent(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback
}

function normalizeStep(step = {}, index = 0) {
  const rawStatus = normalizeStatus(step.status || step.state)
  const isBlocked = rawStatus === 'blocked' || rawStatus === 'action_required' || rawStatus === 'action-required'

  return {
    ...step,
    id: step.id || step.key || `buyer-journey-step-${index + 1}`,
    label: step.label || step.title || `Step ${index + 1}`,
    rawStatus,
    status: COMPLETE_STATUSES.has(rawStatus)
      ? 'complete'
      : CURRENT_STATUSES.has(rawStatus)
        ? 'current'
        : 'upcoming',
    isBlocked,
  }
}

export function buildBuyerJourneyPresentationModel({
  steps = [],
  currentStepId = '',
  currentStageLabel = '',
  nextStageLabel = '',
  progressPercent,
  source = 'unknown',
} = {}) {
  const normalizedSteps = Array.isArray(steps) ? steps.filter(Boolean).map(normalizeStep) : []
  const requestedCurrentIndex = normalizedSteps.findIndex(
    (step) => step.id === currentStepId && step.status !== 'complete',
  )
  const declaredCurrentIndex = normalizedSteps.findIndex((step) => step.status === 'current')
  const firstIncompleteIndex = normalizedSteps.findIndex((step) => step.status !== 'complete')
  const currentIndex = requestedCurrentIndex >= 0
    ? requestedCurrentIndex
    : declaredCurrentIndex >= 0
      ? declaredCurrentIndex
      : firstIncompleteIndex

  const canonicalSteps = normalizedSteps.map((step, index) => {
    const status = step.status === 'complete'
      ? 'complete'
      : index === currentIndex
        ? 'current'
        : 'upcoming'

    return {
      ...step,
      status,
      isComplete: status === 'complete',
      isCurrent: status === 'current',
      isUpcoming: status === 'upcoming',
    }
  })
  const completedCount = canonicalSteps.filter((step) => step.isComplete).length
  const derivedProgress = canonicalSteps.length
    ? Math.round((completedCount / canonicalSteps.length) * 100)
    : 0
  const currentStep = currentIndex >= 0 ? canonicalSteps[currentIndex] : null
  const nextStep = currentIndex >= 0 ? canonicalSteps.slice(currentIndex + 1).find((step) => !step.isComplete) || null : null
  const safeProgress = clampPercent(progressPercent, canonicalSteps.length && completedCount === canonicalSteps.length ? 100 : derivedProgress)
  const resolvedCurrentLabel = currentStageLabel || currentStep?.label || (canonicalSteps.length ? 'Journey complete' : 'Current step')
  const resolvedNextLabel = nextStageLabel || nextStep?.label || (canonicalSteps.length && completedCount === canonicalSteps.length ? 'Complete' : 'Next step')

  return Object.freeze({
    source,
    steps: Object.freeze(canonicalSteps.map((step) => Object.freeze(step))),
    currentStepId: currentStep?.id || null,
    currentStep,
    currentIndex,
    nextStep,
    completedCount,
    progressPercent: safeProgress,
    statusLabel: `${safeProgress}% complete`,
    currentStageLabel: resolvedCurrentLabel,
    nextStageLabel: resolvedNextLabel,
    helperMessage: `Now: ${resolvedCurrentLabel}. Next: ${resolvedNextLabel}.`,
    isComplete: canonicalSteps.length > 0 && completedCount === canonicalSteps.length,
  })
}
