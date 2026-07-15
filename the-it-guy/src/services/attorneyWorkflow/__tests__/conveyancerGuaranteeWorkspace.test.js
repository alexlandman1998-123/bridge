import assert from 'node:assert/strict'
import { MATTER_PLAN_EVIDENCE_STATUSES, MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { CONVEYANCER_COORDINATION_STATUSES as S, buildConveyancerCoordinationContract } from '../../../core/transactions/conveyancerCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  buildConveyancerThreeRoleDependencyModel,
  getConveyancerThreeRoleDependency,
} from '../../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import {
  CONVEYANCER_GUARANTEE_WORKSPACE_VERSION,
  buildConveyancerGuaranteeWorkspace,
  validateConveyancerGuaranteeWorkspace,
} from '../conveyancerGuaranteeWorkspace.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const generatedAt = '2026-07-15T08:00:00.000Z'
const asOf = '2026-07-15T17:00:00.000Z'
const system = { role: R.system, userId: 'guarantee-engine-e4' }
const transfer = { role: R.transferAttorney, userId: 'transfer-e4' }
const bond = { role: R.bondAttorney, userId: 'bond-e4' }
const cancellation = { role: R.cancellationAttorney, userId: 'cancellation-e4' }
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
const hashes = { purchase: 'a'.repeat(64), cancellation: 'b'.repeat(64), wordingPurchase: 'c'.repeat(64), wordingCancellation: 'd'.repeat(64), source: 'e'.repeat(64), document1: '1'.repeat(64), document2: '2'.repeat(64) }

function model(financeType = 'hybrid', sellerHasExistingBond = true) {
  const result = buildConveyancerThreeRoleDependencyModel({
    plan: { planId: 'plan:e4', planVersion: 1 },
    transaction: { id: 'transaction:e4', organisation_id: 'organisation:e4', transaction_type: 'resale', property_tenure: 'freehold', finance_type: financeType, seller_has_existing_bond: sellerHasExistingBond, buyer_entity_type: 'individual', seller_entity_type: 'individual' },
    roleBindings: bindings, generatedAt, generatedBy: system,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.model
}

function accepted(modelValue, dependencyKey, references = []) {
  const base = getConveyancerThreeRoleDependency(modelValue, dependencyKey).coordination
  const source = base.source.owner; const target = base.target.owner
  const refs = references.length ? references : base.evidenceRequirements.map((item) => `${dependencyKey}:${item.key}`)
  const evidence = base.evidenceRequirements.flatMap((requirement, index) => {
    const requirementRefs = dependencyKey === K.bondGuaranteeIssued && requirement.key === 'guarantee_document' ? refs : [refs[index] || `${dependencyKey}:${requirement.key}`]
    return requirementRefs.map((referenceId) => ({ requirementKey: requirement.key, status: requirement.requiresApproval ? MATTER_PLAN_EVIDENCE_STATUSES.approved : MATTER_PLAN_EVIDENCE_STATUSES.provided, referenceId, capturedAt: '2026-07-15T13:00:00.000Z', capturedBy: source }))
  })
  const result = buildConveyancerCoordinationContract({
    ...base, status: S.accepted,
    requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: source,
    acknowledgement: { acknowledgedAt: '2026-07-15T10:00:00.000Z', acknowledgedBy: target, expectedAt: '2026-07-15T14:00:00.000Z' },
    submission: { submittedAt: '2026-07-15T13:00:00.000Z', submittedBy: target, summary: `${dependencyKey} supplied.` },
    evidence, decision: { type: 'accepted', decidedAt: '2026-07-15T14:00:00.000Z', decidedBy: source }, updatedAt: '2026-07-15T14:00:00.000Z',
  }, { actionKeys: Object.values(modelValue.actionKeyMap || {}) })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.coordination
}

function acceptedGuaranteeRecords(modelValue) {
  return modelValue.nodes.filter((node) => [K.bondGuaranteeIssued, K.transferGuaranteeWordingDecision, K.cancellationFigures, K.cancellationGuaranteeProvided, K.cancellationGuaranteeAcceptance].includes(node.key)).map((node) => {
    if (node.key === K.bondGuaranteeIssued) return accepted(modelValue, node.key, ['document:purchase-guarantee', 'document:cancellation-guarantee'])
    if (node.key === K.cancellationFigures) return accepted(modelValue, node.key, ['document:cancellation-figures', 'data:cancellation-expiry'])
    if (node.key === K.cancellationGuaranteeProvided) return accepted(modelValue, node.key, ['document:routed-cancellation-guarantee'])
    return accepted(modelValue, node.key)
  })
}

function purchaseRequirement(overrides = {}) {
  return { requirementId: 'requirement:purchase', requirementType: 'purchase_price', ownerLane: 'transfer', amount: '700000.00', currency: 'ZAR', beneficiaryReferenceHash: hashes.purchase, wordingHash: hashes.wordingPurchase, sourceReferenceId: 'agreement:otp', sourceEvidenceHash: hashes.source, effectiveAt: '2026-07-15T11:00:00.000Z', ...overrides }
}
function cancellationRequirement(overrides = {}) {
  return { requirementId: 'requirement:cancellation', requirementType: 'cancellation_settlement', ownerLane: 'cancellation', amount: '300000.00', currency: 'ZAR', beneficiaryReferenceHash: hashes.cancellation, wordingHash: hashes.wordingCancellation, sourceReferenceId: 'document:cancellation-figures', sourceEvidenceHash: hashes.source, effectiveAt: '2026-07-15T11:00:00.000Z', expiresAt: '2026-08-15T00:00:00.000Z', ...overrides }
}
function purchaseInstrument(overrides = {}) {
  return { instrumentId: 'instrument:purchase', instrumentType: 'bank_guarantee', issuerLane: 'bond', issuerFirmId: 'firm:bond', amount: '700000.00', currency: 'ZAR', beneficiaryReferenceHash: hashes.purchase, wordingHash: hashes.wordingPurchase, documentReferenceId: 'document:purchase-guarantee', documentHash: hashes.document1, issuedAt: '2026-07-15T12:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z', ...overrides }
}
function cancellationInstrument(overrides = {}) {
  return { instrumentId: 'instrument:cancellation', instrumentType: 'bank_guarantee', issuerLane: 'bond', issuerFirmId: 'firm:bond', amount: '300000.00', currency: 'ZAR', beneficiaryReferenceHash: hashes.cancellation, wordingHash: hashes.wordingCancellation, documentReferenceId: 'document:cancellation-guarantee', documentHash: hashes.document2, issuedAt: '2026-07-15T12:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z', ...overrides }
}
function allocation(id, requirementId, instrumentId, amount, overrides = {}) {
  return { allocationId: id, requirementId, instrumentId, amount, allocatedAt: '2026-07-15T15:00:00.000Z', allocatedByLane: 'transfer', ...overrides }
}
function hybridInput(modelValue, overrides = {}) {
  return {
    dependencyModel: modelValue, coordinationRecords: acceptedGuaranteeRecords(modelValue),
    requirements: [purchaseRequirement(), cancellationRequirement()], instruments: [purchaseInstrument(), cancellationInstrument()],
    allocations: [allocation('allocation:purchase', 'requirement:purchase', 'instrument:purchase', '700000.00'), allocation('allocation:cancellation', 'requirement:cancellation', 'instrument:cancellation', '300000.00', { routedDocumentReferenceId: 'document:routed-cancellation-guarantee' })],
    viewer: viewers.transfer, asOf, expectedLodgementAt: '2026-08-01T00:00:00.000Z', ...overrides,
  }
}

test('returns a frozen not-applicable workspace for a cash matter without cancellation', () => {
  const result = buildConveyancerGuaranteeWorkspace({ dependencyModel: model('cash', false), viewer: viewers.transfer, asOf })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.workspace.version, CONVEYANCER_GUARANTEE_WORKSPACE_VERSION)
  assert.equal(result.workspace.health, 'not_applicable')
  assert.equal(result.workspace.ready, false)
  assert.equal(Object.isFrozen(result.workspace), true)
})

test('reconciles a bond guarantee to an exact purchase-price requirement', () => {
  const modelValue = model('bond', false)
  const result = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, coordinationRecords: acceptedGuaranteeRecords(modelValue), requirements: [purchaseRequirement()], instruments: [purchaseInstrument()], allocations: [allocation('allocation:purchase', 'requirement:purchase', 'instrument:purchase', '700000.00')], viewer: viewers.transfer, asOf })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.workspace.health, 'ready')
  assert.equal(result.workspace.requirements[0].coverage, 'exact')
  assert.equal(result.workspace.instruments[0].evidenceBound, true)
  assert.equal(result.workspace.totals.formattedRequired, 'ZAR 700000.00')
})

test('gives all three verified firms one ready hybrid reconciliation with lane-relative responsibilities', () => {
  const modelValue = model()
  for (const viewer of Object.values(viewers)) {
    const result = buildConveyancerGuaranteeWorkspace(hybridInput(modelValue, { viewer }))
    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal(result.workspace.ready, true)
    assert.equal(result.workspace.viewerResponsibilities.length, 0)
    assert.equal(result.workspace.coordination.length, 5)
  }
})

test('supports a cash-funded cancellation undertaking without inventing a bond firm', () => {
  const modelValue = model('cash', true)
  const instrument = { ...cancellationInstrument(), instrumentType: 'cash_undertaking', issuerLane: 'transfer', issuerFirmId: 'firm:transfer' }
  const result = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, coordinationRecords: acceptedGuaranteeRecords(modelValue), requirements: [cancellationRequirement()], instruments: [instrument], allocations: [allocation('allocation:cancellation', 'requirement:cancellation', 'instrument:cancellation', '300000.00', { routedDocumentReferenceId: 'document:routed-cancellation-guarantee' })], viewer: viewers.cancellation, asOf })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.workspace.ready, true)
  assert.equal(result.workspace.instruments[0].issuerLane, 'transfer')
})

test('routes an under-allocation to transfer without granting a command', () => {
  const modelValue = model('bond', false)
  const result = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, coordinationRecords: acceptedGuaranteeRecords(modelValue), requirements: [purchaseRequirement()], instruments: [purchaseInstrument()], allocations: [allocation('allocation:purchase', 'requirement:purchase', 'instrument:purchase', '650000.00')], viewer: viewers.transfer, asOf })
  assert.equal(result.workspace.health, 'action_required')
  assert.equal(result.workspace.viewerResponsibilities.some((item) => item.code === 'guarantee_requirement_underallocated'), true)
  assert.equal(result.workspace.controls.commandsAvailable, false)
})

test('blocks wording mismatch and an instrument that expires before expected lodgement', () => {
  const modelValue = model('bond', false)
  const result = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, coordinationRecords: acceptedGuaranteeRecords(modelValue), requirements: [purchaseRequirement()], instruments: [purchaseInstrument({ wordingHash: hashes.wordingCancellation, expiresAt: '2026-07-20T00:00:00.000Z' })], allocations: [allocation('allocation:purchase', 'requirement:purchase', 'instrument:purchase', '700000.00')], viewer: viewers.bond, asOf, expectedLodgementAt: '2026-08-01T00:00:00.000Z' })
  assert.equal(result.workspace.health, 'blocked')
  assert.equal(result.workspace.issues.some((item) => item.code === 'guarantee_wording_mismatch'), true)
  assert.equal(result.workspace.issues.some((item) => item.code === 'guarantee_instrument_expires_before_lodgement'), true)
})

test('uses only the current instrument while preserving valid replacement lineage', () => {
  const modelValue = model('bond', false)
  const old = purchaseInstrument({ instrumentId: 'instrument:old', status: 'superseded', documentReferenceId: 'document:old', issuedAt: '2026-07-14T12:00:00.000Z' })
  const current = purchaseInstrument({ previousInstrumentId: 'instrument:old' })
  const result = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, coordinationRecords: acceptedGuaranteeRecords(modelValue), requirements: [purchaseRequirement()], instruments: [old, current], allocations: [allocation('allocation:purchase', 'requirement:purchase', 'instrument:purchase', '700000.00')], viewer: viewers.transfer, asOf })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.workspace.instruments.map((item) => item.instrumentId), ['instrument:purchase'])
})

test('rejects wrong-firm issuers, orphan allocations and future evidence', () => {
  const modelValue = model('bond', false)
  const wrongFirm = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, requirements: [purchaseRequirement()], instruments: [purchaseInstrument({ issuerFirmId: 'firm:intruder' })], allocations: [], viewer: viewers.transfer, asOf })
  assert.equal(wrongFirm.ok, false)
  assert.equal(wrongFirm.errors.some((item) => item.startsWith('guarantee_instrument_issuer_invalid')), true)
  const orphan = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, requirements: [purchaseRequirement()], instruments: [purchaseInstrument()], allocations: [allocation('allocation:orphan', 'requirement:missing', 'instrument:purchase', '1.00')], viewer: viewers.transfer, asOf })
  assert.equal(orphan.errors.some((item) => item.startsWith('guarantee_allocation_invalid')), true)
  const future = buildConveyancerGuaranteeWorkspace({ dependencyModel: modelValue, requirements: [purchaseRequirement({ effectiveAt: '2026-07-16T00:00:00.000Z' })], viewer: viewers.transfer, asOf })
  assert.equal(future.errors.some((item) => item.startsWith('guarantee_requirement_in_future')), true)
})

test('denies clients and professionals outside the bound matter firms', () => {
  const modelValue = model()
  assert.equal(buildConveyancerGuaranteeWorkspace(hybridInput(modelValue, { viewer: { role: R.client, userId: 'client-e4', firmId: 'firm:transfer', lane: 'transfer' } })).code, 'guarantee_workspace_access_denied')
  assert.equal(buildConveyancerGuaranteeWorkspace(hybridInput(modelValue, { viewer: { ...viewers.bond, firmId: 'firm:other' } })).code, 'guarantee_workspace_access_denied')
})

test('detects tampering and enforces the side-effect boundary', () => {
  const modelValue = model()
  const workspace = buildConveyancerGuaranteeWorkspace(hybridInput(modelValue)).workspace
  const tampered = structuredClone(workspace); tampered.requirements[0].amountMinor += 1
  assert.equal(validateConveyancerGuaranteeWorkspace(tampered, { dependencyModel: modelValue }).errors.includes('guarantee_workspace_fingerprint_invalid'), true)
  const unsafe = structuredClone(workspace); unsafe.controls.notificationsSent = true
  assert.equal(validateConveyancerGuaranteeWorkspace(unsafe, { dependencyModel: modelValue }).errors.includes('guarantee_workspace_side_effect_boundary_violated'), true)
})
