import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_COORDINATION_LANES as L,
  normalizeConveyancerCoordinationLane,
} from '../transactions/conveyancerCoordinationContract.js'
import { validateConveyancerThreeRoleDependencyModel } from '../transactions/conveyancerThreeRoleDependencyModel.js'

export const CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION = 'conveyancer_integration_framework_f1_v1'

export const CONVEYANCER_INTEGRATION_ENVIRONMENTS = Object.freeze({ sandbox: 'sandbox', production: 'production' })
export const CONVEYANCER_INTEGRATION_CONNECTION_STATUSES = Object.freeze({ draft: 'draft', verified: 'verified', active: 'active', suspended: 'suspended', revoked: 'revoked' })
export const CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES = Object.freeze({ banking: 'banking', deeds: 'deeds', signing: 'signing', documents: 'documents', communication: 'communication', calendar: 'calendar', registry: 'registry', practiceManagement: 'practice_management', trustAccounting: 'trust_accounting', taxAuthority: 'tax_authority', municipalAuthority: 'municipal_authority', communityScheme: 'community_scheme' })
export const CONVEYANCER_INTEGRATION_DATA_CLASSIFICATIONS = Object.freeze({ professionalConfidential: 'professional_confidential', personal: 'personal', specialPersonal: 'special_personal', financial: 'financial', legallyPrivileged: 'legally_privileged' })
export const CONVEYANCER_INTEGRATION_LEGAL_BASES = Object.freeze({ contract: 'contract', legalObligation: 'legal_obligation', consent: 'consent', legitimateInterest: 'legitimate_interest' })
export const CONVEYANCER_INTEGRATION_AUTHENTICATION_TYPES = Object.freeze({ oauth2: 'oauth2', mutualTls: 'mutual_tls', signedWebhook: 'signed_webhook', serviceAccount: 'service_account' })
export const CONVEYANCER_INTEGRATION_INBOUND_STATUSES = Object.freeze({ acceptedForReview: 'accepted_for_review', duplicate: 'duplicate' })
export const CONVEYANCER_INTEGRATION_OUTBOUND_STATUSES = Object.freeze({ prepared: 'prepared', duplicate: 'duplicate' })

export const CONVEYANCER_INTEGRATION_CAPABILITIES = Object.freeze({
  receiveBankInstruction: 'receive_bank_instruction', receiveBankConditions: 'receive_bank_conditions', receiveBankApproval: 'receive_bank_approval',
  receiveCancellationFigures: 'receive_cancellation_figures', receiveGuarantee: 'receive_guarantee', submitBankPack: 'submit_bank_pack', submitGuarantee: 'submit_guarantee',
  receiveDeedsEvent: 'receive_deeds_event', submitDeedsLodgement: 'submit_deeds_lodgement', requestSignature: 'request_signature', receiveSigningEvent: 'receive_signing_event',
  sendDocument: 'send_document', receiveDocument: 'receive_document', sendMessage: 'send_message', syncCalendar: 'sync_calendar', receiveRegistryEvent: 'receive_registry_event',
  receivePracticeSnapshot: 'receive_practice_snapshot', syncPracticeWorkspace: 'sync_practice_workspace', linkPracticeMatter: 'link_practice_matter',
  receiveTrustLedgerSnapshot: 'receive_trust_ledger_snapshot', prepareTrustPosting: 'prepare_trust_posting', linkTrustAccount: 'link_trust_account',
  receiveTransferDutyOutcome: 'receive_transfer_duty_outcome', submitTransferDutyDeclaration: 'submit_transfer_duty_declaration', submitTransferDutySupportingDocuments: 'submit_transfer_duty_supporting_documents', manageTransferDutyDeclaration: 'manage_transfer_duty_declaration',
  receivePropertyClearanceOutcome: 'receive_property_clearance_outcome', requestPropertyClearanceFigures: 'request_property_clearance_figures', submitPropertyClearancePaymentEvidence: 'submit_property_clearance_payment_evidence', managePropertyClearanceRequest: 'manage_property_clearance_request',
  requestBankGuarantee: 'request_bank_guarantee', manageBankGuarantee: 'manage_bank_guarantee', requestCancellationFigures: 'request_cancellation_figures', submitRegistrationAdvice: 'submit_registration_advice', receiveGuaranteeSettlement: 'receive_guarantee_settlement',
})

export const CONVEYANCER_INTEGRATION_BOUNDARY = Object.freeze({
  providerNeutral: true, secretsByReferenceOnly: true, exactMatterBindingRequired: true, exactLaneAndFirmAuthorityRequired: true,
  environmentIsolationRequired: true, idempotencyRequired: true, signedInboundRequired: true, replayProtectionRequired: true,
  purposeAndLegalBasisRequired: true, payloadsByReferenceOnly: true, appendOnlyAuditRequired: true,
  inboundReconciliationOnly: true, inboundCreatesLegalTruth: false, inboundApprovesEvidence: false, inboundMutatesWorkflow: false,
  outboundPreparationOnly: true, outboundDispatchEnabled: false, externalWritesEnabled: false, databaseWritesEnabled: false,
  notificationsSent: false, deedsSubmissionPerformed: false, registrationOutcomeMutated: false,
})

const ENVIRONMENTS = Object.values(CONVEYANCER_INTEGRATION_ENVIRONMENTS)
const CONNECTION_STATUSES = Object.values(CONVEYANCER_INTEGRATION_CONNECTION_STATUSES)
const PROVIDER_CATEGORIES = Object.values(CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES)
const DATA_CLASSIFICATIONS = Object.values(CONVEYANCER_INTEGRATION_DATA_CLASSIFICATIONS)
const LEGAL_BASES = Object.values(CONVEYANCER_INTEGRATION_LEGAL_BASES)
const AUTHENTICATION_TYPES = Object.values(CONVEYANCER_INTEGRATION_AUTHENTICATION_TYPES)
const CAPABILITIES = Object.values(CONVEYANCER_INTEGRATION_CAPABILITIES)
const LANES = Object.values(L)

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function iso(value) { return validDate(value) ? new Date(value).toISOString() : value || null }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
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
function fnv(value) {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function hashValid(value) { return /^(sha256:)?[a-f0-9]{64}$/i.test(text(value)) }
function enumValue(value, allowed) { const normalized = key(value); return allowed.includes(normalized) ? normalized : '' }
function normalizeLanes(values = []) { return unique((Array.isArray(values) ? values : []).map((lane) => normalizeConveyancerCoordinationLane(lane)).filter((lane) => LANES.includes(lane))) }
function normalizeClassifications(values = []) { return unique((Array.isArray(values) ? values : []).map((value) => enumValue(value, DATA_CLASSIFICATIONS))) }
function rawSecretPaths(value, path = '') {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([itemKey, itemValue]) => {
    const current = path ? `${path}.${itemKey}` : itemKey
    if (/^(api_?key|access_?token|refresh_?token|password|private_?key|client_?secret|secret)$/i.test(itemKey) && text(itemValue)) return [current]
    return rawSecretPaths(itemValue, current)
  })
}
function containsInlinePayload(value = {}) { return ['payload', 'body', 'documentContent', 'document_content', 'rawPayload', 'raw_payload'].some((itemKey) => value[itemKey] !== undefined && value[itemKey] !== null) }
function eventDefinition(input = {}) { return { type: key(input.type), capability: enumValue(input.capability, CAPABILITIES), allowedLanes: normalizeLanes(input.allowedLanes || input.allowed_lanes) } }
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null, teamId: text(input.teamId || input.team_id) || null, lane: normalizeConveyancerCoordinationLane(input.lane) || null, firmId: text(input.firmId || input.firm_id) || null } }
function policy(input = {}) { return { purpose: text(input.purpose), legalBasis: enumValue(input.legalBasis || input.legal_basis, LEGAL_BASES), consentReferenceId: text(input.consentReferenceId || input.consent_reference_id) || null, classifications: normalizeClassifications(input.classifications), retentionDays: Number(input.retentionDays || input.retention_days || 0) } }
function matterBinding(model = {}) { return { modelId: text(model.modelId), modelFingerprint: text(model.fingerprint), planId: text(model.plan?.planId), planVersion: Number(model.plan?.planVersion || 0), transactionId: text(model.transactionId), organisationId: text(model.organisationId) } }
function bindingMatchesModel(binding = {}, model = {}) { const expected = matterBinding(model); return Object.keys(expected).every((itemKey) => binding[itemKey] === expected[itemKey]) }
function manifestSnapshot(value = {}) { return stable({ version: value.version, adapterId: value.adapterId, adapterVersion: value.adapterVersion, providerKey: value.providerKey, category: value.category, environments: value.environments, authenticationTypes: value.authenticationTypes, capabilities: value.capabilities, inboundEvents: value.inboundEvents, outboundCommands: value.outboundCommands, createdAt: value.createdAt, createdBy: value.createdBy }) }
function connectionSnapshot(value = {}) { return stable({ version: value.version, connectionId: value.connectionId, adapterId: value.adapterId, adapterFingerprint: value.adapterFingerprint, organisationId: value.organisationId, environment: value.environment, status: value.status, capabilities: value.capabilities, allowedLanes: value.allowedLanes, credentialReferenceId: value.credentialReferenceId, secretVersion: value.secretVersion, webhook: value.webhook, dataPolicy: value.dataPolicy, verifiedAt: value.verifiedAt, createdAt: value.createdAt, createdBy: value.createdBy }) }
function envelopeSnapshot(value = {}) { return stable({ version: value.version, direction: value.direction, recordId: value.recordId, connectionId: value.connectionId, adapterId: value.adapterId, environment: value.environment, type: value.type, capability: value.capability, lane: value.lane, firmId: value.firmId, matter: value.matter, idempotencyKey: value.idempotencyKey, providerEventId: value.providerEventId, payloadReferenceId: value.payloadReferenceId, payloadHash: value.payloadHash, dataPolicy: value.dataPolicy, signature: value.signature, occurredAt: value.occurredAt, receivedAt: value.receivedAt, requestedAt: value.requestedAt, requestedBy: value.requestedBy, authorityReferenceId: value.authorityReferenceId, controls: value.controls }) }

export function validateConveyancerIntegrationAdapterManifest(input = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION) errors.push('unsupported_integration_framework_version')
  if (!value.adapterId || !value.adapterVersion || !value.providerKey) errors.push('adapter_identity_required')
  if (!PROVIDER_CATEGORIES.includes(value.category)) errors.push('adapter_category_invalid')
  if (!value.environments?.length || value.environments.some((item) => !ENVIRONMENTS.includes(item))) errors.push('adapter_environment_invalid')
  if (!value.authenticationTypes?.length || value.authenticationTypes.some((item) => !AUTHENTICATION_TYPES.includes(item))) errors.push('adapter_authentication_invalid')
  if (!value.capabilities?.length || value.capabilities.some((item) => !CAPABILITIES.includes(item))) errors.push('adapter_capability_invalid')
  const definitions = [...(value.inboundEvents || []), ...(value.outboundCommands || [])]
  if (!definitions.length) errors.push('adapter_event_or_command_required')
  if (definitions.some((item) => !item.type || !value.capabilities?.includes(item.capability) || !item.allowedLanes?.length || item.allowedLanes.some((lane) => !LANES.includes(lane)))) errors.push('adapter_definition_invalid')
  const definitionKeys = [...(value.inboundEvents || []).map((item) => `in:${item.type}`), ...(value.outboundCommands || []).map((item) => `out:${item.type}`)]
  if (new Set(definitionKeys).size !== definitionKeys.length) errors.push('adapter_definition_duplicate')
  if (!validDate(value.createdAt) || !value.createdBy) errors.push('adapter_provenance_required')
  if (rawSecretPaths(value).length) errors.push('adapter_contains_raw_secret_material')
  if (value.fingerprint !== fnv(manifestSnapshot(value))) errors.push('adapter_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), manifest: value })
}

export function buildConveyancerIntegrationAdapterManifest(input = {}) {
  const value = { version: CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION, adapterId: key(input.adapterId), adapterVersion: text(input.adapterVersion), providerKey: key(input.providerKey), category: enumValue(input.category, PROVIDER_CATEGORIES), environments: unique((input.environments || []).map((item) => enumValue(item, ENVIRONMENTS))), authenticationTypes: unique((input.authenticationTypes || []).map((item) => enumValue(item, AUTHENTICATION_TYPES))), capabilities: unique((input.capabilities || []).map((item) => enumValue(item, CAPABILITIES))), inboundEvents: (input.inboundEvents || []).map(eventDefinition), outboundCommands: (input.outboundCommands || []).map(eventDefinition), createdAt: iso(input.createdAt), createdBy: text(input.createdBy), fingerprint: null }
  value.fingerprint = fnv(manifestSnapshot(value)); const validation = validateConveyancerIntegrationAdapterManifest(value); const errors = [...validation.errors]
  if (rawSecretPaths(input).length) errors.push('adapter_contains_raw_secret_material')
  return deepFreeze({ ok: errors.length === 0, code: errors.length ? 'integration_adapter_manifest_invalid' : 'integration_adapter_manifest_valid', errors: unique(errors), manifest: validation.manifest })
}

export function buildConveyancerIntegrationRegistry({ manifests = [] } = {}) {
  const validations = manifests.map(validateConveyancerIntegrationAdapterManifest); const errors = validations.flatMap((result) => result.errors)
  const keys = validations.map((result) => `${result.manifest.adapterId}:${result.manifest.adapterVersion}`)
  if (new Set(keys).size !== keys.length) errors.push('integration_adapter_registration_duplicate')
  const entries = validations.map((result) => result.manifest).sort((a, b) => `${a.adapterId}:${a.adapterVersion}`.localeCompare(`${b.adapterId}:${b.adapterVersion}`))
  const registry = { version: CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION, entries, fingerprint: fnv(entries.map((item) => item.fingerprint)), persistencePerformed: false }
  return deepFreeze({ ok: errors.length === 0, code: errors.length ? 'integration_registry_invalid' : 'integration_registry_valid', errors: unique(errors), registry })
}

export function validateConveyancerIntegrationConnection(input = {}, { manifest = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const manifestValidation = validateConveyancerIntegrationAdapterManifest(manifest)
  if (!manifestValidation.valid) errors.push('connection_adapter_invalid')
  if (value.version !== CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION) errors.push('unsupported_integration_framework_version')
  if (!value.connectionId || !value.organisationId) errors.push('connection_identity_required')
  if (value.adapterId !== manifest.adapterId || value.adapterFingerprint !== manifest.fingerprint) errors.push('connection_adapter_binding_invalid')
  if (!ENVIRONMENTS.includes(value.environment) || !manifest.environments?.includes(value.environment)) errors.push('connection_environment_invalid')
  if (!CONNECTION_STATUSES.includes(value.status)) errors.push('connection_status_invalid')
  if (!value.capabilities?.length || value.capabilities.some((item) => !manifest.capabilities?.includes(item))) errors.push('connection_capability_invalid')
  if (!value.allowedLanes?.length || value.allowedLanes.some((lane) => !LANES.includes(lane))) errors.push('connection_lane_scope_invalid')
  if (!value.credentialReferenceId || !value.secretVersion) errors.push('connection_credential_reference_required')
  if (!value.webhook?.endpointReferenceId || !value.webhook?.secretReferenceId || !value.webhook?.signingAlgorithm || !Number.isInteger(value.webhook?.replayWindowSeconds) || value.webhook.replayWindowSeconds < 60 || value.webhook.replayWindowSeconds > 900) errors.push('connection_webhook_security_invalid')
  const p = value.dataPolicy || {}; if (!p.purpose || !LEGAL_BASES.includes(p.legalBasis) || !p.classifications?.length || !Number.isInteger(p.retentionDays) || p.retentionDays < 1) errors.push('connection_data_policy_invalid')
  if (p.legalBasis === CONVEYANCER_INTEGRATION_LEGAL_BASES.consent && !p.consentReferenceId) errors.push('connection_consent_reference_required')
  if ([CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.verified, CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.active].includes(value.status) && !validDate(value.verifiedAt)) errors.push('connection_verification_required')
  if (!validDate(value.createdAt) || !value.createdBy) errors.push('connection_provenance_required')
  if (rawSecretPaths(value).length) errors.push('connection_contains_raw_secret_material')
  if (value.fingerprint !== fnv(connectionSnapshot(value))) errors.push('connection_fingerprint_invalid')
  if (value.externalWritesEnabled || value.databaseWritesEnabled || value.notificationsSent) errors.push('connection_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), connection: value })
}

export function buildConveyancerIntegrationConnection(input = {}, { manifest = {} } = {}) {
  const webhook = input.webhook || {}; const value = { version: CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION, connectionId: text(input.connectionId), adapterId: text(manifest.adapterId), adapterFingerprint: text(manifest.fingerprint), organisationId: text(input.organisationId), environment: enumValue(input.environment, ENVIRONMENTS), status: enumValue(input.status, CONNECTION_STATUSES), capabilities: unique((input.capabilities || []).map((item) => enumValue(item, CAPABILITIES))), allowedLanes: normalizeLanes(input.allowedLanes), credentialReferenceId: text(input.credentialReferenceId), secretVersion: text(input.secretVersion), webhook: { endpointReferenceId: text(webhook.endpointReferenceId), secretReferenceId: text(webhook.secretReferenceId), signingAlgorithm: key(webhook.signingAlgorithm), replayWindowSeconds: Number(webhook.replayWindowSeconds || 0) }, dataPolicy: policy(input.dataPolicy), verifiedAt: iso(input.verifiedAt), createdAt: iso(input.createdAt), createdBy: text(input.createdBy), fingerprint: null, externalWritesEnabled: false, databaseWritesEnabled: false, notificationsSent: false }
  value.fingerprint = fnv(connectionSnapshot(value)); const validation = validateConveyancerIntegrationConnection(value, { manifest }); const errors = [...validation.errors]
  if (rawSecretPaths(input).length) errors.push('connection_contains_raw_secret_material')
  return deepFreeze({ ok: errors.length === 0, code: errors.length ? 'integration_connection_invalid' : 'integration_connection_valid', errors: unique(errors), connection: validation.connection })
}

function findDefinition(manifest, direction, type) { const collection = direction === 'inbound' ? manifest.inboundEvents : manifest.outboundCommands; return (collection || []).find((item) => item.type === key(type)) || null }
function validateSharedEnvelope(value, { dependencyModel, manifest, connection, direction }) {
  const errors = []; const modelValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel); const connectionValidation = validateConveyancerIntegrationConnection(connection, { manifest })
  if (!modelValidation.valid) errors.push('integration_dependency_model_invalid')
  if (!connectionValidation.valid || connection.status !== CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.active) errors.push('integration_connection_not_active')
  if (connection.organisationId !== dependencyModel.organisationId || !bindingMatchesModel(value.matter || {}, dependencyModel)) errors.push('integration_matter_binding_invalid')
  if (value.connectionId !== connection.connectionId || value.adapterId !== manifest.adapterId || value.environment !== connection.environment) errors.push('integration_connection_binding_invalid')
  if (!connection.allowedLanes?.includes(value.lane) || !dependencyModel.requiredLanes?.includes(value.lane)) errors.push('integration_lane_not_allowed')
  const roleBinding = dependencyModel.roleBindings?.[value.lane]; if (!roleBinding || value.firmId !== roleBinding.firmId) errors.push('integration_firm_binding_invalid')
  const definition = findDefinition(manifest, direction, value.type)
  if (!definition || definition.capability !== value.capability || !definition.allowedLanes.includes(value.lane) || !connection.capabilities.includes(value.capability)) errors.push('integration_operation_not_supported')
  if (!value.idempotencyKey) errors.push('integration_idempotency_key_required')
  if (!value.payloadReferenceId || !hashValid(value.payloadHash)) errors.push('integration_payload_reference_invalid')
  const p = value.dataPolicy || {}; if (!p.purpose || !LEGAL_BASES.includes(p.legalBasis) || p.legalBasis !== connection.dataPolicy.legalBasis || !p.classifications?.length || p.classifications.some((item) => !connection.dataPolicy.classifications.includes(item)) || !Number.isInteger(p.retentionDays) || p.retentionDays < 1 || p.retentionDays > connection.dataPolicy.retentionDays) errors.push('integration_data_policy_invalid')
  if (p.legalBasis === CONVEYANCER_INTEGRATION_LEGAL_BASES.consent && !p.consentReferenceId) errors.push('integration_consent_reference_required')
  if (p.legalBasis === CONVEYANCER_INTEGRATION_LEGAL_BASES.consent && p.consentReferenceId !== connection.dataPolicy.consentReferenceId) errors.push('integration_consent_binding_invalid')
  if (rawSecretPaths(value).length) errors.push('integration_record_contains_raw_secret_material')
  if (value.fingerprint !== fnv(envelopeSnapshot(value))) errors.push('integration_record_fingerprint_invalid')
  const expectedControls = direction === 'inbound'
    ? { reconciliationOnly: true, workflowMutated: false, evidenceApproved: false, legalTruthCreated: false, registrationOutcomeMutated: false, databaseWritePerformed: false }
    : { preparationOnly: true, dispatchPerformed: false, externalWritePerformed: false, workflowMutated: false, databaseWritePerformed: false }
  if (Object.entries(expectedControls).some(([control, expected]) => value.controls?.[control] !== expected)) errors.push('integration_side_effect_boundary_violated')
  return errors
}

function semanticFingerprint(value) { const snapshot = envelopeSnapshot(value); delete snapshot.recordId; delete snapshot.receivedAt; delete snapshot.requestedAt; delete snapshot.controls; return fnv(snapshot) }
function idempotency(existing = [], candidate = {}) {
  const match = existing.find((item) => item.direction === candidate.direction && item.connectionId === candidate.connectionId && item.idempotencyKey === candidate.idempotencyKey)
  if (!match) return { state: 'new', match: null }
  return semanticFingerprint(match) === semanticFingerprint(candidate) ? { state: 'duplicate', match } : { state: 'conflict', match }
}

export function validateConveyancerIntegrationInboundEvent(input = {}, context = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = validateSharedEnvelope(value, { ...context, direction: 'inbound' })
  if (value.direction !== 'inbound' || !value.recordId || !value.providerEventId || !Object.values(CONVEYANCER_INTEGRATION_INBOUND_STATUSES).includes(value.status)) errors.push('inbound_event_identity_required')
  if (!validDate(value.occurredAt) || !validDate(value.receivedAt) || new Date(value.occurredAt) > new Date(value.receivedAt)) errors.push('inbound_event_timestamp_invalid')
  if (value.signature?.verified !== true || value.signature?.algorithm !== context.connection?.webhook?.signingAlgorithm || value.signature?.keyReferenceId !== context.connection?.webhook?.secretReferenceId || !hashValid(value.signature?.nonceHash) || !hashValid(value.signature?.payloadHash) || value.signature?.payloadHash !== value.payloadHash || !validDate(value.signature?.signedAt)) errors.push('inbound_signature_invalid')
  const replayWindow = Number(context.connection?.webhook?.replayWindowSeconds || 0) * 1000
  if (validDate(value.signature?.signedAt) && validDate(value.receivedAt) && Math.abs(new Date(value.receivedAt) - new Date(value.signature.signedAt)) > replayWindow) errors.push('inbound_replay_window_exceeded')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), event: value })
}

export function buildConveyancerIntegrationInboundEvent(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, existingEvents = [] } = {}) {
  const definition = findDefinition(manifest, 'inbound', input.type); const sig = input.signature || {}; const lane = normalizeConveyancerCoordinationLane(input.lane); const value = { version: CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION, direction: 'inbound', recordId: text(input.recordId), connectionId: text(connection.connectionId), adapterId: text(manifest.adapterId), environment: text(connection.environment), type: key(input.type), capability: definition?.capability || '', lane, firmId: text(input.firmId), matter: matterBinding(dependencyModel), idempotencyKey: key(input.idempotencyKey), providerEventId: text(input.providerEventId), payloadReferenceId: text(input.payloadReferenceId), payloadHash: text(input.payloadHash).toLowerCase(), dataPolicy: policy(input.dataPolicy), signature: { verified: sig.verified === true, algorithm: key(sig.algorithm), keyReferenceId: text(sig.keyReferenceId), nonceHash: text(sig.nonceHash), payloadHash: text(sig.payloadHash).toLowerCase(), signedAt: iso(sig.signedAt) }, occurredAt: iso(input.occurredAt), receivedAt: iso(input.receivedAt), requestedAt: null, requestedBy: null, authorityReferenceId: null, controls: { reconciliationOnly: true, workflowMutated: false, evidenceApproved: false, legalTruthCreated: false, registrationOutcomeMutated: false, databaseWritePerformed: false }, status: CONVEYANCER_INTEGRATION_INBOUND_STATUSES.acceptedForReview, fingerprint: null }
  value.fingerprint = fnv(envelopeSnapshot(value)); const validation = validateConveyancerIntegrationInboundEvent(value, { dependencyModel, manifest, connection }); const sourceErrors = []
  if (rawSecretPaths(input).length) sourceErrors.push('integration_record_contains_raw_secret_material')
  if (containsInlinePayload(input)) sourceErrors.push('integration_inline_payload_prohibited')
  if (sourceErrors.length) return deepFreeze({ ok: false, code: 'integration_inbound_invalid', errors: unique([...validation.errors, ...sourceErrors]), event: validation.event })
  const duplicate = validation.valid ? idempotency(existingEvents, value) : { state: 'new' }
  if (duplicate.state === 'conflict') return deepFreeze({ ok: false, code: 'integration_idempotency_conflict', errors: ['integration_idempotency_conflict'], event: value })
  if (duplicate.state === 'duplicate') { value.status = CONVEYANCER_INTEGRATION_INBOUND_STATUSES.duplicate; return deepFreeze({ ok: true, code: 'integration_inbound_duplicate', errors: [], event: deepFreeze(value), duplicateOf: duplicate.match.recordId }) }
  return deepFreeze({ ok: validation.valid, code: validation.valid ? 'integration_inbound_accepted_for_review' : 'integration_inbound_invalid', errors: validation.errors, event: validation.event })
}

function actorAllowed(actorValue, dependencyModel, lane) {
  if (!actorValue.userId || actorValue.lane !== lane) return false
  const binding = dependencyModel.roleBindings?.[lane]; if (!binding || actorValue.firmId !== binding.firmId) return false
  if (actorValue.role === R.firmManager) return true
  const expected = { [L.transfer]: R.transferAttorney, [L.bond]: R.bondAttorney, [L.cancellation]: R.cancellationAttorney }[lane]
  return actorValue.role === expected || ([R.secretary, R.accounts].includes(actorValue.role) && actorValue.teamId && actorValue.teamId === binding.owner?.teamId)
}

export function validateConveyancerIntegrationOutboundCommand(input = {}, context = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = validateSharedEnvelope(value, { ...context, direction: 'outbound' })
  if (value.direction !== 'outbound' || !value.recordId || !value.authorityReferenceId || !Object.values(CONVEYANCER_INTEGRATION_OUTBOUND_STATUSES).includes(value.status)) errors.push('outbound_command_identity_required')
  if (!validDate(value.requestedAt) || !actorAllowed(value.requestedBy || {}, context.dependencyModel || {}, value.lane)) errors.push('outbound_actor_authority_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), command: value })
}

export function buildConveyancerIntegrationOutboundCommand(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, existingCommands = [] } = {}) {
  const definition = findDefinition(manifest, 'outbound', input.type); const lane = normalizeConveyancerCoordinationLane(input.lane); const value = { version: CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION, direction: 'outbound', recordId: text(input.recordId), connectionId: text(connection.connectionId), adapterId: text(manifest.adapterId), environment: text(connection.environment), type: key(input.type), capability: definition?.capability || '', lane, firmId: text(input.firmId), matter: matterBinding(dependencyModel), idempotencyKey: key(input.idempotencyKey), providerEventId: null, payloadReferenceId: text(input.payloadReferenceId), payloadHash: text(input.payloadHash).toLowerCase(), dataPolicy: policy(input.dataPolicy), signature: null, occurredAt: null, receivedAt: null, requestedAt: iso(input.requestedAt), requestedBy: actor(input.requestedBy), authorityReferenceId: text(input.authorityReferenceId), controls: { preparationOnly: true, dispatchPerformed: false, externalWritePerformed: false, workflowMutated: false, databaseWritePerformed: false }, status: CONVEYANCER_INTEGRATION_OUTBOUND_STATUSES.prepared, fingerprint: null }
  value.fingerprint = fnv(envelopeSnapshot(value)); const validation = validateConveyancerIntegrationOutboundCommand(value, { dependencyModel, manifest, connection }); const sourceErrors = []
  if (rawSecretPaths(input).length) sourceErrors.push('integration_record_contains_raw_secret_material')
  if (containsInlinePayload(input)) sourceErrors.push('integration_inline_payload_prohibited')
  if (sourceErrors.length) return deepFreeze({ ok: false, code: 'integration_outbound_invalid', errors: unique([...validation.errors, ...sourceErrors]), command: validation.command })
  const duplicate = validation.valid ? idempotency(existingCommands, value) : { state: 'new' }
  if (duplicate.state === 'conflict') return deepFreeze({ ok: false, code: 'integration_idempotency_conflict', errors: ['integration_idempotency_conflict'], command: value })
  if (duplicate.state === 'duplicate') { value.status = CONVEYANCER_INTEGRATION_OUTBOUND_STATUSES.duplicate; return deepFreeze({ ok: true, code: 'integration_outbound_duplicate', errors: [], command: deepFreeze(value), duplicateOf: duplicate.match.recordId }) }
  return deepFreeze({ ok: validation.valid, code: validation.valid ? 'integration_outbound_prepared' : 'integration_outbound_invalid', errors: validation.errors, command: validation.command })
}
