import { buildBuyerJourneyPresentationModel } from '../clientPortal/buyerJourneyPresentationModel.js'
import { buildSharedHighLevelJourney } from './highLevelJourneyAdapter.js'

function isCanonicalSnapshot(snapshot) {
  return Boolean(
    snapshot &&
      Number(snapshot.schemaVersion) >= 1 &&
      Array.isArray(snapshot.milestones) &&
      snapshot.milestones.length,
  )
}

export function buildTransactionJourneyPresentation({
  snapshot = null,
  fallbackModel = null,
  fallbackSteps = [],
  fallbackCurrentStepId = '',
  fallbackProgressPercent,
  fallbackSource = 'legacy',
} = {}) {
  const hasSharedHighLevelJourney =
    snapshot?.highLevelJourney?.ruleVersion === 1 || snapshot?.legalJourney?.status === 'ready'
  if (!snapshot?.legalOnly && hasSharedHighLevelJourney) {
    const highLevelJourney = buildSharedHighLevelJourney(snapshot)
    const workflowItem = snapshot.currentWorkflowItem || null
    const snapshotCurrentMilestoneKey = snapshot.currentMilestoneKey || snapshot.currentMilestone?.key || ''
    const steps = highLevelJourney.milestones.map((milestone) => {
      const isCurrent = ['in_progress', 'waiting', 'blocked'].includes(milestone.status) || milestone.id === snapshotCurrentMilestoneKey
      const status = milestone.isComplete
        ? 'complete'
        : isCurrent
          ? 'current'
          : 'upcoming'
      const description = isCurrent
        ? workflowItem?.summary || `The transaction team is progressing ${milestone.label.toLowerCase()}.`
        : ''

      return {
        ...milestone,
        key: milestone.id,
        status,
        canonicalStatus: milestone.status,
        isCurrent,
        isBlocked: milestone.status === 'blocked',
        isUpcoming: status === 'upcoming',
        description,
        shortDescription: description,
        whatHappensNow: description,
      }
    })
    const currentStep = steps.find(s => s.isCurrent) || null
    const currentIndex = steps.findIndex(s => s.isCurrent)
    const nextStep = currentIndex >= 0
      ? steps.slice(currentIndex + 1).find((step) => !step.isComplete) || null
      : null
    const completedCount = steps.filter((step) => step.isComplete).length
    const completionSummary = `${completedCount} of ${steps.length}`

    return {
      source: 'shared-high-level-journey',
      transactionId: snapshot.transactionId,
      highLevelJourney,
      legalJourney: snapshot.legalJourney || null,
      steps,
      currentStep, currentStepId: currentStep?.id || null,
      currentIndex,
      nextStep,
      currentStageLabel: currentStep?.label || (steps.every((step) => step.isComplete) ? 'Journey complete' : 'Current step'),
      nextStageLabel: nextStep?.label || (steps.every((step) => step.isComplete) ? 'Complete' : 'Next step'),
      currentWorkflowItem: workflowItem,
      helperMessage: workflowItem?.summary || currentStep?.description || '',
      completedCount,
      completionSummary,
      isComplete: steps.every(s => s.isComplete),
      statusLabel: `${completionSummary} milestones complete`,
      // High-level journey rules deliberately do not define a weighted percentage.
      progressPercent: null,
    }
  }
  if (!isCanonicalSnapshot(snapshot)) {
    const fallback = fallbackModel || buildBuyerJourneyPresentationModel({
      steps: fallbackSteps,
      currentStepId: fallbackCurrentStepId,
      progressPercent: fallbackProgressPercent,
      source: fallbackSource,
    })
    return snapshot?.legalJourney ? { ...fallback, legalJourney: snapshot.legalJourney } : fallback
  }

  const workflowItem = snapshot.currentWorkflowItem || null
  const steps = snapshot.milestones.map((milestone) => ({
    id: milestone.key,
    key: milestone.key,
    label: milestone.label,
    status: milestone.status,
    description:
      milestone.key === snapshot.currentMilestoneKey
        ? workflowItem?.summary || `The transaction team is progressing ${milestone.label.toLowerCase()}.`
        : '',
  }))
  const currentMilestone = snapshot.currentMilestone ||
    snapshot.milestones.find((milestone) => milestone.key === snapshot.currentMilestoneKey) ||
    null
  const currentIndex = snapshot.milestones.findIndex(
    (milestone) => milestone.key === currentMilestone?.key,
  )
  const nextMilestone = currentIndex >= 0
    ? snapshot.milestones.slice(currentIndex + 1).find((milestone) => milestone.status !== 'complete') || null
    : null
  const model = buildBuyerJourneyPresentationModel({
    steps,
    currentStepId: currentMilestone?.key || '',
    currentStageLabel: currentMilestone?.label || (snapshot.status === 'complete' ? 'Journey complete' : ''),
    nextStageLabel: nextMilestone?.label || (snapshot.status === 'complete' ? 'Complete' : ''),
    progressPercent: snapshot.progressPercent,
    source: 'transaction-journey-snapshot',
  })

  return Object.freeze({
    ...model,
    schemaVersion: snapshot.schemaVersion,
    version: snapshot.version,
    transactionId: snapshot.transactionId,
    audience: snapshot.audience || null,
    canonicalStatus: snapshot.status,
    currentWorkflowItem: workflowItem,
    derivedAt: snapshot.derivedAt || null,
    helperMessage: workflowItem?.summary || model.helperMessage,
    legalJourney: snapshot.legalJourney || null,
  })
}
