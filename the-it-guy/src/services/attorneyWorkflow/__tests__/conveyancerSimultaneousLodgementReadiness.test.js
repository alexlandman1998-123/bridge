import assert from 'node:assert/strict'
import { MATTER_PLAN_EVIDENCE_STATUSES, MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { CONVEYANCER_COORDINATION_STATUSES as S, buildConveyancerCoordinationContract } from '../../../core/transactions/conveyancerCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  buildConveyancerThreeRoleDependencyModel,
  getConveyancerThreeRoleDependency,
} from '../../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import { buildConveyancerGuaranteeWorkspace } from '../conveyancerGuaranteeWorkspace.js'
import {
  CONVEYANCER_SIMULTANEOUS_LODGEMENT_READINESS_VERSION,
  buildConveyancerLodgementReadinessAttestation,
  buildConveyancerSimultaneousLodgementReadiness,
  getConveyancerLodgementRequiredChecks,
  validateConveyancerLodgementReadinessAttestation,
  validateConveyancerSimultaneousLodgementReadiness,
} from '../conveyancerSimultaneousLodgementReadiness.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const generatedAt = '2026-07-15T08:00:00.000Z'
const asOf = '2026-07-15T17:00:00.000Z'
const plannedAt = '2026-08-01T08:00:00.000Z'
const system = { role: R.system, userId: 'lodgement-engine-e5' }
const transfer = { role: R.transferAttorney, userId: 'transfer-e5' }
const bond = { role: R.bondAttorney, userId: 'bond-e5' }
const cancellation = { role: R.cancellationAttorney, userId: 'cancellation-e5' }
const bindings = { transfer: { firmId: 'firm:transfer', owner: transfer }, bond: { firmId: 'firm:bond', owner: bond }, cancellation: { firmId: 'firm:cancellation', owner: cancellation } }
const viewers = { transfer: { ...transfer, firmId: 'firm:transfer' }, bond: { ...bond, firmId: 'firm:bond' }, cancellation: { ...cancellation, firmId: 'firm:cancellation' } }
const hash = (character) => character.repeat(64)

function model(financeType = 'hybrid', sellerHasExistingBond = true, propertyTenure = 'freehold') {
  const result = buildConveyancerThreeRoleDependencyModel({
    plan: { planId: 'plan:e5', planVersion: 1 },
    transaction: { id: 'transaction:e5', organisation_id: 'organisation:e5', transaction_type: 'resale', property_tenure: propertyTenure, finance_type: financeType, seller_has_existing_bond: sellerHasExistingBond, buyer_entity_type: 'individual', seller_entity_type: 'individual' },
    roleBindings: bindings, generatedAt, generatedBy: system,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.model
}

const referenceByEvidenceKey = {
  guarantee_document: ['document:purchase-guarantee', 'document:cancellation-guarantee'],
  cancellation_figures_document: ['document:cancellation-figures'], figures_expiry: ['data:cancellation-expiry'],
  cancellation_guarantee_document: ['document:routed-cancellation-guarantee'],
  bond_lodgement_ready: ['readiness:bond'], cancellation_lodgement_ready: ['readiness:cancellation'],
}

function accepted(modelValue, dependencyKey) {
  const base = getConveyancerThreeRoleDependency(modelValue, dependencyKey).coordination
  const evidence = base.evidenceRequirements.flatMap((requirement) => (referenceByEvidenceKey[requirement.key] || [`${dependencyKey}:${requirement.key}`]).map((referenceId) => ({ requirementKey: requirement.key, status: requirement.requiresApproval ? MATTER_PLAN_EVIDENCE_STATUSES.approved : MATTER_PLAN_EVIDENCE_STATUSES.provided, referenceId, capturedAt: '2026-07-15T13:00:00.000Z', capturedBy: base.source.owner })))
  const result = buildConveyancerCoordinationContract({
    ...base, status: S.accepted,
    requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: base.source.owner,
    acknowledgement: { acknowledgedAt: '2026-07-15T10:00:00.000Z', acknowledgedBy: base.target.owner, expectedAt: '2026-07-15T14:00:00.000Z' },
    submission: { submittedAt: '2026-07-15T13:00:00.000Z', submittedBy: base.target.owner, summary: `${dependencyKey} supplied.` },
    evidence, decision: { type: 'accepted', decidedAt: '2026-07-15T14:00:00.000Z', decidedBy: base.source.owner }, updatedAt: '2026-07-15T14:00:00.000Z',
  }, { actionKeys: Object.values(modelValue.actionKeyMap || {}) })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.coordination
}

function records(modelValue) {
  const keys = [K.bondGuaranteeIssued, K.transferGuaranteeWordingDecision, K.cancellationFigures, K.cancellationGuaranteeProvided, K.cancellationGuaranteeAcceptance, K.bondLodgementReadiness, K.cancellationLodgementReadiness]
  return modelValue.nodes.filter((node) => keys.includes(node.key)).map((node) => accepted(modelValue, node.key))
}

function requirement(id, type, ownerLane, amount, beneficiary, wording, sourceReferenceId) {
  return { requirementId: id, requirementType: type, ownerLane, amount, currency: 'ZAR', beneficiaryReferenceHash: hash(beneficiary), wordingHash: hash(wording), sourceReferenceId, sourceEvidenceHash: hash('e'), effectiveAt: '2026-07-15T11:00:00.000Z', ...(type === 'cancellation_settlement' ? { expiresAt: '2026-08-15T00:00:00.000Z' } : {}) }
}
function instrument(id, amount, beneficiary, wording, documentReferenceId, documentHash) {
  return { instrumentId: id, instrumentType: 'bank_guarantee', issuerLane: 'bond', issuerFirmId: 'firm:bond', amount, currency: 'ZAR', beneficiaryReferenceHash: hash(beneficiary), wordingHash: hash(wording), documentReferenceId, documentHash: hash(documentHash), issuedAt: '2026-07-15T12:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z' }
}
function allocation(id, requirementId, instrumentId, amount, routedDocumentReferenceId = null) { return { allocationId: id, requirementId, instrumentId, amount, routedDocumentReferenceId, allocatedAt: '2026-07-15T15:00:00.000Z', allocatedByLane: 'transfer' } }

function guaranteeInput(modelValue, viewer) {
  if (!modelValue.requiredLanes.includes('bond') && !modelValue.requiredLanes.includes('cancellation')) return { dependencyModel: modelValue, viewer, asOf }
  const requirements = []; const instruments = []; const allocations = []
  if (modelValue.requiredLanes.includes('bond')) {
    requirements.push(requirement('requirement:purchase', 'purchase_price', 'transfer', '700000.00', 'a', 'c', 'agreement:otp'))
    instruments.push(instrument('instrument:purchase', '700000.00', 'a', 'c', 'document:purchase-guarantee', '1'))
    allocations.push(allocation('allocation:purchase', 'requirement:purchase', 'instrument:purchase', '700000.00'))
  }
  if (modelValue.requiredLanes.includes('cancellation')) {
    requirements.push(requirement('requirement:cancellation', 'cancellation_settlement', 'cancellation', '300000.00', 'b', 'd', 'document:cancellation-figures'))
    if (modelValue.requiredLanes.includes('bond')) instruments.push(instrument('instrument:cancellation', '300000.00', 'b', 'd', 'document:cancellation-guarantee', '2'))
    else instruments.push({ ...instrument('instrument:cancellation', '300000.00', 'b', 'd', 'document:cancellation-guarantee', '2'), instrumentType: 'cash_undertaking', issuerLane: 'transfer', issuerFirmId: 'firm:transfer' })
    allocations.push(allocation('allocation:cancellation', 'requirement:cancellation', 'instrument:cancellation', '300000.00', 'document:routed-cancellation-guarantee'))
  }
  return { dependencyModel: modelValue, coordinationRecords: records(modelValue), requirements, instruments, allocations, viewer, asOf, expectedLodgementAt: plannedAt }
}

function guaranteeWorkspace(modelValue, viewer = viewers.transfer) {
  const result = buildConveyancerGuaranteeWorkspace(guaranteeInput(modelValue, viewer))
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.workspace.applicable ? result.workspace.ready : result.workspace.health === 'not_applicable', true)
  return result.workspace
}

function attestation(modelValue, lane, overrides = {}) {
  const checks = getConveyancerLodgementRequiredChecks(modelValue, lane).map((definition) => ({ key: definition.key, status: 'satisfied', referenceId: `evidence:${lane}:${definition.key}`, evidenceHash: hash(lane === 'transfer' ? '3' : lane === 'bond' ? '4' : '5'), verifiedAt: '2026-07-15T12:00:00.000Z', ...(definition.expiring ? { validUntil: '2026-09-01T00:00:00.000Z' } : {}) }))
  const input = { dependencyModel: modelValue, attestationId: `attestation:${lane}`, lane, firmId: bindings[lane].firmId, status: 'ready', readinessReferenceId: `readiness:${lane}`, checks, attestedAt: '2026-07-15T15:00:00.000Z', attestedBy: viewers[lane], ...overrides }
  const result = buildConveyancerLodgementReadinessAttestation(input)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.attestation
}

function build(modelValue, viewer = viewers.transfer, overrides = {}) {
  return buildConveyancerSimultaneousLodgementReadiness({ dependencyModel: modelValue, coordinationRecords: records(modelValue), guaranteeWorkspace: guaranteeWorkspace(modelValue, viewer), attestations: modelValue.requiredLanes.map((lane) => attestation(modelValue, lane)), viewer, asOf, plannedLodgementAt: plannedAt, ...overrides })
}

test('builds lane-owned attestations with deterministic mandatory checks', () => {
  const modelValue = model('bond', false)
  const result = attestation(modelValue, 'bond')
  assert.deepEqual(result.checks.map((item) => item.key), ['bank_approval_to_lodge', 'lodgement_pack_complete', 'signed_pack_accepted'])
  assert.equal(result.firmId, 'firm:bond')
  assert.equal(Object.isFrozen(result), true)
})

test('makes a transfer-only cash matter jointly ready without inventing other lanes', () => {
  const modelValue = model('cash', false)
  const result = build(modelValue)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.readiness.version, CONVEYANCER_SIMULTANEOUS_LODGEMENT_READINESS_VERSION)
  assert.equal(result.readiness.jointReady, true)
  assert.deepEqual(result.readiness.lanes.map((item) => item.lane), ['transfer'])
  assert.equal(result.readiness.guaranteeSatisfied, true)
})

test('requires exact E1 evidence binding before a bond matter is jointly ready', () => {
  const modelValue = model('bond', false)
  const result = build(modelValue)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.readiness.jointReady, true)
  assert.equal(result.readiness.lanes.find((item) => item.lane === 'bond').coordinationEvidenceBound, true)
})

test('gives all three firms the same hybrid joint decision with viewer-relative responsibility', () => {
  const modelValue = model()
  for (const viewer of Object.values(viewers)) {
    const result = build(modelValue, viewer)
    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal(result.readiness.jointReady, true)
    assert.equal(result.readiness.lanes.length, 3)
    assert.equal(result.readiness.viewerResponsibilities.length, 0)
  }
})

test('keeps joint readiness waiting when one lane has not attested', () => {
  const modelValue = model()
  const supplied = ['transfer', 'bond'].map((lane) => attestation(modelValue, lane))
  const result = build(modelValue, viewers.transfer, { attestations: supplied })
  assert.equal(result.readiness.jointReady, false)
  assert.equal(result.readiness.health, 'waiting')
  assert.equal(result.readiness.issues.some((item) => item.code === 'lodgement_attestation_missing' && item.ownerLane === 'cancellation'), true)
})

test('blocks expired evidence but keeps a validity-buffer warning advisory', () => {
  const modelValue = model('cash', false)
  const baseChecks = getConveyancerLodgementRequiredChecks(modelValue, 'transfer').map((definition) => ({ key: definition.key, status: 'satisfied', referenceId: `evidence:${definition.key}`, evidenceHash: hash('6'), verifiedAt: '2026-07-15T12:00:00.000Z', ...(definition.expiring ? { validUntil: '2026-07-31T00:00:00.000Z' } : {}) }))
  const expiredAttestation = attestation(modelValue, 'transfer', { checks: baseChecks })
  const expired = build(modelValue, viewers.transfer, { attestations: [expiredAttestation] }).readiness
  assert.equal(expired.health, 'blocked')
  assert.equal(expired.issues.some((item) => item.code === 'lodgement_evidence_expires_before_lodgement'), true)
  const riskChecks = baseChecks.map((item) => item.validUntil ? { ...item, validUntil: '2026-08-02T00:00:00.000Z' } : item)
  const riskAttestation = attestation(modelValue, 'transfer', { checks: riskChecks })
  const risk = build(modelValue, viewers.transfer, { attestations: [riskAttestation], minimumValidityHours: 24 }).readiness
  assert.equal(risk.jointReady, true)
  assert.equal(risk.risks.some((item) => item.code === 'lodgement_evidence_validity_buffer_risk'), true)
})

test('does not treat a local attestation as accepted while the E1 handoff is pending', () => {
  const modelValue = model('bond', false)
  const acceptedRecords = records(modelValue).filter((record) => record.coordinationId !== getConveyancerThreeRoleDependency(modelValue, K.bondLodgementReadiness).coordination.coordinationId)
  const result = build(modelValue, viewers.bond, { coordinationRecords: acceptedRecords })
  assert.equal(result.readiness.jointReady, false)
  assert.equal(result.readiness.health, 'waiting')
  assert.equal(result.readiness.issues.some((item) => item.code === 'lodgement_coordination_pending' && item.ownerLane === 'transfer'), true)
})

test('requires sectional-title levy clearance and rejects wrong-lane attestors', () => {
  const modelValue = model('cash', false, 'sectional_title')
  assert.equal(getConveyancerLodgementRequiredChecks(modelValue, 'transfer').some((item) => item.key === 'levy_clearance'), true)
  const valid = attestation(modelValue, 'transfer')
  const missingLevy = structuredClone(valid); missingLevy.checks = missingLevy.checks.filter((item) => item.key !== 'levy_clearance'); missingLevy.fingerprint = valid.fingerprint
  assert.equal(validateConveyancerLodgementReadinessAttestation(missingLevy, { dependencyModel: modelValue }).errors.includes('lodgement_attestation_check_coverage_invalid'), true)
  const wrongActor = buildConveyancerLodgementReadinessAttestation({ dependencyModel: modelValue, attestationId: 'wrong', lane: 'transfer', firmId: 'firm:transfer', status: 'ready', readinessReferenceId: 'wrong', checks: valid.checks, attestedAt: '2026-07-15T15:00:00.000Z', attestedBy: bond })
  assert.equal(wrongActor.errors.includes('lodgement_attestation_authority_invalid'), true)
})

test('rejects stale guarantee projections, outsiders and invalid lodgement windows', () => {
  const modelValue = model()
  const staleGuarantee = guaranteeWorkspace(modelValue); const stale = structuredClone(staleGuarantee); stale.asOf = '2026-07-15T16:00:00.000Z'
  assert.equal(build(modelValue, viewers.transfer, { guaranteeWorkspace: stale }).code, 'simultaneous_lodgement_guarantee_workspace_invalid')
  const outsider = buildConveyancerSimultaneousLodgementReadiness({ dependencyModel: modelValue, guaranteeWorkspace: staleGuarantee, viewer: { ...viewers.transfer, firmId: 'firm:other' }, asOf, plannedLodgementAt: plannedAt })
  assert.equal(outsider.code, 'simultaneous_lodgement_access_denied')
  assert.equal(build(modelValue, viewers.transfer, { plannedLodgementAt: asOf }).code, 'simultaneous_lodgement_projection_invalid')
})

test('detects readiness tampering and forbids execution side effects', () => {
  const modelValue = model()
  const guarantee = guaranteeWorkspace(modelValue)
  const readiness = buildConveyancerSimultaneousLodgementReadiness({ dependencyModel: modelValue, coordinationRecords: records(modelValue), guaranteeWorkspace: guarantee, attestations: modelValue.requiredLanes.map((lane) => attestation(modelValue, lane)), viewer: viewers.transfer, asOf, plannedLodgementAt: plannedAt }).readiness
  const tampered = structuredClone(readiness); tampered.lanes[0].locallyReady = false
  assert.equal(validateConveyancerSimultaneousLodgementReadiness(tampered, { dependencyModel: modelValue, guaranteeWorkspace: guarantee }).errors.includes('simultaneous_lodgement_fingerprint_invalid'), true)
  const unsafe = structuredClone(readiness); unsafe.controls.deedsSubmissionPerformed = true
  assert.equal(validateConveyancerSimultaneousLodgementReadiness(unsafe, { dependencyModel: modelValue, guaranteeWorkspace: guarantee }).errors.includes('simultaneous_lodgement_side_effect_boundary_violated'), true)
})
