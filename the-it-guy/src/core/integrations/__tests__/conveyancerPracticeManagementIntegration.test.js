import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../../transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerThreeRoleDependencyModel } from '../../transactions/conveyancerThreeRoleDependencyModel.js'
import {
  CONVEYANCER_INTEGRATION_AUTHENTICATION_TYPES as A,
  CONVEYANCER_INTEGRATION_CONNECTION_STATUSES as CS,
  CONVEYANCER_INTEGRATION_DATA_CLASSIFICATIONS as D,
  CONVEYANCER_INTEGRATION_ENVIRONMENTS as E,
  CONVEYANCER_INTEGRATION_LEGAL_BASES as B,
  buildConveyancerIntegrationConnection,
  buildConveyancerIntegrationInboundEvent,
} from '../conveyancerIntegrationFramework.js'
import {
  CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION,
  PRACTICE_MANAGEMENT_AUTHORITIES as AU,
  PRACTICE_MANAGEMENT_CONFLICT_POLICIES as CP,
  PRACTICE_MANAGEMENT_INTEGRATION_BOUNDARY,
  PRACTICE_MANAGEMENT_SYNC_DIRECTIONS as SD,
  buildPracticeManagementAdapterManifest,
  buildPracticeManagementMappingProfile,
  buildPracticeManagementMatterLink,
  buildPracticeManagementSyncPlan,
  validatePracticeManagementMappingProfile,
  validatePracticeManagementMatterLink,
  validatePracticeManagementSyncPlan,
} from '../conveyancerPracticeManagementIntegration.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
const hash = (character) => character.repeat(64)
const at = '2026-07-15T10:00:00.000Z'
const manager = { role: R.firmManager, userId: 'manager:transfer', lane: 'transfer', firmId: 'firm:transfer' }
const transfer = { role: R.transferAttorney, userId: 'user:transfer', teamId: 'team:transfer', lane: 'transfer', firmId: 'firm:transfer' }
const bindings = {
  transfer: { firmId: 'firm:transfer', owner: { role: R.transferAttorney, userId: 'user:transfer', teamId: 'team:transfer' } },
  bond: { firmId: 'firm:bond', owner: { role: R.bondAttorney, userId: 'user:bond', teamId: 'team:bond' } },
}

function model() {
  const result = buildConveyancerThreeRoleDependencyModel({ plan: { planId: 'plan:f2', planVersion: 1 }, transaction: { id: 'transaction:f2', organisation_id: 'organisation:f2', transaction_type: 'resale', property_tenure: 'freehold', finance_type: 'bond', seller_has_existing_bond: false, buyer_entity_type: 'individual', seller_entity_type: 'individual' }, roleBindings: bindings, generatedAt: '2026-07-15T08:00:00.000Z', generatedBy: { role: R.system, userId: 'system:f2' } })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.model
}

function manifest() {
  const result = buildPracticeManagementAdapterManifest({ adapterId: 'practice-adapter', adapterVersion: '1.0.0', providerKey: 'vendor-neutral-practice', environments: [E.sandbox, E.production], authenticationTypes: [A.oauth2, A.signedWebhook], createdAt: '2026-07-15T08:00:00.000Z', createdBy: 'integration-governance:f2' })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.manifest
}

function connection(adapter = manifest()) {
  const result = buildConveyancerIntegrationConnection({ connectionId: 'connection:f2:practice', organisationId: 'organisation:f2', environment: E.production, status: CS.active, capabilities: adapter.capabilities, allowedLanes: ['transfer'], credentialReferenceId: 'vault:practice:f2', secretVersion: 'version:2', webhook: { endpointReferenceId: 'route:practice:f2', secretReferenceId: 'vault:webhook:f2', signingAlgorithm: 'hmac_sha256', replayWindowSeconds: 300 }, dataPolicy: { purpose: 'Synchronise reviewed conveyancing matter metadata with the appointed firm practice-management system.', legalBasis: B.contract, classifications: [D.professionalConfidential, D.personal, D.financial], retentionDays: 2555 }, verifiedAt: '2026-07-15T08:30:00.000Z', createdAt: '2026-07-15T08:00:00.000Z', createdBy: 'integration-admin:f2' }, { manifest: adapter })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.connection
}

const rules = [
  { resource: 'matter', canonicalField: 'matter_reference', providerField: 'Matter.FileRef', direction: SD.inbound, authority: AU.practiceManagement, conflictPolicy: CP.providerWins, required: true },
  { resource: 'matter', canonicalField: 'status', providerField: 'Matter.Status', direction: SD.outbound, authority: AU.platform, conflictPolicy: CP.platformWins, required: true },
  { resource: 'matter', canonicalField: 'responsible_professional', providerField: 'Matter.Owner', direction: SD.bidirectional, authority: AU.manualReview, conflictPolicy: CP.noOverwrite },
  { resource: 'task', canonicalField: 'status', providerField: 'Tasks.State', direction: SD.outbound, authority: AU.platform, conflictPolicy: CP.platformWins },
  { resource: 'task', canonicalField: 'due_at', providerField: 'Tasks.DueAt', direction: SD.bidirectional, authority: AU.manualReview, conflictPolicy: CP.manualReview },
  { resource: 'document_metadata', canonicalField: 'status', providerField: 'Documents.Status', direction: SD.outbound, authority: AU.platform, conflictPolicy: CP.platformWins },
  { resource: 'financial_summary', canonicalField: 'balance', providerField: 'Ledger.Balance', direction: SD.inbound, authority: AU.manualReview, conflictPolicy: CP.noOverwrite },
]

function profile(adapter = manifest(), activeConnection = connection(adapter), overrides = {}) {
  const result = buildPracticeManagementMappingProfile({ profileId: 'mapping:f2:transfer', revision: 1, lane: 'transfer', firmId: 'firm:transfer', rules, approvedAt: '2026-07-15T09:00:00.000Z', approvedBy: manager, createdAt: '2026-07-15T08:45:00.000Z', createdBy: 'integration-admin:f2', ...overrides }, { manifest: adapter, connection: activeConnection })
  return result
}

function link(context = {}, overrides = {}) {
  const dependencyModel = context.model || model(); const adapter = context.manifest || manifest(); const activeConnection = context.connection || connection(adapter); const mapping = context.profile || profile(adapter, activeConnection).profile
  return buildPracticeManagementMatterLink({ linkId: 'practice-link:f2', lane: 'transfer', firmId: 'firm:transfer', providerMatterReferenceId: 'practice-matter:ABC-123', providerMatterReferenceHash: hash('a'), verificationEvidenceReferenceId: 'evidence:practice-link:f2', verificationEvidenceHash: hash('b'), verifiedAt: '2026-07-15T09:15:00.000Z', verifiedBy: transfer, ...overrides }, { dependencyModel, manifest: adapter, connection: activeConnection, profile: mapping })
}

function inbound(context = {}) {
  const dependencyModel = context.model || model(); const adapter = context.manifest || manifest(); const activeConnection = context.connection || connection(adapter)
  const result = buildConveyancerIntegrationInboundEvent({ recordId: 'practice-event:f2:1', type: 'practice_snapshot_received', lane: 'transfer', firmId: 'firm:transfer', idempotencyKey: 'practice:snapshot:f2:1', providerEventId: 'provider:event:f2:1', payloadReferenceId: 'quarantine:practice:f2:1', payloadHash: hash('c'), dataPolicy: { purpose: 'Reconcile practice-management metadata.', legalBasis: B.contract, classifications: [D.professionalConfidential, D.financial], retentionDays: 365 }, signature: { verified: true, algorithm: 'hmac_sha256', keyReferenceId: 'vault:webhook:f2', nonceHash: hash('d'), payloadHash: hash('c'), signedAt: '2026-07-15T09:59:00.000Z' }, occurredAt: '2026-07-15T09:58:00.000Z', receivedAt: at }, { dependencyModel, manifest: adapter, connection: activeConnection })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.event
}

function observation(side, resource, canonicalField, recordKey, character, version = '1') { return { observationId: `${side}:${resource}:${canonicalField}:${recordKey}`, resource, canonicalField, recordKey, valueReferenceId: `value:${side}:${resource}:${canonicalField}:${recordKey}`, valueHash: hash(character), version, updatedAt: side === 'platform' ? '2026-07-15T09:30:00.000Z' : '2026-07-15T09:45:00.000Z' } }

function fixture() {
  const dependencyModel = model(); const adapter = manifest(); const activeConnection = connection(adapter); const mappingResult = profile(adapter, activeConnection); assert.equal(mappingResult.ok, true, JSON.stringify(mappingResult.errors)); const linkResult = link({ model: dependencyModel, manifest: adapter, connection: activeConnection, profile: mappingResult.profile }); assert.equal(linkResult.ok, true, JSON.stringify(linkResult.errors)); return { dependencyModel, adapter, activeConnection, mapping: mappingResult.profile, matterLink: linkResult.link, inboundEvent: inbound({ model: dependencyModel, manifest: adapter, connection: activeConnection }) }
}

function buildPlan(value = fixture(), overrides = {}) {
  return buildPracticeManagementSyncPlan({ planId: 'practice-sync:f2:1', generatedAt: at, platformObservations: [observation('platform', 'matter', 'matter_reference', 'matter', '1'), observation('platform', 'matter', 'status', 'matter', '2'), observation('platform', 'task', 'due_at', 'task-signing', '3')], providerObservations: [observation('provider', 'matter', 'matter_reference', 'matter', '1'), observation('provider', 'matter', 'status', 'matter', '4'), observation('provider', 'task', 'due_at', 'task-signing', '5'), observation('provider', 'financial_summary', 'balance', 'matter', '6')], commandId: 'practice-command:f2:1', idempotencyKey: 'practice-sync-f2-1', exportPayloadReferenceId: 'approved-sync-batch:f2:1', exportPayloadHash: hash('7'), requestedBy: transfer, authorityReferenceId: 'approval:practice-sync:f2', retentionDays: 365, ...overrides }, { dependencyModel: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping, link: value.matterLink, inboundEvent: value.inboundEvent, existingCommands: overrides.existingCommands || [] })
}

test('creates a governed F1 practice-management adapter and mapping profile', () => {
  const adapter = manifest(); const activeConnection = connection(adapter); const result = profile(adapter, activeConnection)
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.profile.version, CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION)
  assert.equal(adapter.category, 'practice_management'); assert.equal(Object.isFrozen(result.profile), true)
  assert.equal(validatePracticeManagementMappingProfile(result.profile, { manifest: adapter, connection: activeConnection }).valid, true)
})

test('rejects unsafe restricted mappings and unapproved mapping profiles', () => {
  const adapter = manifest(); const activeConnection = connection(adapter)
  const unsafeRules = rules.map((rule) => rule.canonicalField === 'responsible_professional' ? { ...rule, authority: AU.practiceManagement, conflictPolicy: CP.providerWins } : rule)
  const unsafe = profile(adapter, activeConnection, { rules: unsafeRules }); assert.equal(unsafe.ok, false); assert.equal(unsafe.errors.some((item) => item.includes('restricted_field_policy_invalid')), true)
  const unapproved = profile(adapter, activeConnection, { approvedBy: transfer }); assert.equal(unapproved.errors.includes('practice_mapping_approval_invalid'), true)
})

test('verifies a PMS matter link against the exact E2 matter, lane and firm', () => {
  const value = fixture(); assert.equal(validatePracticeManagementMatterLink(value.matterLink, { dependencyModel: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping }).valid, true)
  assert.equal(value.matterLink.providerWritePerformed, false); assert.equal(value.matterLink.platformWritePerformed, false)
})

test('denies forged matter links and cross-firm verification', () => {
  const value = fixture(); const wrongFirm = link({ model: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping }, { verifiedBy: { ...transfer, firmId: 'firm:other' } })
  assert.equal(wrongFirm.errors.includes('practice_link_authority_invalid'), true)
  const forged = structuredClone(value.matterLink); forged.matter.transactionId = 'transaction:other'
  assert.equal(validatePracticeManagementMatterLink(forged, { dependencyModel: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping }).errors.includes('practice_link_matter_binding_invalid'), true)
})

test('builds one review-first reconciliation plan with a prepared F1 export command', () => {
  const value = fixture(); const result = buildPlan(value)
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.plan.status, 'review_required')
  assert.equal(result.plan.counts.in_sync, 1); assert.equal(result.plan.counts.export_prepared, 1); assert.equal(result.plan.counts.conflict_review, 1); assert.equal(result.plan.counts.import_for_review, 1)
  assert.equal(result.outboundCommand.type, 'practice_sync_batch_requested'); assert.equal(result.outboundCommand.controls.dispatchPerformed, false)
  assert.equal(validatePracticeManagementSyncPlan(result.plan, { dependencyModel: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping, link: value.matterLink, inboundEvent: value.inboundEvent, outboundCommand: result.outboundCommand }).valid, true)
})

test('never uses provider timestamps to overwrite restricted or financial fields', () => {
  const result = buildPlan(); const due = result.plan.actions.find((item) => item.canonicalField === 'due_at'); const balance = result.plan.actions.find((item) => item.canonicalField === 'balance')
  assert.equal(due.action, 'conflict_review'); assert.equal(balance.action, 'import_for_review'); assert.equal(due.automaticMutationAllowed, false); assert.equal(balance.automaticMutationAllowed, false)
})

test('requires a signed F1 inbound envelope for provider-derived decisions', () => {
  const value = fixture(); const result = buildPracticeManagementSyncPlan({ planId: 'practice-sync:no-inbound', generatedAt: at, platformObservations: [], providerObservations: [observation('provider', 'financial_summary', 'balance', 'matter', '6')] }, { dependencyModel: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping, link: value.matterLink, inboundEvent: null })
  assert.equal(result.ok, false); assert.equal(result.errors.includes('practice_sync_inbound_evidence_invalid'), true)
})

test('prepares an export-only plan without inventing inbound evidence', () => {
  const value = fixture(); const result = buildPlan(value, { platformObservations: [observation('platform', 'matter', 'status', 'matter', '2')], providerObservations: [], commandId: 'practice-command:export-only', idempotencyKey: 'practice-export-only' })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.plan.status, 'export_prepared'); assert.equal(result.plan.sourceInboundEventId, null); assert.equal(result.outboundCommand.status, 'prepared')
})

test('returns in-sync when mapped hashes agree and creates no outbound command', () => {
  const value = fixture(); const samePlatform = observation('platform', 'matter', 'matter_reference', 'matter', '1'); const sameProvider = observation('provider', 'matter', 'matter_reference', 'matter', '1')
  const result = buildPlan(value, { platformObservations: [samePlatform], providerObservations: [sameProvider], commandId: null, exportPayloadReferenceId: null, exportPayloadHash: null })
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.plan.status, 'in_sync'); assert.equal(result.outboundCommand, null); assert.equal(result.plan.sourceInboundEventId, value.inboundEvent.recordId)
})

test('blocks unmapped fields, duplicate observations and raw value-shaped data', () => {
  const value = fixture(); const unmapped = buildPlan(value, { platformObservations: [observation('platform', 'party', 'role', 'seller', '1')], providerObservations: [] })
  assert.equal(unmapped.errors.includes('practice_sync_unmapped_observation:party.role'), true)
  const item = observation('platform', 'matter', 'status', 'matter', '2'); const duplicate = buildPlan(value, { platformObservations: [item, { ...item, observationId: 'duplicate' }], providerObservations: [] })
  assert.equal(duplicate.errors.includes('platform_observation_duplicate'), true)
  const inline = buildPlan(value, { platformObservations: [{ ...item, rawValue: 'clientName' }], providerObservations: [] })
  assert.equal(inline.errors.includes('platform_observation_inline_value_prohibited'), true)
  assert.equal(JSON.stringify(buildPlan().plan).includes('rawValue'), false); assert.equal(JSON.stringify(buildPlan().plan).includes('clientName'), false)
})

test('inherits F1 command idempotency and rejects changed batch reuse', () => {
  const value = fixture(); const first = buildPlan(value); const duplicate = buildPlan(value, { existingCommands: [first.outboundCommand] })
  assert.equal(duplicate.ok, true); assert.equal(duplicate.outboundCommand.status, 'duplicate')
  const conflict = buildPlan(value, { existingCommands: [first.outboundCommand], exportPayloadHash: hash('8') })
  assert.equal(conflict.ok, false); assert.equal(conflict.errors.includes('practice_sync_outbound:integration_idempotency_conflict'), true)
})

test('detects plan, source-event and side-effect tampering', () => {
  const value = fixture(); const result = buildPlan(value); const changed = structuredClone(result.plan); changed.controls.providerWritePerformed = true
  const validation = validatePracticeManagementSyncPlan(changed, { dependencyModel: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping, link: value.matterLink, inboundEvent: value.inboundEvent, outboundCommand: result.outboundCommand })
  assert.equal(validation.errors.includes('practice_sync_side_effect_boundary_violated'), true); assert.equal(validation.errors.includes('practice_sync_fingerprint_invalid'), true)
  const wrongEvent = { ...value.inboundEvent, recordId: 'event:forged' }
  assert.equal(validatePracticeManagementSyncPlan(result.plan, { dependencyModel: value.dependencyModel, manifest: value.adapter, connection: value.activeConnection, profile: value.mapping, link: value.matterLink, inboundEvent: wrongEvent, outboundCommand: result.outboundCommand }).errors.includes('practice_sync_inbound_evidence_invalid'), true)
  assert.equal(PRACTICE_MANAGEMENT_INTEGRATION_BOUNDARY.financialLedgerMutated, false)
})

console.log('F2 practice-management integration tests passed.')
