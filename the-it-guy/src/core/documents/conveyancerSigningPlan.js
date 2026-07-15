import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_SIGNING_CAPACITY_STATUSES,
  evaluateConveyancerSigningCapacityApplicability,
  isConveyancerSigningCapacityLaneAuthorised,
  validateConveyancerSigningCapacity,
} from './conveyancerSigningCapacityModel.js'

export const CONVEYANCER_SIGNING_PLAN_VERSION = 'conveyancer_signing_plan_v1'

export const CONVEYANCER_SIGNING_PLAN_STATUSES = Object.freeze({
  incomplete: 'incomplete',
  reviewRequired: 'review_required',
  ready: 'ready',
  blocked: 'blocked',
})

export const CONVEYANCER_SIGNING_PLAN_ROUTING_MODES = Object.freeze({
  parallel: 'parallel',
  sequential: 'sequential',
  mixed: 'mixed',
})

export const CONVEYANCER_SIGNING_PLAN_QUORUM_MODES = Object.freeze({
  all: 'all',
  atLeast: 'at_least',
  any: 'any',
})

export const CONVEYANCER_SIGNING_PLAN_METHODS = Object.freeze({
  electronic: 'electronic',
  wetInk: 'wet_ink',
})

export const CONVEYANCER_SIGNING_PLAN_CAPABILITIES = Object.freeze({
  view: 'view',
  prepare: 'prepare',
  approve: 'approve',
  use: 'use',
})

const STATUS = CONVEYANCER_SIGNING_PLAN_STATUSES
const ROUTING = CONVEYANCER_SIGNING_PLAN_ROUTING_MODES
const QUORUM = CONVEYANCER_SIGNING_PLAN_QUORUM_MODES
const METHOD = CONVEYANCER_SIGNING_PLAN_METHODS
const CAP = CONVEYANCER_SIGNING_PLAN_CAPABILITIES
const ROUTING_VALUES = new Set(Object.values(ROUTING))
const QUORUM_VALUES = new Set(Object.values(QUORUM))
const METHOD_VALUES = new Set(Object.values(METHOD))
const LANES = new Set(['transfer', 'bond', 'cancellation'])
const FIELD_TYPES = new Set(['signature', 'initial'])

export const CONVEYANCER_SIGNING_PLAN_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([CAP.view, CAP.prepare]),
  [R.conveyancer]: Object.freeze(Object.values(CAP)),
  [R.transferAttorney]: Object.freeze(Object.values(CAP)),
  [R.bondAttorney]: Object.freeze(Object.values(CAP)),
  [R.cancellationAttorney]: Object.freeze(Object.values(CAP)),
  [R.firmManager]: Object.freeze(Object.values(CAP)),
  [R.system]: Object.freeze([CAP.view, CAP.use]),
  [R.accounts]: Object.freeze([]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
})

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  return value
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null } }
function normalizedMethods(values = []) { return unique((Array.isArray(values) ? values : []).map(key)).sort() }

export function getConveyancerSigningPlanCapabilities(role) {
  return CONVEYANCER_SIGNING_PLAN_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerSigningPlanActor(role, capability) {
  return getConveyancerSigningPlanCapabilities(role).includes(key(capability))
}

function actorAuthorised(input, capability, lane, includeSecretary = true) {
  const value = actor(input)
  return Boolean(value.userId && canConveyancerSigningPlanActor(value.role, capability) && isConveyancerSigningCapacityLaneAuthorised(value.role, lane, { includeSecretary }))
}

function normalizeDocument(input = {}) {
  return {
    documentId: text(input.documentId || input.document_id),
    planId: text(input.planId || input.plan_id),
    planVersion: Number(input.planVersion || input.plan_version || 0),
    transactionId: text(input.transactionId || input.transaction_id),
    organisationId: text(input.organisationId || input.organisation_id),
    actionKey: key(input.actionKey || input.action_key),
    documentKey: key(input.documentKey || input.document_key),
    documentKind: key(input.documentKind || input.document_kind),
    lane: key(input.lane),
    contentFingerprint: text(input.contentFingerprint || input.content_fingerprint).toLowerCase(),
    provenanceFingerprint: text(input.provenanceFingerprint || input.provenance_fingerprint).toLowerCase(),
    signingFields: (Array.isArray(input.renderModel?.signingFields) ? input.renderModel.signingFields : Array.isArray(input.signingFields) ? input.signingFields : [])
      .filter((field) => FIELD_TYPES.has(key(field.fieldType || field.field_type || field.type)))
      .map((field, index) => ({
        fieldKey: key(field.fieldKey || field.field_key) || `signing_field_${index + 1}`,
        fieldType: key(field.fieldType || field.field_type || field.type),
        signerRole: key(field.signerRole || field.signer_role),
        required: field.required !== false,
        order: Number.isInteger(Number(field.order)) && Number(field.order) > 0 ? Number(field.order) : index + 1,
      }))
      .sort((left, right) => left.order - right.order || left.fieldKey.localeCompare(right.fieldKey)),
  }
}

function normalizeCapacityBinding(capacity = null) {
  if (!capacity) return null
  return {
    capacityId: capacity.capacityId,
    recordVersion: capacity.recordVersion,
    capacityType: capacity.capacityType,
    authorityBasis: capacity.authorityBasis,
    capacityFingerprint: capacity.fingerprint,
    capacityStatus: capacity.assessment?.status || null,
    assessedAt: capacity.assessment?.assessedAt || null,
  }
}

function normalizeParticipant(input = {}, capacity = null, index = 0) {
  return {
    participantKey: key(input.participantKey || input.participant_key) || `participant_${index + 1}`,
    signerKey: key(input.signerKey || input.signer_key),
    documentSignerRole: key(input.documentSignerRole || input.document_signer_role || input.signerRole || input.signer_role),
    partyKey: key(input.partyKey || input.party_key),
    partyRole: key(input.partyRole || input.party_role),
    signerReferenceHash: text(input.signerReferenceHash || input.signer_reference_hash).toLowerCase(),
    capacityId: text(input.capacityId || input.capacity_id),
    capacityBinding: normalizeCapacityBinding(capacity),
    signingOrder: Number(input.signingOrder ?? input.signing_order ?? 1),
    required: input.required !== false,
    allowedMethods: normalizedMethods(input.allowedMethods || input.allowed_methods || [METHOD.electronic]),
  }
}

function normalizeAssignment(input = {}, index = 0) {
  const quorumMode = key(input.quorum?.mode || input.quorumMode || input.quorum_mode) || QUORUM.all
  const signerKeys = unique((Array.isArray(input.signerKeys || input.signer_keys) ? input.signerKeys || input.signer_keys : []).map(key)).sort()
  let minimumRequired = Number(input.quorum?.minimumRequired ?? input.quorum?.minimum_required ?? input.minimumRequired ?? input.minimum_required)
  if (!Number.isInteger(minimumRequired) || minimumRequired < 1) minimumRequired = quorumMode === QUORUM.all ? signerKeys.length : 1
  return {
    fieldKey: key(input.fieldKey || input.field_key) || `assignment_${index + 1}`,
    signerKeys,
    quorum: { mode: quorumMode, minimumRequired },
  }
}

function automaticAssignments(document, participants) {
  return document.signingFields.map((field) => ({
    field,
    signerKeys: participants.filter((item) => item.documentSignerRole === field.signerRole).map((item) => item.signerKey),
  })).filter((item) => item.signerKeys.length).map((item) => normalizeAssignment({
    fieldKey: item.field.fieldKey,
    signerKeys: item.signerKeys,
    quorum: { mode: QUORUM.all },
  }))
}

function planSnapshot(plan = {}) {
  const { fingerprint: _fingerprint, assessment: _assessment, ...snapshot } = plan
  return stable(snapshot)
}

export function buildConveyancerSigningPlanFingerprint(plan = {}) {
  return fnv(planSnapshot(plan))
}

function assessPlan(plan, document, capacityRecords, asOf) {
  const missing = []
  const blockers = []
  const warnings = []
  const assignmentsByField = new Map(plan.fieldAssignments.map((item) => [item.fieldKey, item]))
  const participantsBySigner = new Map(plan.participants.map((item) => [item.signerKey, item]))
  const capacities = new Map((Array.isArray(capacityRecords) ? capacityRecords : []).map((item) => [text(item.capacityId || item.capacity_id), item]))

  for (const field of document.signingFields) {
    const assignment = assignmentsByField.get(field.fieldKey)
    if (!assignment || !assignment.signerKeys.length) {
      if (field.required) missing.push(`required_signing_field_unassigned:${field.fieldKey}`)
      continue
    }
    const matching = assignment.signerKeys.map((signerKey) => participantsBySigner.get(signerKey)).filter(Boolean).filter((item) => item.documentSignerRole === field.signerRole && (!field.required || item.required))
    if (matching.length < assignment.quorum.minimumRequired) blockers.push(`field_quorum_not_covered:${field.fieldKey}`)
  }

  for (const participant of plan.participants) {
    const capacity = capacities.get(participant.capacityId)
    if (!capacity) { missing.push(`capacity_record_missing:${participant.signerKey}`); continue }
    const validation = validateConveyancerSigningCapacity(capacity, { asOf })
    if (!validation.valid) { blockers.push(`capacity_contract_invalid:${participant.signerKey}`); continue }
    if (validation.capacity.signatoryKey !== participant.signerKey || validation.capacity.signatoryReferenceHash !== participant.signerReferenceHash || validation.capacity.partyKey !== participant.partyKey || validation.capacity.partyRole !== participant.partyRole) {
      blockers.push(`capacity_signer_binding_mismatch:${participant.signerKey}`)
      continue
    }
    const applicability = evaluateConveyancerSigningCapacityApplicability({ capacity, document, asOf, expectedPartyRole: participant.partyRole })
    if (!applicability.usable) {
      if (validation.capacity.assessment.status === CONVEYANCER_SIGNING_CAPACITY_STATUSES.incomplete) missing.push(`capacity_incomplete:${participant.signerKey}`)
      else blockers.push(`capacity_not_usable:${participant.signerKey}`)
      warnings.push(...applicability.reasons.map((reason) => `${participant.signerKey}:${reason}`))
    }
  }

  if (blockers.length) return { status: STATUS.blocked, missing: [], blockers: unique(blockers), warnings: unique(warnings), assessedAt: asOf }
  if (missing.length) return { status: STATUS.incomplete, missing: unique(missing), blockers: [], warnings: unique(warnings), assessedAt: asOf }
  if (!plan.approval.approvedAt || !plan.approval.approvedBy.userId) return { status: STATUS.reviewRequired, missing: [], blockers: [], warnings: unique(warnings), assessedAt: asOf }
  return { status: STATUS.ready, missing: [], blockers: [], warnings: unique(warnings), assessedAt: asOf }
}

function normalizedPlan(input = {}, { capacityRecords = [], asOf } = {}) {
  const document = normalizeDocument(input.document || input.sourceDocument || input.source_document || {})
  const assessedAt = iso(asOf || input.assessment?.assessedAt || input.assessment?.assessed_at || input.preparedAt || input.prepared_at) || new Date().toISOString()
  const capacities = new Map((Array.isArray(capacityRecords) ? capacityRecords : []).map((item) => [text(item.capacityId || item.capacity_id), validateConveyancerSigningCapacity(item, { asOf: assessedAt }).capacity]))
  const participants = (Array.isArray(input.participants) ? input.participants : []).map((item, index) => normalizeParticipant(item, capacities.get(text(item.capacityId || item.capacity_id)), index))
    .sort((left, right) => left.signingOrder - right.signingOrder || left.signerKey.localeCompare(right.signerKey))
  const assignmentsInput = input.fieldAssignments || input.field_assignments
  const plan = {
    version: text(input.version) || CONVEYANCER_SIGNING_PLAN_VERSION,
    signingPlanId: text(input.signingPlanId || input.signing_plan_id),
    revision: Number(input.revision || 1),
    previousSigningPlanId: text(input.previousSigningPlanId || input.previous_signing_plan_id) || null,
    previousFingerprint: text(input.previousFingerprint || input.previous_fingerprint) || null,
    changeReason: text(input.changeReason || input.change_reason) || null,
    document,
    routingMode: key(input.routingMode || input.routing_mode) || ROUTING.parallel,
    participants,
    fieldAssignments: (Array.isArray(assignmentsInput) ? assignmentsInput.map(normalizeAssignment) : automaticAssignments(document, participants)).sort((left, right) => left.fieldKey.localeCompare(right.fieldKey)),
    preparedAt: iso(input.preparedAt || input.prepared_at),
    preparedBy: actor(input.preparedBy || input.prepared_by),
    approval: {
      approvedAt: iso(input.approval?.approvedAt || input.approval?.approved_at),
      approvedBy: actor(input.approval?.approvedBy || input.approval?.approved_by),
      decisionReferenceId: text(input.approval?.decisionReferenceId || input.approval?.decision_reference_id) || null,
    },
  }
  plan.assessment = assessPlan(plan, document, capacityRecords, assessedAt)
  plan.fingerprint = buildConveyancerSigningPlanFingerprint(plan)
  return plan
}

function structuralErrors(plan) {
  const errors = []
  const document = plan.document
  if (plan.version !== CONVEYANCER_SIGNING_PLAN_VERSION) errors.push('signing_plan_version_invalid')
  if (!plan.signingPlanId) errors.push('signing_plan_id_required')
  if (!Number.isInteger(plan.revision) || plan.revision < 1) errors.push('signing_plan_revision_invalid')
  for (const field of ['documentId', 'planId', 'transactionId', 'organisationId', 'actionKey', 'documentKey', 'documentKind']) if (!document[field]) errors.push(`source_${key(field)}_required`)
  if (!Number.isInteger(document.planVersion) || document.planVersion < 1) errors.push('source_plan_version_invalid')
  if (!LANES.has(document.lane)) errors.push('source_lane_invalid')
  if (!sha(document.contentFingerprint) || !sha(document.provenanceFingerprint)) errors.push('source_document_fingerprints_invalid')
  if (!document.signingFields.length) errors.push('source_document_has_no_signing_fields')
  const fieldKeys = document.signingFields.map((item) => item.fieldKey)
  if (fieldKeys.some((item, index) => !item || fieldKeys.indexOf(item) !== index)) errors.push('source_signing_field_keys_invalid')
  if (!ROUTING_VALUES.has(plan.routingMode)) errors.push('signing_routing_mode_invalid')
  if (!plan.preparedAt || !actorAuthorised(plan.preparedBy, CAP.prepare, document.lane)) errors.push('signing_plan_preparer_not_authorised')
  if (!plan.participants.length) errors.push('signing_plan_participant_required')
  const participantKeys = plan.participants.map((item) => item.participantKey)
  const signerKeys = plan.participants.map((item) => item.signerKey)
  if (new Set(participantKeys).size !== participantKeys.length) errors.push('duplicate_participant_key')
  if (new Set(signerKeys).size !== signerKeys.length) errors.push('duplicate_signer_key')
  for (const participant of plan.participants) {
    if (!participant.participantKey || !participant.signerKey || !participant.documentSignerRole || !participant.partyKey || !participant.partyRole || !participant.capacityId || !sha(participant.signerReferenceHash)) errors.push(`participant_identity_invalid:${participant.participantKey || 'unknown'}`)
    if (!Number.isInteger(participant.signingOrder) || participant.signingOrder < 1) errors.push(`participant_signing_order_invalid:${participant.signerKey || 'unknown'}`)
    if (!participant.allowedMethods.length || participant.allowedMethods.some((method) => !METHOD_VALUES.has(method))) errors.push(`participant_signing_methods_invalid:${participant.signerKey || 'unknown'}`)
  }
  const assignmentFields = plan.fieldAssignments.map((item) => item.fieldKey)
  if (new Set(assignmentFields).size !== assignmentFields.length) errors.push('duplicate_field_assignment')
  for (const assignment of plan.fieldAssignments) {
    if (!fieldKeys.includes(assignment.fieldKey)) errors.push(`assignment_field_unknown:${assignment.fieldKey}`)
    if (assignment.signerKeys.some((signerKey) => !signerKeys.includes(signerKey))) errors.push(`assignment_signer_unknown:${assignment.fieldKey}`)
    if (!QUORUM_VALUES.has(assignment.quorum.mode) || !Number.isInteger(assignment.quorum.minimumRequired) || assignment.quorum.minimumRequired < 1 || assignment.quorum.minimumRequired > assignment.signerKeys.length) errors.push(`field_quorum_invalid:${assignment.fieldKey}`)
    if (assignment.quorum.mode === QUORUM.all && assignment.quorum.minimumRequired !== assignment.signerKeys.length) errors.push(`field_all_quorum_invalid:${assignment.fieldKey}`)
    if (assignment.quorum.mode === QUORUM.any && assignment.quorum.minimumRequired !== 1) errors.push(`field_any_quorum_invalid:${assignment.fieldKey}`)
  }
  const orders = unique(plan.participants.map((item) => item.signingOrder)).sort((a, b) => a - b)
  if (plan.routingMode === ROUTING.parallel && orders.some((order) => order !== 1)) errors.push('parallel_plan_requires_single_order_group')
  if (plan.routingMode === ROUTING.sequential && orders.length !== plan.participants.length) errors.push('sequential_plan_requires_unique_signing_orders')
  if (orders.some((order, index) => order !== index + 1)) errors.push('signing_order_groups_must_be_contiguous')
  const hasApproval = Boolean(plan.approval.approvedAt || plan.approval.approvedBy.userId || plan.approval.decisionReferenceId)
  if (hasApproval && (!plan.approval.approvedAt || !plan.approval.decisionReferenceId || !actorAuthorised(plan.approval.approvedBy, CAP.approve, document.lane, false))) errors.push('signing_plan_approval_invalid')
  if (plan.approval.approvedAt && plan.preparedAt && new Date(plan.approval.approvedAt) < new Date(plan.preparedAt)) errors.push('signing_plan_approval_chronology_invalid')
  return unique(errors)
}

export function validateConveyancerSigningPlan(input = {}, options = {}) {
  const plan = normalizedPlan(input, options)
  const errors = structuralErrors(plan)
  if (input.fingerprint && input.fingerprint !== plan.fingerprint) errors.push('signing_plan_fingerprint_invalid')
  if (input.assessment && JSON.stringify(stable(input.assessment)) !== JSON.stringify(stable(plan.assessment))) errors.push('signing_plan_assessment_stale')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), plan })
}

export function buildConveyancerSigningPlan(input = {}, options = {}) {
  const validation = validateConveyancerSigningPlan(input, options)
  if (!validation.valid) return deepFreeze({ ok: false, code: 'signing_plan_contract_invalid', errors: validation.errors, plan: validation.plan })
  return deepFreeze({ ok: true, code: validation.plan.assessment.status, errors: [], plan: validation.plan })
}

export function buildConveyancerSigningPlanC7SignerContract(input = {}, options = {}) {
  const validation = validateConveyancerSigningPlan(input, options)
  if (!validation.valid) return deepFreeze({ ok: false, code: 'signing_plan_contract_invalid', errors: validation.errors, signers: [] })
  if (validation.plan.assessment.status !== STATUS.ready) return deepFreeze({ ok: false, code: `signing_plan_${validation.plan.assessment.status}`, errors: [...validation.plan.assessment.missing, ...validation.plan.assessment.blockers], signers: [] })
  const signers = validation.plan.participants.map((participant) => ({
    signerKey: participant.signerKey,
    signerRole: participant.documentSignerRole,
    signerReferenceHash: participant.signerReferenceHash,
    signingOrder: participant.signingOrder,
    required: participant.required,
    allowedMethods: [...participant.allowedMethods],
  }))
  return deepFreeze({ ok: true, code: 'c7_signer_contract_ready', errors: [], signingPlanId: validation.plan.signingPlanId, signingPlanFingerprint: validation.plan.fingerprint, signers })
}

export function validateConveyancerSigningPlanLineage({ previous = null, current = {}, capacityRecords = [], asOf } = {}) {
  const currentValidation = validateConveyancerSigningPlan(current, { capacityRecords, asOf })
  const errors = [...currentValidation.errors]
  if (!previous) {
    if (currentValidation.plan.revision !== 1 || currentValidation.plan.previousSigningPlanId || currentValidation.plan.previousFingerprint) errors.push('initial_signing_plan_lineage_invalid')
    return deepFreeze({ valid: errors.length === 0, errors: unique(errors), previous: null, current: currentValidation.plan })
  }
  const previousValidation = validateConveyancerSigningPlan(previous, { capacityRecords, asOf: previous.assessment?.assessedAt || previous.preparedAt })
  errors.push(...previousValidation.errors.map((item) => `previous:${item}`))
  const prior = previousValidation.plan
  const next = currentValidation.plan
  if (next.revision !== prior.revision + 1) errors.push('signing_plan_revision_must_be_sequential')
  if (next.previousSigningPlanId !== prior.signingPlanId || next.previousFingerprint !== prior.fingerprint) errors.push('previous_signing_plan_binding_invalid')
  if (!next.changeReason) errors.push('signing_plan_change_reason_required')
  for (const field of ['documentId', 'planId', 'planVersion', 'transactionId', 'organisationId', 'documentKey', 'documentKind', 'lane', 'contentFingerprint', 'provenanceFingerprint']) {
    if (next.document[field] !== prior.document[field]) errors.push(`signing_plan_document_identity_changed:${field}`)
  }
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), previous: prior, current: next })
}
