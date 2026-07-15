import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { CONVEYANCER_COORDINATION_STATUSES as S, buildConveyancerCoordinationContract } from '../../../core/transactions/conveyancerCoordinationContract.js'
import { LEGAL_ROLE_COORDINATION_ACTORS, LEGAL_ROLE_COORDINATION_STATES } from '../../../core/transactions/legalRoleCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  buildConveyancerThreeRoleDependencyModel,
  getConveyancerThreeRoleDependency,
} from '../../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import {
  CONVEYANCER_ATTORNEY_REPLACEMENT_VERSION,
  CONVEYANCER_COORDINATION_ESCALATION_VERSION,
  buildConveyancerAttorneyReplacementRequest,
  buildConveyancerCoordinationEscalation,
  confirmConveyancerAttorneyReplacement,
  executeConveyancerCoordinationEscalationCommand,
  validateConveyancerAttorneyReplacement,
  validateConveyancerCoordinationEscalation,
} from '../conveyancerCoordinationEscalationReplacement.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const generatedAt = '2026-07-15T08:00:00.000Z'
const system = { role: R.system, userId: 'recovery-engine-e6' }
const transfer = { role: R.transferAttorney, userId: 'transfer-e6' }
const bond = { role: R.bondAttorney, userId: 'bond-e6' }
const cancellation = { role: R.cancellationAttorney, userId: 'cancellation-e6' }
const manager = { role: R.firmManager, userId: 'manager-e6', lane: 'transfer' }
const bindings = { transfer: { firmId: 'firm:transfer', owner: transfer }, bond: { firmId: 'firm:bond', owner: bond }, cancellation: { firmId: 'firm:cancellation', owner: cancellation } }
const viewers = { transfer: { ...transfer, firmId: 'firm:transfer' }, bond: { ...bond, firmId: 'firm:bond' }, cancellation: { ...cancellation, firmId: 'firm:cancellation' }, manager: { ...manager, firmId: 'firm:transfer' } }
const evidenceHash = 'a'.repeat(64)

function model(financeType = 'hybrid', sellerHasExistingBond = true) {
  const result = buildConveyancerThreeRoleDependencyModel({
    plan: { planId: 'plan:e6', planVersion: 1 },
    transaction: { id: 'transaction:e6', organisation_id: 'organisation:e6', transaction_type: 'resale', property_tenure: 'freehold', finance_type: financeType, seller_has_existing_bond: sellerHasExistingBond, buyer_entity_type: 'individual', seller_entity_type: 'individual' },
    roleBindings: bindings, generatedAt, generatedBy: system,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.model
}

function requested(modelValue, dependencyKey = K.bondGuaranteeIssued) {
  const base = getConveyancerThreeRoleDependency(modelValue, dependencyKey).coordination
  const result = buildConveyancerCoordinationContract({ ...base, status: S.requested, requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: base.source.owner, updatedAt: '2026-07-15T09:00:00.000Z' }, { actionKeys: Object.values(modelValue.actionKeyMap || {}) })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.coordination
}

function blocked(modelValue, dependencyKey = K.bondGuaranteeIssued) {
  const base = getConveyancerThreeRoleDependency(modelValue, dependencyKey).coordination
  const result = buildConveyancerCoordinationContract({
    ...base, status: S.blocked, requestedAt: '2026-07-15T09:00:00.000Z', requestedBy: base.source.owner,
    acknowledgement: { acknowledgedAt: '2026-07-15T09:30:00.000Z', acknowledgedBy: base.target.owner, expectedAt: '2026-07-15T12:00:00.000Z' },
    blockage: { reason: 'Bank instruction amendment outstanding.', blockedAt: '2026-07-15T10:00:00.000Z', blockedBy: base.target.owner, followUpAt: '2026-07-16T10:00:00.000Z' }, updatedAt: '2026-07-15T10:00:00.000Z',
  }, { actionKeys: Object.values(modelValue.actionKeyMap || {}) })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.coordination
}

function createEscalation(modelValue, overrides = {}) {
  const record = requested(modelValue)
  return buildConveyancerCoordinationEscalation({ dependencyModel: modelValue, coordinationRecords: [record], target: { targetType: 'coordination', targetId: record.coordinationId }, reason: 'The guarantee acknowledgement deadline passed.', evidenceReferenceId: 'timeline:e6:overdue', commandId: 'raise:e6:1', occurredAt: '2026-07-15T17:00:00.000Z', raisedBy: viewers.transfer, ...overrides })
}

function command(modelValue, escalation, type, performedBy, overrides = {}) {
  return executeConveyancerCoordinationEscalationCommand({ dependencyModel: modelValue, escalation, performedBy, command: { commandId: `command:${type}:${escalation.revision}`, type, occurredAt: `2026-07-${16 + escalation.revision}T09:00:00.000Z`, expectedRevision: escalation.revision, expectedFingerprint: escalation.fingerprint, ...overrides } })
}

test('creates an immutable high-severity escalation from an overdue E1 handoff', () => {
  const modelValue = model('bond', false); const result = createEscalation(modelValue)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.escalation.version, CONVEYANCER_COORDINATION_ESCALATION_VERSION)
  assert.equal(result.escalation.trigger, 'acknowledgement_overdue')
  assert.equal(result.escalation.ownerLane, 'bond')
  assert.equal(result.escalation.ownerFirmId, 'firm:bond')
  assert.equal(result.escalation.controls.notificationsSent, false)
})

test('rejects early escalation but elevates an explicit blockage immediately', () => {
  const modelValue = model('bond', false); const draft = getConveyancerThreeRoleDependency(modelValue, K.bondGuaranteeIssued).coordination
  const early = createEscalation(modelValue, { coordinationRecords: [], target: { targetType: 'coordination', targetId: draft.coordinationId }, occurredAt: '2026-07-15T09:00:00.000Z' })
  assert.equal(early.errors.includes('coordination_not_escalatable'), true)
  const blockedRecord = blocked(modelValue)
  const result = createEscalation(modelValue, { coordinationRecords: [blockedRecord], target: { targetType: 'coordination', targetId: blockedRecord.coordinationId }, occurredAt: '2026-07-15T11:00:00.000Z' })
  assert.equal(result.escalation.severity, 'critical')
  assert.equal(result.escalation.trigger, 'blocked')
})

test('requires the owning firm to acknowledge and resolve with evidence', () => {
  const modelValue = model('bond', false); const escalation = createEscalation(modelValue).escalation
  const wrong = command(modelValue, escalation, 'acknowledge', viewers.transfer)
  assert.equal(wrong.code, 'coordination_escalation_command_unauthorised')
  const acknowledged = command(modelValue, escalation, 'acknowledge', viewers.bond, { reason: 'Bank team is investigating.' })
  assert.equal(acknowledged.escalation.status, 'acknowledged')
  const resolved = command(modelValue, acknowledged.escalation, 'resolve', viewers.bond, { reason: 'Guarantee instruction acknowledged.', evidenceReferenceId: 'evidence:e6:resolved', evidenceHash })
  assert.equal(resolved.escalation.status, 'resolved')
  assert.equal(command(modelValue, resolved.escalation, 'escalate', viewers.transfer, { reason: 'Too late', nextLevel: 2 }).errors.includes('terminal_escalation_cannot_change'), true)
})

test('enforces sequential escalation and manager-only level three', () => {
  const modelValue = model('bond', false); const escalation = createEscalation(modelValue).escalation
  assert.equal(command(modelValue, escalation, 'escalate', viewers.transfer, { reason: 'Skip', nextLevel: 3 }).errors.includes('next_reasoned_escalation_level_required'), true)
  const level2 = command(modelValue, escalation, 'escalate', viewers.transfer, { reason: 'Firm response still outstanding.', nextLevel: 2 }).escalation
  assert.equal(level2.level, 2)
  assert.equal(command(modelValue, level2, 'escalate', viewers.transfer, { reason: 'Executive escalation.', nextLevel: 3 }).errors.includes('level_three_escalation_requires_firm_manager'), true)
  const level3 = command(modelValue, level2, 'escalate', viewers.manager, { reason: 'Executive escalation.', nextLevel: 3 })
  assert.equal(level3.escalation.level, 3)
})

test('is idempotent for an exact command and rejects command-id payload drift', () => {
  const modelValue = model('bond', false); const escalation = createEscalation(modelValue).escalation
  const first = command(modelValue, escalation, 'acknowledge', viewers.bond, { commandId: 'ack:e6', reason: 'Acknowledged.' })
  const duplicate = executeConveyancerCoordinationEscalationCommand({ dependencyModel: modelValue, escalation: first.escalation, performedBy: viewers.bond, command: { commandId: 'ack:e6', type: 'acknowledge', occurredAt: '2026-07-17T09:00:00.000Z', expectedRevision: escalation.revision, expectedFingerprint: escalation.fingerprint, reason: 'Acknowledged.' } })
  assert.equal(duplicate.duplicate, true)
  const conflict = executeConveyancerCoordinationEscalationCommand({ dependencyModel: modelValue, escalation: first.escalation, performedBy: viewers.bond, command: { commandId: 'ack:e6', type: 'acknowledge', occurredAt: '2026-07-17T09:00:00.000Z', expectedRevision: escalation.revision, expectedFingerprint: escalation.fingerprint, reason: 'Different.' } })
  assert.equal(conflict.code, 'coordination_escalation_command_conflict')
})

test('opens a bank-attorney replacement referral without selecting a new firm', () => {
  const modelValue = model(); const result = buildConveyancerAttorneyReplacementRequest({ dependencyModel: modelValue, lane: 'bond', legalRoleState: LEGAL_ROLE_COORDINATION_STATES.declined, reason: 'The appointed bond firm declined the instruction.', trigger: 'firm_declined', evidenceReferenceId: 'appointment:e6:decline', commandId: 'replacement:e6:bond', requestedAt: '2026-07-16T09:00:00.000Z', requestedBy: viewers.transfer })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.replacement.version, CONVEYANCER_ATTORNEY_REPLACEMENT_VERSION)
  assert.equal(result.replacement.status, 'awaiting_appointing_authority')
  assert.equal(result.replacement.appointingAuthority.actorRole, LEGAL_ROLE_COORDINATION_ACTORS.newLendingBank)
  assert.equal(result.replacement.appointment, null)
})

test('allows replacement after level-two escalation without pretending the current firm declined', () => {
  const modelValue = model('bond', false); const escalation = createEscalation(modelValue).escalation
  const level2 = command(modelValue, escalation, 'escalate', viewers.transfer, { reason: 'No response after firm escalation.', nextLevel: 2 }).escalation
  const result = buildConveyancerAttorneyReplacementRequest({ dependencyModel: modelValue, lane: 'bond', legalRoleState: LEGAL_ROLE_COORDINATION_STATES.active, escalation: level2, reason: 'Refer non-responsive appointment to the bank.', trigger: 'sustained_non_response', evidenceReferenceId: 'escalation:e6:level2', commandId: 'replacement:e6:escalated', requestedAt: '2026-07-18T10:00:00.000Z', requestedBy: viewers.transfer })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.replacement.escalationBinding.escalationId, level2.escalationId)
})

test('only the appointing bank can confirm a distinct replacement firm', () => {
  const modelValue = model(); const request = buildConveyancerAttorneyReplacementRequest({ dependencyModel: modelValue, lane: 'cancellation', legalRoleState: LEGAL_ROLE_COORDINATION_STATES.replacementRequired, reason: 'Existing bank requires a new cancellation panel firm.', trigger: 'replacement_required', evidenceReferenceId: 'appointment:e6:replacement', commandId: 'replacement:e6:cancellation', requestedAt: '2026-07-16T09:00:00.000Z', requestedBy: viewers.transfer }).replacement
  const transferAttempt = confirmConveyancerAttorneyReplacement({ dependencyModel: modelValue, replacement: request, appointment: { firmId: 'firm:new-cancellation', evidenceReferenceId: 'bank:e6:appointment', evidenceHash }, commandId: 'confirm:e6', confirmedAt: '2026-07-16T12:00:00.000Z', confirmedBy: { actorRole: LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney, actorId: 'transfer-e6' } })
  assert.equal(transferAttempt.code, 'attorney_replacement_confirmation_unauthorised')
  const sameFirm = confirmConveyancerAttorneyReplacement({ dependencyModel: modelValue, replacement: request, appointment: { firmId: 'firm:cancellation', evidenceReferenceId: 'bank:e6:appointment', evidenceHash }, commandId: 'confirm:e6', confirmedAt: '2026-07-16T12:00:00.000Z', confirmedBy: { actorRole: LEGAL_ROLE_COORDINATION_ACTORS.existingBank, actorId: 'bank:e6' } })
  assert.equal(sameFirm.ok, false)
  const confirmed = confirmConveyancerAttorneyReplacement({ dependencyModel: modelValue, replacement: request, appointment: { firmId: 'firm:new-cancellation', evidenceReferenceId: 'bank:e6:appointment', evidenceHash }, commandId: 'confirm:e6', confirmedAt: '2026-07-16T12:00:00.000Z', confirmedBy: { actorRole: LEGAL_ROLE_COORDINATION_ACTORS.existingBank, actorId: 'bank:e6' } })
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed.errors))
  assert.equal(confirmed.replacement.status, 'appointment_confirmed')
  assert.equal(confirmed.replacement.invalidation.dependencyModelRegenerationRequired, true)
  assert.equal(confirmed.replacement.invalidation.appointmentChanged, false)
  assert.equal(confirmed.replacement.invalidation.invitationsSent, false)
  const duplicate = confirmConveyancerAttorneyReplacement({ dependencyModel: modelValue, replacement: confirmed.replacement, appointment: { firmId: 'firm:new-cancellation', evidenceReferenceId: 'bank:e6:appointment', evidenceHash }, commandId: 'confirm:e6', confirmedAt: '2026-07-16T12:00:00.000Z', confirmedBy: { actorRole: LEGAL_ROLE_COORDINATION_ACTORS.existingBank, actorId: 'bank:e6' } })
  assert.equal(duplicate.duplicate, true)
})

test('keeps seller authority over transfer-attorney replacement', () => {
  const modelValue = model('cash', false); const request = buildConveyancerAttorneyReplacementRequest({ dependencyModel: modelValue, lane: 'transfer', legalRoleState: LEGAL_ROLE_COORDINATION_STATES.declined, reason: 'Seller requested replacement.', trigger: 'seller_review', evidenceReferenceId: 'seller:e6:request', commandId: 'replacement:e6:transfer', requestedAt: '2026-07-16T09:00:00.000Z', requestedBy: viewers.transfer }).replacement
  assert.equal(request.appointingAuthority.actorRole, LEGAL_ROLE_COORDINATION_ACTORS.seller)
  const wrong = confirmConveyancerAttorneyReplacement({ dependencyModel: modelValue, replacement: request, appointment: { firmId: 'firm:new-transfer', evidenceReferenceId: 'seller:e6:appointment', evidenceHash }, commandId: 'confirm:e6:transfer', confirmedAt: '2026-07-16T12:00:00.000Z', confirmedBy: { actorRole: LEGAL_ROLE_COORDINATION_ACTORS.newLendingBank, actorId: 'bank:e6' } })
  assert.equal(wrong.ok, false)
})

test('denies outsiders and detects escalation and replacement tampering', () => {
  const modelValue = model('bond', false); const record = requested(modelValue)
  const outsider = createEscalation(modelValue, { coordinationRecords: [record], raisedBy: { ...viewers.transfer, firmId: 'firm:other' } })
  assert.equal(outsider.code, 'coordination_escalation_access_denied')
  const escalation = createEscalation(modelValue).escalation; const tamperedEscalation = structuredClone(escalation); tamperedEscalation.ownerFirmId = 'firm:other'
  assert.equal(validateConveyancerCoordinationEscalation(tamperedEscalation, { dependencyModel: modelValue }).errors.includes('coordination_escalation_dependency_binding_invalid'), true)
  const replacement = buildConveyancerAttorneyReplacementRequest({ dependencyModel: modelValue, lane: 'bond', legalRoleState: LEGAL_ROLE_COORDINATION_STATES.declined, reason: 'Declined.', trigger: 'declined', evidenceReferenceId: 'decline:e6', commandId: 'replacement:e6:tamper', requestedAt: '2026-07-16T09:00:00.000Z', requestedBy: viewers.transfer }).replacement
  const tamperedReplacement = structuredClone(replacement); tamperedReplacement.currentFirmId = 'firm:other'
  assert.equal(validateConveyancerAttorneyReplacement(tamperedReplacement, { dependencyModel: modelValue }).errors.includes('attorney_replacement_dependency_binding_invalid'), true)
})
