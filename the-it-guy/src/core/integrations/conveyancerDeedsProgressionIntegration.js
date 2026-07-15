import {
  CONVEYANCER_INTEGRATION_AUTHENTICATION_TYPES as A,
  CONVEYANCER_INTEGRATION_CAPABILITIES as C,
  CONVEYANCER_INTEGRATION_DATA_CLASSIFICATIONS as D,
  CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES as P,
  buildConveyancerIntegrationAdapterManifest,
  buildConveyancerIntegrationOutboundCommand,
  validateConveyancerIntegrationAdapterManifest,
  validateConveyancerIntegrationConnection,
  validateConveyancerIntegrationInboundEvent,
  validateConveyancerIntegrationOutboundCommand,
} from './conveyancerIntegrationFramework.js'
import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../transactions/conveyancerMatterPlanContract.js'
import { validateConveyancerThreeRoleDependencyModel } from '../transactions/conveyancerThreeRoleDependencyModel.js'

export const CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION = 'conveyancer_deeds_progression_integration_f7_v1'
export const DEEDS_PROGRESSION_STATUSES = Object.freeze({
  lodged: 'lodged', examination: 'examination', noteRaised: 'note_raised', noteCleared: 'note_cleared',
  preparation: 'preparation', execution: 'execution', registered: 'registered', rejected: 'rejected', withdrawn: 'withdrawn',
})
export const DEEDS_PROGRESSION_EVIDENCE_TYPES = Object.freeze({ lodgement: 'lodgement', registration: 'registration', exception: 'exception' })
export const DEEDS_COMPONENT_TYPES = Object.freeze({ transfer: 'transfer_deed', bond: 'mortgage_bond', cancellation: 'bond_cancellation' })

const S = DEEDS_PROGRESSION_STATUSES
const STATUSES = Object.values(S)
const EVIDENCE_TYPES = Object.values(DEEDS_PROGRESSION_EVIDENCE_TYPES)
const COMPONENT_BY_LANE = Object.freeze({ transfer: DEEDS_COMPONENT_TYPES.transfer, bond: DEEDS_COMPONENT_TYPES.bond, cancellation: DEEDS_COMPONENT_TYPES.cancellation })
const EVENT_BY_STATUS = Object.freeze({
  [S.lodged]: 'deeds_lodgement_received', [S.examination]: 'deeds_examination_progress_received',
  [S.noteRaised]: 'deeds_note_issued', [S.noteCleared]: 'deeds_note_cleared', [S.preparation]: 'deeds_preparation_received',
  [S.execution]: 'deeds_execution_received', [S.registered]: 'deeds_registration_received',
  [S.rejected]: 'deeds_rejection_received', [S.withdrawn]: 'deeds_withdrawal_received',
})
export const DEEDS_PROGRESSION_TRANSITIONS = Object.freeze({
  [S.lodged]: Object.freeze([S.examination, S.noteRaised, S.rejected, S.withdrawn]),
  [S.examination]: Object.freeze([S.noteRaised, S.preparation, S.rejected, S.withdrawn]),
  [S.noteRaised]: Object.freeze([S.noteCleared, S.rejected, S.withdrawn]),
  [S.noteCleared]: Object.freeze([S.examination, S.preparation, S.noteRaised, S.rejected, S.withdrawn]),
  [S.preparation]: Object.freeze([S.noteRaised, S.execution, S.rejected, S.withdrawn]),
  [S.execution]: Object.freeze([S.registered, S.rejected, S.withdrawn]),
  [S.registered]: Object.freeze([]), [S.rejected]: Object.freeze([]), [S.withdrawn]: Object.freeze([]),
})

export const DEEDS_PROGRESSION_INTEGRATION_BOUNDARY = Object.freeze({
  providerNeutral: true, sourceEvidenceOnly: true, exactMatterBindingRequired: true, exactFirmAppointmentsRequired: true,
  simultaneousBatchIntegrityRequired: true, appendOnlyProgressionRequired: true, legalReviewRequired: true,
  providerEventCreatesLegalTruth: false, providerEventDeclaresRegistration: false, registrationEvidenceAutoApproved: false,
  deedsSubmissionPerformed: false, externalWritePerformed: false, workflowMutated: false, coordinationMutated: false,
  registrationOutcomeMutated: false, databaseWritePerformed: false, notificationsSent: false,
})

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const validDate = (value) => Boolean(value && Number.isFinite(new Date(value).getTime()))
const iso = (value) => validDate(value) ? new Date(value).toISOString() : value || null
const hashValid = (value) => /^(sha256:)?[a-f0-9]{64}$/i.test(text(value))
const unique = (values = []) => [...new Set(values.filter(Boolean))]
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null, teamId: text(input.teamId || input.team_id) || null, lane: key(input.lane) || null, firmId: text(input.firmId || input.firm_id) || null } }
function matterBinding(model = {}) { return { modelId: text(model.modelId), modelFingerprint: text(model.fingerprint), planId: text(model.plan?.planId), planVersion: Number(model.plan?.planVersion || 0), transactionId: text(model.transactionId), organisationId: text(model.organisationId) } }
function bindingMatches(binding = {}, model = {}) { const expected = matterBinding(model); return Object.keys(expected).every((itemKey) => binding[itemKey] === expected[itemKey]) }
function snapshot(value = {}) { const copy = stable(value); delete copy.fingerprint; return copy }
function boundaryValid(value = {}) { return Object.entries(DEEDS_PROGRESSION_INTEGRATION_BOUNDARY).every(([itemKey, expected]) => value.controls?.[itemKey] === expected) }
function transferActorAllowed(inputActor, model, firmId, managerOnly = false) { const value = actor(inputActor); const binding = model.roleBindings?.transfer; if (!value.userId || value.lane !== 'transfer' || value.firmId !== firmId || binding?.firmId !== firmId) return false; if (managerOnly) return value.role === R.firmManager; return [R.firmManager, R.transferAttorney, R.conveyancer].includes(value.role) }
function expectedComponents(model = {}) { return (model.requiredLanes || []).map((lane) => ({ lane, componentType: COMPONENT_BY_LANE[lane], firmId: model.roleBindings?.[lane]?.firmId || null })) }
function components(input = []) { return (Array.isArray(input) ? input : []).map((item) => ({ lane: key(item.lane), componentType: key(item.componentType), firmId: text(item.firmId), providerDocumentReferenceHash: text(item.providerDocumentReferenceHash).toLowerCase() })).sort((a, b) => a.lane.localeCompare(b.lane)) }
function componentsValid(actual = [], model = {}) { const expected = expectedComponents(model).sort((a, b) => a.lane.localeCompare(b.lane)); return actual.length === expected.length && expected.every((item, index) => actual[index]?.lane === item.lane && actual[index]?.componentType === item.componentType && actual[index]?.firmId === item.firmId && hashValid(actual[index]?.providerDocumentReferenceHash)) }

export function buildDeedsProgressionAdapterManifest(input = {}) {
  const inboundEvents = Object.entries(EVENT_BY_STATUS).map(([status, type]) => ({ type, capability: C.receiveDeedsEvent, allowedLanes: ['transfer'], status }))
  return buildConveyancerIntegrationAdapterManifest({ adapterId: input.adapterId, adapterVersion: input.adapterVersion, providerKey: input.providerKey, category: P.deeds, environments: input.environments, authenticationTypes: input.authenticationTypes || [A.mutualTls, A.signedWebhook], capabilities: [C.receiveDeedsEvent, C.submitDeedsLodgement], inboundEvents, outboundCommands: [{ type: 'deeds_lodgement_submission_requested', capability: C.submitDeedsLodgement, allowedLanes: ['transfer'] }], createdAt: input.createdAt, createdBy: input.createdBy })
}

export function validateDeedsIntegrationProfile(input = {}, { dependencyModel = {}, manifest = {}, connection = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const mv = validateConveyancerIntegrationAdapterManifest(manifest); const cv = validateConveyancerIntegrationConnection(connection, { manifest }); const dv = validateConveyancerThreeRoleDependencyModel(dependencyModel)
  if (!mv.valid || manifest.category !== P.deeds || !manifest.capabilities?.includes(C.receiveDeedsEvent) || !manifest.capabilities?.includes(C.submitDeedsLodgement)) errors.push('deeds_profile_adapter_invalid')
  if (!cv.valid || connection.status !== 'active' || !connection.allowedLanes?.includes('transfer') || connection.organisationId !== dependencyModel.organisationId) errors.push('deeds_profile_connection_invalid')
  if (!dv.valid || value.version !== CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION || !value.profileId || value.status !== 'active') errors.push('deeds_profile_identity_invalid')
  if (value.connectionId !== connection.connectionId || value.connectionFingerprint !== connection.fingerprint || value.transferFirmId !== dependencyModel.roleBindings?.transfer?.firmId || !value.deedsOfficeCode || !value.providerPractitionerReferenceHash || !hashValid(value.providerPractitionerReferenceHash)) errors.push('deeds_profile_binding_invalid')
  if (!validDate(value.approvedAt) || !value.approvalReferenceId || !transferActorAllowed(value.approvedBy || {}, dependencyModel, value.transferFirmId, true)) errors.push('deeds_profile_manager_approval_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('deeds_profile_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('deeds_profile_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), profile: value })
}

export function buildDeedsIntegrationProfile(input = {}, context = {}) {
  const model = context.dependencyModel || {}; const connection = context.connection || {}; const value = { version: CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION, profileId: text(input.profileId), status: 'active', connectionId: text(connection.connectionId), connectionFingerprint: text(connection.fingerprint), transferFirmId: text(model.roleBindings?.transfer?.firmId), deedsOfficeCode: key(input.deedsOfficeCode), providerPractitionerReferenceHash: text(input.providerPractitionerReferenceHash).toLowerCase(), approvedAt: iso(input.approvedAt), approvedBy: actor(input.approvedBy), approvalReferenceId: text(input.approvalReferenceId), controls: DEEDS_PROGRESSION_INTEGRATION_BOUNDARY, fingerprint: null }; value.fingerprint = fnv(snapshot(value)); const validation = validateDeedsIntegrationProfile(value, context); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'deeds_profile_active' : 'deeds_profile_invalid', errors: validation.errors, profile: validation.profile })
}

export function validateDeedsLodgementSubmission(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, readiness = {}, outboundCommand = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateDeedsIntegrationProfile(profile, { dependencyModel, manifest, connection }); const ov = validateConveyancerIntegrationOutboundCommand(outboundCommand, { dependencyModel, manifest, connection })
  if (!pv.valid || !ov.valid || outboundCommand.type !== 'deeds_lodgement_submission_requested') errors.push('deeds_lodgement_submission_integration_invalid')
  if (value.version !== CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION || !value.submissionId || value.status !== 'prepared') errors.push('deeds_lodgement_submission_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.profileId !== profile.profileId || value.profileFingerprint !== profile.fingerprint || value.readinessId !== readiness.readinessId || value.readinessFingerprint !== readiness.fingerprint) errors.push('deeds_lodgement_submission_binding_invalid')
  if (readiness.jointReady !== true || readiness.health !== 'ready' || !validDate(readiness.plannedLodgementAt) || value.plannedLodgementAt !== readiness.plannedLodgementAt || value.laneReadinessFingerprints?.join('|') !== (readiness.lanes || []).map((item) => item.attestationFingerprint).join('|')) errors.push('deeds_lodgement_joint_readiness_required')
  if (!componentsValid(value.components || [], dependencyModel)) errors.push('deeds_lodgement_component_batch_invalid')
  if (!validDate(value.preparedAt) || !value.authorityReferenceId || !transferActorAllowed(value.preparedBy || {}, dependencyModel, profile.transferFirmId) || value.outboundCommandId !== outboundCommand.recordId || value.outboundCommandFingerprint !== outboundCommand.fingerprint) errors.push('deeds_lodgement_submission_authority_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('deeds_lodgement_submission_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('deeds_lodgement_submission_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), submission: value })
}

export function buildDeedsLodgementSubmission(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, readiness = {}, existingCommands = [] } = {}) {
  const preparedBy = actor(input.preparedBy); const commandResult = buildConveyancerIntegrationOutboundCommand({ recordId: input.commandId, type: 'deeds_lodgement_submission_requested', lane: 'transfer', firmId: profile.transferFirmId, idempotencyKey: input.idempotencyKey, payloadReferenceId: input.payloadReferenceId, payloadHash: input.payloadHash, dataPolicy: { purpose: text(input.purpose || 'Prepare the jointly ready deeds batch for controlled lodgement.'), legalBasis: connection.dataPolicy?.legalBasis, consentReferenceId: connection.dataPolicy?.consentReferenceId, classifications: [D.professionalConfidential, D.personal, D.financial], retentionDays: Math.min(Number(input.retentionDays || connection.dataPolicy?.retentionDays || 0), Number(connection.dataPolicy?.retentionDays || 0)) }, requestedAt: input.preparedAt, requestedBy: preparedBy, authorityReferenceId: input.authorityReferenceId }, { dependencyModel, manifest, connection, existingCommands })
  const value = { version: CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION, submissionId: text(input.submissionId), status: 'prepared', matter: matterBinding(dependencyModel), profileId: text(profile.profileId), profileFingerprint: text(profile.fingerprint), readinessId: text(readiness.readinessId), readinessFingerprint: text(readiness.fingerprint), plannedLodgementAt: iso(readiness.plannedLodgementAt), laneReadinessFingerprints: (readiness.lanes || []).map((item) => text(item.attestationFingerprint)), components: components(input.components), preparedAt: iso(input.preparedAt), preparedBy, authorityReferenceId: text(input.authorityReferenceId), outboundCommandId: text(commandResult.command?.recordId), outboundCommandFingerprint: text(commandResult.command?.fingerprint), controls: DEEDS_PROGRESSION_INTEGRATION_BOUNDARY, fingerprint: null }; value.fingerprint = fnv(snapshot(value)); const validation = commandResult.ok ? validateDeedsLodgementSubmission(value, { dependencyModel, manifest, connection, profile, readiness, outboundCommand: commandResult.command }) : { valid: false, errors: commandResult.errors.map((item) => `deeds_lodgement_command:${item}`), submission: value }; return deepFreeze({ ok: validation.valid, code: validation.valid ? 'deeds_lodgement_submission_prepared' : 'deeds_lodgement_submission_blocked', errors: validation.errors, submission: validation.submission, outboundCommand: commandResult.command })
}

export function validateDeedsProgressionEvent(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, inboundEvent = {}, submission = {}, previousProgression = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateDeedsIntegrationProfile(profile, { dependencyModel, manifest, connection }); const iv = validateConveyancerIntegrationInboundEvent(inboundEvent, { dependencyModel, manifest, connection })
  if (!pv.valid || !iv.valid || inboundEvent.type !== EVENT_BY_STATUS[value.status] || inboundEvent.lane !== 'transfer' || value.sourceInboundEventId !== inboundEvent.recordId || value.sourceInboundEventFingerprint !== inboundEvent.fingerprint) errors.push('deeds_progression_inbound_evidence_invalid')
  if (value.version !== CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION || !value.progressionId || !Number.isInteger(value.revision) || value.revision < 1 || !STATUSES.includes(value.status) || !validDate(value.occurredAt)) errors.push('deeds_progression_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.submissionId !== submission.submissionId || value.submissionFingerprint !== submission.fingerprint || value.deedsOfficeCode !== profile.deedsOfficeCode || !value.providerBatchReferenceHash || !hashValid(value.providerBatchReferenceHash) || !componentsValid(value.components || [], dependencyModel)) errors.push('deeds_progression_binding_invalid')
  if (value.revision === 1 && (value.status !== S.lodged || value.previousProgressionId || value.previousFingerprint)) errors.push('deeds_progression_initial_state_invalid')
  if (value.revision > 1 && (!previousProgression || value.previousProgressionId !== previousProgression.progressionId || value.previousFingerprint !== previousProgression.fingerprint || value.revision !== previousProgression.revision + 1 || !DEEDS_PROGRESSION_TRANSITIONS[previousProgression.status]?.includes(value.status) || value.providerBatchReferenceHash !== previousProgression.providerBatchReferenceHash || new Date(value.occurredAt) < new Date(previousProgression.occurredAt))) errors.push('deeds_progression_transition_invalid')
  if (value.status === S.noteRaised && (!value.noteCode || !value.noteReferenceHash || !hashValid(value.noteReferenceHash) || !value.noteOwnerLane || !dependencyModel.requiredLanes?.includes(value.noteOwnerLane))) errors.push('deeds_progression_note_invalid')
  if (value.status === S.noteCleared && (!previousProgression || previousProgression.status !== S.noteRaised || value.noteCode !== previousProgression.noteCode || value.noteReferenceHash !== previousProgression.noteReferenceHash)) errors.push('deeds_progression_note_clearance_invalid')
  if (value.status === S.registered && (!value.registrationNoticeReferenceId || !hashValid(value.registrationNoticeHash) || !validDate(value.registeredAt) || new Date(value.registeredAt) > new Date(value.occurredAt))) errors.push('deeds_progression_registration_notice_invalid')
  if ([S.rejected, S.withdrawn].includes(value.status) && (!value.reasonCode || !value.reasonReferenceHash || !hashValid(value.reasonReferenceHash))) errors.push('deeds_progression_terminal_reason_invalid')
  if (value.reviewEligible !== [S.lodged, S.registered, S.rejected, S.withdrawn].includes(value.status)) errors.push('deeds_progression_review_eligibility_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('deeds_progression_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('deeds_progression_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), progression: value })
}

export function buildDeedsProgressionEvent(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, inboundEvent = {}, submission = {}, previousProgression = null } = {}) {
  const status = key(input.status); const value = { version: CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION, progressionId: text(input.progressionId), revision: Number(input.revision || 1), previousProgressionId: previousProgression ? text(previousProgression.progressionId) : null, previousFingerprint: previousProgression ? text(previousProgression.fingerprint) : null, status, matter: matterBinding(dependencyModel), submissionId: text(submission.submissionId), submissionFingerprint: text(submission.fingerprint), deedsOfficeCode: text(profile.deedsOfficeCode), providerBatchReferenceHash: text(input.providerBatchReferenceHash || previousProgression?.providerBatchReferenceHash).toLowerCase(), components: components(input.components || previousProgression?.components), noteCode: text(input.noteCode || previousProgression?.noteCode) || null, noteReferenceHash: text(input.noteReferenceHash || previousProgression?.noteReferenceHash).toLowerCase() || null, noteOwnerLane: key(input.noteOwnerLane || previousProgression?.noteOwnerLane) || null, reasonCode: key(input.reasonCode) || null, reasonReferenceHash: text(input.reasonReferenceHash).toLowerCase() || null, registrationNoticeReferenceId: text(input.registrationNoticeReferenceId) || null, registrationNoticeHash: text(input.registrationNoticeHash).toLowerCase() || null, registeredAt: iso(input.registeredAt), occurredAt: iso(input.occurredAt || inboundEvent.occurredAt), sourceInboundEventId: text(inboundEvent.recordId), sourceInboundEventFingerprint: text(inboundEvent.fingerprint), reviewEligible: [S.lodged, S.registered, S.rejected, S.withdrawn].includes(status), controls: DEEDS_PROGRESSION_INTEGRATION_BOUNDARY, fingerprint: null }; value.fingerprint = fnv(snapshot(value)); const validation = validateDeedsProgressionEvent(value, { dependencyModel, manifest, connection, profile, inboundEvent, submission, previousProgression }); return deepFreeze({ ok: validation.valid, code: validation.valid ? `deeds_progression_${status}` : 'deeds_progression_invalid', errors: validation.errors, progression: validation.progression })
}

export function validateDeedsProgressionEvidence(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, inboundEvent = {}, submission = {}, progression = {}, previousProgression = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateDeedsProgressionEvent(progression, { dependencyModel, manifest, connection, profile, inboundEvent, submission, previousProgression })
  const expectedType = progression.status === S.lodged ? 'lodgement' : progression.status === S.registered ? 'registration' : 'exception'
  if (!pv.valid || !progression.reviewEligible) errors.push('deeds_progression_reviewable_event_required')
  if (value.version !== CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION || !value.evidenceId || value.status !== 'approved_for_coordination' || !EVIDENCE_TYPES.includes(value.evidenceType) || value.evidenceType !== expectedType) errors.push('deeds_progression_evidence_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.progressionId !== progression.progressionId || value.progressionFingerprint !== progression.fingerprint || value.providerBatchReferenceHash !== progression.providerBatchReferenceHash) errors.push('deeds_progression_evidence_binding_invalid')
  const expectedProjections = expectedComponents(dependencyModel).map((item) => ({ lane: item.lane, firmId: item.firmId, evidenceKey: expectedType === 'lodgement' ? `${item.lane}_lodgement_evidence` : expectedType === 'registration' ? `${item.lane}_registration_confirmation` : 'deeds_progression_exception', sourceProgressionId: progression.progressionId, sourceProgressionFingerprint: progression.fingerprint })); if (JSON.stringify(value.laneProjections) !== JSON.stringify(expectedProjections)) errors.push('deeds_progression_evidence_lane_projection_invalid')
  if (expectedType === 'registration' && (value.registrationNoticeReferenceId !== progression.registrationNoticeReferenceId || value.registrationNoticeHash !== progression.registrationNoticeHash || value.registeredAt !== progression.registeredAt)) errors.push('deeds_registration_evidence_notice_binding_invalid')
  if (!validDate(value.reviewedAt) || new Date(value.reviewedAt) < new Date(progression.occurredAt) || !value.reviewReferenceId || !transferActorAllowed(value.reviewedBy || {}, dependencyModel, profile.transferFirmId)) errors.push('deeds_progression_evidence_legal_review_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('deeds_progression_evidence_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('deeds_progression_evidence_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), evidence: value })
}

export function buildDeedsProgressionEvidence(input = {}, context = {}) {
  const { dependencyModel = {}, progression = {} } = context; const evidenceType = progression.status === S.lodged ? 'lodgement' : progression.status === S.registered ? 'registration' : 'exception'; const value = { version: CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION, evidenceId: text(input.evidenceId), status: 'approved_for_coordination', evidenceType, matter: matterBinding(dependencyModel), progressionId: text(progression.progressionId), progressionFingerprint: text(progression.fingerprint), providerBatchReferenceHash: text(progression.providerBatchReferenceHash), laneProjections: expectedComponents(dependencyModel).map((item) => ({ lane: item.lane, firmId: item.firmId, evidenceKey: evidenceType === 'lodgement' ? `${item.lane}_lodgement_evidence` : evidenceType === 'registration' ? `${item.lane}_registration_confirmation` : 'deeds_progression_exception', sourceProgressionId: progression.progressionId, sourceProgressionFingerprint: progression.fingerprint })), registrationNoticeReferenceId: progression.registrationNoticeReferenceId || null, registrationNoticeHash: progression.registrationNoticeHash || null, registeredAt: progression.registeredAt || null, reviewedAt: iso(input.reviewedAt), reviewedBy: actor(input.reviewedBy), reviewReferenceId: text(input.reviewReferenceId), controls: DEEDS_PROGRESSION_INTEGRATION_BOUNDARY, fingerprint: null }; value.fingerprint = fnv(snapshot(value)); const validation = validateDeedsProgressionEvidence(value, context); return deepFreeze({ ok: validation.valid, code: validation.valid ? `deeds_${evidenceType}_evidence_approved` : 'deeds_progression_evidence_invalid', errors: validation.errors, evidence: validation.evidence })
}
