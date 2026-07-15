import {
  MATTER_PLAN_DEPENDENCY_TYPES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_EVIDENCE_TYPES,
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from './conveyancerMatterPlanContract.js'

export const CONVEYANCER_COORDINATION_CONTRACT_VERSION = 'conveyancer_coordination_v1'

export const CONVEYANCER_COORDINATION_LANES = Object.freeze({
  transfer: 'transfer',
  bond: 'bond',
  cancellation: 'cancellation',
  external: 'external',
})

export const CONVEYANCER_COORDINATION_STATUSES = Object.freeze({
  draft: 'draft',
  requested: 'requested',
  acknowledged: 'acknowledged',
  inProgress: 'in_progress',
  submitted: 'submitted',
  changesRequested: 'changes_requested',
  blocked: 'blocked',
  accepted: 'accepted',
  cancelled: 'cancelled',
  superseded: 'superseded',
})

export const CONVEYANCER_COORDINATION_PRIORITIES = Object.freeze({
  low: 'low',
  normal: 'normal',
  high: 'high',
  critical: 'critical',
})

export const CONVEYANCER_COORDINATION_DELIVERABLE_TYPES = Object.freeze({
  information: 'information',
  document: 'document',
  confirmation: 'confirmation',
  approval: 'approval',
  guarantee: 'guarantee',
  financial: 'financial',
  appointment: 'appointment',
  lodgement: 'lodgement',
  registration: 'registration',
  externalOutcome: 'external_outcome',
})

export const CONVEYANCER_COORDINATION_VISIBILITIES = Object.freeze({
  internal: 'internal',
  professionalShared: 'professional_shared',
  clientVisible: 'client_visible',
})

export const CONVEYANCER_COORDINATION_CAPABILITIES = Object.freeze({
  view: 'view',
  create: 'create',
  request: 'request',
  acknowledge: 'acknowledge',
  update: 'update',
  submit: 'submit',
  review: 'review',
  accept: 'accept',
  block: 'block',
  cancel: 'cancel',
  assign: 'assign',
  supersede: 'supersede',
})

const C = CONVEYANCER_COORDINATION_CAPABILITIES
const S = CONVEYANCER_COORDINATION_STATUSES
const L = CONVEYANCER_COORDINATION_LANES
const enumValues = (value) => Object.freeze(Object.values(value))
const STATUS_VALUES = enumValues(CONVEYANCER_COORDINATION_STATUSES)
const LANE_VALUES = enumValues(CONVEYANCER_COORDINATION_LANES)
const PRIORITY_VALUES = enumValues(CONVEYANCER_COORDINATION_PRIORITIES)
const DELIVERABLE_VALUES = enumValues(CONVEYANCER_COORDINATION_DELIVERABLE_TYPES)
const VISIBILITY_VALUES = enumValues(CONVEYANCER_COORDINATION_VISIBILITIES)
const CAPABILITY_VALUES = enumValues(CONVEYANCER_COORDINATION_CAPABILITIES)
const DEPENDENCY_VALUES = Object.values(MATTER_PLAN_DEPENDENCY_TYPES)
const EVIDENCE_TYPE_VALUES = Object.values(MATTER_PLAN_EVIDENCE_TYPES)
const EVIDENCE_STATUS_VALUES = Object.values(MATTER_PLAN_EVIDENCE_STATUSES)

export const CONVEYANCER_COORDINATION_ROLE_CAPABILITIES = Object.freeze({
  [R.conveyancer]: Object.freeze(Object.values(C)),
  [R.transferAttorney]: Object.freeze(Object.values(C)),
  [R.bondAttorney]: Object.freeze([C.view, C.create, C.request, C.acknowledge, C.update, C.submit, C.review, C.accept, C.block, C.cancel, C.assign]),
  [R.cancellationAttorney]: Object.freeze([C.view, C.create, C.request, C.acknowledge, C.update, C.submit, C.review, C.accept, C.block, C.cancel, C.assign]),
  [R.firmManager]: Object.freeze(Object.values(C)),
  [R.secretary]: Object.freeze([C.view, C.create, C.request, C.acknowledge, C.update, C.submit, C.block, C.cancel]),
  [R.accounts]: Object.freeze([C.view, C.create, C.request, C.acknowledge, C.update, C.submit, C.block]),
  [R.externalParty]: Object.freeze([C.view, C.acknowledge, C.update, C.submit, C.block]),
  [R.system]: Object.freeze([C.view, C.create]),
  [R.client]: Object.freeze([C.view]),
})

export const CONVEYANCER_COORDINATION_TRANSITIONS = Object.freeze({
  [S.draft]: Object.freeze([S.requested, S.cancelled, S.superseded]),
  [S.requested]: Object.freeze([S.acknowledged, S.blocked, S.cancelled, S.superseded]),
  [S.acknowledged]: Object.freeze([S.inProgress, S.submitted, S.blocked, S.cancelled, S.superseded]),
  [S.inProgress]: Object.freeze([S.submitted, S.blocked, S.cancelled, S.superseded]),
  [S.submitted]: Object.freeze([S.accepted, S.changesRequested, S.blocked, S.superseded]),
  [S.changesRequested]: Object.freeze([S.inProgress, S.submitted, S.blocked, S.cancelled, S.superseded]),
  [S.blocked]: Object.freeze([S.inProgress, S.submitted, S.cancelled, S.superseded]),
  [S.accepted]: Object.freeze([S.changesRequested, S.superseded]),
  [S.cancelled]: Object.freeze([S.draft, S.superseded]),
  [S.superseded]: Object.freeze([]),
})

export const CONVEYANCER_COORDINATION_PRIORITY_POLICY = Object.freeze({
  [CONVEYANCER_COORDINATION_PRIORITIES.low]: Object.freeze({ acknowledgeHours: 48, deliverHours: 240 }),
  [CONVEYANCER_COORDINATION_PRIORITIES.normal]: Object.freeze({ acknowledgeHours: 24, deliverHours: 120 }),
  [CONVEYANCER_COORDINATION_PRIORITIES.high]: Object.freeze({ acknowledgeHours: 8, deliverHours: 48 }),
  [CONVEYANCER_COORDINATION_PRIORITIES.critical]: Object.freeze({ acknowledgeHours: 2, deliverHours: 12 }),
})

export const CONVEYANCER_COORDINATION_SCHEMA = Object.freeze({
  contractVersion: CONVEYANCER_COORDINATION_CONTRACT_VERSION,
  definitionModel: 'append_only_supersession',
  crossLaneMutationAllowed: false,
  sourceLaneOwnsRequestAndAcceptance: true,
  targetLaneOwnsDelivery: true,
  requiredFields: Object.freeze([
    'coordinationId', 'revision', 'definitionFingerprint', 'planId', 'planVersion',
    'transactionId', 'organisationId', 'deduplicationKey', 'status', 'priority',
    'source.lane', 'source.owner.role', 'target.lane', 'target.owner.role',
    'deliverable.key', 'deliverable.type', 'deliverable.label', 'createdAt', 'createdBy',
  ]),
})

function key(value = '') { return String(value ?? '').trim().toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function text(value = '') { return String(value ?? '').trim() }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function enumValue(value, allowed, fallback = '') { const normalized = key(value); return allowed.includes(normalized) ? normalized : fallback }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {})
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function actor(input = {}) {
  return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null, teamId: text(input.teamId || input.team_id) || null, lane: normalizeConveyancerCoordinationLane(input.lane) || null }
}
function endpoint(input = {}) {
  return { lane: normalizeConveyancerCoordinationLane(input.lane), firmId: text(input.firmId || input.firm_id) || null, owner: actor(input.owner || {}) }
}

export function normalizeConveyancerCoordinationLane(value, fallback = '') {
  const aliases = { transfer_attorney: L.transfer, conveyancer: L.transfer, bond_attorney: L.bond, cancellation_attorney: L.cancellation, external_party: L.external }
  const normalized = key(value)
  return LANE_VALUES.includes(normalized) ? normalized : aliases[normalized] || fallback
}

export function getConveyancerCoordinationRoleCapabilities(role) {
  return CONVEYANCER_COORDINATION_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerCoordinationActor(role, capability) {
  const normalized = enumValue(capability, CAPABILITY_VALUES)
  return Boolean(normalized && getConveyancerCoordinationRoleCapabilities(role).includes(normalized))
}

export function getConveyancerCoordinationRoleLane(role) {
  const normalized = normalizeMatterPlanOwnerRole(role)
  if ([R.conveyancer, R.transferAttorney].includes(normalized)) return L.transfer
  if (normalized === R.bondAttorney) return L.bond
  if (normalized === R.cancellationAttorney) return L.cancellation
  if (normalized === R.externalParty) return L.external
  return null
}

export function isConveyancerCoordinationActorInLane(inputActor = {}, lane = '') {
  const value = actor(inputActor)
  const expected = normalizeConveyancerCoordinationLane(lane)
  if (!expected) return false
  if (value.role === R.firmManager) return !value.lane || value.lane === expected
  const fixedLane = getConveyancerCoordinationRoleLane(value.role)
  if (fixedLane) return fixedLane === expected && (!value.lane || value.lane === expected)
  return [R.secretary, R.accounts].includes(value.role) && value.lane === expected
}

function definitionSnapshot(value = {}) {
  return stable({
    contractVersion: value.contractVersion, coordinationId: value.coordinationId, revision: value.revision,
    previousCoordinationId: value.previousCoordinationId, previousDefinitionFingerprint: value.previousDefinitionFingerprint,
    changeReason: value.changeReason, planId: value.planId, planVersion: value.planVersion,
    transactionId: value.transactionId, organisationId: value.organisationId, deduplicationKey: value.deduplicationKey,
    priority: value.priority, visibility: value.visibility, source: value.source, target: value.target,
    deliverable: value.deliverable, dependencies: value.dependencies, requiredForActionKeys: value.requiredForActionKeys,
    evidenceRequirements: value.evidenceRequirements, sla: value.sla, createdAt: value.createdAt, createdBy: value.createdBy,
  })
}

export function buildConveyancerCoordinationDefinitionFingerprint(value = {}) { return fnv(definitionSnapshot(value)) }

export function normalizeConveyancerCoordination(input = {}) {
  const deliverable = input.deliverable || {}
  const sla = input.sla || {}
  const acknowledgement = input.acknowledgement || {}
  const submission = input.submission || {}
  const decision = input.decision || {}
  const blockage = input.blockage || {}
  const value = {
    contractVersion: text(input.contractVersion || input.contract_version) || CONVEYANCER_COORDINATION_CONTRACT_VERSION,
    coordinationId: text(input.coordinationId || input.coordination_id) || null,
    revision: Number(input.revision || 0),
    previousCoordinationId: text(input.previousCoordinationId || input.previous_coordination_id) || null,
    previousDefinitionFingerprint: text(input.previousDefinitionFingerprint || input.previous_definition_fingerprint) || null,
    changeReason: text(input.changeReason || input.change_reason) || null,
    planId: text(input.planId || input.plan_id) || null,
    planVersion: Number(input.planVersion || input.plan_version || 0),
    transactionId: text(input.transactionId || input.transaction_id),
    organisationId: text(input.organisationId || input.organisation_id),
    deduplicationKey: key(input.deduplicationKey || input.deduplication_key),
    status: enumValue(input.status, STATUS_VALUES, S.draft),
    priority: enumValue(input.priority, PRIORITY_VALUES, CONVEYANCER_COORDINATION_PRIORITIES.normal),
    visibility: enumValue(input.visibility, VISIBILITY_VALUES, CONVEYANCER_COORDINATION_VISIBILITIES.professionalShared),
    source: endpoint(input.source || {}),
    target: endpoint(input.target || {}),
    deliverable: { key: key(deliverable.key), type: enumValue(deliverable.type, DELIVERABLE_VALUES), label: text(deliverable.label), description: text(deliverable.description), format: key(deliverable.format) || null },
    dependencies: (Array.isArray(input.dependencies) ? input.dependencies : []).map((item) => ({ key: key(item.key || item.id), type: enumValue(item.type, DEPENDENCY_VALUES), required: item.required !== false })),
    requiredForActionKeys: unique((input.requiredForActionKeys || input.required_for_action_keys || []).map(key)),
    evidenceRequirements: (Array.isArray(input.evidenceRequirements || input.evidence_requirements) ? input.evidenceRequirements || input.evidence_requirements : []).map((item) => ({ key: key(item.key || item.id), label: text(item.label || item.title), type: enumValue(item.type, EVIDENCE_TYPE_VALUES), required: item.required !== false, requiresApproval: item.requiresApproval === true || item.requires_approval === true })),
    evidence: (Array.isArray(input.evidence) ? input.evidence : []).map((item) => ({ requirementKey: key(item.requirementKey || item.requirement_key), status: enumValue(item.status, EVIDENCE_STATUS_VALUES), referenceId: text(item.referenceId || item.reference_id) || null, reason: text(item.reason) || null, capturedAt: item.capturedAt || item.captured_at || null, capturedBy: actor(item.capturedBy || item.captured_by) })),
    sla: { acknowledgeBy: sla.acknowledgeBy || sla.acknowledge_by || null, deliverBy: sla.deliverBy || sla.deliver_by || null },
    acknowledgement: { acknowledgedAt: acknowledgement.acknowledgedAt || acknowledgement.acknowledged_at || null, acknowledgedBy: actor(acknowledgement.acknowledgedBy || acknowledgement.acknowledged_by), expectedAt: acknowledgement.expectedAt || acknowledgement.expected_at || null },
    submission: { submittedAt: submission.submittedAt || submission.submitted_at || null, submittedBy: actor(submission.submittedBy || submission.submitted_by), summary: text(submission.summary) || null },
    decision: { type: key(decision.type) || null, reason: text(decision.reason) || null, decidedAt: decision.decidedAt || decision.decided_at || null, decidedBy: actor(decision.decidedBy || decision.decided_by) },
    blockage: { reason: text(blockage.reason) || null, blockedAt: blockage.blockedAt || blockage.blocked_at || null, blockedBy: actor(blockage.blockedBy || blockage.blocked_by), followUpAt: blockage.followUpAt || blockage.follow_up_at || null },
    requestedAt: input.requestedAt || input.requested_at || null,
    requestedBy: actor(input.requestedBy || input.requested_by),
    createdAt: input.createdAt || input.created_at || null,
    createdBy: actor(input.createdBy || input.created_by),
    updatedAt: input.updatedAt || input.updated_at || null,
    runtimeRevision: Number(input.runtimeRevision || input.runtime_revision || 0),
    lastEventId: text(input.lastEventId || input.last_event_id) || null,
    definitionFingerprint: text(input.definitionFingerprint || input.definition_fingerprint) || null,
  }
  return value
}

function evidenceSatisfied(value) {
  return value.evidenceRequirements.filter((item) => item.required).every((requirement) => value.evidence.some((item) => {
    if (item.requirementKey !== requirement.key) return false
    if (item.status === MATTER_PLAN_EVIDENCE_STATUSES.waived) return Boolean(item.reason)
    if (requirement.requiresApproval) return item.status === MATTER_PLAN_EVIDENCE_STATUSES.approved
    return [MATTER_PLAN_EVIDENCE_STATUSES.provided, MATTER_PLAN_EVIDENCE_STATUSES.approved].includes(item.status)
  }))
}

export function evaluateConveyancerCoordinationAuthority({ coordination: input = {}, actor: inputActor = {}, capability = '' } = {}) {
  const value = normalizeConveyancerCoordination(input)
  const performedBy = actor(inputActor)
  const requestedCapability = enumValue(capability, CAPABILITY_VALUES)
  if (!performedBy.userId) return { allowed: false, reason: 'actor_user_required' }
  if (!requestedCapability || !canConveyancerCoordinationActor(performedBy.role, requestedCapability)) return { allowed: false, reason: 'actor_lacks_coordination_capability' }
  if (requestedCapability === C.view) return { allowed: true, reason: 'coordination_participant_view' }
  if (requestedCapability === C.create && performedBy.role === R.system) return { allowed: true, reason: 'system_contract_creation' }
  if (requestedCapability === C.supersede) return performedBy.role === R.firmManager ? { allowed: true, reason: 'firm_manager_supersession' } : { allowed: false, reason: 'firm_manager_required' }
  const sourceCapabilities = [C.create, C.request, C.review, C.accept, C.cancel]
  const targetCapabilities = [C.acknowledge, C.update, C.submit, C.block]
  if (sourceCapabilities.includes(requestedCapability)) return isConveyancerCoordinationActorInLane(performedBy, value.source.lane) ? { allowed: true, reason: 'source_lane_authority' } : { allowed: false, reason: 'source_lane_authority_required' }
  if (targetCapabilities.includes(requestedCapability)) return isConveyancerCoordinationActorInLane(performedBy, value.target.lane) ? { allowed: true, reason: 'target_lane_authority' } : { allowed: false, reason: 'target_lane_authority_required' }
  if (requestedCapability === C.assign) return performedBy.role === R.firmManager || isConveyancerCoordinationActorInLane(performedBy, value.target.lane) ? { allowed: true, reason: 'target_assignment_authority' } : { allowed: false, reason: 'target_assignment_authority_required' }
  return { allowed: false, reason: 'coordination_authority_not_defined' }
}

export function validateConveyancerCoordination(input = {}, { actionKeys = [] } = {}) {
  const value = normalizeConveyancerCoordination(input)
  const errors = []
  const warnings = []
  const suppliedStatus = key(input.status)
  const suppliedPriority = key(input.priority)
  const suppliedVisibility = key(input.visibility)
  const suppliedDeliverableType = key(input.deliverable?.type)
  if (value.contractVersion !== CONVEYANCER_COORDINATION_CONTRACT_VERSION) errors.push('unsupported_contract_version')
  if (!value.coordinationId) errors.push('coordination_id_required')
  if (!Number.isInteger(value.revision) || value.revision < 1) errors.push('positive_coordination_revision_required')
  if (value.revision > 1 && (!value.previousCoordinationId || !/^fnv1a_[a-f0-9]{8}$/.test(value.previousDefinitionFingerprint || '') || !value.changeReason)) errors.push('coordination_supersession_lineage_required')
  if (value.revision === 1 && (value.previousCoordinationId || value.previousDefinitionFingerprint)) errors.push('initial_coordination_cannot_supersede')
  if (!value.planId || !Number.isInteger(value.planVersion) || value.planVersion < 1) errors.push('matter_plan_reference_required')
  if (!value.transactionId || !value.organisationId) errors.push('coordination_matter_binding_required')
  if (!value.deduplicationKey) errors.push('coordination_deduplication_key_required')
  if (!suppliedStatus) errors.push('coordination_status_required')
  if (suppliedStatus && !STATUS_VALUES.includes(suppliedStatus)) errors.push('invalid_coordination_status')
  if (suppliedPriority && !PRIORITY_VALUES.includes(suppliedPriority)) errors.push('invalid_coordination_priority')
  if (suppliedVisibility && !VISIBILITY_VALUES.includes(suppliedVisibility)) errors.push('invalid_coordination_visibility')
  if (!value.source.lane || !value.target.lane) errors.push('coordination_lanes_required')
  if (value.source.lane && value.source.lane === value.target.lane) errors.push('cross_lane_coordination_required')
  if ([L.transfer, L.bond, L.cancellation].includes(value.source.lane) && !value.source.firmId) errors.push('source_firm_binding_required')
  if ([L.transfer, L.bond, L.cancellation].includes(value.target.lane) && !value.target.firmId) errors.push('target_firm_binding_required')
  if (!value.source.owner.role || !isConveyancerCoordinationActorInLane(value.source.owner, value.source.lane)) errors.push('source_owner_lane_invalid')
  if (!value.target.owner.role || !isConveyancerCoordinationActorInLane(value.target.owner, value.target.lane)) errors.push('target_owner_lane_invalid')
  if (!value.source.owner.userId && !value.source.owner.teamId) errors.push('source_owner_reference_required')
  if (!value.target.owner.userId && !value.target.owner.teamId) errors.push('target_owner_reference_required')
  if (!value.deliverable.key || !value.deliverable.label) errors.push('coordination_deliverable_identity_required')
  if (suppliedDeliverableType && !DELIVERABLE_VALUES.includes(suppliedDeliverableType)) errors.push('invalid_coordination_deliverable_type')
  if (!value.deliverable.type) errors.push('coordination_deliverable_type_required')
  if (!validDate(value.createdAt)) errors.push('coordination_created_at_required')
  if (!value.createdBy.role || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.createdBy, capability: C.create }).allowed) errors.push('coordination_creator_not_authorised')
  if (value.updatedAt && !validDate(value.updatedAt)) errors.push('invalid_coordination_updated_at')
  if (validDate(value.createdAt) && validDate(value.updatedAt) && new Date(value.updatedAt) < new Date(value.createdAt)) errors.push('coordination_update_precedes_creation')
  if (!Number.isInteger(value.runtimeRevision) || value.runtimeRevision < 0) errors.push('invalid_coordination_runtime_revision')
  if (value.runtimeRevision > 0 && !value.lastEventId) errors.push('coordination_last_event_id_required')

  const dependencyKeys = value.dependencies.map((item) => item.key)
  if (dependencyKeys.some((item) => !item)) errors.push('coordination_dependency_key_required')
  if (value.dependencies.some((item) => !item.type)) errors.push('invalid_coordination_dependency_type')
  if (new Set(dependencyKeys).size !== dependencyKeys.length) errors.push('duplicate_coordination_dependency')
  if (actionKeys.length && value.dependencies.some((item) => item.type === MATTER_PLAN_DEPENDENCY_TYPES.action && !actionKeys.includes(item.key))) errors.push('unknown_coordination_action_dependency')
  if (actionKeys.length && value.requiredForActionKeys.some((item) => !actionKeys.includes(item))) errors.push('unknown_coordination_required_action')

  const requirementKeys = value.evidenceRequirements.map((item) => item.key)
  if (requirementKeys.some((item) => !item)) errors.push('coordination_evidence_requirement_key_required')
  if (value.evidenceRequirements.some((item) => !item.type)) errors.push('invalid_coordination_evidence_requirement_type')
  if (new Set(requirementKeys).size !== requirementKeys.length) errors.push('duplicate_coordination_evidence_requirement')
  if (value.evidence.some((item) => !requirementKeys.includes(item.requirementKey))) errors.push('unknown_coordination_evidence_requirement')
  if (value.evidence.some((item) => !item.status)) errors.push('invalid_coordination_evidence_status')
  if (value.evidence.some((item) => !validDate(item.capturedAt) || !item.capturedBy.role)) errors.push('coordination_evidence_provenance_required')
  if (value.evidence.some((item) => item.status === MATTER_PLAN_EVIDENCE_STATUSES.waived && !item.reason)) errors.push('waived_coordination_evidence_reason_required')

  if ([CONVEYANCER_COORDINATION_PRIORITIES.high, CONVEYANCER_COORDINATION_PRIORITIES.critical].includes(value.priority) && (!validDate(value.sla.acknowledgeBy) || !validDate(value.sla.deliverBy))) errors.push('coordination_sla_required')
  if (value.sla.acknowledgeBy && !validDate(value.sla.acknowledgeBy)) errors.push('invalid_coordination_acknowledgement_sla')
  if (value.sla.deliverBy && !validDate(value.sla.deliverBy)) errors.push('invalid_coordination_delivery_sla')
  if (validDate(value.createdAt) && validDate(value.sla.acknowledgeBy) && new Date(value.sla.acknowledgeBy) < new Date(value.createdAt)) errors.push('coordination_acknowledgement_sla_precedes_creation')
  if (validDate(value.sla.acknowledgeBy) && validDate(value.sla.deliverBy) && new Date(value.sla.deliverBy) < new Date(value.sla.acknowledgeBy)) errors.push('coordination_delivery_sla_precedes_acknowledgement_sla')

  if (value.status !== S.draft) {
    if (!validDate(value.requestedAt) || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.requestedBy, capability: C.request }).allowed) errors.push('coordination_request_authority_required')
    if (validDate(value.createdAt) && validDate(value.requestedAt) && new Date(value.requestedAt) < new Date(value.createdAt)) errors.push('coordination_request_precedes_creation')
  }
  if ([S.acknowledged, S.inProgress, S.submitted, S.changesRequested, S.blocked, S.accepted].includes(value.status)) {
    if (!validDate(value.acknowledgement.acknowledgedAt) || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.acknowledgement.acknowledgedBy, capability: C.acknowledge }).allowed) errors.push('coordination_acknowledgement_required')
    if (validDate(value.requestedAt) && validDate(value.acknowledgement.acknowledgedAt) && new Date(value.acknowledgement.acknowledgedAt) < new Date(value.requestedAt)) errors.push('coordination_acknowledgement_precedes_request')
    if (value.acknowledgement.expectedAt && !validDate(value.acknowledgement.expectedAt)) errors.push('invalid_coordination_expected_at')
    if (validDate(value.acknowledgement.acknowledgedAt) && validDate(value.acknowledgement.expectedAt) && new Date(value.acknowledgement.expectedAt) < new Date(value.acknowledgement.acknowledgedAt)) errors.push('coordination_expected_at_precedes_acknowledgement')
  }
  if ([S.submitted, S.changesRequested, S.accepted].includes(value.status)) {
    if (!validDate(value.submission.submittedAt) || !value.submission.summary || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.submission.submittedBy, capability: C.submit }).allowed) errors.push('coordination_submission_required')
    if (validDate(value.acknowledgement.acknowledgedAt) && validDate(value.submission.submittedAt) && new Date(value.submission.submittedAt) < new Date(value.acknowledgement.acknowledgedAt)) errors.push('coordination_submission_precedes_acknowledgement')
  }
  if (value.status === S.accepted) {
    if (value.decision.type !== 'accepted' || !validDate(value.decision.decidedAt) || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.decision.decidedBy, capability: C.accept }).allowed) errors.push('coordination_acceptance_required')
    if (!evidenceSatisfied(value)) errors.push('coordination_required_evidence_not_satisfied')
    if (validDate(value.submission.submittedAt) && validDate(value.decision.decidedAt) && new Date(value.decision.decidedAt) < new Date(value.submission.submittedAt)) errors.push('coordination_decision_precedes_submission')
  }
  if (value.status === S.changesRequested && (value.decision.type !== 'changes_requested' || !value.decision.reason || !validDate(value.decision.decidedAt) || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.decision.decidedBy, capability: C.review }).allowed)) errors.push('coordination_change_request_required')
  if (value.status === S.blocked && (!value.blockage.reason || !validDate(value.blockage.blockedAt) || !validDate(value.blockage.followUpAt) || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.blockage.blockedBy, capability: C.block }).allowed)) errors.push('coordination_blockage_required')
  if (value.status === S.blocked && validDate(value.blockage.blockedAt) && validDate(value.blockage.followUpAt) && new Date(value.blockage.followUpAt) < new Date(value.blockage.blockedAt)) errors.push('coordination_follow_up_precedes_blockage')
  if (value.status === S.cancelled && (value.decision.type !== 'cancelled' || !value.decision.reason || !validDate(value.decision.decidedAt) || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.decision.decidedBy, capability: C.cancel }).allowed)) errors.push('coordination_cancellation_required')
  if (value.status === S.superseded && (!value.decision.reason || !validDate(value.decision.decidedAt) || !evaluateConveyancerCoordinationAuthority({ coordination: value, actor: value.decision.decidedBy, capability: C.supersede }).allowed)) errors.push('coordination_supersession_decision_required')

  const expectedFingerprint = buildConveyancerCoordinationDefinitionFingerprint(value)
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.definitionFingerprint || '')) errors.push('coordination_definition_fingerprint_required')
  else if (value.definitionFingerprint !== expectedFingerprint) errors.push('coordination_definition_fingerprint_invalid')
  if (!value.dependencies.length) warnings.push('coordination_has_no_dependencies')
  if (!value.evidenceRequirements.length) warnings.push('coordination_has_no_evidence_contract')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings), coordination: value })
}

export function buildConveyancerCoordinationContract(input = {}, options = {}) {
  const normalized = normalizeConveyancerCoordination(input)
  normalized.definitionFingerprint = buildConveyancerCoordinationDefinitionFingerprint(normalized)
  const validation = validateConveyancerCoordination(normalized, options)
  return deepFreeze({ ok: validation.valid, code: validation.valid ? 'coordination_contract_valid' : 'coordination_contract_invalid', errors: validation.errors, warnings: validation.warnings, coordination: validation.coordination })
}

function transitionCapability(to) {
  if (to === S.requested) return C.request
  if (to === S.acknowledged) return C.acknowledge
  if (to === S.inProgress) return C.update
  if (to === S.submitted) return C.submit
  if (to === S.changesRequested) return C.review
  if (to === S.blocked) return C.block
  if (to === S.accepted) return C.accept
  if (to === S.cancelled) return C.cancel
  if (to === S.superseded) return C.supersede
  if (to === S.draft) return C.create
  return null
}

export function evaluateConveyancerCoordinationTransition({ coordination: input = {}, toStatus = '', actor: inputActor = {}, reason = '', requiredEvidenceSatisfied = false } = {}) {
  const value = normalizeConveyancerCoordination(input)
  const to = enumValue(toStatus, STATUS_VALUES)
  if (!to || !STATUS_VALUES.includes(value.status)) return { allowed: false, reason: 'invalid_coordination_status' }
  if (to === value.status) return { allowed: true, reason: 'no_change', requiredCapability: null }
  if (!(CONVEYANCER_COORDINATION_TRANSITIONS[value.status] || []).includes(to)) return { allowed: false, reason: 'coordination_transition_not_allowed' }
  const capability = transitionCapability(to)
  const authority = evaluateConveyancerCoordinationAuthority({ coordination: value, actor: inputActor, capability })
  if (!authority.allowed) return { allowed: false, reason: authority.reason, requiredCapability: capability }
  if ([S.changesRequested, S.blocked, S.cancelled, S.superseded].includes(to) && !text(reason)) return { allowed: false, reason: 'coordination_transition_reason_required', requiredCapability: capability }
  if (to === S.accepted && !requiredEvidenceSatisfied) return { allowed: false, reason: 'coordination_required_evidence_not_satisfied', requiredCapability: capability }
  return { allowed: true, reason: 'coordination_transition_allowed', requiredCapability: capability }
}

export function evaluateConveyancerCoordinationSupersession({ previous: inputPrevious = {}, current: inputCurrent = {}, actor: inputActor = {} } = {}) {
  const previous = normalizeConveyancerCoordination(inputPrevious)
  const current = normalizeConveyancerCoordination(inputCurrent)
  const errors = []
  if (current.revision !== previous.revision + 1) errors.push('next_coordination_revision_required')
  if (current.previousCoordinationId !== previous.coordinationId || current.previousDefinitionFingerprint !== previous.definitionFingerprint) errors.push('coordination_supersession_lineage_mismatch')
  if (current.planId !== previous.planId || current.planVersion !== previous.planVersion || current.transactionId !== previous.transactionId || current.organisationId !== previous.organisationId) errors.push('coordination_matter_binding_changed')
  if (!current.changeReason) errors.push('coordination_change_reason_required')
  if (!evaluateConveyancerCoordinationAuthority({ coordination: previous, actor: inputActor, capability: C.supersede }).allowed) errors.push('coordination_supersession_not_authorised')
  return deepFreeze({ allowed: errors.length === 0, errors: unique(errors), previous, current })
}
