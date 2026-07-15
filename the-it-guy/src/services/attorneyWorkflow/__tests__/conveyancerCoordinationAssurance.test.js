import assert from 'node:assert/strict'
import { MATTER_PLAN_EVIDENCE_STATUSES, MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { CONVEYANCER_COORDINATION_STATUSES as S, buildConveyancerCoordinationContract } from '../../../core/transactions/conveyancerCoordinationContract.js'
import { LEGAL_ROLE_COORDINATION_ACTORS, LEGAL_ROLE_COORDINATION_STATES } from '../../../core/transactions/legalRoleCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  buildConveyancerThreeRoleDependencyModel,
  getConveyancerThreeRoleDependency,
} from '../../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import {
  CONVEYANCER_COORDINATION_ASSURANCE_VERSION,
  assureConveyancerCoordinationEvidence,
  buildConveyancerCoordinationPilotManifest,
  evaluateConveyancerCoordinationPilot,
  serializeConveyancerCoordinationAssuranceEvidence,
} from '../conveyancerCoordinationAssurance.js'
import { buildConveyancerAttorneyReplacementRequest, buildConveyancerCoordinationEscalation, confirmConveyancerAttorneyReplacement } from '../conveyancerCoordinationEscalationReplacement.js'
import { buildConveyancerGuaranteeWorkspace } from '../conveyancerGuaranteeWorkspace.js'
import { buildConveyancerLodgementReadinessAttestation, buildConveyancerSimultaneousLodgementReadiness, getConveyancerLodgementRequiredChecks } from '../conveyancerSimultaneousLodgementReadiness.js'
import { buildConveyancerSharedProfessionalTimeline } from '../conveyancerSharedProfessionalTimeline.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const generatedAt = '2026-07-15T08:00:00.000Z'; const asOf = '2026-07-15T17:00:00.000Z'; const plannedAt = '2026-08-01T08:00:00.000Z'
const system = { role: R.system, userId: 'assurance-engine-e7' }; const transfer = { role: R.transferAttorney, userId: 'transfer-e7' }; const bond = { role: R.bondAttorney, userId: 'bond-e7' }; const cancellation = { role: R.cancellationAttorney, userId: 'cancellation-e7' }
const bindings = { transfer: { firmId: 'firm:transfer', owner: transfer }, bond: { firmId: 'firm:bond', owner: bond }, cancellation: { firmId: 'firm:cancellation', owner: cancellation } }
const viewers = { transfer: { ...transfer, firmId: 'firm:transfer' }, bond: { ...bond, firmId: 'firm:bond' }, cancellation: { ...cancellation, firmId: 'firm:cancellation' } }
const hash = (value) => value.repeat(64)

function model(financeType = 'bond', sellerHasExistingBond = false) {
  const result = buildConveyancerThreeRoleDependencyModel({ plan: { planId: 'plan:e7', planVersion: 1 }, transaction: { id: 'transaction:e7', organisation_id: 'organisation:e7', transaction_type: 'resale', property_tenure: 'freehold', finance_type: financeType, seller_has_existing_bond: sellerHasExistingBond, buyer_entity_type: 'individual', seller_entity_type: 'individual' }, roleBindings: bindings, generatedAt, generatedBy: system })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.model
}

const refs = { guarantee_document: ['document:purchase-guarantee', 'document:cancellation-guarantee'], bond_lodgement_ready: ['readiness:bond'], cancellation_figures_document: ['document:cancellation-figures'], figures_expiry: ['data:cancellation-expiry'], cancellation_guarantee_document: ['document:routed-cancellation-guarantee'], cancellation_lodgement_ready: ['readiness:cancellation'] }

function accepted(modelValue, dependencyKey) {
  const base = getConveyancerThreeRoleDependency(modelValue, dependencyKey).coordination
  const evidence = base.evidenceRequirements.flatMap((requirement) => (refs[requirement.key] || [`${dependencyKey}:${requirement.key}`]).map((referenceId) => ({ requirementKey: requirement.key, status: requirement.requiresApproval ? MATTER_PLAN_EVIDENCE_STATUSES.approved : MATTER_PLAN_EVIDENCE_STATUSES.provided, referenceId, capturedAt: '2026-07-15T13:00:00.000Z', capturedBy: base.source.owner })))
  const result = buildConveyancerCoordinationContract({ ...base, status: S.accepted, requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: base.source.owner, acknowledgement: { acknowledgedAt: '2026-07-15T10:00:00.000Z', acknowledgedBy: base.target.owner, expectedAt: '2026-07-15T14:00:00.000Z' }, submission: { submittedAt: '2026-07-15T13:00:00.000Z', submittedBy: base.target.owner, summary: `${dependencyKey} supplied.` }, evidence, decision: { type: 'accepted', decidedAt: '2026-07-15T14:00:00.000Z', decidedBy: base.source.owner }, updatedAt: '2026-07-15T14:00:00.000Z' }, { actionKeys: Object.values(modelValue.actionKeyMap || {}) })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.coordination
}

function requested(modelValue, dependencyKey = K.bondGuaranteeIssued) {
  const base = getConveyancerThreeRoleDependency(modelValue, dependencyKey).coordination
  const result = buildConveyancerCoordinationContract({ ...base, status: S.requested, requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: base.source.owner, updatedAt: '2026-07-15T09:00:00.000Z' }, { actionKeys: Object.values(modelValue.actionKeyMap || {}) })
  assert.equal(result.ok, true); return result.coordination
}

function currentRecords(modelValue, guaranteeRecord = null) {
  const keys = [K.bondGuaranteeIssued, K.transferGuaranteeWordingDecision, K.bondLodgementReadiness, K.cancellationFigures, K.cancellationGuaranteeProvided, K.cancellationGuaranteeAcceptance, K.cancellationLodgementReadiness]
  return modelValue.nodes.filter((node) => keys.includes(node.key)).map((node) => node.key === K.bondGuaranteeIssued && guaranteeRecord ? guaranteeRecord : accepted(modelValue, node.key))
}
function roleStates(modelValue) { return Object.fromEntries(modelValue.requiredLanes.map((lane) => [lane, { state: 'active', firmId: bindings[lane].firmId, updatedAt: generatedAt }])) }
function milestones(modelValue) { return [...new Set(modelValue.nodes.flatMap((node) => node.prerequisiteMilestones))].map((milestoneKey) => ({ key: milestoneKey, status: 'completed', occurredAt: generatedAt, referenceId: `milestone:${milestoneKey}` })) }
function attestation(modelValue, lane) {
  const checks = getConveyancerLodgementRequiredChecks(modelValue, lane).map((definition) => ({ key: definition.key, status: 'satisfied', referenceId: `evidence:${lane}:${definition.key}`, evidenceHash: hash(lane === 'transfer' ? '3' : lane === 'bond' ? '4' : '5'), verifiedAt: '2026-07-15T12:00:00.000Z', ...(definition.expiring ? { validUntil: '2026-09-01T00:00:00.000Z' } : {}) }))
  const result = buildConveyancerLodgementReadinessAttestation({ dependencyModel: modelValue, attestationId: `attestation:${lane}`, lane, firmId: bindings[lane].firmId, status: 'ready', readinessReferenceId: `readiness:${lane}`, checks, attestedAt: '2026-07-15T15:00:00.000Z', attestedBy: viewers[lane] })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.attestation
}

function fixture(financeType = 'bond', sellerHasExistingBond = false, viewer = viewers.transfer, guaranteeRecord = null, suppliedAttestations = null) {
  const dependencyModel = model(financeType, sellerHasExistingBond); const coordinationRecords = currentRecords(dependencyModel, guaranteeRecord)
  const timelineResult = buildConveyancerSharedProfessionalTimeline({ dependencyModel, coordinationRecords, milestoneEvidence: milestones(dependencyModel), roleStates: roleStates(dependencyModel), viewer, asOf }); assert.equal(timelineResult.ok, true, JSON.stringify(timelineResult.errors))
  const requirements = []; const instruments = []; const allocations = []
  if (dependencyModel.requiredLanes.includes('bond')) {
    requirements.push({ requirementId: 'requirement:purchase', requirementType: 'purchase_price', ownerLane: 'transfer', amount: '700000.00', currency: 'ZAR', beneficiaryReferenceHash: hash('a'), wordingHash: hash('c'), sourceReferenceId: 'agreement:otp', sourceEvidenceHash: hash('e'), effectiveAt: '2026-07-15T11:00:00.000Z' })
    instruments.push({ instrumentId: 'instrument:purchase', instrumentType: 'bank_guarantee', issuerLane: 'bond', issuerFirmId: 'firm:bond', amount: '700000.00', currency: 'ZAR', beneficiaryReferenceHash: hash('a'), wordingHash: hash('c'), documentReferenceId: 'document:purchase-guarantee', documentHash: hash('1'), issuedAt: '2026-07-15T12:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z' })
    allocations.push({ allocationId: 'allocation:purchase', requirementId: 'requirement:purchase', instrumentId: 'instrument:purchase', amount: '700000.00', allocatedAt: '2026-07-15T15:00:00.000Z', allocatedByLane: 'transfer' })
  }
  if (dependencyModel.requiredLanes.includes('cancellation')) {
    requirements.push({ requirementId: 'requirement:cancellation', requirementType: 'cancellation_settlement', ownerLane: 'cancellation', amount: '300000.00', currency: 'ZAR', beneficiaryReferenceHash: hash('b'), wordingHash: hash('d'), sourceReferenceId: 'document:cancellation-figures', sourceEvidenceHash: hash('e'), effectiveAt: '2026-07-15T11:00:00.000Z', expiresAt: '2026-08-15T00:00:00.000Z' })
    const bank = dependencyModel.requiredLanes.includes('bond'); instruments.push({ instrumentId: 'instrument:cancellation', instrumentType: bank ? 'bank_guarantee' : 'cash_undertaking', issuerLane: bank ? 'bond' : 'transfer', issuerFirmId: bank ? 'firm:bond' : 'firm:transfer', amount: '300000.00', currency: 'ZAR', beneficiaryReferenceHash: hash('b'), wordingHash: hash('d'), documentReferenceId: 'document:cancellation-guarantee', documentHash: hash('2'), issuedAt: '2026-07-15T12:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z' })
    allocations.push({ allocationId: 'allocation:cancellation', requirementId: 'requirement:cancellation', instrumentId: 'instrument:cancellation', amount: '300000.00', routedDocumentReferenceId: 'document:routed-cancellation-guarantee', allocatedAt: '2026-07-15T15:00:00.000Z', allocatedByLane: 'transfer' })
  }
  const guaranteeResult = buildConveyancerGuaranteeWorkspace({ dependencyModel, coordinationRecords, requirements, instruments, allocations, viewer, asOf, ...(requirements.length ? { expectedLodgementAt: plannedAt } : {}) }); assert.equal(guaranteeResult.ok, true, JSON.stringify(guaranteeResult.errors))
  const attestations = suppliedAttestations || dependencyModel.requiredLanes.map((lane) => attestation(dependencyModel, lane))
  const readinessResult = buildConveyancerSimultaneousLodgementReadiness({ dependencyModel, coordinationRecords, guaranteeWorkspace: guaranteeResult.workspace, attestations, viewer, asOf, plannedLodgementAt: plannedAt }); assert.equal(readinessResult.ok, true, JSON.stringify(readinessResult.errors))
  return { dependencyModel, coordinationRecords, timeline: timelineResult.timeline, guaranteeWorkspace: guaranteeResult.workspace, lodgementReadiness: readinessResult.readiness, attestations, viewer, asOf }
}
function assure(value, overrides = {}) { return assureConveyancerCoordinationEvidence({ ...value, escalations: [], replacements: [], ...overrides }) }

test('certifies a complete transfer-only cash coordination chain', () => {
  const result = assure(fixture('cash', false))
  assert.equal(result.version, CONVEYANCER_COORDINATION_ASSURANCE_VERSION)
  assert.equal(result.decision, 'ready')
  assert.deepEqual(result.phaseStatus, { E1: true, E2: true, E3: true, E4: true, E5: true, E6: true })
  assert.equal(result.controls.readOnly, true)
})

test('certifies exact E1-E5 bindings for a bond matter', () => {
  const result = assure(fixture())
  assert.equal(result.decision, 'ready', JSON.stringify(result.findings))
  assert.equal(result.counts.coordinationRecords, 5)
  assert.equal(result.counts.lodgementLanes, 2)
  assert.equal(Object.isFrozen(result), true)
})

test('certifies cancellation-only and full three-firm hybrid scenarios', () => {
  const cancellationOnly = assure(fixture('cash', true))
  const hybrid = assure(fixture('hybrid', true))
  assert.equal(cancellationOnly.decision, 'ready', JSON.stringify(cancellationOnly.findings))
  assert.equal(hybrid.decision, 'ready', JSON.stringify(hybrid.findings))
  assert.equal(hybrid.counts.lodgementLanes, 3)
})

test('blocks a stale E3 projection after E1 runtime state changes', () => {
  const clean = fixture(); const staleTimeline = fixture('bond', false, viewers.transfer, requested(clean.dependencyModel)).timeline
  const result = assure(clean, { timeline: staleTimeline })
  assert.equal(result.decision, 'blocked')
  assert.equal(result.findings.some((item) => item.code === 'e3_current_record_binding_invalid'), true)
})

test('blocks guarantee tampering and treats valid incomplete lodgement as observation', () => {
  const clean = fixture(); const tampered = structuredClone(clean.guaranteeWorkspace); tampered.totals.requiredMinor += 1
  assert.equal(assure(clean, { guaranteeWorkspace: tampered }).decision, 'blocked')
  const dependencyModel = model('cash', false); const partial = fixture('cash', false, viewers.transfer, null, [])
  assert.equal(partial.dependencyModel.modelId, dependencyModel.modelId)
  const observed = assure(partial)
  assert.equal(observed.decision, 'observe')
  assert.equal(observed.findings.some((item) => item.code === 'e5_joint_lodgement_not_ready'), true)
})

test('requires exact source attestation binding for every E5 certificate', () => {
  const clean = fixture(); const missing = assure(clean, { attestations: clean.attestations.slice(0, 1) })
  assert.equal(missing.decision, 'blocked')
  assert.equal(missing.findings.some((item) => item.code === 'e5_attestation_binding_invalid'), true)
})

test('validates E6 escalation audit continuity and reports open recovery work', () => {
  const dependencyModel = model(); const overdue = requested(dependencyModel); const value = fixture('bond', false, viewers.transfer, overdue)
  const escalation = buildConveyancerCoordinationEscalation({ dependencyModel: value.dependencyModel, coordinationRecords: value.coordinationRecords, target: { targetType: 'coordination', targetId: overdue.coordinationId }, reason: 'Guarantee acknowledgement overdue.', evidenceReferenceId: 'timeline:e7:overdue', commandId: 'raise:e7', occurredAt: asOf, raisedBy: viewers.transfer }).escalation
  const observed = assure(value, { escalations: [escalation] })
  assert.equal(observed.decision, 'observe')
  assert.equal(observed.findings.some((item) => item.code === 'e6_escalation_open'), true)
  const tampered = structuredClone(escalation); tampered.events.push({ ...tampered.events[0], eventId: 'duplicate' }); tampered.fingerprint = escalation.fingerprint
  assert.equal(assure(value, { escalations: [tampered] }).decision, 'blocked')
})

test('observes authority-correct replacement and blocks forged appointment evidence', () => {
  const value = fixture(); const request = buildConveyancerAttorneyReplacementRequest({ dependencyModel: value.dependencyModel, lane: 'bond', legalRoleState: LEGAL_ROLE_COORDINATION_STATES.declined, reason: 'Appointed firm declined.', trigger: 'declined', evidenceReferenceId: 'appointment:e7:decline', commandId: 'replacement:e7', requestedAt: '2026-07-15T15:00:00.000Z', requestedBy: viewers.transfer }).replacement
  const confirmed = confirmConveyancerAttorneyReplacement({ dependencyModel: value.dependencyModel, replacement: request, appointment: { firmId: 'firm:new-bond', evidenceReferenceId: 'bank:e7:appointment', evidenceHash: hash('7') }, commandId: 'confirm:e7', confirmedAt: '2026-07-15T16:00:00.000Z', confirmedBy: { actorRole: LEGAL_ROLE_COORDINATION_ACTORS.newLendingBank, actorId: 'bank:e7' } }).replacement
  const observed = assure(value, { replacements: [confirmed] })
  assert.equal(observed.decision, 'observe')
  assert.equal(observed.findings.some((item) => item.code === 'e6_dependency_regeneration_required'), true)
  const forged = structuredClone(confirmed); forged.appointment.appointedBy.actorRole = LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney
  assert.equal(assure(value, { replacements: [forged] }).decision, 'blocked')
})

test('fails closed on viewer-firm mismatch and strict pilot thresholds', () => {
  const value = fixture(); const denied = assure(value, { viewer: { ...viewers.transfer, firmId: 'firm:other' } })
  assert.equal(denied.decision, 'blocked')
  assert.equal(denied.findings.some((item) => item.code === 'e7_viewer_access_invalid'), true)
  const ready = assure(value); const pilot = evaluateConveyancerCoordinationPilot({ scenarios: [{ scenarioId: 'cash', assurance: ready }, { scenarioId: 'bad', assurance: denied }], operationalMetrics: {} })
  assert.equal(pilot.decision, 'hold')
  assert.equal(evaluateConveyancerCoordinationPilot({ scenarios: [{ scenarioId: 'cash', assurance: ready }], operationalMetrics: { openEscalationRate: 0.15 } }).decision, 'observe')
  assert.equal(evaluateConveyancerCoordinationPilot({ scenarios: [{ scenarioId: 'cash', assurance: ready }], operationalMetrics: {}, thresholds: { maximumContractFailures: 10 } }).thresholds.maximumContractFailures, 0)
})

test('builds a guarded pilot manifest and serializes redacted assurance evidence', () => {
  const value = fixture(); const assurance = assure(value)
  const manifest = buildConveyancerCoordinationPilotManifest({ firmIds: ['firm:transfer', 'firm:bond', 'firm:extra', 'firm:ignored'], lanes: ['transfer', 'bond'], maximumMatters: 100, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-15T00:00:00.000Z', owners: { assurance: 'a', legal: 'l', operations: 'o', support: 's', rollback: 'r' } })
  assert.equal(manifest.valid, true)
  assert.equal(manifest.scope.firmIds.length, 3)
  assert.equal(manifest.scope.maximumMatters, 25)
  assert.equal(manifest.controls.humanApprovalRequired, true)
  const serialized = serializeConveyancerCoordinationAssuranceEvidence({ assurance: { ...assurance, bankAccountNumber: 'SECRET', partyIdentity: 'SECRET' }, manifest })
  assert.equal(serialized.includes('SECRET'), false)
  assert.equal(serialized.includes('bankAccountNumber'), false)
})
