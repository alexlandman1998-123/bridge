import { buildBuyerJourneyPresentationModel } from '../clientPortal/buyerJourneyPresentationModel.js'

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
  if (!isCanonicalSnapshot(snapshot)) {
    return fallbackModel || buildBuyerJourneyPresentationModel({
      steps: fallbackSteps,
      currentStepId: fallbackCurrentStepId,
      progressPercent: fallbackProgressPercent,
      source: fallbackSource,
    })
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
  })
}
