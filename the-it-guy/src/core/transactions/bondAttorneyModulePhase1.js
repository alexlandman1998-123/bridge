export const BOND_ATTORNEY_PHASE1_VERSION = 'bond_attorney_module_phase1_usability_v1'

export const BOND_ATTORNEY_PHASE1_ACTION_SEQUENCE = Object.freeze([
  Object.freeze({ id: 'request', label: 'Request', description: 'Create or reuse a document request.' }),
  Object.freeze({ id: 'upload', label: 'Upload', description: 'Collect the file or evidence from the owner.' }),
  Object.freeze({ id: 'review', label: 'Review', description: 'Approve, reject or complete the submitted document.' }),
  Object.freeze({ id: 'generate', label: 'Generate', description: 'Draft only where a governed generator exists.' }),
  Object.freeze({ id: 'sign', label: 'Sign', description: 'Prepare and track required signatures.' }),
])

const CATEGORY_ORDER = Object.freeze([
  'bond_documents',
  'signing_documents',
  'fica',
  'entity_documents',
  'transfer_documents',
  'cancellation_documents',
  'property_compliance',
  'development_documents',
  'other',
])

const COMPLETE_STATUSES = new Set(['approved', 'completed', 'complete', 'ready', 'accepted', 'signed'])
const REVIEW_STATUSES = new Set(['uploaded', 'pending_review', 'review', 'submitted'])
const REQUESTED_STATUSES = new Set(['requested', 'waiting', 'waiting_on_party', 'pending'])
const REJECTED_STATUSES = new Set(['rejected', 'declined'])

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function toTitle(value = '') {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function normalizeStatus(value = '') {
  const normalized = normalizeText(value)
  if (!normalized || normalized === 'missing') return 'missing'
  if (COMPLETE_STATUSES.has(normalized)) return 'complete'
  if (REVIEW_STATUSES.has(normalized)) return 'review'
  if (REQUESTED_STATUSES.has(normalized)) return 'requested'
  if (REJECTED_STATUSES.has(normalized)) return 'rejected'
  return normalized
}

function requirementOwner(requirement = {}) {
  const owner = normalizeText(requirement.requiredFrom || requirement.owner || requirement.appliesTo || 'attorney')
  if (owner === 'client') return 'Client'
  return toTitle(owner || 'attorney')
}

function categoryLabel(category = 'other') {
  const normalized = normalizeText(category) || 'other'
  if (normalized === 'fica') return 'FICA'
  return toTitle(normalized)
}

function actionStatus(id, requirement, status) {
  const requiredFromAttorney = normalizeText(requirement.requiredFrom) === 'attorney'
  const clientUploadAllowed = requirement.clientUploadAllowed !== false
  const hasRequest = Boolean(requirement.requestId)
  const hasGenerator = requirement.generatorAvailable === true || requirement.canGenerate === true
  const requiresSigning = requirement.requiresSignature === true || requirement.signingRequired === true

  if (id === 'request') {
    if (hasRequest || ['requested', 'review', 'complete'].includes(status)) return 'done'
    if (requirement.requestable === false) return 'not_applicable'
    return 'next'
  }
  if (id === 'upload') {
    if (!clientUploadAllowed || requiredFromAttorney) return 'not_applicable'
    if (['review', 'complete'].includes(status)) return 'done'
    if (status === 'requested' || hasRequest) return 'next'
    return 'waiting'
  }
  if (id === 'review') {
    if (status === 'complete') return 'done'
    if (status === 'review' || status === 'rejected') return 'next'
    if (requirement.reviewRequired === false) return 'not_applicable'
    return 'waiting'
  }
  if (id === 'generate') {
    if (!requiredFromAttorney && requirement.generatorCandidate !== true) return 'not_applicable'
    if (hasGenerator) return status === 'complete' ? 'done' : 'available'
    return 'manual_or_later'
  }
  if (id === 'sign') {
    if (!requiresSigning) return 'not_applicable'
    return status === 'complete' ? 'done' : 'waiting'
  }
  return 'waiting'
}

function nextActionForRequirement(requirement, status) {
  if (status === 'complete') return 'Complete'
  if (status === 'review') return 'Review uploaded document'
  if (status === 'rejected') return 'Fix rejection and re-upload'
  if (status === 'requested') return 'Wait for upload or evidence'
  if (normalizeText(requirement.requiredFrom) === 'attorney' || requirement.clientUploadAllowed === false) {
    return 'Prepare or attach attorney-controlled evidence'
  }
  return 'Create document request'
}

export function decorateAttorneyDocumentRequirement(requirement = {}) {
  const status = normalizeStatus(requirement.status)
  const actionMap = BOND_ATTORNEY_PHASE1_ACTION_SEQUENCE.map((action) => Object.freeze({
    ...action,
    status: actionStatus(action.id, requirement, status),
  }))
  return Object.freeze({
    ...requirement,
    status,
    ownerLabel: requirementOwner(requirement),
    categoryLabel: categoryLabel(requirement.category),
    why: requirement.reason || requirement.description || 'Required for attorney workflow readiness.',
    nextAction: nextActionForRequirement(requirement, status),
    actionMap: Object.freeze(actionMap),
  })
}

export function groupAttorneyDocumentRequirements(requirements = []) {
  const groups = new Map()
  for (const rawRequirement of Array.isArray(requirements) ? requirements : []) {
    const requirement = decorateAttorneyDocumentRequirement(rawRequirement)
    const key = normalizeText(requirement.category) || 'other'
    const existing = groups.get(key) || {
      key,
      label: categoryLabel(key),
      requirements: [],
    }
    existing.requirements.push(requirement)
    groups.set(key, existing)
  }

  return [...groups.values()]
    .sort((left, right) => {
      const leftIndex = CATEGORY_ORDER.indexOf(left.key)
      const rightIndex = CATEGORY_ORDER.indexOf(right.key)
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex)
    })
    .map((group) => Object.freeze({
      ...group,
      requirements: Object.freeze(group.requirements),
      count: group.requirements.length,
      openCount: group.requirements.filter((item) => item.status !== 'complete').length,
    }))
}

export function buildAttorneyLanePhase1Usability(lane = {}) {
  const requirements = Array.isArray(lane.documentRequirements) ? lane.documentRequirements : []
  const groups = groupAttorneyDocumentRequirements(requirements)
  const editable = lane.permissions?.canUpdateStage || lane.permissions?.canRequestDocuments || lane.permissions?.canAddInternalNote
  const missingCount = Number(lane.documentSummary?.missing || 0) || requirements.filter((item) => normalizeStatus(item.status) !== 'complete').length
  const reviewCount = requirements.filter((item) => normalizeStatus(item.status) === 'review').length
  const attorneyControlledCount = requirements.filter((item) => normalizeText(item.requiredFrom) === 'attorney' || item.clientUploadAllowed === false).length

  return Object.freeze({
    version: BOND_ATTORNEY_PHASE1_VERSION,
    laneKey: lane.laneKey || 'bond',
    laneLabel: lane.label || toTitle(lane.laneKey || 'bond'),
    roleFocused: Boolean(editable),
    documentRequestActionLabel: 'Create Document Requests',
    documentRequestActionDescription: 'Creates requests for missing documents; it does not generate legal documents.',
    requirementCount: requirements.length,
    visibleRequirementCount: requirements.length,
    hiddenRequirementCount: 0,
    groups: Object.freeze(groups),
    nextAction: lane.workflowUsability?.primaryNextAction?.label || lane.summary?.nextAction || '',
    counts: Object.freeze({
      missing: missingCount,
      review: reviewCount,
      attorneyControlled: attorneyControlledCount,
      signing: Array.isArray(lane.signingRequirements) ? lane.signingRequirements.length : 0,
    }),
    actionSequence: BOND_ATTORNEY_PHASE1_ACTION_SEQUENCE,
  })
}

export function buildBondAttorneyPhase1BaselineReport(lane = {}) {
  const usability = buildAttorneyLanePhase1Usability(lane)
  const actionIds = usability.actionSequence.map((action) => action.id)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE1_VERSION,
    laneKey: usability.laneKey,
    requirementCount: usability.requirementCount,
    hiddenRequirementCount: usability.hiddenRequirementCount,
    documentRequestActionLabel: usability.documentRequestActionLabel,
    actionIds,
    groupCount: usability.groups.length,
    readyForPhase2:
      usability.hiddenRequirementCount === 0 &&
      usability.documentRequestActionLabel === 'Create Document Requests' &&
      ['request', 'upload', 'review', 'generate', 'sign'].every((id) => actionIds.includes(id)),
  })
}
