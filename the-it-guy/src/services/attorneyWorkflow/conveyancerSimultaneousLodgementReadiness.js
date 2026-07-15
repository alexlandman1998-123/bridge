import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_COORDINATION_STATUSES as S,
  isConveyancerCoordinationActorInLane,
  validateConveyancerCoordination,
} from '../../core/transactions/conveyancerCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  validateConveyancerThreeRoleDependencyModel,
} from '../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import { validateConveyancerGuaranteeWorkspace } from './conveyancerGuaranteeWorkspace.js'
import { evaluateConveyancerSharedTimelineViewer } from './conveyancerSharedProfessionalTimeline.js'

export const CONVEYANCER_SIMULTANEOUS_LODGEMENT_READINESS_VERSION = 'conveyancer_simultaneous_lodgement_readiness_v1'
export const CONVEYANCER_LODGEMENT_ATTESTATION_VERSION = 'conveyancer_lodgement_attestation_v1'

export const CONVEYANCER_LODGEMENT_ATTESTATION_STATUSES = Object.freeze({ ready: 'ready', notReady: 'not_ready' })
export const CONVEYANCER_LODGEMENT_CHECK_STATUSES = Object.freeze({ satisfied: 'satisfied', failed: 'failed' })
export const CONVEYANCER_SIMULTANEOUS_LODGEMENT_HEALTH = Object.freeze({ waiting: 'waiting', actionRequired: 'action_required', blocked: 'blocked', ready: 'ready' })

const ATTESTATION_STATUSES = new Set(Object.values(CONVEYANCER_LODGEMENT_ATTESTATION_STATUSES))
const CHECK_STATUSES = new Set(Object.values(CONVEYANCER_LODGEMENT_CHECK_STATUSES))
const LODGEMENT_KEYS = new Set([K.bondLodgementReadiness, K.cancellationLodgementReadiness])
const LANE_CHECKS = Object.freeze({
  transfer: Object.freeze([
    Object.freeze({ key: 'signed_pack_accepted', label: 'Accepted transfer signed pack', expiring: false }),
    Object.freeze({ key: 'transfer_duty_compliance', label: 'Transfer-duty receipt or exemption', expiring: false }),
    Object.freeze({ key: 'rates_clearance', label: 'Current rates clearance', expiring: true }),
    Object.freeze({ key: 'lodgement_pack_complete', label: 'Transfer lodgement pack complete', expiring: false }),
  ]),
  bond: Object.freeze([
    Object.freeze({ key: 'signed_pack_accepted', label: 'Accepted bond signed pack', expiring: false }),
    Object.freeze({ key: 'bank_approval_to_lodge', label: 'Current bank approval to lodge', expiring: false }),
    Object.freeze({ key: 'lodgement_pack_complete', label: 'Bond lodgement pack complete', expiring: false }),
  ]),
  cancellation: Object.freeze([
    Object.freeze({ key: 'signed_pack_accepted', label: 'Accepted cancellation signed pack', expiring: false }),
    Object.freeze({ key: 'cancellation_bank_consent', label: 'Existing-bank cancellation authority', expiring: false }),
    Object.freeze({ key: 'lodgement_pack_complete', label: 'Cancellation lodgement pack complete', expiring: false }),
  ]),
})

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
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
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function fingerprint(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return fnv(snapshot) }
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id), lane: key(input.lane) || null, firmId: text(input.firmId || input.firm_id) || null } }
function fail(code, errors) { return deepFreeze({ ok: false, code, errors: unique(errors), readiness: null }) }

export function getConveyancerLodgementRequiredChecks(dependencyModel = {}, lane = '') {
  const normalizedLane = key(lane)
  const checks = [...(LANE_CHECKS[normalizedLane] || [])]
  if (normalizedLane === 'transfer' && /sectional/.test(key(dependencyModel.sourceFacts?.propertyTenure))) checks.splice(3, 0, { key: 'levy_clearance', label: 'Current levy clearance', expiring: true })
  return deepFreeze(checks)
}

function normalizeCheck(input = {}) {
  return {
    key: key(input.key), status: key(input.status), referenceId: text(input.referenceId || input.reference_id) || null,
    evidenceHash: text(input.evidenceHash || input.evidence_hash).toLowerCase() || null,
    verifiedAt: iso(input.verifiedAt || input.verified_at), validUntil: iso(input.validUntil || input.valid_until),
    reason: text(input.reason) || null,
  }
}

function attestationFingerprint(value = {}) { return fingerprint(value) }

export function buildConveyancerLodgementReadinessAttestation({ dependencyModel = {}, attestationId = '', revision = 1, lane = '', firmId = '', status = '', readinessReferenceId = '', checks = [], blockers = [], attestedAt = '', attestedBy = {} } = {}) {
  const dependencyValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel)
  if (!dependencyValidation.valid) return deepFreeze({ ok: false, errors: dependencyValidation.errors, attestation: null })
  const normalizedLane = key(lane)
  const performedBy = actor({ ...attestedBy, lane: attestedBy.lane || normalizedLane })
  const value = {
    version: CONVEYANCER_LODGEMENT_ATTESTATION_VERSION,
    attestationId: text(attestationId), revision: Number(revision),
    dependencyModelId: dependencyModel.modelId, dependencyModelFingerprint: dependencyModel.fingerprint,
    plan: { ...dependencyModel.plan }, transactionId: dependencyModel.transactionId, organisationId: dependencyModel.organisationId,
    lane: normalizedLane, firmId: text(firmId), status: key(status), readinessReferenceId: text(readinessReferenceId),
    checks: (Array.isArray(checks) ? checks : []).map(normalizeCheck).sort((left, right) => left.key.localeCompare(right.key)),
    blockers: unique((Array.isArray(blockers) ? blockers : []).map(text)).sort(),
    attestedAt: iso(attestedAt), attestedBy: performedBy, fingerprint: null,
  }
  value.fingerprint = attestationFingerprint(value)
  const validation = validateConveyancerLodgementReadinessAttestation(value, { dependencyModel })
  return deepFreeze({ ok: validation.valid, errors: validation.errors, attestation: validation.attestation })
}

export function validateConveyancerLodgementReadinessAttestation(input = {}, { dependencyModel = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_LODGEMENT_ATTESTATION_VERSION || !value.attestationId || !Number.isInteger(value.revision) || value.revision < 1) errors.push('lodgement_attestation_identity_invalid')
  if (!value.dependencyModelId || !value.plan?.planId || !Number.isInteger(value.plan?.planVersion) || !value.transactionId || !value.organisationId) errors.push('lodgement_attestation_matter_binding_invalid')
  if (!['transfer', 'bond', 'cancellation'].includes(value.lane) || !value.firmId || !ATTESTATION_STATUSES.has(value.status) || !value.readinessReferenceId || !iso(value.attestedAt)) errors.push('lodgement_attestation_context_invalid')
  if (!value.attestedBy?.userId || value.attestedBy?.firmId !== value.firmId || !isConveyancerCoordinationActorInLane(value.attestedBy, value.lane) || value.attestedBy?.role === R.secretary || value.attestedBy?.role === R.accounts) errors.push('lodgement_attestation_authority_invalid')
  const checks = Array.isArray(value.checks) ? value.checks : []
  const requiredChecks = dependencyModel ? getConveyancerLodgementRequiredChecks(dependencyModel, value.lane) : []
  if (dependencyModel && checks.map((item) => item.key).sort().join('|') !== requiredChecks.map((item) => item.key).sort().join('|')) errors.push('lodgement_attestation_check_coverage_invalid')
  if (new Set(checks.map((item) => item.key)).size !== checks.length || checks.some((item) => !item.key || !CHECK_STATUSES.has(item.status))) errors.push('lodgement_attestation_checks_invalid')
  if (checks.some((item) => item.status === 'satisfied' && (!item.referenceId || !sha(item.evidenceHash) || !iso(item.verifiedAt)))) errors.push('lodgement_attestation_check_provenance_invalid')
  if (checks.some((item) => item.status === 'failed' && !item.reason)) errors.push('failed_lodgement_check_reason_required')
  if (checks.some((item) => item.verifiedAt && new Date(item.verifiedAt) > new Date(value.attestedAt))) errors.push('lodgement_check_verified_after_attestation')
  const expiringKeys = new Set(requiredChecks.filter((item) => item.expiring).map((item) => item.key))
  if (checks.some((item) => item.status === 'satisfied' && expiringKeys.has(item.key) && !iso(item.validUntil))) errors.push('expiring_lodgement_check_validity_required')
  if (checks.some((item) => item.validUntil && item.verifiedAt && new Date(item.validUntil) <= new Date(item.verifiedAt))) errors.push('lodgement_check_validity_invalid')
  if (value.status === 'ready' && (checks.some((item) => item.status !== 'satisfied') || (value.blockers || []).length)) errors.push('ready_lodgement_attestation_has_failures')
  if (value.status === 'not_ready' && !(value.blockers || []).length && !checks.some((item) => item.status === 'failed')) errors.push('not_ready_lodgement_attestation_reason_required')
  if (dependencyModel) {
    if (!dependencyModel.requiredLanes.includes(value.lane) || value.firmId !== dependencyModel.roleBindings?.[value.lane]?.firmId) errors.push('lodgement_attestation_lane_binding_invalid')
    if (value.dependencyModelId !== dependencyModel.modelId || value.dependencyModelFingerprint !== dependencyModel.fingerprint || value.transactionId !== dependencyModel.transactionId || value.organisationId !== dependencyModel.organisationId || value.plan?.planId !== dependencyModel.plan?.planId || value.plan?.planVersion !== dependencyModel.plan?.planVersion) errors.push('lodgement_attestation_dependency_binding_invalid')
  }
  const expectedFingerprint = attestationFingerprint(value)
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.fingerprint || '')) errors.push('lodgement_attestation_fingerprint_required')
  else if (value.fingerprint !== expectedFingerprint) errors.push('lodgement_attestation_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), attestation: value })
}

function currentLodgementRecords(dependencyModel, supplied = [], asOf = null) {
  const rows = Array.isArray(supplied) ? supplied : []; const errors = []
  if (new Set(rows.map((item) => item.coordinationId)).size !== rows.length) errors.push('duplicate_lodgement_coordination_record')
  const nodes = dependencyModel.nodes.filter((item) => LODGEMENT_KEYS.has(item.key)); const nodeIds = new Set(dependencyModel.nodes.map((item) => item.coordination.coordinationId))
  if (rows.some((item) => !nodeIds.has(item.coordinationId))) errors.push('orphan_lodgement_coordination_record')
  const suppliedById = new Map(rows.map((item) => [item.coordinationId, item])); const records = new Map()
  for (const node of nodes) {
    const record = suppliedById.get(node.coordination.coordinationId) || node.coordination
    const validation = validateConveyancerCoordination(record, { actionKeys: Object.values(dependencyModel.actionKeyMap || {}) })
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${node.key}:${error}`))
    if (record.coordinationId !== node.coordination.coordinationId || record.definitionFingerprint !== node.coordination.definitionFingerprint) errors.push(`${node.key}:lodgement_coordination_binding_invalid`)
    const timestamps = [record.createdAt, record.updatedAt, record.requestedAt, record.acknowledgement?.acknowledgedAt, record.submission?.submittedAt, record.decision?.decidedAt, record.blockage?.blockedAt, ...(record.evidence || []).map((item) => item.capturedAt)].filter(Boolean)
    if (asOf && timestamps.some((timestamp) => new Date(timestamp) > new Date(asOf))) errors.push(`${node.key}:lodgement_coordination_event_in_future`)
    records.set(node.key, validation.coordination)
  }
  return { records, errors }
}

function nextLane(record) {
  if (!record || record.status === S.accepted) return null
  if ([S.draft, S.submitted].includes(record.status)) return record.source.lane
  if ([S.requested, S.acknowledged, S.inProgress, S.changesRequested, S.blocked].includes(record.status)) return record.target.lane
  return record.source.lane
}
function evidenceRefs(record, keyName) { return new Set((record?.evidence || []).filter((item) => item.requirementKey === keyName).map((item) => item.referenceId).filter(Boolean)) }
function issue(code, ownerLane, { severity = 'blocker', lane = null, checkKey = null, coordinationKey = null, detail = null } = {}) { return { code, severity, ownerLane, lane, checkKey, coordinationKey, detail } }

function readinessFingerprint(value = {}) { return fingerprint(value) }

export function buildConveyancerSimultaneousLodgementReadiness({ dependencyModel = {}, coordinationRecords = [], guaranteeWorkspace = {}, attestations: inputAttestations = [], viewer = {}, asOf = '', plannedLodgementAt = '', minimumValidityHours = 24 } = {}) {
  const dependencyValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel)
  if (!dependencyValidation.valid) return fail('simultaneous_lodgement_dependency_model_invalid', dependencyValidation.errors)
  const access = evaluateConveyancerSharedTimelineViewer({ dependencyModel, viewer })
  if (!access.allowed) return fail('simultaneous_lodgement_access_denied', [access.reason])
  const projectionAt = iso(asOf); const plannedAt = iso(plannedLodgementAt)
  if (!projectionAt || !plannedAt || new Date(plannedAt) <= new Date(projectionAt) || !Number.isInteger(minimumValidityHours) || minimumValidityHours < 0 || minimumValidityHours > 168) return fail('simultaneous_lodgement_projection_invalid', ['simultaneous_lodgement_window_invalid'])
  if (new Date(dependencyModel.generatedAt) > new Date(projectionAt)) return fail('simultaneous_lodgement_projection_invalid', ['dependency_model_generated_in_future'])
  const guaranteeValidation = validateConveyancerGuaranteeWorkspace(guaranteeWorkspace, { dependencyModel })
  if (!guaranteeValidation.valid) return fail('simultaneous_lodgement_guarantee_workspace_invalid', guaranteeValidation.errors)
  const guarantee = guaranteeValidation.workspace
  if (guarantee.asOf !== projectionAt || guarantee.viewer?.userId !== access.viewer.userId || guarantee.viewer?.lane !== access.viewer.lane || guarantee.viewer?.firmId !== access.viewer.firmId || (guarantee.applicable && guarantee.expectedLodgementAt !== plannedAt)) return fail('simultaneous_lodgement_guarantee_workspace_invalid', ['guarantee_workspace_projection_binding_invalid'])
  const attestations = Array.isArray(inputAttestations) ? inputAttestations : []
  if (new Set(attestations.map((item) => item.lane)).size !== attestations.length) return fail('simultaneous_lodgement_attestations_invalid', ['duplicate_current_lodgement_attestation'])
  const attestationErrors = []; const attestationByLane = new Map()
  for (const item of attestations) {
    const validation = validateConveyancerLodgementReadinessAttestation(item, { dependencyModel })
    if (!validation.valid) attestationErrors.push(...validation.errors.map((error) => `${item.lane || 'unknown'}:${error}`))
    if (validation.attestation?.attestedAt && new Date(validation.attestation.attestedAt) > new Date(projectionAt)) attestationErrors.push(`${item.lane}:lodgement_attestation_in_future`)
    attestationByLane.set(validation.attestation?.lane, validation.attestation)
  }
  const records = currentLodgementRecords(dependencyModel, coordinationRecords, projectionAt)
  if (attestationErrors.length || records.errors.length) return fail('simultaneous_lodgement_attestations_invalid', [...attestationErrors, ...records.errors])

  const issues = []; const bufferAt = new Date(new Date(plannedAt).getTime() + minimumValidityHours * 60 * 60 * 1000)
  const coordinationByLane = new Map([
    ['bond', { key: K.bondLodgementReadiness, evidenceKey: 'bond_lodgement_ready' }],
    ['cancellation', { key: K.cancellationLodgementReadiness, evidenceKey: 'cancellation_lodgement_ready' }],
  ])
  const lanes = dependencyModel.requiredLanes.map((lane) => {
    const attestation = attestationByLane.get(lane)
    const coordinationMeta = coordinationByLane.get(lane); const coordination = coordinationMeta ? records.records.get(coordinationMeta.key) : null
    if (!attestation) issues.push(issue('lodgement_attestation_missing', lane, { lane }))
    if (attestation?.status === 'not_ready') issues.push(issue('lane_lodgement_not_ready', lane, { lane, detail: attestation.blockers }))
    for (const check of attestation?.checks || []) {
      if (check.status === 'failed') issues.push(issue('lodgement_check_failed', lane, { lane, checkKey: check.key, detail: check.reason }))
      if (check.validUntil && new Date(check.validUntil) < new Date(plannedAt)) issues.push(issue('lodgement_evidence_expires_before_lodgement', lane, { lane, checkKey: check.key }))
      else if (check.validUntil && new Date(check.validUntil) < bufferAt) issues.push(issue('lodgement_evidence_validity_buffer_risk', lane, { severity: 'warning', lane, checkKey: check.key }))
    }
    let coordinationAccepted = !coordinationMeta; let coordinationEvidenceBound = !coordinationMeta
    if (coordinationMeta) {
      coordinationAccepted = coordination?.status === S.accepted
      coordinationEvidenceBound = Boolean(attestation && evidenceRefs(coordination, coordinationMeta.evidenceKey).has(attestation.readinessReferenceId))
      if (!coordinationAccepted) issues.push(issue(coordination?.status === S.blocked ? 'lodgement_coordination_blocked' : 'lodgement_coordination_pending', nextLane(coordination), { lane, coordinationKey: coordinationMeta.key, detail: coordination?.status }))
      else if (!coordinationEvidenceBound) issues.push(issue('lodgement_attestation_evidence_unbound', lane, { lane, coordinationKey: coordinationMeta.key }))
    }
    const localIssues = () => issues.filter((item) => item.lane === lane && item.severity === 'blocker')
    const locallyReady = Boolean(attestation?.status === 'ready' && !localIssues().length && coordinationAccepted && coordinationEvidenceBound)
    return { lane, firmId: dependencyModel.roleBindings[lane].firmId, attestationId: attestation?.attestationId || null, attestationFingerprint: attestation?.fingerprint || null, status: attestation?.status || 'missing', attestedAt: attestation?.attestedAt || null, readinessReferenceId: attestation?.readinessReferenceId || null, coordinationKey: coordinationMeta?.key || null, coordinationId: coordination?.coordinationId || null, coordinationStatus: coordination?.status || null, coordinationAccepted, coordinationEvidenceBound, checks: attestation?.checks || [], blockers: attestation?.blockers || [], locallyReady }
  })

  const guaranteeSatisfied = guarantee.applicable ? guarantee.ready === true : guarantee.health === 'not_applicable'
  if (!guaranteeSatisfied) {
    if (guarantee.issues.length) guarantee.issues.forEach((item) => issues.push(issue(`guarantee:${item.code}`, item.ownerLane, { severity: item.severity, detail: item.detail })))
    else issues.push(issue('guarantee_workspace_not_ready', 'transfer'))
  }
  const blockers = issues.filter((item) => item.severity === 'blocker')
  const jointReady = guaranteeSatisfied && lanes.every((lane) => lane.locallyReady) && blockers.length === 0
  const health = jointReady ? 'ready'
    : blockers.some((item) => item.code.includes('blocked') || item.code.includes('expired') || item.code.includes('expires_') || item.code.includes('failed') || item.code.startsWith('guarantee:guarantee_') && /mismatch|overallocated/.test(item.code)) ? 'blocked'
      : blockers.some((item) => item.ownerLane === access.viewer.lane) ? 'action_required' : 'waiting'
  const readiness = {
    version: CONVEYANCER_SIMULTANEOUS_LODGEMENT_READINESS_VERSION,
    readinessId: `simultaneous_lodgement:${dependencyModel.transactionId}:${dependencyModel.plan.planId}:v${dependencyModel.plan.planVersion}:${plannedAt}`,
    dependencyModelId: dependencyModel.modelId, dependencyModelFingerprint: dependencyModel.fingerprint,
    guaranteeWorkspaceId: guarantee.workspaceId, guaranteeWorkspaceFingerprint: guarantee.fingerprint,
    plan: { ...dependencyModel.plan }, transactionId: dependencyModel.transactionId, organisationId: dependencyModel.organisationId,
    asOf: projectionAt, plannedLodgementAt: plannedAt, minimumValidityHours, validityBufferUntil: bufferAt.toISOString(), viewer: access.viewer,
    health, jointReady, guaranteeSatisfied, lanes, issues, risks: issues.filter((item) => item.severity === 'warning'), viewerResponsibilities: issues.filter((item) => item.ownerLane === access.viewer.lane),
    controls: { readOnly: true, advisoryOnly: true, deedsSubmissionPerformed: false, commandsAvailable: false, crossLaneMutationAllowed: false, persistencePerformed: false, notificationsSent: false, workflowsMutated: false, evidenceMutated: false },
    fingerprint: null,
  }
  readiness.fingerprint = readinessFingerprint(readiness)
  const validation = validateConveyancerSimultaneousLodgementReadiness(readiness, { dependencyModel, guaranteeWorkspace: guarantee })
  if (!validation.valid) return fail('simultaneous_lodgement_readiness_invalid', validation.errors)
  return deepFreeze({ ok: true, code: 'simultaneous_lodgement_readiness_ready', errors: [], readiness: validation.readiness })
}

export function validateConveyancerSimultaneousLodgementReadiness(input = {}, { dependencyModel = null, guaranteeWorkspace = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_SIMULTANEOUS_LODGEMENT_READINESS_VERSION || !value.readinessId || !value.dependencyModelId || !value.guaranteeWorkspaceId) errors.push('simultaneous_lodgement_identity_invalid')
  if (!value.plan?.planId || !Number.isInteger(value.plan?.planVersion) || !value.transactionId || !value.organisationId) errors.push('simultaneous_lodgement_matter_binding_invalid')
  if (!iso(value.asOf) || !iso(value.plannedLodgementAt) || !iso(value.validityBufferUntil) || !value.viewer?.userId || !value.viewer?.lane || !value.viewer?.firmId) errors.push('simultaneous_lodgement_projection_context_invalid')
  if (!Array.isArray(value.lanes) || !Array.isArray(value.issues) || !Array.isArray(value.risks) || !Array.isArray(value.viewerResponsibilities)) errors.push('simultaneous_lodgement_collections_invalid')
  if (!Object.values(CONVEYANCER_SIMULTANEOUS_LODGEMENT_HEALTH).includes(value.health) || value.jointReady !== (value.health === 'ready')) errors.push('simultaneous_lodgement_health_invalid')
  if (new Set((value.lanes || []).map((item) => item.lane)).size !== (value.lanes || []).length) errors.push('simultaneous_lodgement_lane_coverage_invalid')
  const blockers = (value.issues || []).filter((item) => item.severity === 'blocker')
  const expectedJointReady = value.guaranteeSatisfied === true && (value.lanes || []).every((item) => item.locallyReady === true) && blockers.length === 0
  if (value.jointReady !== expectedJointReady) errors.push('simultaneous_lodgement_decision_invalid')
  if (JSON.stringify(value.risks || []) !== JSON.stringify((value.issues || []).filter((item) => item.severity === 'warning'))) errors.push('simultaneous_lodgement_risk_projection_invalid')
  if (JSON.stringify(value.viewerResponsibilities || []) !== JSON.stringify((value.issues || []).filter((item) => item.ownerLane === value.viewer?.lane))) errors.push('simultaneous_lodgement_responsibility_projection_invalid')
  for (const lane of value.lanes || []) {
    const laneBlockers = blockers.filter((item) => item.lane === lane.lane)
    const expectedLocalReady = lane.status === 'ready' && lane.coordinationAccepted === true && lane.coordinationEvidenceBound === true && laneBlockers.length === 0
    if (lane.locallyReady !== expectedLocalReady) errors.push(`simultaneous_lodgement_lane_decision_invalid:${lane.lane}`)
  }
  if (!value.controls?.readOnly || !value.controls?.advisoryOnly || value.controls?.deedsSubmissionPerformed || value.controls?.commandsAvailable || value.controls?.crossLaneMutationAllowed || value.controls?.persistencePerformed || value.controls?.notificationsSent || value.controls?.workflowsMutated || value.controls?.evidenceMutated) errors.push('simultaneous_lodgement_side_effect_boundary_violated')
  if (dependencyModel && (value.dependencyModelId !== dependencyModel.modelId || value.dependencyModelFingerprint !== dependencyModel.fingerprint || value.transactionId !== dependencyModel.transactionId || value.organisationId !== dependencyModel.organisationId || value.plan?.planId !== dependencyModel.plan?.planId || value.plan?.planVersion !== dependencyModel.plan?.planVersion || (value.lanes || []).map((item) => item.lane).join('|') !== dependencyModel.requiredLanes.join('|'))) errors.push('simultaneous_lodgement_dependency_binding_invalid')
  if (guaranteeWorkspace && (value.guaranteeWorkspaceId !== guaranteeWorkspace.workspaceId || value.guaranteeWorkspaceFingerprint !== guaranteeWorkspace.fingerprint)) errors.push('simultaneous_lodgement_guarantee_binding_invalid')
  const expectedFingerprint = readinessFingerprint(value)
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.fingerprint || '')) errors.push('simultaneous_lodgement_fingerprint_required')
  else if (value.fingerprint !== expectedFingerprint) errors.push('simultaneous_lodgement_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), readiness: value })
}
