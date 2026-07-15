import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../transactions/conveyancerMatterPlanContract.js'
import { CONVEYANCER_COORDINATION_LANES as L, normalizeConveyancerCoordinationLane } from '../transactions/conveyancerCoordinationContract.js'
import { validateConveyancerThreeRoleDependencyModel } from '../transactions/conveyancerThreeRoleDependencyModel.js'
import {
  CONVEYANCER_INTEGRATION_CAPABILITIES as C,
  CONVEYANCER_INTEGRATION_CONNECTION_STATUSES,
  CONVEYANCER_INTEGRATION_DATA_CLASSIFICATIONS as D,
  CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION,
  CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES,
  buildConveyancerIntegrationAdapterManifest,
  buildConveyancerIntegrationOutboundCommand,
  validateConveyancerIntegrationAdapterManifest,
  validateConveyancerIntegrationConnection,
  validateConveyancerIntegrationInboundEvent,
  validateConveyancerIntegrationOutboundCommand,
} from './conveyancerIntegrationFramework.js'

export const CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION = 'conveyancer_practice_management_integration_f2_v1'

export const PRACTICE_MANAGEMENT_RESOURCES = Object.freeze({ matter: 'matter', party: 'party', contact: 'contact', task: 'task', documentMetadata: 'document_metadata', financialSummary: 'financial_summary' })
export const PRACTICE_MANAGEMENT_SYNC_DIRECTIONS = Object.freeze({ inbound: 'inbound', outbound: 'outbound', bidirectional: 'bidirectional' })
export const PRACTICE_MANAGEMENT_AUTHORITIES = Object.freeze({ platform: 'platform', practiceManagement: 'practice_management', manualReview: 'manual_review' })
export const PRACTICE_MANAGEMENT_CONFLICT_POLICIES = Object.freeze({ platformWins: 'platform_wins', providerWins: 'provider_wins', manualReview: 'manual_review', noOverwrite: 'no_overwrite' })
export const PRACTICE_MANAGEMENT_SYNC_ACTIONS = Object.freeze({ inSync: 'in_sync', importForReview: 'import_for_review', exportPrepared: 'export_prepared', conflictReview: 'conflict_review', ignored: 'ignored' })
export const PRACTICE_MANAGEMENT_PLAN_STATUSES = Object.freeze({ inSync: 'in_sync', exportPrepared: 'export_prepared', reviewRequired: 'review_required', blocked: 'blocked' })

const PR = PRACTICE_MANAGEMENT_RESOURCES
const SD = PRACTICE_MANAGEMENT_SYNC_DIRECTIONS
const AU = PRACTICE_MANAGEMENT_AUTHORITIES
const CP = PRACTICE_MANAGEMENT_CONFLICT_POLICIES
const SA = PRACTICE_MANAGEMENT_SYNC_ACTIONS
const PS = PRACTICE_MANAGEMENT_PLAN_STATUSES

export const PRACTICE_MANAGEMENT_CANONICAL_FIELDS = Object.freeze([
  Object.freeze({ resource: PR.matter, field: 'matter_reference', classification: D.professionalConfidential, defaultDirection: SD.inbound, defaultAuthority: AU.practiceManagement, restricted: false }),
  Object.freeze({ resource: PR.matter, field: 'description', classification: D.personal, defaultDirection: SD.bidirectional, defaultAuthority: AU.manualReview, restricted: true }),
  Object.freeze({ resource: PR.matter, field: 'status', classification: D.professionalConfidential, defaultDirection: SD.outbound, defaultAuthority: AU.platform, restricted: false }),
  Object.freeze({ resource: PR.matter, field: 'opened_at', classification: D.professionalConfidential, defaultDirection: SD.inbound, defaultAuthority: AU.practiceManagement, restricted: false }),
  Object.freeze({ resource: PR.matter, field: 'responsible_professional', classification: D.personal, defaultDirection: SD.bidirectional, defaultAuthority: AU.manualReview, restricted: true }),
  Object.freeze({ resource: PR.party, field: 'party_reference', classification: D.personal, defaultDirection: SD.bidirectional, defaultAuthority: AU.manualReview, restricted: true }),
  Object.freeze({ resource: PR.party, field: 'role', classification: D.professionalConfidential, defaultDirection: SD.outbound, defaultAuthority: AU.platform, restricted: false }),
  Object.freeze({ resource: PR.contact, field: 'contact_reference', classification: D.personal, defaultDirection: SD.bidirectional, defaultAuthority: AU.manualReview, restricted: true }),
  Object.freeze({ resource: PR.task, field: 'task_key', classification: D.professionalConfidential, defaultDirection: SD.outbound, defaultAuthority: AU.platform, restricted: false }),
  Object.freeze({ resource: PR.task, field: 'status', classification: D.professionalConfidential, defaultDirection: SD.outbound, defaultAuthority: AU.platform, restricted: false }),
  Object.freeze({ resource: PR.task, field: 'due_at', classification: D.professionalConfidential, defaultDirection: SD.bidirectional, defaultAuthority: AU.manualReview, restricted: false }),
  Object.freeze({ resource: PR.documentMetadata, field: 'document_reference', classification: D.professionalConfidential, defaultDirection: SD.outbound, defaultAuthority: AU.platform, restricted: false }),
  Object.freeze({ resource: PR.documentMetadata, field: 'status', classification: D.professionalConfidential, defaultDirection: SD.outbound, defaultAuthority: AU.platform, restricted: false }),
  Object.freeze({ resource: PR.financialSummary, field: 'balance', classification: D.financial, defaultDirection: SD.inbound, defaultAuthority: AU.manualReview, restricted: true }),
  Object.freeze({ resource: PR.financialSummary, field: 'last_posted_at', classification: D.financial, defaultDirection: SD.inbound, defaultAuthority: AU.manualReview, restricted: true }),
])

export const PRACTICE_MANAGEMENT_INTEGRATION_BOUNDARY = Object.freeze({
  vendorNeutral: true, valuesStoredByReferenceOnly: true, documentBodiesTransferred: false, clientIdentityAutoMerged: false,
  financialValuesAutoAccepted: false, timestampWinsAllowed: false, inboundReviewRequired: true, conflictsRequireHumanDecision: true,
  outboundDispatchEnabled: false, providerWritePerformed: false, platformWritePerformed: false, databaseWritePerformed: false,
  workflowMutated: false, tasksCompleted: false, documentsApproved: false, financialLedgerMutated: false,
})

const RESOURCES = Object.values(PRACTICE_MANAGEMENT_RESOURCES)
const DIRECTIONS = Object.values(PRACTICE_MANAGEMENT_SYNC_DIRECTIONS)
const AUTHORITIES = Object.values(PRACTICE_MANAGEMENT_AUTHORITIES)
const CONFLICT_POLICIES = Object.values(PRACTICE_MANAGEMENT_CONFLICT_POLICIES)
const PLAN_STATUSES = Object.values(PRACTICE_MANAGEMENT_PLAN_STATUSES)
const ACTIONS = Object.values(PRACTICE_MANAGEMENT_SYNC_ACTIONS)

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function enumValue(value, allowed) { const normalized = key(value); return allowed.includes(normalized) ? normalized : '' }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function iso(value) { return validDate(value) ? new Date(value).toISOString() : value || null }
function hashValid(value) { return /^(sha256:)?[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function matterBinding(model = {}) { return { modelId: text(model.modelId), modelFingerprint: text(model.fingerprint), planId: text(model.plan?.planId), planVersion: Number(model.plan?.planVersion || 0), transactionId: text(model.transactionId), organisationId: text(model.organisationId) } }
function bindingMatches(binding = {}, model = {}) { const expected = matterBinding(model); return Object.keys(expected).every((itemKey) => binding[itemKey] === expected[itemKey]) }
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null, teamId: text(input.teamId || input.team_id) || null, lane: normalizeConveyancerCoordinationLane(input.lane) || null, firmId: text(input.firmId || input.firm_id) || null } }
function actorAllowed(inputActor, model, lane, firmId, managerOnly = false) { const value = actor(inputActor); const binding = model.roleBindings?.[lane]; if (!value.userId || value.lane !== lane || value.firmId !== firmId || binding?.firmId !== firmId) return false; if (managerOnly) return value.role === R.firmManager; if (value.role === R.firmManager) return true; const expected = { [L.transfer]: R.transferAttorney, [L.bond]: R.bondAttorney, [L.cancellation]: R.cancellationAttorney }[lane]; return value.role === expected || ([R.secretary, R.accounts].includes(value.role) && value.teamId && value.teamId === binding.owner?.teamId) }
function fieldDefinition(resource, field) { return PRACTICE_MANAGEMENT_CANONICAL_FIELDS.find((item) => item.resource === resource && item.field === field) || null }
function profileSnapshot(value = {}) { return stable({ version: value.version, profileId: value.profileId, revision: value.revision, connectionId: value.connectionId, connectionFingerprint: value.connectionFingerprint, adapterId: value.adapterId, adapterFingerprint: value.adapterFingerprint, organisationId: value.organisationId, environment: value.environment, lane: value.lane, firmId: value.firmId, rules: value.rules, approvedAt: value.approvedAt, approvedBy: value.approvedBy, createdAt: value.createdAt, createdBy: value.createdBy }) }
function linkSnapshot(value = {}) { return stable({ version: value.version, linkId: value.linkId, connectionId: value.connectionId, connectionFingerprint: value.connectionFingerprint, profileId: value.profileId, profileFingerprint: value.profileFingerprint, matter: value.matter, lane: value.lane, firmId: value.firmId, providerMatterReferenceId: value.providerMatterReferenceId, providerMatterReferenceHash: value.providerMatterReferenceHash, verificationEvidenceReferenceId: value.verificationEvidenceReferenceId, verificationEvidenceHash: value.verificationEvidenceHash, status: value.status, verifiedAt: value.verifiedAt, verifiedBy: value.verifiedBy }) }
function planSnapshot(value = {}) { return stable({ version: value.version, planId: value.planId, connectionId: value.connectionId, connectionFingerprint: value.connectionFingerprint, profileId: value.profileId, profileFingerprint: value.profileFingerprint, linkId: value.linkId, linkFingerprint: value.linkFingerprint, matter: value.matter, lane: value.lane, firmId: value.firmId, sourceInboundEventId: value.sourceInboundEventId, sourceInboundEventFingerprint: value.sourceInboundEventFingerprint, generatedAt: value.generatedAt, actions: value.actions, counts: value.counts, status: value.status, outboundCommandId: value.outboundCommandId, outboundCommandFingerprint: value.outboundCommandFingerprint, controls: value.controls }) }

export function buildPracticeManagementAdapterManifest(input = {}) {
  const lanes = [L.transfer, L.bond, L.cancellation]
  return buildConveyancerIntegrationAdapterManifest({ adapterId: input.adapterId, adapterVersion: input.adapterVersion, providerKey: input.providerKey, category: CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES.practiceManagement, environments: input.environments, authenticationTypes: input.authenticationTypes, capabilities: [C.receivePracticeSnapshot, C.syncPracticeWorkspace, C.linkPracticeMatter], inboundEvents: [{ type: 'practice_snapshot_received', capability: C.receivePracticeSnapshot, allowedLanes: lanes }, { type: 'practice_matter_link_verified', capability: C.receivePracticeSnapshot, allowedLanes: lanes }], outboundCommands: [{ type: 'practice_sync_batch_requested', capability: C.syncPracticeWorkspace, allowedLanes: lanes }, { type: 'practice_matter_link_requested', capability: C.linkPracticeMatter, allowedLanes: lanes }], createdAt: input.createdAt, createdBy: input.createdBy })
}

function normalizeRule(input = {}) { const resource = enumValue(input.resource, RESOURCES); const field = key(input.canonicalField || input.canonical_field); const definition = fieldDefinition(resource, field); return { ruleId: key(input.ruleId || `${resource}.${field}`), resource, canonicalField: field, providerField: text(input.providerField || input.provider_field), direction: enumValue(input.direction || definition?.defaultDirection, DIRECTIONS), authority: enumValue(input.authority || definition?.defaultAuthority, AUTHORITIES), conflictPolicy: enumValue(input.conflictPolicy || input.conflict_policy || CP.manualReview, CONFLICT_POLICIES), classification: definition?.classification || '', required: input.required === true } }

export function validatePracticeManagementMappingProfile(input = {}, { manifest = {}, connection = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const manifestValidation = validateConveyancerIntegrationAdapterManifest(manifest); const connectionValidation = validateConveyancerIntegrationConnection(connection, { manifest })
  if (!manifestValidation.valid || manifest.category !== CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES.practiceManagement) errors.push('practice_adapter_invalid')
  if (!connectionValidation.valid || connection.status !== CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.active) errors.push('practice_connection_not_active')
  if (value.version !== CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION || !value.profileId || !Number.isInteger(value.revision) || value.revision < 1) errors.push('practice_mapping_identity_invalid')
  if (value.connectionId !== connection.connectionId || value.connectionFingerprint !== connection.fingerprint || value.adapterId !== manifest.adapterId || value.adapterFingerprint !== manifest.fingerprint || value.organisationId !== connection.organisationId || value.environment !== connection.environment) errors.push('practice_mapping_connection_binding_invalid')
  if (!connection.allowedLanes?.includes(value.lane) || !value.firmId) errors.push('practice_mapping_lane_scope_invalid')
  if (!Array.isArray(value.rules) || !value.rules.length) errors.push('practice_mapping_rules_required')
  const ruleIds = (value.rules || []).map((item) => item.ruleId); if (new Set(ruleIds).size !== ruleIds.length) errors.push('practice_mapping_rule_duplicate')
  for (const rule of value.rules || []) {
    const definition = fieldDefinition(rule.resource, rule.canonicalField)
    if (!definition || !rule.providerField || !DIRECTIONS.includes(rule.direction) || !AUTHORITIES.includes(rule.authority) || !CONFLICT_POLICIES.includes(rule.conflictPolicy) || rule.classification !== definition?.classification) errors.push(`practice_mapping_rule_invalid:${rule.ruleId}`)
    if (rule.authority === AU.platform && ![SD.outbound, SD.bidirectional].includes(rule.direction)) errors.push(`practice_mapping_authority_direction_invalid:${rule.ruleId}`)
    if (rule.authority === AU.practiceManagement && ![SD.inbound, SD.bidirectional].includes(rule.direction)) errors.push(`practice_mapping_authority_direction_invalid:${rule.ruleId}`)
    if (definition?.restricted && (rule.authority !== AU.manualReview || ![CP.manualReview, CP.noOverwrite].includes(rule.conflictPolicy))) errors.push(`practice_mapping_restricted_field_policy_invalid:${rule.ruleId}`)
    if (rule.conflictPolicy === CP.platformWins && rule.authority !== AU.platform) errors.push(`practice_mapping_conflict_policy_invalid:${rule.ruleId}`)
    if (rule.conflictPolicy === CP.providerWins && rule.authority !== AU.practiceManagement) errors.push(`practice_mapping_conflict_policy_invalid:${rule.ruleId}`)
  }
  if (!(value.rules || []).some((item) => item.resource === PR.matter && item.canonicalField === 'matter_reference')) errors.push('practice_mapping_matter_reference_required')
  if (!(value.rules || []).some((item) => item.resource === PR.matter && item.canonicalField === 'status')) errors.push('practice_mapping_matter_status_required')
  if (!validDate(value.approvedAt) || value.approvedBy?.role !== R.firmManager || !value.approvedBy?.userId || value.approvedBy?.lane !== value.lane || value.approvedBy?.firmId !== value.firmId) errors.push('practice_mapping_approval_invalid')
  if (!validDate(value.createdAt) || !value.createdBy) errors.push('practice_mapping_provenance_invalid')
  if (value.fingerprint !== fnv(profileSnapshot(value))) errors.push('practice_mapping_fingerprint_invalid')
  if (value.databaseWritePerformed || value.providerWritePerformed) errors.push('practice_mapping_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), profile: value })
}

export function buildPracticeManagementMappingProfile(input = {}, { manifest = {}, connection = {} } = {}) {
  const value = { version: CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION, profileId: text(input.profileId), revision: Number(input.revision || 1), connectionId: text(connection.connectionId), connectionFingerprint: text(connection.fingerprint), adapterId: text(manifest.adapterId), adapterFingerprint: text(manifest.fingerprint), organisationId: text(connection.organisationId), environment: text(connection.environment), lane: normalizeConveyancerCoordinationLane(input.lane), firmId: text(input.firmId), rules: (input.rules || []).map(normalizeRule), approvedAt: iso(input.approvedAt), approvedBy: actor(input.approvedBy), createdAt: iso(input.createdAt), createdBy: text(input.createdBy), fingerprint: null, databaseWritePerformed: false, providerWritePerformed: false }
  value.fingerprint = fnv(profileSnapshot(value)); const validation = validatePracticeManagementMappingProfile(value, { manifest, connection })
  return deepFreeze({ ok: validation.valid, code: validation.valid ? 'practice_mapping_profile_valid' : 'practice_mapping_profile_invalid', errors: validation.errors, profile: validation.profile })
}

export function validatePracticeManagementMatterLink(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const modelValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel); const profileValidation = validatePracticeManagementMappingProfile(profile, { manifest, connection })
  if (!modelValidation.valid) errors.push('practice_link_dependency_model_invalid')
  if (!profileValidation.valid) errors.push('practice_link_mapping_profile_invalid')
  if (value.version !== CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION || !value.linkId || value.status !== 'verified') errors.push('practice_link_identity_invalid')
  if (value.connectionId !== connection.connectionId || value.connectionFingerprint !== connection.fingerprint || value.profileId !== profile.profileId || value.profileFingerprint !== profile.fingerprint) errors.push('practice_link_configuration_binding_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.matter?.organisationId !== connection.organisationId) errors.push('practice_link_matter_binding_invalid')
  if (value.lane !== profile.lane || value.firmId !== profile.firmId || dependencyModel.roleBindings?.[value.lane]?.firmId !== value.firmId) errors.push('practice_link_lane_firm_invalid')
  if (!value.providerMatterReferenceId || !hashValid(value.providerMatterReferenceHash) || !value.verificationEvidenceReferenceId || !hashValid(value.verificationEvidenceHash)) errors.push('practice_link_evidence_invalid')
  if (!validDate(value.verifiedAt) || !actorAllowed(value.verifiedBy || {}, dependencyModel, value.lane, value.firmId)) errors.push('practice_link_authority_invalid')
  if (value.fingerprint !== fnv(linkSnapshot(value))) errors.push('practice_link_fingerprint_invalid')
  if (value.providerWritePerformed || value.platformWritePerformed || value.invitationSent) errors.push('practice_link_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), link: value })
}

export function buildPracticeManagementMatterLink(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {} } = {}) {
  const value = { version: CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION, linkId: text(input.linkId), connectionId: text(connection.connectionId), connectionFingerprint: text(connection.fingerprint), profileId: text(profile.profileId), profileFingerprint: text(profile.fingerprint), matter: matterBinding(dependencyModel), lane: normalizeConveyancerCoordinationLane(input.lane), firmId: text(input.firmId), providerMatterReferenceId: text(input.providerMatterReferenceId), providerMatterReferenceHash: text(input.providerMatterReferenceHash).toLowerCase(), verificationEvidenceReferenceId: text(input.verificationEvidenceReferenceId), verificationEvidenceHash: text(input.verificationEvidenceHash).toLowerCase(), status: 'verified', verifiedAt: iso(input.verifiedAt), verifiedBy: actor(input.verifiedBy), fingerprint: null, providerWritePerformed: false, platformWritePerformed: false, invitationSent: false }
  value.fingerprint = fnv(linkSnapshot(value)); const validation = validatePracticeManagementMatterLink(value, { dependencyModel, manifest, connection, profile })
  return deepFreeze({ ok: validation.valid, code: validation.valid ? 'practice_matter_link_verified' : 'practice_matter_link_invalid', errors: validation.errors, link: validation.link })
}

function observation(input = {}) { return { observationId: text(input.observationId), resource: enumValue(input.resource, RESOURCES), canonicalField: key(input.canonicalField), recordKey: key(input.recordKey || 'matter'), valueReferenceId: text(input.valueReferenceId), valueHash: text(input.valueHash).toLowerCase(), version: text(input.version), updatedAt: iso(input.updatedAt) } }
function containsInlineObservationValue(input = {}) { return ['value', 'rawValue', 'raw_value', 'displayValue', 'display_value', 'content', 'documentBody', 'document_body'].some((itemKey) => input[itemKey] !== undefined && input[itemKey] !== null) }
function observationErrors(values = [], prefix) { const errors = []; const identities = values.map((item) => `${item.resource}:${item.canonicalField}:${item.recordKey}`); if (new Set(identities).size !== identities.length) errors.push(`${prefix}_observation_duplicate`); for (const item of values) { if (!item.observationId || !fieldDefinition(item.resource, item.canonicalField) || !item.recordKey || !item.valueReferenceId || !hashValid(item.valueHash) || !item.version || !validDate(item.updatedAt)) errors.push(`${prefix}_observation_invalid:${item.observationId || 'unknown'}`) } return errors }
function canInbound(direction) { return [SD.inbound, SD.bidirectional].includes(direction) }
function canOutbound(direction) { return [SD.outbound, SD.bidirectional].includes(direction) }
function decide(rule, platformValue, providerValue) {
  if (platformValue && providerValue && platformValue.valueHash === providerValue.valueHash) return { action: SA.inSync, reason: 'value_hashes_match' }
  if (!platformValue && !providerValue) return null
  if (platformValue && !providerValue) return canOutbound(rule.direction) ? { action: SA.exportPrepared, reason: 'provider_value_missing' } : { action: SA.ignored, reason: 'profile_is_inbound_only' }
  if (!platformValue && providerValue) return canInbound(rule.direction) ? { action: SA.importForReview, reason: 'platform_value_missing' } : { action: SA.ignored, reason: 'profile_is_outbound_only' }
  if (rule.conflictPolicy === CP.noOverwrite || rule.authority === AU.manualReview) return { action: SA.conflictReview, reason: 'human_source_of_truth_decision_required' }
  if (rule.authority === AU.platform && canOutbound(rule.direction)) return { action: SA.exportPrepared, reason: 'platform_is_configured_authority' }
  if (rule.authority === AU.practiceManagement && canInbound(rule.direction)) return { action: SA.importForReview, reason: 'practice_management_is_configured_authority' }
  return { action: SA.conflictReview, reason: 'mapping_cannot_resolve_conflict' }
}

export function validatePracticeManagementSyncPlan(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, link = {}, inboundEvent = null, outboundCommand = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const profileValidation = validatePracticeManagementMappingProfile(profile, { manifest, connection }); const linkValidation = validatePracticeManagementMatterLink(link, { dependencyModel, manifest, connection, profile })
  if (!profileValidation.valid) errors.push('practice_sync_mapping_profile_invalid')
  if (!linkValidation.valid) errors.push('practice_sync_matter_link_invalid')
  if (value.version !== CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION || !value.planId || !PLAN_STATUSES.includes(value.status) || !validDate(value.generatedAt)) errors.push('practice_sync_plan_identity_invalid')
  if (value.connectionId !== connection.connectionId || value.connectionFingerprint !== connection.fingerprint || value.profileId !== profile.profileId || value.profileFingerprint !== profile.fingerprint || value.linkId !== link.linkId || value.linkFingerprint !== link.fingerprint) errors.push('practice_sync_configuration_binding_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.lane !== link.lane || value.firmId !== link.firmId) errors.push('practice_sync_matter_binding_invalid')
  if (!Array.isArray(value.actions) || value.actions.some((item) => !ACTIONS.includes(item.action) || !fieldDefinition(item.resource, item.canonicalField) || !item.recordKey || (item.platformValueHash && !hashValid(item.platformValueHash)) || (item.providerValueHash && !hashValid(item.providerValueHash)))) errors.push('practice_sync_action_invalid')
  const calculated = Object.fromEntries(ACTIONS.map((action) => [action, value.actions.filter((item) => item.action === action).length])); if (JSON.stringify(calculated) !== JSON.stringify(value.counts)) errors.push('practice_sync_counts_invalid')
  const needsInbound = value.actions.some((item) => item.providerValueHash)
  if (needsInbound) { const inboundValidation = validateConveyancerIntegrationInboundEvent(inboundEvent || {}, { dependencyModel, manifest, connection }); if (!inboundValidation.valid || value.sourceInboundEventId !== inboundEvent?.recordId || value.sourceInboundEventFingerprint !== inboundEvent?.fingerprint || inboundEvent?.type !== 'practice_snapshot_received') errors.push('practice_sync_inbound_evidence_invalid') }
  const needsOutbound = value.actions.some((item) => item.action === SA.exportPrepared)
  if (needsOutbound) { const outboundValidation = validateConveyancerIntegrationOutboundCommand(outboundCommand || {}, { dependencyModel, manifest, connection }); if (!outboundValidation.valid || value.outboundCommandId !== outboundCommand?.recordId || value.outboundCommandFingerprint !== outboundCommand?.fingerprint || outboundCommand?.type !== 'practice_sync_batch_requested') errors.push('practice_sync_outbound_command_invalid') }
  if (!needsOutbound && (value.outboundCommandId || value.outboundCommandFingerprint)) errors.push('practice_sync_unnecessary_outbound_command')
  if (value.fingerprint !== fnv(planSnapshot(value))) errors.push('practice_sync_fingerprint_invalid')
  if (Object.entries(PRACTICE_MANAGEMENT_INTEGRATION_BOUNDARY).some(([control, expected]) => value.controls?.[control] !== expected)) errors.push('practice_sync_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), plan: value })
}

export function buildPracticeManagementSyncPlan(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, link = {}, inboundEvent = null, existingCommands = [] } = {}) {
  const rawPlatform = input.platformObservations || []; const rawProvider = input.providerObservations || []; const platform = rawPlatform.map(observation); const provider = rawProvider.map(observation); const errors = [...observationErrors(platform, 'platform'), ...observationErrors(provider, 'provider')]
  if (rawPlatform.some(containsInlineObservationValue)) errors.push('platform_observation_inline_value_prohibited')
  if (rawProvider.some(containsInlineObservationValue)) errors.push('provider_observation_inline_value_prohibited')
  const profileValidation = validatePracticeManagementMappingProfile(profile, { manifest, connection }); const linkValidation = validatePracticeManagementMatterLink(link, { dependencyModel, manifest, connection, profile }); if (!profileValidation.valid) errors.push('practice_sync_mapping_profile_invalid'); if (!linkValidation.valid) errors.push('practice_sync_matter_link_invalid')
  const rules = new Map((profile.rules || []).map((rule) => [`${rule.resource}:${rule.canonicalField}`, rule])); const identities = unique([...platform, ...provider].map((item) => `${item.resource}:${item.canonicalField}:${item.recordKey}`)).sort(); const actions = []
  for (const identity of identities) {
    const [resource, canonicalField, recordKey] = identity.split(':'); const rule = rules.get(`${resource}:${canonicalField}`); if (!rule) { errors.push(`practice_sync_unmapped_observation:${resource}.${canonicalField}`); continue }
    const platformValue = platform.find((item) => `${item.resource}:${item.canonicalField}:${item.recordKey}` === identity); const providerValue = provider.find((item) => `${item.resource}:${item.canonicalField}:${item.recordKey}` === identity); const decision = decide(rule, platformValue, providerValue); if (!decision) continue
    actions.push({ actionId: `sync:${resource}:${canonicalField}:${recordKey}`, resource, canonicalField, recordKey, providerField: rule.providerField, action: decision.action, reason: decision.reason, classification: rule.classification, platformValueReferenceId: platformValue?.valueReferenceId || null, platformValueHash: platformValue?.valueHash || null, platformVersion: platformValue?.version || null, providerValueReferenceId: providerValue?.valueReferenceId || null, providerValueHash: providerValue?.valueHash || null, providerVersion: providerValue?.version || null, automaticMutationAllowed: false })
  }
  const needsInbound = actions.some((item) => item.providerValueHash)
  if (needsInbound) { const result = validateConveyancerIntegrationInboundEvent(inboundEvent || {}, { dependencyModel, manifest, connection }); if (!result.valid || inboundEvent?.type !== 'practice_snapshot_received') errors.push('practice_sync_inbound_evidence_invalid') }
  const exports = actions.filter((item) => item.action === SA.exportPrepared); let outboundCommand = null
  if (exports.length) {
    const result = buildConveyancerIntegrationOutboundCommand({ recordId: input.commandId, type: 'practice_sync_batch_requested', lane: link.lane, firmId: link.firmId, idempotencyKey: input.idempotencyKey, payloadReferenceId: input.exportPayloadReferenceId, payloadHash: input.exportPayloadHash, dataPolicy: { purpose: text(input.purpose || 'Synchronise reviewed conveyancer matter metadata with the linked practice-management matter.'), legalBasis: connection.dataPolicy?.legalBasis, consentReferenceId: connection.dataPolicy?.consentReferenceId, classifications: unique(exports.map((item) => item.classification)), retentionDays: Math.min(Number(input.retentionDays || connection.dataPolicy?.retentionDays || 0), Number(connection.dataPolicy?.retentionDays || 0)) }, requestedAt: input.generatedAt, requestedBy: input.requestedBy, authorityReferenceId: input.authorityReferenceId }, { dependencyModel, manifest, connection, existingCommands })
    if (!result.ok) errors.push(...result.errors.map((item) => `practice_sync_outbound:${item}`)); else outboundCommand = result.command
  }
  const counts = Object.fromEntries(ACTIONS.map((action) => [action, actions.filter((item) => item.action === action).length])); let status = counts[SA.conflictReview] || counts[SA.importForReview] ? PS.reviewRequired : counts[SA.exportPrepared] ? PS.exportPrepared : PS.inSync; if (errors.length) status = PS.blocked
  const value = { version: CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION, planId: text(input.planId), connectionId: text(connection.connectionId), connectionFingerprint: text(connection.fingerprint), profileId: text(profile.profileId), profileFingerprint: text(profile.fingerprint), linkId: text(link.linkId), linkFingerprint: text(link.fingerprint), matter: matterBinding(dependencyModel), lane: text(link.lane), firmId: text(link.firmId), sourceInboundEventId: needsInbound ? text(inboundEvent?.recordId) : null, sourceInboundEventFingerprint: needsInbound ? text(inboundEvent?.fingerprint) : null, generatedAt: iso(input.generatedAt), actions, counts, status, outboundCommandId: outboundCommand?.recordId || null, outboundCommandFingerprint: outboundCommand?.fingerprint || null, controls: PRACTICE_MANAGEMENT_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(planSnapshot(value)); const validation = errors.length ? { valid: false, errors } : validatePracticeManagementSyncPlan(value, { dependencyModel, manifest, connection, profile, link, inboundEvent, outboundCommand })
  return deepFreeze({ ok: validation.valid, code: validation.valid ? `practice_sync_${status}` : 'practice_sync_blocked', errors: unique(validation.errors), plan: value, outboundCommand })
}
