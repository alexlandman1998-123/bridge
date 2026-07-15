import {
  ATTORNEY_WORKFLOW_STAGE_DEFINITIONS,
  getAttorneyDocumentRequirementKeysForLane,
  normalizeAttorneyStageKey,
} from '../../constants/attorneyWorkflowStages.js'
import { resolveLegalDocumentRequirements } from '../../services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import {
  CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION,
  CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE,
  buildCancellationAttorneyPhase0BaselineReport,
} from './cancellationAttorneyModulePhase0.js'

export const CANCELLATION_ATTORNEY_PHASE1_VERSION = 'cancellation_attorney_module_phase1_usability_v1'
export const CANCELLATION_ATTORNEY_PHASE1_RELEASE_BLOCKER_ID = 'cancellation_lane_usability_not_simplified'

export const CANCELLATION_ATTORNEY_PHASE1_ACTION_SEQUENCE = Object.freeze([
  Object.freeze({ id: 'confirm', label: 'Confirm', description: 'Confirm the instruction, source fact or evidence source.' }),
  Object.freeze({ id: 'request', label: 'Request', description: 'Create or reuse a request for missing cancellation evidence.' }),
  Object.freeze({ id: 'upload', label: 'Upload', description: 'Collect the document or external evidence from the owner.' }),
  Object.freeze({ id: 'review', label: 'Review', description: 'Approve, reject or complete the submitted cancellation evidence.' }),
  Object.freeze({ id: 'reconcile', label: 'Reconcile', description: 'Compare figures, guarantees, registration or settlement proof against the matter state.' }),
  Object.freeze({ id: 'sign', label: 'Sign', description: 'Prepare and track seller cancellation signatures where required.' }),
])

export const CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY = Object.freeze({
  roleFocusedCockpitOnly: true,
  exposesStageAndResolverRequirementMismatch: true,
  surfacesNextActions: true,
  mayCreateDocumentRequests: true,
  generatesOperationalDocuments: false,
  generatesLegalInstruments: false,
  approvesBankCancellationDocuments: false,
  requestsExternalFiguresAutomatically: false,
  acceptsGuaranteeAutomatically: false,
  marksRegistrationFromStageOnly: false,
  reconcilesSettlement: false,
  writesExternalSystem: false,
  mutatesMatter: false,
})

export const CANCELLATION_ATTORNEY_PHASE1_DOMAIN_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'instruction_and_existing_bond',
    label: 'Instruction and existing bond',
    start: 'cancellation_existing_bond_confirmed',
    end: 'notice_period_captured',
    summary: 'Confirm the existing bond, lender, account reference, instruction and 90-day notice position.',
    priority: 'critical',
  }),
  Object.freeze({
    key: 'figures_and_expiry',
    label: 'Figures and expiry',
    start: 'cancellation_figures_requested',
    end: 'notice_penalty_risk_captured',
    summary: 'Request, receive and check cancellation figures, expiry, daily interest and penalty risk.',
    priority: 'critical',
  }),
  Object.freeze({
    key: 'guarantees',
    label: 'Guarantees',
    start: 'cancellation_guarantees_requested',
    end: 'cancellation_guarantees_accepted',
    summary: 'Coordinate guarantee requirements, receipt, amount, wording and acceptance.',
    priority: 'critical',
    dependency: true,
  }),
  Object.freeze({
    key: 'documents_and_signing',
    label: 'Documents and signing',
    start: 'cancellation_documents_prepared',
    end: 'seller_cancellation_documents_signed',
    summary: 'Prepare or receive bank cancellation documents and track seller signing evidence.',
    priority: 'high',
  }),
  Object.freeze({
    key: 'lodgement_and_registration',
    label: 'Lodgement and registration',
    start: 'cancellation_lodgement_ready',
    end: 'cancellation_registered',
    summary: 'Confirm simultaneous lodgement readiness, lodgement evidence and registration evidence.',
    priority: 'high',
    dependency: true,
  }),
  Object.freeze({
    key: 'settlement_and_closeout',
    label: 'Settlement and close-out',
    start: 'settlement_proof_captured',
    end: 'cancellation_close_out_complete',
    summary: 'Capture settlement proof, reconcile it to figures and close the cancellation matter.',
    priority: 'high',
  }),
])

const STAGE_KEYS = Object.freeze((ATTORNEY_WORKFLOW_STAGE_DEFINITIONS.cancellation || []).map((stage) => stage.key))
const STAGE_BY_KEY = Object.freeze((ATTORNEY_WORKFLOW_STAGE_DEFINITIONS.cancellation || []).reduce((result, stage) => ({ ...result, [stage.key]: stage }), {}))
const AUTOMATION_BY_ID = Object.freeze(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.reduce((result, item) => ({ ...result, [item.id]: item }), {}))
const COMPLETE_STATUSES = new Set(['approved', 'completed', 'complete', 'ready', 'accepted', 'signed', 'verified'])
const REVIEW_STATUSES = new Set(['uploaded', 'pending_review', 'review', 'submitted', 'provided'])
const REQUESTED_STATUSES = new Set(['requested', 'waiting', 'waiting_on_party', 'pending'])
const REJECTED_STATUSES = new Set(['rejected', 'declined'])
const RECONCILE_DOCUMENT_IDS = new Set(['cancellation_figures', 'cancellation_guarantees', 'guarantee_letter', 'cancellation_registration_evidence', 'proof_of_settlement'])
const SIGNING_DOCUMENT_IDS = new Set(['seller_signed_cancellation_documents', 'bank_cancellation_documents', 'cancellation_consent'])

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function toTitle(value = '') {
  return text(value)
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeStatus(value = '') {
  const normalized = key(value)
  if (!normalized || normalized === 'missing') return 'missing'
  if (COMPLETE_STATUSES.has(normalized)) return 'complete'
  if (REVIEW_STATUSES.has(normalized)) return 'review'
  if (REQUESTED_STATUSES.has(normalized)) return 'requested'
  if (REJECTED_STATUSES.has(normalized)) return 'rejected'
  return normalized
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return true
  return value !== null && value !== undefined && text(value) !== '' && key(value) !== 'unknown'
}

function ownerLabel(requirement = {}) {
  const owner = key(requirement.requiredFrom || requirement.owner || requirement.appliesTo || requirement.attorneyRole || 'cancellation_attorney')
  if (owner === 'seller') return 'Seller'
  if (owner === 'attorney') return 'Attorney'
  if (owner === 'cancellation_attorney') return 'Cancellation Attorney'
  if (owner === 'transfer_attorney') return 'Transfer Attorney'
  if (owner === 'bond_attorney') return 'Bond Attorney'
  return toTitle(owner || 'cancellation_attorney')
}

function categoryLabel(category = 'cancellation_documents') {
  return toTitle(key(category) || 'cancellation_documents')
}

function documentAutomation(itemId = '') {
  return AUTOMATION_BY_ID[key(itemId)] || null
}

function documentStrategy(requirement = {}) {
  const automation = documentAutomation(requirement.id)
  if (automation) return automation.strategy
  if (requirement.clientUploadAllowed === false || key(requirement.requiredFrom) === 'attorney') return 'template_controlled_or_manual'
  return 'request_or_ingest'
}

function documentRiskTier(requirement = {}) {
  const automation = documentAutomation(requirement.id)
  if (automation) return automation.riskTier
  if (key(requirement.id).includes('signed')) return 'signing_evidence'
  return 'cancellation_evidence'
}

function actionStatus(actionId, requirement, status) {
  const id = key(requirement.id)
  const strategy = documentStrategy(requirement)
  const hasRequest = Boolean(requirement.requestId || requirement.request_id)
  const clientUploadAllowed = requirement.clientUploadAllowed !== false && key(requirement.requiredFrom) !== 'attorney'
  const requiresSigning = requirement.requiresSignature === true || requirement.signingRequired === true || SIGNING_DOCUMENT_IDS.has(id)
  const requiresReconciliation = RECONCILE_DOCUMENT_IDS.has(id)

  if (actionId === 'confirm') {
    if (status === 'complete') return 'done'
    if (['lender_cancellation_instruction', 'cancellation_instruction', 'existing_bond_account_details'].includes(id)) return 'next'
    return 'waiting'
  }
  if (actionId === 'request') {
    if (hasRequest || ['requested', 'review', 'complete'].includes(status)) return 'done'
    if (requirement.requestable === false) return 'not_applicable'
    return 'next'
  }
  if (actionId === 'upload') {
    if (!clientUploadAllowed && strategy !== 'ingest_only') return 'not_applicable'
    if (['review', 'complete'].includes(status)) return 'done'
    if (status === 'requested' || hasRequest) return 'next'
    return 'waiting'
  }
  if (actionId === 'review') {
    if (status === 'complete') return 'done'
    if (status === 'review' || status === 'rejected') return 'next'
    if (requirement.reviewRequired === false) return 'not_applicable'
    return 'waiting'
  }
  if (actionId === 'reconcile') {
    if (!requiresReconciliation) return 'not_applicable'
    if (status === 'complete') return 'done'
    if (status === 'review') return 'next'
    return 'waiting'
  }
  if (actionId === 'sign') {
    if (!requiresSigning) return 'not_applicable'
    return status === 'complete' ? 'done' : 'waiting'
  }
  return 'waiting'
}

function nextActionForRequirement(requirement, status) {
  const id = key(requirement.id)
  if (status === 'complete') return 'Complete'
  if (status === 'review' && RECONCILE_DOCUMENT_IDS.has(id)) return 'Review and reconcile evidence'
  if (status === 'review') return 'Review uploaded cancellation document'
  if (status === 'rejected') return 'Fix rejection and re-upload'
  if (status === 'requested') return 'Wait for upload or evidence'
  if (documentStrategy(requirement) === 'template_controlled') return 'Prepare only from governed template'
  if (documentStrategy(requirement) === 'ingest_only') return 'Attach source evidence'
  if (key(requirement.requiredFrom) === 'attorney' || requirement.clientUploadAllowed === false) return 'Prepare or attach attorney-controlled evidence'
  return 'Create cancellation document request'
}

function defaultRequirement(id, source = 'stage') {
  const normalized = key(id)
  const automation = documentAutomation(normalized)
  return {
    id: normalized,
    label: automation?.label || toTitle(normalized),
    category: 'cancellation_documents',
    laneKey: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    requiredFrom: source === 'stage' && normalized.includes('signed') ? 'attorney' : 'seller',
    visibilityDefault: source === 'resolver' ? 'client_visible' : 'professional_shared',
    reason: automation?.purpose || 'Required for cancellation workflow readiness.',
  }
}

function mergeRequirement(base = {}, override = {}, sourceTags = []) {
  return {
    ...base,
    ...override,
    id: key(override.id || base.id),
    label: text(override.label || base.label) || toTitle(override.id || base.id),
    category: key(override.category || base.category || 'cancellation_documents'),
    laneKey: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    sourceTags: unique([...(base.sourceTags || []), ...(override.sourceTags || []), ...sourceTags]),
  }
}

function richCancellationRequirements() {
  const report = resolveLegalDocumentRequirements(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.transaction)
  return (report.requirements || [])
    .filter((requirement) => requirement.laneKey === 'cancellation')
    .map((requirement) => mergeRequirement(defaultRequirement(requirement.id, 'resolver'), requirement, ['resolver']))
}

function mergedCancellationRequirements(inputRequirements = []) {
  const byId = new Map()
  const add = (requirement, source) => {
    const normalizedId = key(requirement.id)
    const existing = byId.get(normalizedId) || {}
    byId.set(normalizedId, mergeRequirement(existing.id ? existing : defaultRequirement(normalizedId, source), requirement, [source]))
  }
  richCancellationRequirements().forEach((requirement) => add(requirement, 'resolver'))
  getAttorneyDocumentRequirementKeysForLane('cancellation').forEach((id) => add(defaultRequirement(id, 'stage'), 'stage'))
  ;(Array.isArray(inputRequirements) ? inputRequirements : []).forEach((requirement) => add(requirement, 'lane'))
  return [...byId.values()].sort((left, right) => text(left.label).localeCompare(text(right.label)))
}

export function decorateCancellationDocumentRequirement(requirement = {}) {
  const status = normalizeStatus(requirement.status || requirement.reviewStatus || requirement.review_status)
  const actionMap = CANCELLATION_ATTORNEY_PHASE1_ACTION_SEQUENCE.map((action) => Object.freeze({
    ...action,
    status: actionStatus(action.id, requirement, status),
  }))
  const strategy = documentStrategy(requirement)
  return Object.freeze({
    ...requirement,
    status,
    ownerLabel: ownerLabel(requirement),
    categoryLabel: categoryLabel(requirement.category),
    sourceTags: Object.freeze(unique(requirement.sourceTags || [])),
    strategy,
    riskTier: documentRiskTier(requirement),
    why: requirement.reason || requirement.description || 'Required for cancellation workflow readiness.',
    nextAction: nextActionForRequirement(requirement, status),
    actionMap: Object.freeze(actionMap),
  })
}

function stageIndex(stageKey) {
  return STAGE_KEYS.indexOf(stageKey)
}

function domainStageKeys(domain) {
  const start = stageIndex(domain.start)
  const end = stageIndex(domain.end)
  if (start < 0 || end < start) return Object.freeze([])
  return Object.freeze(STAGE_KEYS.slice(start, end + 1))
}

function currentStage(lane = {}) {
  return normalizeAttorneyStageKey(
    lane.currentStage || lane.current_stage || lane.summary?.currentStage || lane.workflowUsability?.currentStage || '',
    'cancellation',
  ) || STAGE_KEYS[0]
}

function stageStatus(stageKey, lane = {}, current = currentStage(lane)) {
  const currentIndex = stageIndex(current)
  const itemIndex = stageIndex(stageKey)
  const explicit = (lane.steps || []).find((step) => normalizeAttorneyStageKey(step.stepKey || step.step_key || step.key, 'cancellation') === stageKey)
  const explicitStatus = normalizeStatus(explicit?.status)
  if (explicitStatus && explicitStatus !== 'missing') return explicitStatus === 'complete' ? 'completed' : explicitStatus
  if (itemIndex < currentIndex) return 'completed'
  if (itemIndex === currentIndex) return normalizeStatus(lane.laneStatus || lane.summary?.status) || 'active'
  return 'pending'
}

function buildDataRequirement(requirement = {}, lane = {}) {
  const value = requirement.value ?? requirement.currentValue ?? requirement.current_value
  const complete = requirement.complete === true || normalizeStatus(requirement.status) === 'complete' || hasValue(value)
  return Object.freeze({
    id: key(requirement.id),
    label: text(requirement.label) || toTitle(requirement.id),
    owner: key(requirement.owner || 'cancellation_attorney'),
    severity: key(requirement.severity || 'medium'),
    required: requirement.required !== false,
    complete,
    missing: !complete && requirement.required !== false,
    stageKey: normalizeAttorneyStageKey(requirement.stageKey || requirement.stage_key || lane.currentStage || '', 'cancellation') || null,
  })
}

function laneDataRequirements(lane = {}) {
  if (Array.isArray(lane.dataRequirements)) return lane.dataRequirements.map((item) => buildDataRequirement(item, lane))
  const current = currentStage(lane)
  return (STAGE_BY_KEY[current]?.requiredData || []).map((item) => buildDataRequirement(item, lane))
}

function dependencyItems(lane = {}) {
  return Array.isArray(lane.coordinationSummary?.items) ? lane.coordinationSummary.items : []
}

function dependencyStatusCounts(lane = {}) {
  const items = dependencyItems(lane)
  return Object.freeze({
    total: items.length,
    blocked: items.filter((item) => ['blocked', 'rejected'].includes(normalizeStatus(item.status)) || item.escalationNeeded === true).length,
    waiting: items.filter((item) => ['waiting', 'requested', 'pending'].includes(normalizeStatus(item.status))).length,
  })
}

function buildDomain(domain, lane, requirements) {
  const stageKeys = domainStageKeys(domain)
  const current = currentStage(lane)
  const currentIndex = stageIndex(current)
  const start = stageIndex(domain.start)
  const end = stageIndex(domain.end)
  const dependencies = dependencyStatusCounts(lane)
  let status = 'pending'
  if (currentIndex > end) status = 'completed'
  else if (currentIndex >= start && currentIndex <= end) status = 'active'
  if (domain.dependency && dependencies.blocked) status = 'blocked'
  else if (domain.dependency && dependencies.waiting && status === 'active') status = 'waiting'
  const domainRequirements = requirements.filter((requirement) => {
    const id = key(requirement.id)
    if (domain.key === 'instruction_and_existing_bond') return ['cancellation_instruction', 'existing_bond_account_details', 'seller_bond_cancellation_information', 'bond_statement'].includes(id)
    if (domain.key === 'figures_and_expiry') return ['cancellation_figures'].includes(id)
    if (domain.key === 'guarantees') return ['cancellation_guarantees', 'guarantee_letter'].includes(id)
    if (domain.key === 'documents_and_signing') return ['bank_cancellation_documents', 'cancellation_consent', 'seller_signed_cancellation_documents'].includes(id)
    if (domain.key === 'lodgement_and_registration') return ['cancellation_registration_evidence'].includes(id)
    if (domain.key === 'settlement_and_closeout') return ['proof_of_settlement'].includes(id)
    return false
  })
  return Object.freeze({
    ...domain,
    stageKeys,
    stageCount: stageKeys.length,
    status,
    current: currentIndex >= start && currentIndex <= end,
    documentRequirementIds: Object.freeze(domainRequirements.map((requirement) => requirement.id)),
    openDocumentCount: domainRequirements.filter((requirement) => requirement.status !== 'complete').length,
  })
}

function priorityRank(value = '') {
  return ({ critical: 0, high: 1, normal: 2, medium: 2, low: 3 }[key(value)] ?? 9)
}

function buildNextActions({ lane, requirements, dataRequirements, documentCoverage }) {
  const actions = []
  const canAct = lane.permissions?.canUpdateStage === true || lane.permissions?.canRequestDocuments === true || lane.permissions?.canAddInternalNote === true
  const assignmentComplete = lane.assignment?.complete === true || lane.assigned === true || lane.assignedAttorneyId || lane.assigned_attorney_id
  const dependencies = dependencyStatusCounts(lane)
  if (!assignmentComplete) {
    actions.push(Object.freeze({
      actionKey: 'confirm_cancellation_assignment',
      actionLabel: 'Confirm cancellation attorney assignment',
      priority: 'critical',
      reason: 'assignment_missing',
      stageKey: currentStage(lane),
    }))
  }
  const missingCriticalData = dataRequirements.filter((item) => item.missing && ['critical', 'high'].includes(item.severity))
  if (missingCriticalData.length) {
    actions.push(Object.freeze({
      actionKey: 'capture_cancellation_data',
      actionLabel: 'Capture required cancellation data',
      priority: 'critical',
      reason: missingCriticalData[0].id,
      stageKey: missingCriticalData[0].stageKey || currentStage(lane),
    }))
  }
  const reviewRequirement = requirements.find((requirement) => requirement.status === 'review')
  if (reviewRequirement) {
    actions.push(Object.freeze({
      actionKey: `review:${reviewRequirement.id}`,
      actionLabel: reviewRequirement.nextAction,
      priority: RECONCILE_DOCUMENT_IDS.has(reviewRequirement.id) ? 'critical' : 'high',
      reason: reviewRequirement.id,
      stageKey: currentStage(lane),
    }))
  }
  const missingRequiredDocs = requirements.filter((requirement) => requirement.required !== false && !['complete', 'review'].includes(requirement.status))
  if (missingRequiredDocs.length) {
    actions.push(Object.freeze({
      actionKey: 'create_cancellation_document_requests',
      actionLabel: 'Create cancellation document requests',
      priority: 'high',
      reason: missingRequiredDocs[0].id,
      stageKey: currentStage(lane),
    }))
  }
  if (documentCoverage.richRequirementIdsNotOnStages.length || documentCoverage.stageOnlyDocumentKeys.length) {
    actions.push(Object.freeze({
      actionKey: 'review_cancellation_requirement_coverage',
      actionLabel: 'Review cancellation requirement coverage',
      priority: 'normal',
      reason: 'stage_and_resolver_document_requirements_differ',
      stageKey: null,
    }))
  }
  if (dependencies.blocked) {
    actions.push(Object.freeze({
      actionKey: 'clear_linked_legal_dependency',
      actionLabel: 'Clear linked transfer or bond handoff blocker',
      priority: 'critical',
      reason: 'blocked_dependency',
      stageKey: currentStage(lane),
    }))
  }
  if (!canAct) {
    actions.push(Object.freeze({
      actionKey: 'read_only_cancellation_lane',
      actionLabel: 'Open assigned cancellation lane to act',
      priority: 'normal',
      reason: 'current_user_cannot_update_cancellation_lane',
      stageKey: currentStage(lane),
    }))
  }
  return Object.freeze(actions
    .filter((action, index, all) => all.findIndex((item) => item.actionKey === action.actionKey) === index)
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || text(left.actionKey).localeCompare(text(right.actionKey))))
}

function buildDocumentCoverage(requirements) {
  const stageDocumentKeys = getAttorneyDocumentRequirementKeysForLane('cancellation')
  const richRequirementIds = richCancellationRequirements().map((requirement) => requirement.id)
  const visibleRequirementIds = requirements.map((requirement) => requirement.id)
  return Object.freeze({
    stageDocumentKeys: Object.freeze(stageDocumentKeys),
    richRequirementIds: Object.freeze(richRequirementIds),
    visibleRequirementIds: Object.freeze(visibleRequirementIds),
    richRequirementIdsNotOnStages: Object.freeze(richRequirementIds.filter((id) => !stageDocumentKeys.includes(id))),
    stageOnlyDocumentKeys: Object.freeze(stageDocumentKeys.filter((id) => !richRequirementIds.includes(id))),
    hiddenRichRequirementIds: Object.freeze(richRequirementIds.filter((id) => !visibleRequirementIds.includes(id))),
  })
}

export function buildCancellationAttorneyPhase1Usability(lane = {}) {
  const rawRequirements = mergedCancellationRequirements(lane.documentRequirements)
  const requirements = Object.freeze(rawRequirements.map(decorateCancellationDocumentRequirement))
  const dataRequirements = Object.freeze(laneDataRequirements(lane))
  const documentCoverage = buildDocumentCoverage(requirements)
  const domains = Object.freeze(CANCELLATION_ATTORNEY_PHASE1_DOMAIN_DEFINITIONS.map((domain) => buildDomain(domain, lane, requirements)))
  const dependencies = dependencyStatusCounts(lane)
  const nextActions = buildNextActions({ lane, requirements, dataRequirements, documentCoverage })
  const canAct = lane.permissions?.canUpdateStage === true || lane.permissions?.canRequestDocuments === true || lane.permissions?.canAddInternalNote === true
  const current = currentStage(lane)
  const primaryNextAction = nextActions[0] || null
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE1_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE1_RELEASE_BLOCKER_ID,
    laneKey: 'cancellation',
    laneLabel: lane.label || 'Cancellation Attorney',
    title: 'Cancellation Attorney Command Centre',
    currentStage: current,
    currentStageLabel: STAGE_BY_KEY[current]?.label || toTitle(current),
    roleFocused: Boolean(canAct),
    canAct: Boolean(canAct),
    readOnlyReason: canAct ? '' : (lane.permissions?.readOnlyReason || 'Only the assigned cancellation team may change this lane.'),
    documentRequestActionLabel: 'Create Cancellation Document Requests',
    documentRequestActionDescription: 'Creates requests for missing cancellation evidence; it does not generate bank forms, cancellation figures, guarantees, settlement proof or legal instruments.',
    domains,
    dataRequirements,
    documentRequirements: requirements,
    documentCoverage,
    dependencies,
    nextActions,
    primaryNextAction,
    counts: Object.freeze({
      domainCount: domains.length,
      stageCount: STAGE_KEYS.length,
      visibleRequirementCount: requirements.length,
      hiddenRichRequirementCount: documentCoverage.hiddenRichRequirementIds.length,
      openRequirementCount: requirements.filter((requirement) => requirement.status !== 'complete').length,
      reviewRequirementCount: requirements.filter((requirement) => requirement.status === 'review').length,
      dataGapCount: dataRequirements.filter((requirement) => requirement.missing).length,
      signingRequirementCount: Array.isArray(lane.signingRequirements) ? lane.signingRequirements.length : 0,
      blockedDependencyCount: dependencies.blocked,
      coverageWarningCount: documentCoverage.richRequirementIdsNotOnStages.length + documentCoverage.stageOnlyDocumentKeys.length,
    }),
    actionSequence: CANCELLATION_ATTORNEY_PHASE1_ACTION_SEQUENCE,
    controls: CANCELLATION_ATTORNEY_PHASE1_CONTROL_BOUNDARY,
  })
}

export function validateCancellationAttorneyPhase1Usability(usability = {}) {
  const errors = []
  if (usability.version !== CANCELLATION_ATTORNEY_PHASE1_VERSION) errors.push('phase1_version_invalid')
  if (usability.laneKey !== 'cancellation') errors.push('lane_key_invalid')
  if (usability.releaseBlockerId !== CANCELLATION_ATTORNEY_PHASE1_RELEASE_BLOCKER_ID) errors.push('release_blocker_id_invalid')
  if (!Array.isArray(usability.domains) || usability.domains.length !== CANCELLATION_ATTORNEY_PHASE1_DOMAIN_DEFINITIONS.length) errors.push('domain_contract_incomplete')
  const coveredStages = unique((usability.domains || []).flatMap((domain) => domain.stageKeys || []))
  STAGE_KEYS.filter((stageKey) => !coveredStages.includes(stageKey)).forEach((stageKey) => errors.push(`stage_not_domain_mapped:${stageKey}`))
  if (usability.counts?.hiddenRichRequirementCount !== 0) errors.push('rich_cancellation_requirements_hidden')
  if ((usability.documentRequirements || []).length < 10) errors.push('visible_cancellation_requirements_too_thin')
  if (!usability.documentCoverage?.richRequirementIdsNotOnStages?.length) errors.push('stage_resolver_mismatch_not_surfaced')
  if (!usability.documentCoverage?.stageOnlyDocumentKeys?.length) errors.push('stage_only_requirements_not_surfaced')
  if (usability.controls?.generatesOperationalDocuments !== false) errors.push('operational_generation_forbidden_in_phase1')
  if (usability.controls?.generatesLegalInstruments !== false) errors.push('legal_instrument_generation_forbidden_in_phase1')
  if (usability.controls?.writesExternalSystem !== false) errors.push('external_writes_forbidden_in_phase1')
  if (!Array.isArray(usability.nextActions)) errors.push('next_actions_required')
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
  })
}

export function buildCancellationAttorneyPhase1BaselineReport(lane = {}) {
  const phase0Report = buildCancellationAttorneyPhase0BaselineReport()
  const usability = buildCancellationAttorneyPhase1Usability(lane)
  const validation = validateCancellationAttorneyPhase1Usability(usability)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE1_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE1_RELEASE_BLOCKER_ID,
    laneKey: usability.laneKey,
    phase0Ready: phase0Report.readyForPhase1,
    domainCount: usability.counts.domainCount,
    stageCount: usability.counts.stageCount,
    visibleRequirementCount: usability.counts.visibleRequirementCount,
    hiddenRichRequirementCount: usability.counts.hiddenRichRequirementCount,
    coverageWarningCount: usability.counts.coverageWarningCount,
    nextActionCount: usability.nextActions.length,
    documentRequestActionLabel: usability.documentRequestActionLabel,
    controls: usability.controls,
    validation,
    readyForPhase2: phase0Report.readyForPhase1 === true &&
      validation.valid &&
      usability.counts.domainCount === 6 &&
      usability.counts.stageCount === 19 &&
      usability.counts.visibleRequirementCount >= 10 &&
      usability.counts.hiddenRichRequirementCount === 0 &&
      usability.controls.exposesStageAndResolverRequirementMismatch === true,
  })
}
