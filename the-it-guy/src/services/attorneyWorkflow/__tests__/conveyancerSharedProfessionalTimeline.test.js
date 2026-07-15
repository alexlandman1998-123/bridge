import assert from 'node:assert/strict'
import { MATTER_PLAN_EVIDENCE_STATUSES, MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_COORDINATION_STATUSES as S,
  buildConveyancerCoordinationContract,
} from '../../../core/transactions/conveyancerCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  buildConveyancerThreeRoleDependencyModel,
  getConveyancerThreeRoleDependency,
} from '../../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import {
  CONVEYANCER_SHARED_PROFESSIONAL_TIMELINE_VERSION,
  buildConveyancerSharedProfessionalTimeline,
  evaluateConveyancerSharedTimelineViewer,
  validateConveyancerSharedProfessionalTimeline,
} from '../conveyancerSharedProfessionalTimeline.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const generatedAt = '2026-07-15T08:00:00.000Z'
const system = { role: R.system, userId: 'timeline-engine-e3' }
const transfer = { role: R.transferAttorney, userId: 'transfer-e3' }
const bond = { role: R.bondAttorney, userId: 'bond-e3' }
const cancellation = { role: R.cancellationAttorney, userId: 'cancellation-e3' }
const bindings = {
  transfer: { firmId: 'firm:transfer', owner: transfer },
  bond: { firmId: 'firm:bond', owner: bond },
  cancellation: { firmId: 'firm:cancellation', owner: cancellation },
}
const viewers = {
  transfer: { ...transfer, firmId: 'firm:transfer' },
  bond: { ...bond, firmId: 'firm:bond' },
  cancellation: { ...cancellation, firmId: 'firm:cancellation' },
}

function dependencyModel(financeType = 'hybrid', sellerHasExistingBond = true) {
  const result = buildConveyancerThreeRoleDependencyModel({
    plan: { planId: 'plan:e3', planVersion: 1 },
    transaction: { id: 'transaction:e3', organisation_id: 'organisation:e3', transaction_type: 'resale', property_tenure: 'freehold', finance_type: financeType, seller_has_existing_bond: sellerHasExistingBond, buyer_entity_type: 'individual', seller_entity_type: 'individual' },
    roleBindings: bindings, generatedAt, generatedBy: system,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.model
}

function activeRoles(model) {
  return Object.fromEntries(model.requiredLanes.map((lane) => [lane, { state: 'active', firmId: bindings[lane].firmId, updatedAt: '2026-07-15T08:00:00.000Z' }]))
}

function allMilestones(model) {
  return [...new Set(model.nodes.flatMap((node) => node.prerequisiteMilestones))].map((milestoneKey) => ({ key: milestoneKey, status: 'completed', occurredAt: '2026-07-15T08:00:00.000Z', referenceId: `milestone:${milestoneKey}` }))
}

function evolve(model, dependencyKey, overrides) {
  const base = getConveyancerThreeRoleDependency(model, dependencyKey).coordination
  const result = buildConveyancerCoordinationContract({ ...base, ...overrides }, { actionKeys: Object.values(model.actionKeyMap || {}) })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.coordination
}

function requested(model, dependencyKey = K.bondInstructionAndConditions, overrides = {}) {
  return evolve(model, dependencyKey, { status: S.requested, requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: transfer, updatedAt: '2026-07-15T09:00:00.000Z', ...overrides })
}

function acknowledged(model, dependencyKey = K.bondInstructionAndConditions, overrides = {}) {
  return evolve(model, dependencyKey, { status: S.acknowledged, requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: transfer, acknowledgement: { acknowledgedAt: '2026-07-15T10:00:00.000Z', acknowledgedBy: bond, expectedAt: '2026-07-16T10:00:00.000Z' }, updatedAt: '2026-07-15T10:00:00.000Z', ...overrides })
}

function acceptedGuarantee(model) {
  const node = getConveyancerThreeRoleDependency(model, K.bondGuaranteeIssued)
  const requirement = node.coordination.evidenceRequirements[0]
  return evolve(model, K.bondGuaranteeIssued, {
    status: S.accepted,
    requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: transfer,
    acknowledgement: { acknowledgedAt: '2026-07-15T10:00:00.000Z', acknowledgedBy: bond, expectedAt: '2026-07-15T16:00:00.000Z' },
    submission: { submittedAt: '2026-07-15T13:00:00.000Z', submittedBy: bond, summary: 'Issued guarantee uploaded for professional review.' },
    evidence: [{ requirementKey: requirement.key, status: MATTER_PLAN_EVIDENCE_STATUSES.approved, referenceId: 'document:e3:guarantee', capturedAt: '2026-07-15T13:00:00.000Z', capturedBy: transfer }],
    decision: { type: 'accepted', decidedAt: '2026-07-15T14:00:00.000Z', decidedBy: transfer },
    updatedAt: '2026-07-15T14:00:00.000Z',
  })
}

function timeline(model, overrides = {}) {
  return buildConveyancerSharedProfessionalTimeline({ dependencyModel: model, coordinationRecords: [], milestoneEvidence: allMilestones(model), roleStates: activeRoles(model), viewer: viewers.transfer, asOf: '2026-07-15T15:00:00.000Z', ...overrides })
}

test('returns a clear empty professional timeline for a cash-only matter', () => {
  const model = dependencyModel('cash', false)
  const result = timeline(model)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.timeline.version, CONVEYANCER_SHARED_PROFESSIONAL_TIMELINE_VERSION)
  assert.equal(result.timeline.health, 'clear')
  assert.equal(result.timeline.items.length, 0)
  assert.equal(result.timeline.entries.length, 0)
})

test('projects the full hybrid graph in deterministic topological order', () => {
  const model = dependencyModel()
  const result = timeline(model)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.timeline.items.length, 10)
  assert.deepEqual(result.timeline.items.map((item) => item.dependencyKey), model.topologicalOrder)
  assert.equal(result.timeline.entries.length, 10)
  assert.equal(result.timeline.entries.every((entry) => entry.eventType === 'coordination_planned'), true)
  assert.equal(result.timeline.items.find((item) => item.dependencyKey === K.bondGuaranteeIssued).state, 'ready_to_request')
  assert.equal(result.timeline.items.find((item) => item.dependencyKey === K.transferGuaranteeWordingDecision).state, 'awaiting_prerequisite')
  assert.equal(Object.isFrozen(result.timeline), true)
})

test('builds a chronological, evidence-linked lifecycle without exposing payloads', () => {
  const model = dependencyModel('bond', false)
  const record = acceptedGuarantee(model)
  const result = timeline(model, { coordinationRecords: [record] })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  const entries = result.timeline.entries.filter((entry) => entry.coordinationId === record.coordinationId)
  assert.deepEqual(entries.map((entry) => entry.eventType), ['coordination_planned', 'coordination_requested', 'coordination_acknowledged', 'coordination_submitted', 'coordination_accepted'])
  assert.equal(entries[3].evidence[0].referenceId, 'document:e3:guarantee')
  assert.equal(JSON.stringify(result.timeline).includes('evidenceHash'), false)
  assert.equal(JSON.stringify(result.timeline).includes('purchasePrice'), false)
  assert.equal(result.timeline.items.find((item) => item.dependencyKey === K.bondGuaranteeIssued).state, 'accepted')
})

test('shows lane-relative responsibility without granting mutation capability', () => {
  const model = dependencyModel('bond', false)
  const record = requested(model)
  const transferView = timeline(model, { coordinationRecords: [record] }).timeline
  const bondView = timeline(model, { coordinationRecords: [record], viewer: viewers.bond }).timeline
  const transferItem = transferView.items.find((item) => item.dependencyKey === K.bondInstructionAndConditions)
  const bondItem = bondView.items.find((item) => item.dependencyKey === K.bondInstructionAndConditions)
  assert.equal(transferItem.viewerRelationship, 'source')
  assert.equal(transferItem.viewerResponsibility, 'observe')
  assert.equal(bondItem.viewerRelationship, 'target')
  assert.equal(bondItem.viewerResponsibility, 'deliver')
  assert.equal(transferView.controls.readOnly, true)
})

test('distinguishes missing role readiness from missing milestone prerequisites', () => {
  const model = dependencyModel('bond', false)
  const noRole = timeline(model, { roleStates: { transfer: activeRoles(model).transfer } }).timeline
  assert.equal(noRole.items.find((item) => item.dependencyKey === K.bondGuaranteeIssued).state, 'waiting_role')
  const noMilestones = timeline(model, { milestoneEvidence: [] }).timeline
  assert.equal(noMilestones.items.find((item) => item.dependencyKey === K.bondGuaranteeIssued).state, 'awaiting_prerequisite')
  assert.deepEqual(noMilestones.items.find((item) => item.dependencyKey === K.bondGuaranteeIssued).missingPrerequisiteMilestones, ['bank_conditions_satisfied'])
})

test('requires known, timestamped milestone and exact role-state provenance', () => {
  const model = dependencyModel('bond', false)
  const unknown = timeline(model, { milestoneEvidence: [{ key: 'invented_milestone', status: 'completed', occurredAt: generatedAt, referenceId: 'fake' }] })
  assert.ok(unknown.errors.includes('unknown_timeline_milestone_evidence'))
  const future = timeline(model, { milestoneEvidence: allMilestones(model).map((item, index) => index ? item : { ...item, occurredAt: '2026-07-16T08:00:00.000Z' }) })
  assert.ok(future.errors.includes('timeline_milestone_evidence_in_future'))
  const wrongFirm = activeRoles(model); wrongFirm.bond.firmId = 'wrong-firm'
  assert.ok(timeline(model, { roleStates: wrongFirm }).errors.includes('timeline_role_state_invalid:bond'))
})

test('calculates acknowledgement and delivery overdue state without mutation', () => {
  const model = dependencyModel('bond', false)
  const request = requested(model)
  const waiting = timeline(model, { coordinationRecords: [request], asOf: '2026-07-16T12:00:00.000Z' }).timeline
  const waitingItem = waiting.items.find((item) => item.dependencyKey === K.bondInstructionAndConditions)
  assert.equal(waitingItem.acknowledgementOverdue, true)
  assert.equal(waiting.health, 'overdue')
  const progress = acknowledged(model)
  const overdue = timeline(model, { coordinationRecords: [progress], asOf: '2026-07-18T12:00:00.000Z' }).timeline
  assert.equal(overdue.items.find((item) => item.dependencyKey === K.bondInstructionAndConditions).deliveryOverdue, true)
  assert.equal(progress.status, S.acknowledged)
})

test('prioritises explicit target-lane blockage in timeline health', () => {
  const model = dependencyModel('bond', false)
  const blocked = evolve(model, K.bondInstructionAndConditions, {
    status: S.blocked, requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: transfer,
    acknowledgement: { acknowledgedAt: '2026-07-15T10:00:00.000Z', acknowledgedBy: bond },
    blockage: { reason: 'Bank instruction amendment outstanding.', blockedAt: '2026-07-15T11:00:00.000Z', blockedBy: bond, followUpAt: '2026-07-16T08:00:00.000Z' },
    updatedAt: '2026-07-15T11:00:00.000Z',
  })
  const result = timeline(model, { coordinationRecords: [blocked] })
  assert.equal(result.timeline.health, 'blocked')
  assert.equal(result.timeline.counts.blocked, 1)
  assert.ok(result.timeline.entries.some((entry) => entry.eventType === 'coordination_blocked'))
})

test('allows only professionals bound to a required matter lane and firm', () => {
  const model = dependencyModel()
  assert.equal(evaluateConveyancerSharedTimelineViewer({ dependencyModel: model, viewer: viewers.cancellation }).allowed, true)
  const wrongFirm = timeline(model, { viewer: { ...viewers.bond, firmId: 'wrong-firm' } })
  assert.equal(wrongFirm.code, 'timeline_access_denied')
  assert.ok(wrongFirm.errors.includes('timeline_viewer_firm_mismatch'))
  const client = timeline(model, { viewer: { role: R.client, userId: 'client-e3', lane: 'transfer', firmId: 'firm:transfer' } })
  assert.equal(client.code, 'timeline_access_denied')
  assert.ok(client.errors.includes('professional_timeline_role_required'))
})

test('rejects duplicate, orphaned and definition-tampered coordination records', () => {
  const model = dependencyModel('bond', false)
  const record = requested(model)
  assert.ok(timeline(model, { coordinationRecords: [record, record] }).errors.includes('duplicate_timeline_coordination_record'))
  assert.ok(timeline(model, { coordinationRecords: [{ ...record, coordinationId: 'orphan:e3' }] }).errors.includes('orphan_timeline_coordination_record'))
  const tampered = structuredClone(record); tampered.deliverable.label = 'Forged hand-off'
  assert.ok(timeline(model, { coordinationRecords: [tampered] }).errors.some((error) => error.includes('coordination_definition_fingerprint_invalid')))
  const future = requested(model, K.bondInstructionAndConditions, { requestedAt: '2026-07-16T09:00:00.000Z', updatedAt: '2026-07-16T09:00:00.000Z' })
  assert.ok(timeline(model, { coordinationRecords: [future] }).errors.includes(`${K.bondInstructionAndConditions}:timeline_lifecycle_event_in_future`))
})

test('detects timeline binding, ordering, fingerprint and side-effect tampering', () => {
  const model = dependencyModel('bond', false)
  const clean = timeline(model, { coordinationRecords: [acceptedGuarantee(model)] }).timeline
  const binding = structuredClone(clean); binding.transactionId = 'forged'
  assert.ok(validateConveyancerSharedProfessionalTimeline(binding, { dependencyModel: model }).errors.includes('shared_timeline_dependency_binding_invalid'))
  const order = structuredClone(clean); order.entries.reverse()
  assert.ok(validateConveyancerSharedProfessionalTimeline(order, { dependencyModel: model }).errors.includes('shared_timeline_entry_order_invalid'))
  const sideEffect = structuredClone(clean); sideEffect.controls.notificationsSent = true
  assert.ok(validateConveyancerSharedProfessionalTimeline(sideEffect, { dependencyModel: model }).errors.includes('shared_timeline_side_effect_boundary_violated'))
  assert.ok(validateConveyancerSharedProfessionalTimeline(sideEffect, { dependencyModel: model }).errors.includes('shared_timeline_fingerprint_invalid'))
})

console.log('E3 shared professional timeline tests passed.')
