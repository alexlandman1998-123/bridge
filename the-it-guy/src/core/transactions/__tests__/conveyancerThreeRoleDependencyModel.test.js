import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  CONVEYANCER_THREE_ROLE_DEPENDENCY_LIBRARY,
  CONVEYANCER_THREE_ROLE_DEPENDENCY_MODEL_VERSION,
  buildConveyancerThreeRoleDependencyModel,
  getConveyancerThreeRoleDependency,
  summarizeConveyancerThreeRoleDependencyModel,
  validateConveyancerThreeRoleDependencyModel,
} from '../conveyancerThreeRoleDependencyModel.js'
import { validateConveyancerCoordination } from '../conveyancerCoordinationContract.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const generatedAt = '2026-07-15T08:00:00.000Z'
const system = { role: R.system, userId: 'dependency-engine-e2' }
const bindings = {
  transfer: { firmId: 'firm:transfer', owner: { role: R.transferAttorney, userId: 'transfer-e2' } },
  bond: { firmId: 'firm:bond', owner: { role: R.bondAttorney, userId: 'bond-e2' } },
  cancellation: { firmId: 'firm:cancellation', owner: { role: R.cancellationAttorney, userId: 'cancellation-e2' } },
}

function build(transaction, overrides = {}) {
  return buildConveyancerThreeRoleDependencyModel({
    plan: { planId: 'plan:e2', planVersion: 1 }, transaction: { id: 'transaction:e2', organisation_id: 'organisation:e2', transaction_type: 'resale', property_tenure: 'freehold', buyer_entity_type: 'individual', seller_entity_type: 'individual', ...transaction },
    roleBindings: bindings, generatedAt, generatedBy: system, ...overrides,
  })
}

test('keeps a cash matter transfer-only with no invented cross-lane work', () => {
  const result = build({ finance_type: 'cash', seller_has_existing_bond: false })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.model.version, CONVEYANCER_THREE_ROLE_DEPENDENCY_MODEL_VERSION)
  assert.match(result.model.sourceFactsFingerprint, /^fnv1a_[a-f0-9]{8}$/)
  assert.deepEqual(result.model.requiredLanes, ['transfer'])
  assert.equal(result.model.nodes.length, 0)
  assert.ok(result.warnings.includes('dependency_model_has_no_cross_lane_dependencies'))
})

test('builds the complete transfer and bond dependency chain', () => {
  const result = build({ finance_type: 'bond', seller_has_existing_bond: false })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.model.requiredLanes, ['transfer', 'bond'])
  assert.equal(result.model.nodes.length, 5)
  const issued = getConveyancerThreeRoleDependency(result.model, K.bondGuaranteeIssued)
  assert.equal(issued.sourceLane, 'transfer')
  assert.equal(issued.targetLane, 'bond')
  assert.equal(issued.coordination.priority, 'critical')
  assert.equal(validateConveyancerCoordination(issued.coordination).valid, true)
  const wording = getConveyancerThreeRoleDependency(result.model, K.transferGuaranteeWordingDecision)
  assert.deepEqual(wording.prerequisiteKeys, [K.bondGuaranteeIssued])
  assert.ok(result.model.topologicalOrder.indexOf(K.bondGuaranteeIssued) < result.model.topologicalOrder.indexOf(K.transferGuaranteeWordingDecision))
})

test('builds cancellation figures, guarantee, lodgement and registration dependencies', () => {
  const result = build({ finance_type: 'cash', seller_has_existing_bond: true })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.model.requiredLanes, ['transfer', 'cancellation'])
  assert.equal(result.model.nodes.length, 5)
  const figures = getConveyancerThreeRoleDependency(result.model, K.cancellationFigures)
  assert.equal(figures.coordination.deliverable.key, 'cancellation_figures')
  assert.equal(figures.coordination.evidenceRequirements.length, 2)
  const guarantee = getConveyancerThreeRoleDependency(result.model, K.cancellationGuaranteeProvided)
  assert.equal(guarantee.sourceLane, 'cancellation')
  assert.equal(guarantee.targetLane, 'transfer')
  assert.deepEqual(guarantee.prerequisiteKeys, [])
})

test('links the full three-role guarantee chain through transfer', () => {
  const result = build({ finance_type: 'hybrid', seller_has_existing_bond: true })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.model.requiredLanes, ['transfer', 'bond', 'cancellation'])
  assert.equal(result.model.nodes.length, 10)
  const cancellationGuarantee = getConveyancerThreeRoleDependency(result.model, K.cancellationGuaranteeProvided)
  assert.deepEqual(cancellationGuarantee.prerequisiteKeys, [K.bondGuaranteeIssued])
  assert.ok(cancellationGuarantee.coordination.dependencies.some((item) => item.key === `coordination_accepted:${K.bondGuaranteeIssued}`))
  assert.equal(result.model.nodes.some((node) => node.sourceLane === 'bond' && node.targetLane === 'cancellation'), false)
  assert.equal(result.model.nodes.some((node) => node.sourceLane === 'cancellation' && node.targetLane === 'bond'), false)
  assert.deepEqual(summarizeConveyancerThreeRoleDependencyModel(result.model), { requiredLaneCount: 3, dependencyCount: 10, criticalCount: 6, transferToBond: 4, bondToTransfer: 1, transferToCancellation: 4, cancellationToTransfer: 1 })
})

test('maps canonical milestones to A1 action keys without inventing mappings', () => {
  const result = build({ finance_type: 'bond', seller_has_existing_bond: false }, { actionKeyMap: { transfer_guarantees_accepted: 'review_guarantees', lodgement_ready: 'prepare_lodgement' } })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(getConveyancerThreeRoleDependency(result.model, K.bondGuaranteeIssued).coordination.requiredForActionKeys, ['review_guarantees'])
  assert.deepEqual(getConveyancerThreeRoleDependency(result.model, K.bondLodgementReadiness).coordination.requiredForActionKeys, ['prepare_lodgement'])
  assert.deepEqual(getConveyancerThreeRoleDependency(result.model, K.bondRegistrationConfirmation).coordination.requiredForActionKeys, [])
})

test('fails closed when required role firms or owners are unknown', () => {
  const missingBond = structuredClone(bindings); delete missingBond.bond
  const result = build({ finance_type: 'bond', seller_has_existing_bond: false }, { roleBindings: missingBond })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('dependency_role_binding_required:bond'))
  assert.ok(result.errors.some((error) => error.includes('target_firm_binding_required')))
})

test('fails closed when finance facts are incomplete', () => {
  const result = build({ seller_has_existing_bond: false })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith('dependency_model_facts_incomplete:')))
})

test('requires neutral system or firm-manager generation provenance', () => {
  const invalid = build({ finance_type: 'bond' }, { generatedBy: { role: R.secretary, userId: 'secretary-e2', lane: 'transfer' } })
  assert.ok(invalid.errors.includes('dependency_model_generation_provenance_invalid'))
  const manager = build({ finance_type: 'bond' }, { generatedBy: { role: R.firmManager, userId: 'manager-e2' } })
  assert.equal(manager.ok, true, JSON.stringify(manager.errors))
  const transfer = build({ finance_type: 'bond' }, { generatedBy: { role: R.transferAttorney, userId: 'transfer-generator-e2' } })
  assert.ok(transfer.errors.includes('dependency_model_generation_provenance_invalid'))
})

test('detects graph cycles and invalid prerequisite references', () => {
  const value = structuredClone(build({ finance_type: 'bond' }).model)
  getConveyancerThreeRoleDependency(value, K.bondGuaranteeIssued).prerequisiteKeys = [K.bondLodgementReadiness]
  const result = validateConveyancerThreeRoleDependencyModel(value)
  assert.ok(result.errors.some((error) => error.startsWith('cyclic_three_role_dependencies:')))
  const missing = structuredClone(build({ finance_type: 'bond' }).model)
  getConveyancerThreeRoleDependency(missing, K.bondGuaranteeIssued).prerequisiteKeys = ['unknown_dependency']
  assert.ok(validateConveyancerThreeRoleDependencyModel(missing).errors.includes(`dependency_prerequisite_invalid:${K.bondGuaranteeIssued}`))
})

test('detects lane, matter, definition and model tampering', () => {
  const lane = structuredClone(build({ finance_type: 'bond' }).model)
  getConveyancerThreeRoleDependency(lane, K.bondGuaranteeIssued).targetLane = 'cancellation'
  assert.ok(validateConveyancerThreeRoleDependencyModel(lane).errors.includes(`dependency_node_uses_non_required_lane:${K.bondGuaranteeIssued}`))
  const matter = structuredClone(build({ finance_type: 'bond' }).model)
  getConveyancerThreeRoleDependency(matter, K.bondGuaranteeIssued).coordination.transactionId = 'forged'
  assert.ok(validateConveyancerThreeRoleDependencyModel(matter).errors.includes(`dependency_coordination_matter_binding_invalid:${K.bondGuaranteeIssued}`))
  const definition = structuredClone(build({ finance_type: 'bond' }).model)
  getConveyancerThreeRoleDependency(definition, K.bondGuaranteeIssued).coordination.deliverable.label = 'Forged'
  assert.ok(validateConveyancerThreeRoleDependencyModel(definition).errors.includes(`${K.bondGuaranteeIssued}:coordination_definition_fingerprint_invalid`))
  const facts = structuredClone(build({ finance_type: 'bond' }).model); facts.sourceFacts.requiresBondAttorney = false
  assert.ok(validateConveyancerThreeRoleDependencyModel(facts).errors.includes('dependency_model_source_facts_invalid'))
  assert.ok(validateConveyancerThreeRoleDependencyModel(facts).errors.includes('dependency_model_fact_lane_mismatch'))
})

test('rejects side-effect claims and keeps the dependency library immutable', () => {
  const value = structuredClone(build({ finance_type: 'bond' }).model); value.notificationsSent = true
  assert.ok(validateConveyancerThreeRoleDependencyModel(value).errors.includes('dependency_model_side_effect_boundary_violated'))
  assert.equal(Object.isFrozen(CONVEYANCER_THREE_ROLE_DEPENDENCY_LIBRARY), true)
  assert.equal(Object.isFrozen(CONVEYANCER_THREE_ROLE_DEPENDENCY_LIBRARY[0].deliverable), true)
})

console.log('E2 three-role dependency model tests passed.')
