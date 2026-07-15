import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../../core/transactions/conveyancerMatterPlanContract.js'
import { LEGAL_ROLE_COORDINATION_STATES } from '../../core/transactions/legalRoleCoordinationContract.js'
import {
  CONVEYANCER_COORDINATION_STATUSES as S,
  getConveyancerCoordinationRoleLane,
  normalizeConveyancerCoordinationLane,
  validateConveyancerCoordination,
} from '../../core/transactions/conveyancerCoordinationContract.js'
import { validateConveyancerThreeRoleDependencyModel } from '../../core/transactions/conveyancerThreeRoleDependencyModel.js'

export const CONVEYANCER_SHARED_PROFESSIONAL_TIMELINE_VERSION = 'conveyancer_shared_professional_timeline_v1'

export const CONVEYANCER_SHARED_TIMELINE_ITEM_STATES = Object.freeze({
  planned: 'planned',
  awaitingPrerequisite: 'awaiting_prerequisite',
  waitingRole: 'waiting_role',
  readyToRequest: 'ready_to_request',
  waitingAcknowledgement: 'waiting_acknowledgement',
  inProgress: 'in_progress',
  readyForReview: 'ready_for_review',
  changesRequested: 'changes_requested',
  blocked: 'blocked',
  accepted: 'accepted',
  cancelled: 'cancelled',
  superseded: 'superseded',
})

export const CONVEYANCER_SHARED_TIMELINE_EVENT_TYPES = Object.freeze({
  planned: 'coordination_planned',
  requested: 'coordination_requested',
  acknowledged: 'coordination_acknowledged',
  submitted: 'coordination_submitted',
  blocked: 'coordination_blocked',
  accepted: 'coordination_accepted',
  changesRequested: 'coordination_changes_requested',
  cancelled: 'coordination_cancelled',
  superseded: 'coordination_superseded',
})

const I = CONVEYANCER_SHARED_TIMELINE_ITEM_STATES
const E = CONVEYANCER_SHARED_TIMELINE_EVENT_TYPES
const PROFESSIONAL_ROLES = new Set([R.conveyancer, R.transferAttorney, R.bondAttorney, R.cancellationAttorney, R.firmManager, R.secretary, R.accounts])
const SATISFIED_ROLE_STATES = new Set([LEGAL_ROLE_COORDINATION_STATES.active, LEGAL_ROLE_COORDINATION_STATES.completed])
const SATISFIED_MILESTONE_STATES = new Set(['completed', 'confirmed', 'accepted', 'ready'])
const ROLE_STATE_VALUES = new Set(Object.values(LEGAL_ROLE_COORDINATION_STATES))

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
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
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function fnv(value) {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function actor(input = {}) {
  const role = normalizeMatterPlanOwnerRole(input.role)
  return { role, userId: text(input.userId || input.user_id) || null, lane: normalizeConveyancerCoordinationLane(input.lane || getConveyancerCoordinationRoleLane(role)) || null, firmId: text(input.firmId || input.firm_id) || null }
}
function eventActor(input = {}, lane = null, firmId = null) {
  return { role: normalizeMatterPlanOwnerRole(input.role), actorId: text(input.userId || input.user_id) || null, lane: normalizeConveyancerCoordinationLane(input.lane || getConveyancerCoordinationRoleLane(input.role) || lane) || lane || null, firmId: firmId || null }
}
function timelineFingerprint(value = {}) {
  const { fingerprint: _fingerprint, ...snapshot } = value
  return fnv(snapshot)
}
function fail(code, errors) { return deepFreeze({ ok: false, code, errors: unique(errors), timeline: null }) }

export function evaluateConveyancerSharedTimelineViewer({ dependencyModel = {}, viewer: inputViewer = {} } = {}) {
  const viewer = actor(inputViewer)
  if (!viewer.userId) return { allowed: false, reason: 'timeline_viewer_user_required', viewer }
  if (!PROFESSIONAL_ROLES.has(viewer.role)) return { allowed: false, reason: 'professional_timeline_role_required', viewer }
  if (!viewer.lane || !dependencyModel.requiredLanes?.includes(viewer.lane)) return { allowed: false, reason: 'timeline_viewer_lane_not_required', viewer }
  const binding = dependencyModel.roleBindings?.[viewer.lane]
  if (!binding?.firmId || viewer.firmId !== binding.firmId) return { allowed: false, reason: 'timeline_viewer_firm_mismatch', viewer }
  const fixedLane = getConveyancerCoordinationRoleLane(viewer.role)
  if (fixedLane && fixedLane !== viewer.lane) return { allowed: false, reason: 'timeline_viewer_role_lane_mismatch', viewer }
  return { allowed: true, reason: 'verified_matter_professional', viewer }
}

function normalizeMilestones(values = []) {
  const rows = Array.isArray(values) ? values : []
  return rows.map((item) => ({ key: key(item.key || item.milestoneKey || item.milestone_key), status: key(item.status), occurredAt: item.occurredAt || item.occurred_at || null, referenceId: text(item.referenceId || item.reference_id) || null, lane: normalizeConveyancerCoordinationLane(item.lane) || null }))
}
function normalizeRoleStates(values = {}) {
  return Object.fromEntries(Object.entries(values || {}).map(([lane, item]) => [normalizeConveyancerCoordinationLane(lane), { state: key(item?.state || item?.status), firmId: text(item?.firmId || item?.firm_id) || null, updatedAt: item?.updatedAt || item?.updated_at || null }]).filter(([lane]) => lane))
}
function currentTimestamp(record) {
  return record.decision?.decidedAt || record.blockage?.blockedAt || record.submission?.submittedAt || record.acknowledgement?.acknowledgedAt || record.requestedAt || record.updatedAt || record.createdAt
}
function milestoneSatisfied(index, milestone) { return SATISFIED_MILESTONE_STATES.has(index.get(milestone)?.status) }

function deriveItemState({ node, record, recordByKey, milestones, roleStates, asOf }) {
  const prerequisiteCoordination = (node.prerequisiteKeys || []).filter((item) => recordByKey.get(item)?.status !== S.accepted)
  const prerequisiteMilestones = (node.prerequisiteMilestones || []).filter((item) => !milestoneSatisfied(milestones, item))
  const targetRole = roleStates[node.targetLane]
  const targetFirmMatches = targetRole?.firmId === record.target?.firmId
  const targetReady = targetFirmMatches && SATISFIED_ROLE_STATES.has(targetRole?.state)
  let state = I.planned
  if (record.status === S.draft) {
    if (!targetReady) state = I.waitingRole
    else if (prerequisiteCoordination.length || prerequisiteMilestones.length) state = I.awaitingPrerequisite
    else state = I.readyToRequest
  } else if (record.status === S.requested) state = I.waitingAcknowledgement
  else if ([S.acknowledged, S.inProgress].includes(record.status)) state = I.inProgress
  else if (record.status === S.submitted) state = I.readyForReview
  else if (record.status === S.changesRequested) state = I.changesRequested
  else if (record.status === S.blocked) state = I.blocked
  else if (record.status === S.accepted) state = I.accepted
  else if (record.status === S.cancelled) state = I.cancelled
  else if (record.status === S.superseded) state = I.superseded
  const acknowledgementOverdue = record.status === S.requested && validDate(record.sla?.acknowledgeBy) && new Date(asOf) > new Date(record.sla.acknowledgeBy)
  const deliveryOverdue = [S.acknowledged, S.inProgress, S.changesRequested].includes(record.status) && validDate(record.sla?.deliverBy) && new Date(asOf) > new Date(record.sla.deliverBy)
  return { state, prerequisiteCoordination, prerequisiteMilestones, targetReady, acknowledgementOverdue, deliveryOverdue, overdue: acknowledgementOverdue || deliveryOverdue }
}

function viewerRelationship(record, viewerLane) {
  if (record.source?.lane === viewerLane) return 'source'
  if (record.target?.lane === viewerLane) return 'target'
  return 'observer'
}
function viewerResponsibility(record, viewerLane) {
  const relation = viewerRelationship(record, viewerLane)
  if (relation === 'source' && record.status === S.draft) return 'request'
  if (relation === 'target' && [S.requested, S.acknowledged, S.inProgress, S.changesRequested, S.blocked].includes(record.status)) return 'deliver'
  if (relation === 'source' && record.status === S.submitted) return 'review'
  return 'observe'
}
function visibleToViewer(record, viewer) {
  if (record.visibility === 'professional_shared' || record.visibility === 'client_visible') return true
  return record.visibility === 'internal' && record.source?.firmId === viewer.firmId
}

function entry({ record, kind, occurredAt, performedBy, title, summary = null, firmId = null, evidence = [] }) {
  return {
    entryId: `shared_timeline:${record.coordinationId}:${kind}:${occurredAt}`,
    coordinationId: record.coordinationId,
    definitionFingerprint: record.definitionFingerprint,
    eventType: kind,
    title,
    summary,
    occurredAt,
    sourceLane: record.source.lane,
    targetLane: record.target.lane,
    visibility: record.visibility,
    actor: eventActor(performedBy, null, firmId),
    evidence: evidence.map((item) => ({ requirementKey: item.requirementKey, status: item.status, referenceId: item.referenceId })),
  }
}

function lifecycleEntries(record) {
  const rows = []
  if (validDate(record.createdAt)) rows.push(entry({ record, kind: E.planned, occurredAt: record.createdAt, performedBy: record.createdBy, firmId: record.source.firmId, title: `${record.deliverable.label} planned` }))
  if (validDate(record.requestedAt)) rows.push(entry({ record, kind: E.requested, occurredAt: record.requestedAt, performedBy: record.requestedBy, firmId: record.source.firmId, title: `${record.deliverable.label} requested` }))
  if (validDate(record.acknowledgement?.acknowledgedAt)) rows.push(entry({ record, kind: E.acknowledged, occurredAt: record.acknowledgement.acknowledgedAt, performedBy: record.acknowledgement.acknowledgedBy, firmId: record.target.firmId, title: `${record.deliverable.label} acknowledged` }))
  if (validDate(record.submission?.submittedAt)) rows.push(entry({ record, kind: E.submitted, occurredAt: record.submission.submittedAt, performedBy: record.submission.submittedBy, firmId: record.target.firmId, title: `${record.deliverable.label} submitted`, summary: record.submission.summary, evidence: record.evidence }))
  if (validDate(record.blockage?.blockedAt)) rows.push(entry({ record, kind: E.blocked, occurredAt: record.blockage.blockedAt, performedBy: record.blockage.blockedBy, firmId: record.target.firmId, title: `${record.deliverable.label} blocked`, summary: record.blockage.reason }))
  if (validDate(record.decision?.decidedAt)) {
    const eventType = record.decision.type === 'accepted' ? E.accepted : record.decision.type === 'changes_requested' ? E.changesRequested : record.decision.type === 'cancelled' ? E.cancelled : E.superseded
    rows.push(entry({ record, kind: eventType, occurredAt: record.decision.decidedAt, performedBy: record.decision.decidedBy, firmId: record.source.firmId, title: `${record.deliverable.label} ${record.decision.type.replaceAll('_', ' ')}`, summary: record.decision.reason, evidence: eventType === E.accepted ? record.evidence : [] }))
  }
  return rows
}

function summary(items) {
  const counts = { total: items.length, planned: 0, ready: 0, waiting: 0, inProgress: 0, review: 0, accepted: 0, blocked: 0, overdue: 0, terminal: 0 }
  for (const item of items) {
    if ([I.planned, I.awaitingPrerequisite, I.waitingRole].includes(item.state)) counts.planned += 1
    if (item.state === I.readyToRequest) counts.ready += 1
    if (item.state === I.waitingAcknowledgement) counts.waiting += 1
    if ([I.inProgress, I.changesRequested].includes(item.state)) counts.inProgress += 1
    if (item.state === I.readyForReview) counts.review += 1
    if (item.state === I.accepted) counts.accepted += 1
    if (item.state === I.blocked) counts.blocked += 1
    if (item.overdue) counts.overdue += 1
    if ([I.accepted, I.cancelled, I.superseded].includes(item.state)) counts.terminal += 1
  }
  const health = counts.blocked ? 'blocked' : counts.overdue ? 'overdue' : counts.review || counts.ready ? 'action_required' : counts.waiting || counts.inProgress || counts.planned ? 'in_progress' : counts.total ? 'complete' : 'clear'
  return { health, counts }
}

export function buildConveyancerSharedProfessionalTimeline({ dependencyModel = {}, coordinationRecords = [], milestoneEvidence = [], roleStates = {}, viewer = {}, asOf = '' } = {}) {
  const dependencyValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel)
  if (!dependencyValidation.valid) return fail('timeline_dependency_model_invalid', dependencyValidation.errors)
  const access = evaluateConveyancerSharedTimelineViewer({ dependencyModel, viewer })
  if (!access.allowed) return fail('timeline_access_denied', [access.reason])
  if (!validDate(asOf)) return fail('timeline_as_of_invalid', ['timeline_as_of_invalid'])
  const projectionTime = new Date(asOf)
  if (new Date(dependencyModel.generatedAt) > projectionTime) return fail('timeline_projection_evidence_invalid', ['dependency_model_generated_in_future'])
  const records = Array.isArray(coordinationRecords) ? coordinationRecords : []
  const recordIds = records.map((record) => record.coordinationId)
  if (new Set(recordIds).size !== recordIds.length) return fail('timeline_coordination_records_invalid', ['duplicate_timeline_coordination_record'])
  const nodeIds = new Set(dependencyModel.nodes.map((node) => node.coordination.coordinationId))
  if (records.some((record) => !nodeIds.has(record.coordinationId))) return fail('timeline_coordination_records_invalid', ['orphan_timeline_coordination_record'])
  const suppliedById = new Map(records.map((record) => [record.coordinationId, record]))
  const actionKeys = Object.values(dependencyModel.actionKeyMap || {})
  const current = []
  const errors = []
  for (const node of dependencyModel.nodes) {
    const record = suppliedById.get(node.coordination.coordinationId) || node.coordination
    const validation = validateConveyancerCoordination(record, { actionKeys })
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${node.key}:${error}`))
    if (record.definitionFingerprint !== node.coordination.definitionFingerprint || record.coordinationId !== node.coordination.coordinationId) errors.push(`${node.key}:timeline_definition_binding_invalid`)
    if (lifecycleEntries(validation.coordination).some((item) => new Date(item.occurredAt) > projectionTime)) errors.push(`${node.key}:timeline_lifecycle_event_in_future`)
    current.push({ node, record: validation.coordination })
  }
  if (errors.length) return fail('timeline_coordination_records_invalid', errors)
  const recordByKey = new Map(current.map(({ node, record }) => [node.key, record]))
  const milestoneRows = normalizeMilestones(milestoneEvidence)
  const knownMilestones = new Set(dependencyModel.nodes.flatMap((node) => node.prerequisiteMilestones || []))
  const milestoneErrors = []
  if (new Set(milestoneRows.map((item) => item.key)).size !== milestoneRows.length) milestoneErrors.push('duplicate_timeline_milestone_evidence')
  if (milestoneRows.some((item) => !knownMilestones.has(item.key))) milestoneErrors.push('unknown_timeline_milestone_evidence')
  if (milestoneRows.some((item) => !SATISFIED_MILESTONE_STATES.has(item.status) || !validDate(item.occurredAt) || !item.referenceId)) milestoneErrors.push('timeline_milestone_provenance_invalid')
  if (milestoneRows.some((item) => validDate(item.occurredAt) && new Date(item.occurredAt) > projectionTime)) milestoneErrors.push('timeline_milestone_evidence_in_future')
  if (milestoneErrors.length) return fail('timeline_projection_evidence_invalid', milestoneErrors)
  const milestones = new Map(milestoneRows.map((item) => [item.key, item]))
  const roles = normalizeRoleStates(roleStates)
  const roleErrors = []
  for (const [lane, roleState] of Object.entries(roles)) {
    if (!dependencyModel.requiredLanes.includes(lane)) roleErrors.push(`timeline_role_state_lane_not_required:${lane}`)
    if (!ROLE_STATE_VALUES.has(roleState.state) || !roleState.firmId || roleState.firmId !== dependencyModel.roleBindings?.[lane]?.firmId || !validDate(roleState.updatedAt)) roleErrors.push(`timeline_role_state_invalid:${lane}`)
    if (validDate(roleState.updatedAt) && new Date(roleState.updatedAt) > projectionTime) roleErrors.push(`timeline_role_state_in_future:${lane}`)
  }
  if (roleErrors.length) return fail('timeline_projection_evidence_invalid', roleErrors)
  const order = new Map(dependencyModel.topologicalOrder.map((nodeKey, index) => [nodeKey, index]))
  const items = current.filter(({ record }) => visibleToViewer(record, access.viewer)).map(({ node, record }) => {
    const derived = deriveItemState({ node, record, recordByKey, milestones, roleStates: roles, asOf })
    return {
      dependencyKey: node.key, coordinationId: record.coordinationId, definitionFingerprint: record.definitionFingerprint,
      label: record.deliverable.label, deliverableType: record.deliverable.type, priority: record.priority,
      sourceLane: node.sourceLane, targetLane: node.targetLane, status: record.status, state: derived.state,
      occurredAt: currentTimestamp(record), acknowledgeBy: record.sla.acknowledgeBy, deliverBy: record.sla.deliverBy,
      prerequisiteKeys: [...node.prerequisiteKeys], missingPrerequisiteKeys: derived.prerequisiteCoordination,
      prerequisiteMilestones: [...node.prerequisiteMilestones], missingPrerequisiteMilestones: derived.prerequisiteMilestones,
      requiredForMilestones: [...node.requiredForMilestones], targetReady: derived.targetReady,
      acknowledgementOverdue: derived.acknowledgementOverdue, deliveryOverdue: derived.deliveryOverdue, overdue: derived.overdue,
      evidence: record.evidence.map((item) => ({ requirementKey: item.requirementKey, status: item.status, referenceId: item.referenceId })),
      viewerRelationship: viewerRelationship(record, access.viewer.lane), viewerResponsibility: viewerResponsibility(record, access.viewer.lane),
      topologicalIndex: order.get(node.key),
    }
  }).sort((left, right) => left.topologicalIndex - right.topologicalIndex)
  const entries = current.flatMap(({ record }) => visibleToViewer(record, access.viewer) ? lifecycleEntries(record) : []).sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt) || left.entryId.localeCompare(right.entryId))
  const rollup = summary(items)
  const timeline = {
    version: CONVEYANCER_SHARED_PROFESSIONAL_TIMELINE_VERSION,
    timelineId: `shared_professional_timeline:${dependencyModel.transactionId}:${dependencyModel.plan.planId}:v${dependencyModel.plan.planVersion}`,
    dependencyModelId: dependencyModel.modelId, dependencyModelFingerprint: dependencyModel.fingerprint,
    plan: { ...dependencyModel.plan }, transactionId: dependencyModel.transactionId, organisationId: dependencyModel.organisationId,
    asOf: new Date(asOf).toISOString(), viewer: access.viewer, health: rollup.health, counts: rollup.counts,
    filters: { lanes: [...dependencyModel.requiredLanes], states: unique(items.map((item) => item.state)), priorities: unique(items.map((item) => item.priority)) },
    items, entries,
    controls: { readOnly: true, persistencePerformed: false, notificationsSent: false, workflowsMutated: false, evidenceMutated: false },
    fingerprint: null,
  }
  timeline.fingerprint = timelineFingerprint(timeline)
  const validation = validateConveyancerSharedProfessionalTimeline(timeline, { dependencyModel })
  if (!validation.valid) return fail('shared_professional_timeline_invalid', validation.errors)
  return deepFreeze({ ok: true, code: 'shared_professional_timeline_ready', errors: [], timeline: validation.timeline })
}

export function validateConveyancerSharedProfessionalTimeline(input = {}, { dependencyModel = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {}))
  const errors = []
  if (value.version !== CONVEYANCER_SHARED_PROFESSIONAL_TIMELINE_VERSION) errors.push('shared_timeline_version_invalid')
  if (!value.timelineId || !value.dependencyModelId || !/^fnv1a_[a-f0-9]{8}$/.test(value.dependencyModelFingerprint || '')) errors.push('shared_timeline_identity_invalid')
  if (!value.plan?.planId || !Number.isInteger(value.plan?.planVersion) || value.plan.planVersion < 1 || !value.transactionId || !value.organisationId) errors.push('shared_timeline_matter_binding_invalid')
  if (!validDate(value.asOf) || !value.viewer?.userId || !value.viewer?.lane || !value.viewer?.firmId) errors.push('shared_timeline_projection_context_invalid')
  if (!Array.isArray(value.items) || !Array.isArray(value.entries)) errors.push('shared_timeline_collections_invalid')
  const items = Array.isArray(value.items) ? value.items : []
  const entries = Array.isArray(value.entries) ? value.entries : []
  if (new Set(items.map((item) => item.dependencyKey)).size !== items.length) errors.push('duplicate_shared_timeline_item')
  if (new Set(entries.map((item) => item.entryId)).size !== entries.length) errors.push('duplicate_shared_timeline_entry')
  if (entries.some((item) => !validDate(item.occurredAt) || !item.coordinationId || !item.eventType || !item.visibility)) errors.push('shared_timeline_entry_invalid')
  if (entries.some((item, index) => index > 0 && new Date(item.occurredAt) < new Date(entries[index - 1].occurredAt))) errors.push('shared_timeline_entry_order_invalid')
  if (items.some((item, index) => item.topologicalIndex !== index)) errors.push('shared_timeline_topological_order_invalid')
  if (!value.controls?.readOnly || value.controls?.persistencePerformed || value.controls?.notificationsSent || value.controls?.workflowsMutated || value.controls?.evidenceMutated) errors.push('shared_timeline_side_effect_boundary_violated')
  if (dependencyModel) {
    if (value.dependencyModelId !== dependencyModel.modelId || value.dependencyModelFingerprint !== dependencyModel.fingerprint || value.transactionId !== dependencyModel.transactionId || value.organisationId !== dependencyModel.organisationId || value.plan?.planId !== dependencyModel.plan?.planId || value.plan?.planVersion !== dependencyModel.plan?.planVersion) errors.push('shared_timeline_dependency_binding_invalid')
    const expectedVisibleCount = (dependencyModel.nodes || []).filter((node) => node.coordination?.visibility !== 'internal' || node.coordination?.source?.firmId === value.viewer?.firmId).length
    if (items.length !== expectedVisibleCount) errors.push('shared_timeline_dependency_coverage_invalid')
  }
  const expectedFingerprint = timelineFingerprint(value)
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.fingerprint || '')) errors.push('shared_timeline_fingerprint_required')
  else if (value.fingerprint !== expectedFingerprint) errors.push('shared_timeline_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), timeline: value })
}
