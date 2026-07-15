import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_COORDINATION_STATUSES as S,
  validateConveyancerCoordination,
} from '../../core/transactions/conveyancerCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  validateConveyancerThreeRoleDependencyModel,
} from '../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import {
  LEGAL_ROLE_COORDINATION_STATES,
  LEGAL_ROLE_TYPES,
  getLegalRoleAuthorityPolicy,
  isLegalRoleAppointmentAuthority,
} from '../../core/transactions/legalRoleCoordinationContract.js'
import { validateConveyancerGuaranteeWorkspace } from './conveyancerGuaranteeWorkspace.js'
import { validateConveyancerSimultaneousLodgementReadiness } from './conveyancerSimultaneousLodgementReadiness.js'
import { evaluateConveyancerSharedTimelineViewer } from './conveyancerSharedProfessionalTimeline.js'

export const CONVEYANCER_COORDINATION_ESCALATION_VERSION = 'conveyancer_coordination_escalation_v1'
export const CONVEYANCER_ATTORNEY_REPLACEMENT_VERSION = 'conveyancer_attorney_replacement_v1'

export const CONVEYANCER_ESCALATION_TARGET_TYPES = Object.freeze({ coordination: 'coordination', guaranteeIssue: 'guarantee_issue', lodgementIssue: 'lodgement_issue' })
export const CONVEYANCER_ESCALATION_STATUSES = Object.freeze({ open: 'open', acknowledged: 'acknowledged', resolved: 'resolved', cancelled: 'cancelled' })
export const CONVEYANCER_ESCALATION_COMMANDS = Object.freeze({ acknowledge: 'acknowledge', escalate: 'escalate', resolve: 'resolve', cancel: 'cancel' })
export const CONVEYANCER_REPLACEMENT_STATUSES = Object.freeze({ awaitingAuthority: 'awaiting_appointing_authority', appointmentConfirmed: 'appointment_confirmed' })

const TARGET_TYPES = new Set(Object.values(CONVEYANCER_ESCALATION_TARGET_TYPES))
const ESCALATION_STATUSES = new Set(Object.values(CONVEYANCER_ESCALATION_STATUSES))
const COMMANDS = new Set(Object.values(CONVEYANCER_ESCALATION_COMMANDS))
const REPLACEMENT_STATUSES = new Set(Object.values(CONVEYANCER_REPLACEMENT_STATUSES))
const REPLACEABLE_ROLE_STATES = new Set([LEGAL_ROLE_COORDINATION_STATES.declined, LEGAL_ROLE_COORDINATION_STATES.replacementRequired])
const TERMINAL_ESCALATIONS = new Set([CONVEYANCER_ESCALATION_STATUSES.resolved, CONVEYANCER_ESCALATION_STATUSES.cancelled])
const REPLACEMENT_REQUEST_ROLES = new Set([R.conveyancer, R.transferAttorney, R.bondAttorney, R.cancellationAttorney, R.firmManager])
const POLICY = Object.freeze({ medium: Object.freeze({ acknowledgeHours: 24, resolveHours: 120 }), high: Object.freeze({ acknowledgeHours: 8, resolveHours: 48 }), critical: Object.freeze({ acknowledgeHours: 2, resolveHours: 12 }) })
const LANE_ROLE = Object.freeze({ transfer: LEGAL_ROLE_TYPES.transferAttorney, bond: LEGAL_ROLE_TYPES.bondAttorney, cancellation: LEGAL_ROLE_TYPES.cancellationAttorney })

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {}); return value }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function fingerprint(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return fnv(snapshot) }
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id), lane: key(input.lane) || null, firmId: text(input.firmId || input.firm_id) || null } }
function addHours(value, hours) { return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString() }
function fail(code, errors = []) { return deepFreeze({ ok: false, duplicate: false, code, errors: unique(errors), escalation: null, replacement: null, event: null }) }
function access(dependencyModel, inputActor) { return evaluateConveyancerSharedTimelineViewer({ dependencyModel, viewer: inputActor }) }
function exactViewer(left, right) { return left?.userId === right?.userId && left?.lane === right?.lane && left?.firmId === right?.firmId }

function recordTimestamp(record) { return record.decision?.decidedAt || record.blockage?.blockedAt || record.submission?.submittedAt || record.acknowledgement?.acknowledgedAt || record.requestedAt || record.updatedAt || record.createdAt }
function coordinationNextLane(record) {
  if ([S.draft, S.submitted].includes(record.status)) return record.source.lane
  if ([S.requested, S.acknowledged, S.inProgress, S.changesRequested, S.blocked].includes(record.status)) return record.target.lane
  return record.source.lane
}
function coordinationSignal(record, asOf) {
  if (record.status === S.blocked) return { escalatable: true, severity: 'critical', trigger: 'blocked', ownerLane: record.target.lane }
  if (record.status === S.requested && new Date(asOf) > new Date(record.sla?.acknowledgeBy)) return { escalatable: true, severity: 'high', trigger: 'acknowledgement_overdue', ownerLane: record.target.lane }
  if ([S.acknowledged, S.inProgress, S.changesRequested].includes(record.status) && new Date(asOf) > new Date(record.sla?.deliverBy)) return { escalatable: true, severity: 'high', trigger: 'delivery_overdue', ownerLane: record.target.lane }
  return { escalatable: false, severity: 'medium', trigger: null, ownerLane: coordinationNextLane(record) }
}

function resolveCoordinationTarget({ dependencyModel, coordinationRecords, targetId, asOf }) {
  const node = dependencyModel.nodes.find((item) => item.coordination.coordinationId === targetId)
  if (!node) return { error: 'escalation_coordination_target_unknown' }
  const supplied = (Array.isArray(coordinationRecords) ? coordinationRecords : []).find((item) => item.coordinationId === targetId)
  const record = supplied || node.coordination
  const validation = validateConveyancerCoordination(record, { actionKeys: Object.values(dependencyModel.actionKeyMap || {}) })
  if (!validation.valid) return { error: 'escalation_coordination_target_invalid', errors: validation.errors }
  if (record.definitionFingerprint !== node.coordination.definitionFingerprint) return { error: 'escalation_coordination_target_unbound' }
  if (new Date(recordTimestamp(record)) > new Date(asOf)) return { error: 'escalation_target_event_in_future' }
  const signal = coordinationSignal(validation.coordination, asOf)
  if (!signal.escalatable) return { error: 'coordination_not_escalatable' }
  return { target: { targetType: 'coordination', targetId, targetFingerprint: record.definitionFingerprint, issueCode: signal.trigger, sourceStatus: record.status, sourceOccurredAt: recordTimestamp(record) }, ...signal }
}

function resolveGuaranteeTarget({ dependencyModel, guaranteeWorkspace, targetId, viewer, asOf }) {
  const validation = validateConveyancerGuaranteeWorkspace(guaranteeWorkspace, { dependencyModel })
  if (!validation.valid) return { error: 'escalation_guarantee_workspace_invalid', errors: validation.errors }
  const workspace = validation.workspace
  if (workspace.asOf !== asOf || !exactViewer(workspace.viewer, viewer)) return { error: 'escalation_guarantee_workspace_unbound' }
  const issue = workspace.issues.find((item) => item.code === targetId)
  if (!issue) return { error: 'escalation_guarantee_issue_unknown' }
  return { target: { targetType: 'guarantee_issue', targetId, targetFingerprint: workspace.fingerprint, issueCode: issue.code, sourceStatus: workspace.health, sourceOccurredAt: workspace.asOf }, escalatable: true, severity: issue.severity === 'warning' ? 'medium' : /expired|mismatch|blocked|overallocated/.test(issue.code) ? 'critical' : 'high', trigger: issue.code, ownerLane: issue.ownerLane }
}

function resolveLodgementTarget({ dependencyModel, lodgementReadiness, targetId, viewer, asOf }) {
  const validation = validateConveyancerSimultaneousLodgementReadiness(lodgementReadiness, { dependencyModel })
  if (!validation.valid) return { error: 'escalation_lodgement_readiness_invalid', errors: validation.errors }
  const readiness = validation.readiness
  if (readiness.asOf !== asOf || !exactViewer(readiness.viewer, viewer)) return { error: 'escalation_lodgement_readiness_unbound' }
  const issue = readiness.issues.find((item) => item.code === targetId && item.severity === 'blocker')
  if (!issue) return { error: 'escalation_lodgement_issue_unknown' }
  return { target: { targetType: 'lodgement_issue', targetId, targetFingerprint: readiness.fingerprint, issueCode: issue.code, sourceStatus: readiness.health, sourceOccurredAt: readiness.asOf }, escalatable: true, severity: /expired|blocked|failed/.test(issue.code) ? 'critical' : 'high', trigger: issue.code, ownerLane: issue.ownerLane }
}

function resolveTarget(input, context) {
  if (input.targetType === 'coordination') return resolveCoordinationTarget({ ...context, targetId: input.targetId })
  if (input.targetType === 'guarantee_issue') return resolveGuaranteeTarget({ ...context, targetId: input.targetId })
  if (input.targetType === 'lodgement_issue') return resolveLodgementTarget({ ...context, targetId: input.targetId })
  return { error: 'escalation_target_type_invalid' }
}

export function buildConveyancerCoordinationEscalation({ dependencyModel = {}, coordinationRecords = [], guaranteeWorkspace = null, lodgementReadiness = null, target = {}, reason = '', evidenceReferenceId = '', commandId = '', occurredAt = '', raisedBy = {} } = {}) {
  const dependencyValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel)
  if (!dependencyValidation.valid) return fail('coordination_escalation_dependency_invalid', dependencyValidation.errors)
  const performedBy = actor(raisedBy); const viewerAccess = access(dependencyModel, performedBy)
  if (!viewerAccess.allowed) return fail('coordination_escalation_access_denied', [viewerAccess.reason])
  const timestamp = iso(occurredAt)
  if (!timestamp || new Date(timestamp) < new Date(dependencyModel.generatedAt)) return fail('coordination_escalation_invalid', ['escalation_timestamp_invalid'])
  if (!TARGET_TYPES.has(key(target.targetType || target.target_type)) || !text(target.targetId || target.target_id) || !text(reason) || !text(evidenceReferenceId) || !text(commandId)) return fail('coordination_escalation_invalid', ['escalation_required_fields_missing'])
  const targetInput = { targetType: key(target.targetType || target.target_type), targetId: text(target.targetId || target.target_id) }
  const resolved = resolveTarget(targetInput, { dependencyModel, coordinationRecords, guaranteeWorkspace, lodgementReadiness, viewer: viewerAccess.viewer, asOf: timestamp })
  if (resolved.error) return fail('coordination_escalation_target_invalid', [resolved.error, ...(resolved.errors || [])])
  if (!dependencyModel.requiredLanes.includes(resolved.ownerLane)) return fail('coordination_escalation_target_invalid', ['escalation_owner_lane_invalid'])
  const policy = POLICY[resolved.severity]
  const value = {
    version: CONVEYANCER_COORDINATION_ESCALATION_VERSION,
    escalationId: `coordination_escalation:${dependencyModel.transactionId}:${fnv(`${targetInput.targetType}:${targetInput.targetId}:${commandId}`)}`,
    revision: 1, dependencyModelId: dependencyModel.modelId, dependencyModelFingerprint: dependencyModel.fingerprint,
    plan: { ...dependencyModel.plan }, transactionId: dependencyModel.transactionId, organisationId: dependencyModel.organisationId,
    target: resolved.target, trigger: resolved.trigger, severity: resolved.severity, status: 'open', level: 1,
    reason: text(reason), evidenceReferenceId: text(evidenceReferenceId), raisedAt: timestamp, raisedBy: viewerAccess.viewer,
    ownerLane: resolved.ownerLane, ownerFirmId: dependencyModel.roleBindings[resolved.ownerLane].firmId,
    acknowledgeBy: addHours(timestamp, policy.acknowledgeHours), resolveBy: addHours(timestamp, policy.resolveHours),
    acknowledgement: null, resolution: null, cancellation: null,
    events: [{ eventId: `escalation_event:${commandId}`, type: 'raised', level: 1, occurredAt: timestamp, actor: viewerAccess.viewer, reason: text(reason), evidenceReferenceId: text(evidenceReferenceId) }],
    processedCommands: [{ commandId: text(commandId), payloadFingerprint: fnv({ target: targetInput, reason: text(reason), evidenceReferenceId: text(evidenceReferenceId), occurredAt: timestamp }) }],
    controls: { notificationsSent: false, persistencePerformed: false, workflowsMutated: false, appointmentChanged: false }, fingerprint: null,
  }
  value.fingerprint = fingerprint(value)
  const validation = validateConveyancerCoordinationEscalation(value, { dependencyModel })
  if (!validation.valid) return fail('coordination_escalation_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: 'coordination_escalation_created', errors: [], escalation: validation.escalation, replacement: null, event: value.events[0] })
}

export function validateConveyancerCoordinationEscalation(input = {}, { dependencyModel = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_COORDINATION_ESCALATION_VERSION || !value.escalationId || !Number.isInteger(value.revision) || value.revision < 1) errors.push('coordination_escalation_identity_invalid')
  if (!value.plan?.planId || !Number.isInteger(value.plan?.planVersion) || !value.transactionId || !value.organisationId || !value.dependencyModelId) errors.push('coordination_escalation_matter_binding_invalid')
  if (!TARGET_TYPES.has(value.target?.targetType) || !value.target?.targetId || !value.target?.targetFingerprint || !value.target?.issueCode) errors.push('coordination_escalation_target_invalid')
  if (!['medium', 'high', 'critical'].includes(value.severity) || !ESCALATION_STATUSES.has(value.status) || !Number.isInteger(value.level) || value.level < 1 || value.level > 3) errors.push('coordination_escalation_state_invalid')
  if (!value.reason || !value.evidenceReferenceId || !iso(value.raisedAt) || !value.raisedBy?.userId || !value.raisedBy?.lane || !value.raisedBy?.firmId) errors.push('coordination_escalation_provenance_invalid')
  if (!value.ownerLane || !value.ownerFirmId || !iso(value.acknowledgeBy) || !iso(value.resolveBy) || new Date(value.resolveBy) < new Date(value.acknowledgeBy)) errors.push('coordination_escalation_ownership_or_sla_invalid')
  if (!Array.isArray(value.events) || !value.events.length || !Array.isArray(value.processedCommands) || !value.processedCommands.length || new Set(value.processedCommands.map((item) => item.commandId)).size !== value.processedCommands.length) errors.push('coordination_escalation_history_invalid')
  if (value.status === 'acknowledged' && !value.acknowledgement) errors.push('coordination_escalation_acknowledgement_required')
  if (value.status === 'resolved' && (!value.resolution?.evidenceReferenceId || !sha(value.resolution?.evidenceHash) || !iso(value.resolution?.resolvedAt))) errors.push('coordination_escalation_resolution_required')
  if (value.status === 'cancelled' && (!value.cancellation?.reason || !iso(value.cancellation?.cancelledAt))) errors.push('coordination_escalation_cancellation_required')
  if (value.controls?.notificationsSent || value.controls?.persistencePerformed || value.controls?.workflowsMutated || value.controls?.appointmentChanged) errors.push('coordination_escalation_side_effect_boundary_violated')
  if (dependencyModel && (value.dependencyModelId !== dependencyModel.modelId || value.dependencyModelFingerprint !== dependencyModel.fingerprint || value.transactionId !== dependencyModel.transactionId || value.organisationId !== dependencyModel.organisationId || value.plan?.planId !== dependencyModel.plan?.planId || value.plan?.planVersion !== dependencyModel.plan?.planVersion || value.ownerFirmId !== dependencyModel.roleBindings?.[value.ownerLane]?.firmId)) errors.push('coordination_escalation_dependency_binding_invalid')
  const expectedFingerprint = fingerprint(value)
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.fingerprint || '')) errors.push('coordination_escalation_fingerprint_required')
  else if (value.fingerprint !== expectedFingerprint) errors.push('coordination_escalation_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), escalation: value })
}

function escalationEvent(commandId, type, level, occurredAt, performedBy, reason = null, evidenceReferenceId = null) { return { eventId: `escalation_event:${commandId}`, type, level, occurredAt, actor: performedBy, reason, evidenceReferenceId } }

export function executeConveyancerCoordinationEscalationCommand({ dependencyModel = {}, escalation: inputEscalation = {}, command = {}, performedBy = {} } = {}) {
  const validation = validateConveyancerCoordinationEscalation(inputEscalation, { dependencyModel })
  if (!validation.valid) return fail('coordination_escalation_invalid', validation.errors)
  const value = structuredClone(validation.escalation); const commandId = text(command.commandId || command.command_id); const type = key(command.type); const occurredAt = iso(command.occurredAt || command.occurred_at)
  if (!commandId || !COMMANDS.has(type) || !occurredAt || new Date(occurredAt) < new Date(value.events.at(-1).occurredAt)) return fail('coordination_escalation_command_invalid', ['escalation_command_context_invalid'])
  const payloadFingerprint = fnv({ type, occurredAt, reason: text(command.reason), evidenceReferenceId: text(command.evidenceReferenceId || command.evidence_reference_id), evidenceHash: text(command.evidenceHash || command.evidence_hash), nextLevel: Number(command.nextLevel || command.next_level || 0) })
  const prior = value.processedCommands.find((item) => item.commandId === commandId)
  if (prior) return prior.payloadFingerprint === payloadFingerprint ? deepFreeze({ ok: true, duplicate: true, code: 'coordination_escalation_command_duplicate', errors: [], escalation: value, replacement: null, event: null }) : fail('coordination_escalation_command_conflict', ['command_id_reused_with_different_payload'])
  if (command.expectedRevision !== value.revision || command.expectedFingerprint !== value.fingerprint) return fail('coordination_escalation_command_stale', ['escalation_concurrency_conflict'])
  if (TERMINAL_ESCALATIONS.has(value.status)) return fail('coordination_escalation_command_invalid', ['terminal_escalation_cannot_change'])
  const user = actor(performedBy); const viewerAccess = access(dependencyModel, user)
  if (!viewerAccess.allowed) return fail('coordination_escalation_access_denied', [viewerAccess.reason])
  let event
  if (type === 'acknowledge') {
    if (value.status !== 'open') return fail('coordination_escalation_command_invalid', ['open_escalation_required_for_acknowledgement'])
    if (viewerAccess.viewer.lane !== value.ownerLane || viewerAccess.viewer.firmId !== value.ownerFirmId) return fail('coordination_escalation_command_unauthorised', ['escalation_owner_acknowledgement_required'])
    value.status = 'acknowledged'; value.acknowledgement = { acknowledgedAt: occurredAt, acknowledgedBy: viewerAccess.viewer, response: text(command.reason) || null }
    event = escalationEvent(commandId, type, value.level, occurredAt, viewerAccess.viewer, text(command.reason) || null)
  } else if (type === 'escalate') {
    const nextLevel = Number(command.nextLevel || command.next_level); const reason = text(command.reason)
    if (nextLevel !== value.level + 1 || nextLevel > 3 || !reason) return fail('coordination_escalation_command_invalid', ['next_reasoned_escalation_level_required'])
    if (![value.raisedBy.lane, value.ownerLane].includes(viewerAccess.viewer.lane)) return fail('coordination_escalation_command_unauthorised', ['escalation_participant_lane_required'])
    if (nextLevel === 3 && viewerAccess.viewer.role !== R.firmManager) return fail('coordination_escalation_command_unauthorised', ['level_three_escalation_requires_firm_manager'])
    value.level = nextLevel; event = escalationEvent(commandId, type, value.level, occurredAt, viewerAccess.viewer, reason)
  } else if (type === 'resolve') {
    const referenceId = text(command.evidenceReferenceId || command.evidence_reference_id); const evidenceHash = text(command.evidenceHash || command.evidence_hash).toLowerCase(); const reason = text(command.reason)
    if (viewerAccess.viewer.lane !== value.ownerLane || !referenceId || !sha(evidenceHash) || !reason) return fail('coordination_escalation_command_unauthorised', ['owner_resolution_evidence_required'])
    value.status = 'resolved'; value.resolution = { reason, evidenceReferenceId: referenceId, evidenceHash, resolvedAt: occurredAt, resolvedBy: viewerAccess.viewer }
    event = escalationEvent(commandId, type, value.level, occurredAt, viewerAccess.viewer, reason, referenceId)
  } else {
    const reason = text(command.reason); const sameRaiser = viewerAccess.viewer.userId === value.raisedBy.userId && viewerAccess.viewer.firmId === value.raisedBy.firmId
    const raisingFirmManager = viewerAccess.viewer.role === R.firmManager && viewerAccess.viewer.firmId === value.raisedBy.firmId
    if (!reason || (!sameRaiser && !raisingFirmManager)) return fail('coordination_escalation_command_unauthorised', ['escalation_cancellation_authority_required'])
    value.status = 'cancelled'; value.cancellation = { reason, cancelledAt: occurredAt, cancelledBy: viewerAccess.viewer }; event = escalationEvent(commandId, type, value.level, occurredAt, viewerAccess.viewer, reason)
  }
  value.revision += 1; value.events.push(event); value.processedCommands.push({ commandId, payloadFingerprint }); value.fingerprint = fingerprint(value)
  const nextValidation = validateConveyancerCoordinationEscalation(value, { dependencyModel })
  if (!nextValidation.valid) return fail('coordination_escalation_invalid', nextValidation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: `coordination_escalation_${type}d`, errors: [], escalation: nextValidation.escalation, replacement: null, event })
}

export function buildConveyancerAttorneyReplacementRequest({ dependencyModel = {}, lane = '', legalRoleState = '', escalation = null, reason = '', trigger = '', evidenceReferenceId = '', commandId = '', requestedAt = '', requestedBy = {} } = {}) {
  const dependencyValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel)
  if (!dependencyValidation.valid) return fail('attorney_replacement_dependency_invalid', dependencyValidation.errors)
  const performedBy = actor(requestedBy); const viewerAccess = access(dependencyModel, performedBy)
  if (!viewerAccess.allowed) return fail('attorney_replacement_access_denied', [viewerAccess.reason])
  if (!REPLACEMENT_REQUEST_ROLES.has(viewerAccess.viewer.role)) return fail('attorney_replacement_access_denied', ['legal_replacement_referral_role_required'])
  const targetLane = key(lane); const state = key(legalRoleState); const timestamp = iso(requestedAt)
  if (!dependencyModel.requiredLanes.includes(targetLane) || !timestamp || !text(reason) || !text(trigger) || !text(evidenceReferenceId) || !text(commandId)) return fail('attorney_replacement_request_invalid', ['attorney_replacement_required_fields_missing'])
  if (![targetLane, 'transfer'].includes(viewerAccess.viewer.lane)) return fail('attorney_replacement_access_denied', ['replacement_referral_requires_transfer_or_affected_lane'])
  let escalationBinding = null
  if (!REPLACEABLE_ROLE_STATES.has(state)) {
    const escalationValidation = validateConveyancerCoordinationEscalation(escalation || {}, { dependencyModel })
    if (!escalationValidation.valid || escalationValidation.escalation.level < 2 || escalationValidation.escalation.ownerLane !== targetLane || TERMINAL_ESCALATIONS.has(escalationValidation.escalation.status)) return fail('attorney_replacement_request_invalid', ['replacement_requires_role_state_or_level_two_escalation'])
    escalationBinding = { escalationId: escalationValidation.escalation.escalationId, escalationFingerprint: escalationValidation.escalation.fingerprint }
  }
  const roleType = LANE_ROLE[targetLane]; const authorityPolicy = getLegalRoleAuthorityPolicy(roleType); const authorityActor = authorityPolicy?.appointmentAuthorities?.[0]
  const value = {
    version: CONVEYANCER_ATTORNEY_REPLACEMENT_VERSION,
    replacementId: `attorney_replacement:${dependencyModel.transactionId}:${targetLane}:${fnv(commandId)}`,
    revision: 1, dependencyModelId: dependencyModel.modelId, dependencyModelFingerprint: dependencyModel.fingerprint,
    plan: { ...dependencyModel.plan }, transactionId: dependencyModel.transactionId, organisationId: dependencyModel.organisationId,
    lane: targetLane, legalRoleType: roleType, currentFirmId: dependencyModel.roleBindings[targetLane].firmId, legalRoleState: state,
    status: 'awaiting_appointing_authority', reason: text(reason), trigger: text(trigger), evidenceReferenceId: text(evidenceReferenceId), escalationBinding,
    appointingAuthority: { actorRole: authorityActor, appointmentKind: authorityPolicy.appointmentKind },
    requestedAt: timestamp, requestedBy: viewerAccess.viewer, authorityResponseBy: addHours(timestamp, 24), appointment: null,
    invalidation: { dependencyModelRegenerationRequired: false, oldFirmAccessRevoked: false, invitationsSent: false, appointmentChanged: false },
    processedCommands: [{ commandId: text(commandId), payloadFingerprint: fnv({ lane: targetLane, reason: text(reason), trigger: text(trigger), evidenceReferenceId: text(evidenceReferenceId), requestedAt: timestamp }) }],
    fingerprint: null,
  }
  value.fingerprint = fingerprint(value)
  const validation = validateConveyancerAttorneyReplacement(value, { dependencyModel })
  if (!validation.valid) return fail('attorney_replacement_request_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: 'attorney_replacement_awaiting_authority', errors: [], escalation: null, replacement: validation.replacement, event: null })
}

export function confirmConveyancerAttorneyReplacement({ dependencyModel = {}, replacement: inputReplacement = {}, appointment = {}, commandId = '', confirmedAt = '', confirmedBy = {} } = {}) {
  const validation = validateConveyancerAttorneyReplacement(inputReplacement, { dependencyModel })
  if (!validation.valid) return fail('attorney_replacement_invalid', validation.errors)
  const value = structuredClone(validation.replacement); const timestamp = iso(confirmedAt); const externalActorRole = key(confirmedBy.actorRole || confirmedBy.actor_role); const externalActorId = text(confirmedBy.actorId || confirmedBy.actor_id); const nextFirmId = text(appointment.firmId || appointment.firm_id); const referenceId = text(appointment.evidenceReferenceId || appointment.evidence_reference_id); const evidenceHash = text(appointment.evidenceHash || appointment.evidence_hash).toLowerCase()
  const payloadFingerprint = fnv({ nextFirmId, referenceId, evidenceHash, timestamp, externalActorRole, externalActorId }); const prior = value.processedCommands.find((item) => item.commandId === text(commandId))
  if (prior) return prior.payloadFingerprint === payloadFingerprint ? deepFreeze({ ok: true, duplicate: true, code: 'attorney_replacement_confirmation_duplicate', errors: [], escalation: null, replacement: value, event: null }) : fail('attorney_replacement_command_conflict', ['command_id_reused_with_different_payload'])
  if (value.status !== 'awaiting_appointing_authority' || !text(commandId) || !timestamp || new Date(timestamp) < new Date(value.requestedAt) || !externalActorId || !isLegalRoleAppointmentAuthority(value.legalRoleType, externalActorRole) || !nextFirmId || nextFirmId === value.currentFirmId || !referenceId || !sha(evidenceHash)) return fail('attorney_replacement_confirmation_unauthorised', ['appointing_authority_confirmation_required'])
  value.status = 'appointment_confirmed'; value.revision += 1
  value.appointment = { firmId: nextFirmId, evidenceReferenceId: referenceId, evidenceHash, appointedAt: timestamp, appointedBy: { actorRole: externalActorRole, actorId: externalActorId } }
  value.invalidation = { dependencyModelRegenerationRequired: true, oldFirmAccessRevoked: false, invitationsSent: false, appointmentChanged: false }
  value.processedCommands.push({ commandId: text(commandId), payloadFingerprint }); value.fingerprint = fingerprint(value)
  const nextValidation = validateConveyancerAttorneyReplacement(value, { dependencyModel })
  if (!nextValidation.valid) return fail('attorney_replacement_invalid', nextValidation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: 'attorney_replacement_appointment_confirmed', errors: [], escalation: null, replacement: nextValidation.replacement, event: null })
}

export function validateConveyancerAttorneyReplacement(input = {}, { dependencyModel = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_ATTORNEY_REPLACEMENT_VERSION || !value.replacementId || !Number.isInteger(value.revision) || value.revision < 1) errors.push('attorney_replacement_identity_invalid')
  if (!value.plan?.planId || !Number.isInteger(value.plan?.planVersion) || !value.transactionId || !value.organisationId || !value.dependencyModelId) errors.push('attorney_replacement_matter_binding_invalid')
  if (!LANE_ROLE[value.lane] || value.legalRoleType !== LANE_ROLE[value.lane] || !value.currentFirmId || !REPLACEMENT_STATUSES.has(value.status)) errors.push('attorney_replacement_context_invalid')
  if (!value.reason || !value.trigger || !value.evidenceReferenceId || !iso(value.requestedAt) || !value.requestedBy?.userId || !value.appointingAuthority?.actorRole || !iso(value.authorityResponseBy)) errors.push('attorney_replacement_provenance_invalid')
  if (!Array.isArray(value.processedCommands) || !value.processedCommands.length || new Set(value.processedCommands.map((item) => item.commandId)).size !== value.processedCommands.length) errors.push('attorney_replacement_command_history_invalid')
  if (value.status === 'awaiting_appointing_authority' && value.appointment) errors.push('unconfirmed_replacement_cannot_have_appointment')
  if (value.status === 'appointment_confirmed') {
    if (!value.appointment?.firmId || value.appointment.firmId === value.currentFirmId || !value.appointment?.evidenceReferenceId || !sha(value.appointment?.evidenceHash) || !iso(value.appointment?.appointedAt) || !isLegalRoleAppointmentAuthority(value.legalRoleType, value.appointment?.appointedBy?.actorRole)) errors.push('attorney_replacement_appointment_invalid')
    if (!value.invalidation?.dependencyModelRegenerationRequired || value.invalidation?.appointmentChanged || value.invalidation?.invitationsSent || value.invalidation?.oldFirmAccessRevoked) errors.push('attorney_replacement_activation_boundary_violated')
  }
  if (value.invalidation?.appointmentChanged || value.invalidation?.invitationsSent || value.invalidation?.oldFirmAccessRevoked) errors.push('attorney_replacement_side_effect_boundary_violated')
  if (dependencyModel && (value.dependencyModelId !== dependencyModel.modelId || value.dependencyModelFingerprint !== dependencyModel.fingerprint || value.transactionId !== dependencyModel.transactionId || value.organisationId !== dependencyModel.organisationId || value.plan?.planId !== dependencyModel.plan?.planId || value.plan?.planVersion !== dependencyModel.plan?.planVersion || value.currentFirmId !== dependencyModel.roleBindings?.[value.lane]?.firmId)) errors.push('attorney_replacement_dependency_binding_invalid')
  const expectedFingerprint = fingerprint(value)
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.fingerprint || '')) errors.push('attorney_replacement_fingerprint_required')
  else if (value.fingerprint !== expectedFingerprint) errors.push('attorney_replacement_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), replacement: value })
}

export const CONVEYANCER_E6_REPLACEMENT_COORDINATION_KEYS = Object.freeze([K.bondInstructionAndConditions, K.cancellationFigures])
