import assert from 'node:assert/strict'
import {
  MATTER_PLAN_DEPENDENCY_TYPES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_EVIDENCE_TYPES,
  MATTER_PLAN_OWNER_ROLES as R,
} from '../conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_COORDINATION_CAPABILITIES as C,
  CONVEYANCER_COORDINATION_CONTRACT_VERSION,
  CONVEYANCER_COORDINATION_DELIVERABLE_TYPES as D,
  CONVEYANCER_COORDINATION_LANES as L,
  CONVEYANCER_COORDINATION_PRIORITY_POLICY,
  CONVEYANCER_COORDINATION_SCHEMA,
  CONVEYANCER_COORDINATION_STATUSES as S,
  buildConveyancerCoordinationContract,
  canConveyancerCoordinationActor,
  evaluateConveyancerCoordinationAuthority,
  evaluateConveyancerCoordinationSupersession,
  evaluateConveyancerCoordinationTransition,
  validateConveyancerCoordination,
} from '../conveyancerCoordinationContract.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const transfer = { role: R.transferAttorney, userId: 'transfer-e1' }
const bond = { role: R.bondAttorney, userId: 'bond-e1' }
const cancellation = { role: R.cancellationAttorney, userId: 'cancellation-e1' }
const manager = { role: R.firmManager, userId: 'manager-e1' }

function input(overrides = {}) {
  return {
    contractVersion: CONVEYANCER_COORDINATION_CONTRACT_VERSION,
    coordinationId: 'coordination:e1:guarantee',
    revision: 1,
    planId: 'plan:e1',
    planVersion: 1,
    transactionId: 'transaction:e1',
    organisationId: 'organisation:e1',
    deduplicationKey: 'bond.guarantee.issue',
    status: S.requested,
    priority: 'high',
    visibility: 'professional_shared',
    source: { lane: L.transfer, firmId: 'firm:transfer', owner: transfer },
    target: { lane: L.bond, firmId: 'firm:bond', owner: bond },
    deliverable: { key: 'issued_guarantee', type: D.guarantee, label: 'Issued bank guarantee', description: 'Provide the issued guarantee for transfer review.', format: 'pdf' },
    dependencies: [{ key: 'bond_instruction_received', type: MATTER_PLAN_DEPENDENCY_TYPES.event, required: true }],
    requiredForActionKeys: ['approve_guarantee_wording'],
    evidenceRequirements: [{ key: 'guarantee_document', label: 'Issued guarantee', type: MATTER_PLAN_EVIDENCE_TYPES.document, required: true, requiresApproval: true }],
    evidence: [],
    sla: { acknowledgeBy: '2026-07-15T16:00:00.000Z', deliverBy: '2026-07-17T08:00:00.000Z' },
    requestedAt: '2026-07-15T08:00:00.000Z',
    requestedBy: transfer,
    createdAt: '2026-07-15T08:00:00.000Z',
    createdBy: transfer,
    updatedAt: '2026-07-15T08:00:00.000Z',
    runtimeRevision: 0,
    ...overrides,
  }
}

function build(overrides = {}) {
  return buildConveyancerCoordinationContract(input(overrides), { actionKeys: ['approve_guarantee_wording', 'prepare_lodgement'] })
}

function accepted() {
  return build({
    status: S.accepted,
    acknowledgement: { acknowledgedAt: '2026-07-15T09:00:00.000Z', acknowledgedBy: bond, expectedAt: '2026-07-16T12:00:00.000Z' },
    submission: { submittedAt: '2026-07-16T10:00:00.000Z', submittedBy: bond, summary: 'Issued guarantee supplied.' },
    evidence: [{ requirementKey: 'guarantee_document', status: MATTER_PLAN_EVIDENCE_STATUSES.approved, referenceId: 'document:e1:guarantee', capturedAt: '2026-07-16T10:00:00.000Z', capturedBy: transfer }],
    decision: { type: 'accepted', decidedAt: '2026-07-16T11:00:00.000Z', decidedBy: transfer },
  })
}

test('builds an immutable cross-lane coordination contract', () => {
  const result = build()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.match(result.coordination.definitionFingerprint, /^fnv1a_[a-f0-9]{8}$/)
  assert.equal(result.coordination.source.lane, L.transfer)
  assert.equal(result.coordination.target.lane, L.bond)
  assert.equal(CONVEYANCER_COORDINATION_SCHEMA.crossLaneMutationAllowed, false)
  assert.equal(Object.isFrozen(result.coordination), true)
})

test('keeps source request/acceptance separate from target delivery authority', () => {
  const value = build().coordination
  assert.deepEqual(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: transfer, capability: C.request }), { allowed: true, reason: 'source_lane_authority' })
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: transfer, capability: C.submit }).reason, 'target_lane_authority_required')
  assert.deepEqual(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: bond, capability: C.submit }), { allowed: true, reason: 'target_lane_authority' })
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: bond, capability: C.accept }).reason, 'source_lane_authority_required')
})

test('requires operational actors to carry an explicit matching lane', () => {
  const value = build().coordination
  const secretaryWithoutLane = { role: R.secretary, userId: 'secretary-e1' }
  const transferSecretary = { ...secretaryWithoutLane, lane: L.transfer }
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: secretaryWithoutLane, capability: C.request }).allowed, false)
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: transferSecretary, capability: C.request }).allowed, true)
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: transferSecretary, capability: C.submit }).allowed, false)
})

test('supports cancellation coordination without letting transfer appoint the bank attorney', () => {
  const result = build({
    coordinationId: 'coordination:e1:cancellation-figures', deduplicationKey: 'cancellation.figures',
    target: { lane: L.cancellation, firmId: 'firm:cancellation', owner: cancellation },
    deliverable: { key: 'cancellation_figures', type: D.financial, label: 'Cancellation figures', description: 'Provide lender-issued cancellation figures.' },
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.coordination.target.owner.role, R.cancellationAttorney)
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: result.coordination, actor: transfer, capability: C.request }).allowed, true)
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: result.coordination, actor: cancellation, capability: C.submit }).allowed, true)
})

test('rejects same-lane handoffs and owners from the wrong lane', () => {
  const sameLane = build({ target: { lane: L.transfer, owner: transfer } })
  assert.ok(sameLane.errors.includes('cross_lane_coordination_required'))
  const wrongOwner = build({ target: { lane: L.bond, owner: cancellation } })
  assert.ok(wrongOwner.errors.includes('target_owner_lane_invalid'))
})

test('requires action dependencies to exist in the bound matter plan', () => {
  const result = build({ dependencies: [{ key: 'missing_action', type: MATTER_PLAN_DEPENDENCY_TYPES.action }], requiredForActionKeys: ['missing_required_action'] })
  assert.ok(result.errors.includes('unknown_coordination_action_dependency'))
  assert.ok(result.errors.includes('unknown_coordination_required_action'))
})

test('requires high and critical handoffs to carry coherent SLA dates', () => {
  const missing = build({ sla: {} })
  assert.ok(missing.errors.includes('coordination_sla_required'))
  const reversed = build({ sla: { acknowledgeBy: '2026-07-17T08:00:00.000Z', deliverBy: '2026-07-16T08:00:00.000Z' } })
  assert.ok(reversed.errors.includes('coordination_delivery_sla_precedes_acknowledgement_sla'))
  assert.deepEqual(CONVEYANCER_COORDINATION_PRIORITY_POLICY.critical, { acknowledgeHours: 2, deliverHours: 12 })
})

test('requires bound legal firms, accountable owners and chronological evidence', () => {
  const missingBindings = build({ source: { lane: L.transfer, owner: { role: R.transferAttorney, teamId: 'team:transfer' } }, target: { lane: L.bond, owner: { role: R.bondAttorney, teamId: 'team:bond' } } })
  assert.ok(missingBindings.errors.includes('source_firm_binding_required'))
  assert.ok(missingBindings.errors.includes('target_firm_binding_required'))
  const reversed = build({
    status: S.accepted,
    acknowledgement: { acknowledgedAt: '2026-07-16T12:00:00.000Z', acknowledgedBy: bond },
    submission: { submittedAt: '2026-07-16T10:00:00.000Z', submittedBy: bond, summary: 'Submitted early.' },
    evidence: [{ requirementKey: 'guarantee_document', status: MATTER_PLAN_EVIDENCE_STATUSES.approved, referenceId: 'doc', capturedAt: '2026-07-16T10:00:00.000Z', capturedBy: transfer }],
    decision: { type: 'accepted', decidedAt: '2026-07-16T09:00:00.000Z', decidedBy: transfer },
  })
  assert.ok(reversed.errors.includes('coordination_submission_precedes_acknowledgement'))
  assert.ok(reversed.errors.includes('coordination_decision_precedes_submission'))
})

test('requires target submission, source acceptance and approved evidence', () => {
  const clean = accepted()
  assert.equal(clean.ok, true, JSON.stringify(clean.errors))
  const missingEvidence = accepted().coordination
  const tampered = structuredClone(missingEvidence); tampered.evidence = []; tampered.definitionFingerprint = missingEvidence.definitionFingerprint
  const invalid = validateConveyancerCoordination(tampered, { actionKeys: ['approve_guarantee_wording'] })
  assert.ok(invalid.errors.includes('coordination_required_evidence_not_satisfied'))
  const wrongDecision = build({
    status: S.accepted,
    acknowledgement: { acknowledgedAt: '2026-07-15T09:00:00.000Z', acknowledgedBy: bond },
    submission: { submittedAt: '2026-07-16T10:00:00.000Z', submittedBy: bond, summary: 'Submitted.' },
    evidence: [{ requirementKey: 'guarantee_document', status: MATTER_PLAN_EVIDENCE_STATUSES.approved, referenceId: 'doc', capturedAt: '2026-07-16T10:00:00.000Z', capturedBy: transfer }],
    decision: { type: 'accepted', decidedAt: '2026-07-16T11:00:00.000Z', decidedBy: bond },
  })
  assert.ok(wrongDecision.errors.includes('coordination_acceptance_required'))
})

test('enforces lane authority, evidence and reasons on lifecycle transitions', () => {
  const value = build().coordination
  assert.equal(evaluateConveyancerCoordinationTransition({ coordination: value, toStatus: S.acknowledged, actor: bond }).allowed, true)
  assert.equal(evaluateConveyancerCoordinationTransition({ coordination: value, toStatus: S.acknowledged, actor: transfer }).reason, 'target_lane_authority_required')
  const submitted = structuredClone(accepted().coordination)
  submitted.status = S.submitted
  assert.equal(evaluateConveyancerCoordinationTransition({ coordination: submitted, toStatus: S.accepted, actor: transfer }).reason, 'coordination_required_evidence_not_satisfied')
  assert.equal(evaluateConveyancerCoordinationTransition({ coordination: submitted, toStatus: S.accepted, actor: transfer, requiredEvidenceSatisfied: true }).allowed, true)
  assert.equal(evaluateConveyancerCoordinationTransition({ coordination: value, toStatus: S.blocked, actor: bond }).reason, 'coordination_transition_reason_required')
})

test('detects immutable definition tampering', () => {
  const value = structuredClone(build().coordination)
  value.deliverable.label = 'Different deliverable'
  const result = validateConveyancerCoordination(value, { actionKeys: ['approve_guarantee_wording'] })
  assert.ok(result.errors.includes('coordination_definition_fingerprint_invalid'))
})

test('requires exact append-only lineage and firm-manager supersession', () => {
  const previous = build().coordination
  const current = build({
    coordinationId: 'coordination:e1:guarantee:v2', revision: 2,
    previousCoordinationId: previous.coordinationId,
    previousDefinitionFingerprint: previous.definitionFingerprint,
    changeReason: 'Bank replaced the guarantee wording.',
  }).coordination
  assert.equal(evaluateConveyancerCoordinationSupersession({ previous, current, actor: manager }).allowed, true)
  assert.ok(evaluateConveyancerCoordinationSupersession({ previous, current, actor: transfer }).errors.includes('coordination_supersession_not_authorised'))
  const broken = structuredClone(current); broken.previousDefinitionFingerprint = 'fnv1a_deadbeef'
  assert.ok(evaluateConveyancerCoordinationSupersession({ previous, current: broken, actor: manager }).errors.includes('coordination_supersession_lineage_mismatch'))
})

test('keeps clients read-only and system creation narrowly scoped', () => {
  assert.equal(canConveyancerCoordinationActor(R.client, C.view), true)
  assert.equal(canConveyancerCoordinationActor(R.client, C.request), false)
  const value = build().coordination
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: { role: R.system, userId: 'system-e1' }, capability: C.create }).allowed, true)
  assert.equal(evaluateConveyancerCoordinationAuthority({ coordination: value, actor: { role: R.system, userId: 'system-e1' }, capability: C.request }).allowed, false)
})

console.log('E1 conveyancer coordination contract tests passed.')
