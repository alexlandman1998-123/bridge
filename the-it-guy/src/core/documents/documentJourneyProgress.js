function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const WORKSPACE_STAGES = [
  { id: 'prepare', label: 'Prepare', description: 'Edit and check the document' },
  { id: 'pdf', label: 'Generate PDF', description: 'Create the signing copy' },
  { id: 'setup', label: 'Set up signing', description: 'Place fields and confirm parties' },
  { id: 'signing', label: 'Collect signatures', description: 'Track each signing party' },
  { id: 'complete', label: 'Final copy', description: 'Save and share the signed PDF' },
]

const SIGNER_STAGES = [
  { id: 'review', label: 'Review', description: 'Read the full document' },
  { id: 'fields', label: 'Sign', description: 'Complete required fields' },
  { id: 'submit', label: 'Finish', description: 'Submit your signing' },
]

function decorateStages(stages, activeIndex, { completed = false, attention = false } = {}) {
  return stages.map((stage, index) => ({
    ...stage,
    isCurrent: index === activeIndex,
    status: completed || index < activeIndex ? 'complete' : index === activeIndex ? (attention ? 'attention' : 'current') : 'upcoming',
  }))
}

function workspaceJourney(state) {
  const normalizedState = key(state)
  const activeByState = {
    draft: 0,
    pdf_ready: 1,
    ready_to_send: 2,
    awaiting_signers: 3,
    partially_signed: 3,
    attention_required: 3,
    finalising: 4,
    publishing: 4,
    completed: 4,
  }
  const inactive = ['voided', 'archived'].includes(normalizedState)
  const activeIndex = inactive ? 0 : (activeByState[normalizedState] ?? 0)
  const completed = normalizedState === 'completed'
  const stages = decorateStages(WORKSPACE_STAGES, activeIndex, { completed, attention: normalizedState === 'attention_required' || inactive })
  return {
    stages,
    activeIndex,
    completed,
    title: inactive ? 'Document workflow inactive' : completed ? 'Document journey complete' : `Current stage: ${stages[activeIndex].label}`,
    summary: inactive ? 'This document is no longer moving through signing.' : stages[activeIndex].description,
  }
}

function signerJourney({ signerStatus, requiredFields, completedFields }) {
  const status = key(signerStatus)
  const required = Math.max(0, Number(requiredFields) || 0)
  const completedCount = Math.max(0, Number(completedFields) || 0)
  const completed = status === 'signed'
  const attention = ['declined', 'expired'].includes(status)
  const activeIndex = completed ? 2 : required > 0 && completedCount >= required ? 2 : completedCount > 0 ? 1 : 0
  const stages = decorateStages(SIGNER_STAGES, activeIndex, { completed, attention })
  return {
    stages,
    activeIndex,
    completed,
    title: completed ? 'Your signing journey is complete' : attention ? 'Your signing journey needs attention' : `Current step: ${stages[activeIndex].label}`,
    summary: completed ? 'Your completed signing has been securely recorded.' : stages[activeIndex].description,
  }
}

export function buildDocumentJourneyProgress({ surface = 'workspace', state = 'draft', signerStatus = '', requiredFields = 0, completedFields = 0 } = {}) {
  const normalizedSurface = key(surface)
  const journey = normalizedSurface === 'signer_portal'
    ? signerJourney({ signerStatus, requiredFields, completedFields })
    : workspaceJourney(state)
  const denominator = Math.max(1, journey.stages.length - 1)
  return {
    contract: 'arch9-document-journey-progress-v1',
    surface: normalizedSurface,
    ...journey,
    progressPercent: journey.completed ? 100 : Math.min(90, Math.round((journey.activeIndex / denominator) * 100)),
  }
}

export { SIGNER_STAGES as DOCUMENT_SIGNER_JOURNEY_STAGES, WORKSPACE_STAGES as DOCUMENT_WORKSPACE_JOURNEY_STAGES }
