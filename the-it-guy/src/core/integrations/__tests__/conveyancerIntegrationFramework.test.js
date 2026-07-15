import assert from 'node:assert/strict'
import {
  CONVEYANCER_INTEGRATION_AUTHENTICATION_TYPES as A,
  CONVEYANCER_INTEGRATION_BOUNDARY,
  CONVEYANCER_INTEGRATION_CAPABILITIES as C,
  CONVEYANCER_INTEGRATION_CONNECTION_STATUSES as S,
  CONVEYANCER_INTEGRATION_DATA_CLASSIFICATIONS as D,
  CONVEYANCER_INTEGRATION_ENVIRONMENTS as E,
  CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION,
  CONVEYANCER_INTEGRATION_LEGAL_BASES as B,
  CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES as P,
  buildConveyancerIntegrationAdapterManifest,
  buildConveyancerIntegrationConnection,
  buildConveyancerIntegrationInboundEvent,
  buildConveyancerIntegrationOutboundCommand,
  buildConveyancerIntegrationRegistry,
  validateConveyancerIntegrationAdapterManifest,
  validateConveyancerIntegrationConnection,
  validateConveyancerIntegrationInboundEvent,
  validateConveyancerIntegrationOutboundCommand,
} from '../conveyancerIntegrationFramework.js'
import { MATTER_PLAN_OWNER_ROLES as R } from '../../transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerThreeRoleDependencyModel } from '../../transactions/conveyancerThreeRoleDependencyModel.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const createdAt = '2026-07-15T08:00:00.000Z'
const receivedAt = '2026-07-15T10:00:00.000Z'
const hash = (character) => character.repeat(64)
const bindings = {
  transfer: { firmId: 'firm:transfer', owner: { role: R.transferAttorney, userId: 'user:transfer', teamId: 'team:transfer' } },
  bond: { firmId: 'firm:bond', owner: { role: R.bondAttorney, userId: 'user:bond', teamId: 'team:bond' } },
  cancellation: { firmId: 'firm:cancellation', owner: { role: R.cancellationAttorney, userId: 'user:cancellation', teamId: 'team:cancellation' } },
}

function dependencyModel() {
  const result = buildConveyancerThreeRoleDependencyModel({ plan: { planId: 'plan:f1', planVersion: 1 }, transaction: { id: 'transaction:f1', organisation_id: 'organisation:f1', transaction_type: 'resale', property_tenure: 'freehold', finance_type: 'hybrid', seller_has_existing_bond: true, buyer_entity_type: 'individual', seller_entity_type: 'individual' }, roleBindings: bindings, generatedAt: createdAt, generatedBy: { role: R.system, userId: 'system:f1' } })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.model
}

function manifest() {
  const result = buildConveyancerIntegrationAdapterManifest({ adapterId: 'bank-adapter', adapterVersion: '1.0.0', providerKey: 'example-bank', category: P.banking, environments: [E.sandbox, E.production], authenticationTypes: [A.oauth2, A.signedWebhook], capabilities: [C.receiveBankInstruction, C.receiveBankApproval, C.receiveCancellationFigures, C.receiveGuarantee, C.submitBankPack, C.submitGuarantee], inboundEvents: [{ type: 'bank_instruction_received', capability: C.receiveBankInstruction, allowedLanes: ['bond'] }, { type: 'approval_to_lodge_received', capability: C.receiveBankApproval, allowedLanes: ['bond'] }, { type: 'cancellation_figures_received', capability: C.receiveCancellationFigures, allowedLanes: ['cancellation'] }], outboundCommands: [{ type: 'bank_pack_submission_requested', capability: C.submitBankPack, allowedLanes: ['bond'] }, { type: 'guarantee_submission_requested', capability: C.submitGuarantee, allowedLanes: ['bond', 'transfer'] }], createdAt, createdBy: 'integration-governance:f1' })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.manifest
}

function connection(adapter = manifest(), overrides = {}) {
  const result = buildConveyancerIntegrationConnection({ connectionId: 'connection:f1:bank', organisationId: 'organisation:f1', environment: E.production, status: S.active, capabilities: adapter.capabilities, allowedLanes: ['transfer', 'bond', 'cancellation'], credentialReferenceId: 'vault:credential:f1', secretVersion: 'version:7', webhook: { endpointReferenceId: 'route:webhook:f1', secretReferenceId: 'vault:webhook:f1', signingAlgorithm: 'hmac_sha256', replayWindowSeconds: 300 }, dataPolicy: { purpose: 'Coordinate lender instructions and submissions for the bound conveyancing matter.', legalBasis: B.contract, classifications: [D.professionalConfidential, D.personal, D.financial], retentionDays: 2555 }, verifiedAt: '2026-07-15T08:30:00.000Z', createdAt, createdBy: 'integration-admin:f1', ...overrides }, { manifest: adapter })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.connection
}

function inbound(overrides = {}, context = {}) {
  const model = context.dependencyModel || dependencyModel(); const adapter = context.manifest || manifest(); const activeConnection = context.connection || connection(adapter)
  return buildConveyancerIntegrationInboundEvent({ recordId: 'event:f1:1', type: 'bank_instruction_received', lane: 'bond', firmId: 'firm:bond', idempotencyKey: 'example-bank:event:1', providerEventId: 'provider:event:1', payloadReferenceId: 'quarantine:payload:1', payloadHash: hash('a'), dataPolicy: { purpose: 'Reconcile a bank instruction against matter evidence.', legalBasis: B.contract, classifications: [D.professionalConfidential, D.financial], retentionDays: 365 }, signature: { verified: true, algorithm: 'hmac_sha256', keyReferenceId: 'vault:webhook:f1', nonceHash: hash('b'), payloadHash: hash('a'), signedAt: '2026-07-15T09:59:00.000Z' }, occurredAt: '2026-07-15T09:58:00.000Z', receivedAt, ...overrides }, { dependencyModel: model, manifest: adapter, connection: activeConnection, existingEvents: context.existingEvents || [] })
}

function outbound(overrides = {}, context = {}) {
  const model = context.dependencyModel || dependencyModel(); const adapter = context.manifest || manifest(); const activeConnection = context.connection || connection(adapter)
  return buildConveyancerIntegrationOutboundCommand({ recordId: 'command:f1:1', type: 'bank_pack_submission_requested', lane: 'bond', firmId: 'firm:bond', idempotencyKey: 'matter:f1:submit-bank-pack:1', payloadReferenceId: 'approved-packet:f1:1', payloadHash: hash('c'), dataPolicy: { purpose: 'Prepare an approved bond pack for lender submission.', legalBasis: B.contract, classifications: [D.professionalConfidential, D.personal, D.financial], retentionDays: 365 }, requestedAt: receivedAt, requestedBy: { role: R.bondAttorney, userId: 'user:bond', teamId: 'team:bond', lane: 'bond', firmId: 'firm:bond' }, authorityReferenceId: 'approval:f1:bank-pack', ...overrides }, { dependencyModel: model, manifest: adapter, connection: activeConnection, existingCommands: context.existingCommands || [] })
}

test('builds an immutable provider-neutral adapter manifest and registry', () => {
  const adapter = manifest(); const registry = buildConveyancerIntegrationRegistry({ manifests: [adapter] })
  assert.equal(adapter.version, CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION)
  assert.equal(validateConveyancerIntegrationAdapterManifest(adapter).valid, true)
  assert.equal(registry.ok, true); assert.equal(registry.registry.entries.length, 1)
  assert.equal(Object.isFrozen(adapter), true); assert.equal(CONVEYANCER_INTEGRATION_BOUNDARY.outboundDispatchEnabled, false)
})

test('rejects duplicate adapter registrations and tampered manifests', () => {
  const adapter = manifest(); assert.equal(buildConveyancerIntegrationRegistry({ manifests: [adapter, adapter] }).errors.includes('integration_adapter_registration_duplicate'), true)
  const changed = structuredClone(adapter); changed.capabilities.pop()
  assert.equal(validateConveyancerIntegrationAdapterManifest(changed).errors.includes('adapter_fingerprint_invalid'), true)
})

test('creates a reference-only active connection with constrained environment and policy', () => {
  const adapter = manifest(); const value = connection(adapter)
  assert.equal(value.environment, E.production); assert.equal(value.externalWritesEnabled, false)
  assert.equal(JSON.stringify(value).includes('apiKey'), false)
  assert.equal(validateConveyancerIntegrationConnection(value, { manifest: adapter }).valid, true)
})

test('fails closed on unverified production connections, consent gaps and raw secrets', () => {
  const adapter = manifest(); const unverified = buildConveyancerIntegrationConnection({ ...connection(adapter), connectionId: 'connection:bad', status: S.active, verifiedAt: null }, { manifest: adapter })
  assert.equal(unverified.errors.includes('connection_verification_required'), true)
  const consent = structuredClone(connection(adapter)); consent.dataPolicy.legalBasis = B.consent; consent.dataPolicy.consentReferenceId = null
  assert.equal(validateConveyancerIntegrationConnection(consent, { manifest: adapter }).errors.includes('connection_consent_reference_required'), true)
  const secret = structuredClone(connection(adapter)); secret.apiKey = 'raw-secret'; secret.fingerprint = connection(adapter).fingerprint
  assert.equal(validateConveyancerIntegrationConnection(secret, { manifest: adapter }).errors.includes('connection_contains_raw_secret_material'), true)
  const secretBuild = buildConveyancerIntegrationConnection({ ...connection(adapter), connectionId: 'connection:secret', apiKey: 'raw-secret' }, { manifest: adapter })
  assert.equal(secretBuild.errors.includes('connection_contains_raw_secret_material'), true)
})

test('accepts signed inbound events for review without creating legal truth', () => {
  const result = inbound(); assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.code, 'integration_inbound_accepted_for_review')
  assert.equal(result.event.status, 'accepted_for_review'); assert.deepEqual(result.event.controls, { reconciliationOnly: true, workflowMutated: false, evidenceApproved: false, legalTruthCreated: false, registrationOutcomeMutated: false, databaseWritePerformed: false })
})

test('rejects invalid signatures and replayed inbound events', () => {
  assert.equal(inbound({ signature: { verified: false } }).errors.includes('inbound_signature_invalid'), true)
  const replay = inbound({ signature: { verified: true, algorithm: 'hmac_sha256', keyReferenceId: 'vault:webhook:f1', nonceHash: hash('b'), payloadHash: hash('a'), signedAt: '2026-07-15T09:00:00.000Z' } })
  assert.equal(replay.errors.includes('inbound_replay_window_exceeded'), true)
  assert.equal(inbound({ payload: { bankAccount: 'inline' } }).errors.includes('integration_inline_payload_prohibited'), true)
  assert.equal(inbound({ signature: { verified: true, algorithm: 'hmac_sha256', keyReferenceId: 'vault:wrong', nonceHash: hash('b'), payloadHash: hash('a'), signedAt: '2026-07-15T09:59:00.000Z' } }).errors.includes('inbound_signature_invalid'), true)
})

test('enforces exact E2 matter, lane, firm and provider capability bindings', () => {
  assert.equal(inbound({ lane: 'cancellation', firmId: 'firm:cancellation' }).errors.includes('integration_operation_not_supported'), true)
  assert.equal(inbound({ firmId: 'firm:transfer' }).errors.includes('integration_firm_binding_invalid'), true)
  const valid = inbound(); const forged = structuredClone(valid.event); forged.matter.transactionId = 'transaction:forged'
  assert.equal(validateConveyancerIntegrationInboundEvent(forged, { dependencyModel: dependencyModel(), manifest: manifest(), connection: connection() }).errors.includes('integration_matter_binding_invalid'), true)
})

test('deduplicates exact inbound delivery and rejects changed payload reuse', () => {
  const first = inbound(); const duplicate = inbound({}, { existingEvents: [first.event] })
  assert.equal(duplicate.ok, true); assert.equal(duplicate.code, 'integration_inbound_duplicate'); assert.equal(duplicate.duplicateOf, first.event.recordId)
  const conflict = inbound({ payloadHash: hash('d'), signature: { verified: true, algorithm: 'hmac_sha256', keyReferenceId: 'vault:webhook:f1', nonceHash: hash('b'), payloadHash: hash('d'), signedAt: '2026-07-15T09:59:00.000Z' } }, { existingEvents: [first.event] })
  assert.equal(conflict.code, 'integration_idempotency_conflict')
})

test('prepares authority-bound outbound commands without dispatching them', () => {
  const result = outbound(); assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.code, 'integration_outbound_prepared')
  assert.equal(result.command.status, 'prepared'); assert.deepEqual(result.command.controls, { preparationOnly: true, dispatchPerformed: false, externalWritePerformed: false, workflowMutated: false, databaseWritePerformed: false })
  assert.equal(outbound({ body: 'inline document' }).errors.includes('integration_inline_payload_prohibited'), true)
})

test('denies wrong-lane, wrong-firm and client outbound actors', () => {
  assert.equal(outbound({ requestedBy: { role: R.transferAttorney, userId: 'user:transfer', lane: 'transfer', firmId: 'firm:transfer' } }).errors.includes('outbound_actor_authority_invalid'), true)
  assert.equal(outbound({ requestedBy: { role: R.bondAttorney, userId: 'user:bond', lane: 'bond', firmId: 'firm:other' } }).errors.includes('outbound_actor_authority_invalid'), true)
  assert.equal(outbound({ requestedBy: { role: R.client, userId: 'client:f1', lane: 'bond', firmId: 'firm:bond' } }).errors.includes('outbound_actor_authority_invalid'), true)
})

test('deduplicates outbound intent and rejects idempotency-key payload conflicts', () => {
  const first = outbound(); const duplicate = outbound({}, { existingCommands: [first.command] })
  assert.equal(duplicate.code, 'integration_outbound_duplicate')
  const conflict = outbound({ payloadHash: hash('d') }, { existingCommands: [first.command] })
  assert.equal(conflict.code, 'integration_idempotency_conflict')
})

test('detects environment, fingerprint and side-effect tampering', () => {
  const model = dependencyModel(); const adapter = manifest(); const activeConnection = connection(adapter); const valid = outbound({}, { dependencyModel: model, manifest: adapter, connection: activeConnection })
  const environment = structuredClone(valid.command); environment.environment = E.sandbox
  assert.equal(validateConveyancerIntegrationOutboundCommand(environment, { dependencyModel: model, manifest: adapter, connection: activeConnection }).errors.includes('integration_connection_binding_invalid'), true)
  const mutation = structuredClone(valid.command); mutation.controls.dispatchPerformed = true
  const result = validateConveyancerIntegrationOutboundCommand(mutation, { dependencyModel: model, manifest: adapter, connection: activeConnection })
  assert.equal(result.errors.includes('integration_side_effect_boundary_violated'), true); assert.equal(result.errors.includes('integration_record_fingerprint_invalid'), true)
})

console.log('F1 integration framework tests passed.')
