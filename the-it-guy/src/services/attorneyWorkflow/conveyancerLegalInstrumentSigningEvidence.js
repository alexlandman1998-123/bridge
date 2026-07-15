import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerGovernedContentHash } from './conveyancerCorrespondenceGenerator.js'
import {
  buildConveyancerOperationalDocumentContentFingerprint,
  buildConveyancerOperationalDocumentProvenanceFingerprint,
} from './conveyancerOperationalDocumentGenerator.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_STATUSES,
  validateConveyancerLegalInstrumentReview,
} from './conveyancerLegalInstrumentReview.js'

export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_EVIDENCE_VERSION = 'conveyancer_legal_instrument_signing_evidence_v1'

export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_STATUSES = Object.freeze({
  prepared: 'prepared',
  inProgress: 'in_progress',
  awaitingCompletionEvidence: 'awaiting_completion_evidence',
  completed: 'completed',
  declined: 'declined',
  expired: 'expired',
  voided: 'voided',
})

export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_COMMANDS = Object.freeze({
  recordViewed: 'record_viewed',
  recordSignature: 'record_signature',
  recordDecline: 'record_decline',
  complete: 'complete',
  expire: 'expire',
  void: 'void',
})

export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_CAPABILITIES = Object.freeze({
  prepare: 'prepare',
  recordEvidence: 'record_evidence',
  complete: 'complete',
  expire: 'expire',
  void: 'void',
})

const S = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_STATUSES
const C = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_CAPABILITIES
const COMMAND = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_COMMANDS
const COMMANDS = new Set(Object.values(COMMAND))
const STATUSES = new Set(Object.values(S))
const TERMINAL = new Set([S.completed, S.declined, S.expired, S.voided])
const SIGNER_STATUSES = new Set(['pending', 'viewed', 'signed', 'declined'])
const METHODS = new Set(['electronic', 'wet_ink'])

export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([C.prepare, C.recordEvidence, C.complete]),
  [R.conveyancer]: Object.freeze(Object.values(C)),
  [R.transferAttorney]: Object.freeze(Object.values(C)),
  [R.bondAttorney]: Object.freeze(Object.values(C)),
  [R.cancellationAttorney]: Object.freeze(Object.values(C)),
  [R.firmManager]: Object.freeze(Object.values(C)),
  [R.system]: Object.freeze([C.recordEvidence, C.complete, C.expire]),
  [R.accounts]: Object.freeze([]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
})

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '') }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function clone(value) { return typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  return value
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fail(code, errors = []) { return { ok: false, duplicate: false, code, errors: unique(errors), signing: null, event: null } }

function normalizeActor(input = {}) {
  return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null }
}

export function getConveyancerLegalInstrumentSigningCapabilities(role) {
  return CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerLegalInstrumentSigningActor(role, capability) {
  return getConveyancerLegalInstrumentSigningCapabilities(role).includes(key(capability))
}

function laneAuthorised(role, lane) {
  const normalizedRole = normalizeMatterPlanOwnerRole(role)
  if ([R.firmManager, R.system].includes(normalizedRole)) return true
  if (lane === 'transfer') return [R.conveyancer, R.transferAttorney, R.secretary].includes(normalizedRole)
  if (lane === 'bond') return [R.bondAttorney, R.secretary].includes(normalizedRole)
  if (lane === 'cancellation') return [R.cancellationAttorney, R.secretary].includes(normalizedRole)
  return false
}

function recomputeDocumentFingerprints(document = {}) {
  const contentFingerprint = buildConveyancerOperationalDocumentContentFingerprint({
    renderModel: document.renderModel,
    templateVersionId: document.template?.templateVersionId,
  })
  const provenanceFingerprint = buildConveyancerOperationalDocumentProvenanceFingerprint({
    contentFingerprint,
    planId: document.planId,
    planVersion: document.planVersion,
    transactionId: document.transactionId,
    organisationId: document.organisationId,
    actionKey: document.actionKey,
    documentKey: document.documentKey,
    documentKind: document.documentKind,
    lane: document.lane,
    template: document.template,
    variableManifest: document.variableManifest,
    clauseManifest: document.clauseManifest,
    dataValidation: document.dataValidation,
  })
  return { contentFingerprint, provenanceFingerprint }
}

function normalizeSignerContract(input = {}) {
  return {
    signerKey: key(input.signerKey || input.signer_key),
    signerRole: key(input.signerRole || input.signer_role),
    signerReferenceHash: text(input.signerReferenceHash || input.signer_reference_hash).toLowerCase(),
    signingOrder: Number(input.signingOrder ?? input.signing_order ?? 1),
    required: input.required !== false,
    allowedMethods: unique((Array.isArray(input.allowedMethods || input.allowed_methods) ? input.allowedMethods || input.allowed_methods : ['electronic']).map(key)).sort(),
  }
}

function validateSignerContract(signers = [], requiredRoles = []) {
  const errors = []
  if (!signers.length) errors.push('signer_contract_required')
  if (!signers.some((item) => item.required)) errors.push('required_signer_required')
  const signerKeys = signers.map((item) => item.signerKey)
  if (new Set(signerKeys).size !== signerKeys.length) errors.push('duplicate_signer_key')
  signers.forEach((signer) => {
    if (!signer.signerKey) errors.push('signer_key_required')
    if (!signer.signerRole) errors.push(`signer_role_required:${signer.signerKey || 'unknown'}`)
    if (!sha(signer.signerReferenceHash)) errors.push(`valid_signer_reference_hash_required:${signer.signerKey || 'unknown'}`)
    if (!Number.isInteger(signer.signingOrder) || signer.signingOrder < 1) errors.push(`valid_signing_order_required:${signer.signerKey || 'unknown'}`)
    if (!signer.allowedMethods.length || signer.allowedMethods.some((method) => !METHODS.has(method))) errors.push(`valid_signing_method_required:${signer.signerKey || 'unknown'}`)
  })
  requiredRoles.forEach((role) => {
    if (!signers.some((signer) => signer.required && signer.signerRole === role)) errors.push(`required_document_signer_role_missing:${role}`)
  })
  return unique(errors)
}

function normalizeRenderEvidence(input = {}) {
  return {
    artifactId: text(input.artifactId || input.artifact_id),
    artifactVersionId: text(input.artifactVersionId || input.artifact_version_id),
    artifactHash: text(input.artifactHash || input.artifact_hash).toLowerCase(),
    mimeType: text(input.mimeType || input.mime_type).toLowerCase(),
    pageCount: Number(input.pageCount ?? input.page_count),
    rendererName: text(input.rendererName || input.renderer_name),
    rendererVersion: text(input.rendererVersion || input.renderer_version),
    renderedAt: validDate(input.renderedAt || input.rendered_at) ? new Date(input.renderedAt || input.rendered_at).toISOString() : null,
    renderedBy: normalizeActor(input.renderedBy || input.rendered_by),
    sourceDocumentId: text(input.sourceDocumentId || input.source_document_id),
    sourceContentFingerprint: text(input.sourceContentFingerprint || input.source_content_fingerprint),
    sourceProvenanceFingerprint: text(input.sourceProvenanceFingerprint || input.source_provenance_fingerprint),
    sourceApprovalFingerprint: text(input.sourceApprovalFingerprint || input.source_approval_fingerprint),
  }
}

function validateRenderEvidence(evidence, review, document, preparedAt) {
  const errors = []
  if (!evidence.artifactId || !evidence.artifactVersionId) errors.push('rendered_artifact_identity_required')
  if (!sha(evidence.artifactHash)) errors.push('valid_rendered_artifact_hash_required')
  if (evidence.mimeType !== 'application/pdf') errors.push('signable_pdf_required')
  if (!Number.isInteger(evidence.pageCount) || evidence.pageCount < 1) errors.push('positive_rendered_page_count_required')
  if (!evidence.rendererName || !evidence.rendererVersion || !evidence.renderedBy.userId) errors.push('renderer_evidence_required')
  if (!validDate(evidence.renderedAt) || new Date(evidence.renderedAt) < new Date(review.approval.approvedAt) || new Date(evidence.renderedAt) > new Date(preparedAt)) errors.push('render_evidence_chronology_invalid')
  if (evidence.sourceDocumentId !== document.documentId) errors.push('render_source_document_mismatch')
  if (evidence.sourceContentFingerprint !== document.contentFingerprint) errors.push('render_source_content_fingerprint_mismatch')
  if (evidence.sourceProvenanceFingerprint !== document.provenanceFingerprint) errors.push('render_source_provenance_fingerprint_mismatch')
  if (evidence.sourceApprovalFingerprint !== review.approval.approvalFingerprint) errors.push('render_source_approval_fingerprint_mismatch')
  return errors
}

function bindingSnapshot(signing = {}) {
  return stable({
    version: signing.version,
    signingId: signing.signingId,
    reviewId: signing.reviewId,
    documentId: signing.documentId,
    planId: signing.planId,
    planVersion: signing.planVersion,
    transactionId: signing.transactionId,
    organisationId: signing.organisationId,
    actionKey: signing.actionKey,
    lane: signing.lane,
    contentFingerprint: signing.contentFingerprint,
    provenanceFingerprint: signing.provenanceFingerprint,
    c6BindingFingerprint: signing.c6BindingFingerprint,
    c6ApprovalFingerprint: signing.c6ApprovalFingerprint,
    c6ApprovalEventId: signing.c6ApprovalEventId,
    renderEvidence: signing.renderEvidence,
    requiredSignerRoles: signing.requiredSignerRoles,
    signerContract: signing.signerContract,
    preparationCommandId: signing.preparationCommandId,
    preparedAt: signing.preparedAt,
    preparedBy: signing.preparedBy,
    expiresAt: signing.expiresAt,
  })
}

export function buildConveyancerLegalInstrumentSigningBindingFingerprint(signing = {}) {
  return buildConveyancerGovernedContentHash(JSON.stringify(bindingSnapshot(signing)))
}

function completionSnapshot(signing = {}) {
  return stable({
    signingId: signing.signingId,
    bindingFingerprint: signing.bindingFingerprint,
    c6ApprovalFingerprint: signing.c6ApprovalFingerprint,
    renderArtifactHash: signing.renderEvidence?.artifactHash,
    finalArtifactHash: signing.currentArtifactHash,
    signedDocumentEvidence: signing.signedDocumentEvidence,
    signatures: (signing.signerStates || []).filter((item) => item.status === 'signed').map((item) => ({ signerKey: item.signerKey, signatureEvidence: item.signatureEvidence })),
  })
}

export function buildConveyancerLegalInstrumentCompletionFingerprint(signing = {}) {
  return buildConveyancerGovernedContentHash(JSON.stringify(completionSnapshot(signing)))
}

function runtimeSnapshot(signing = {}) {
  return {
    status: signing.status,
    signerStates: clone(signing.signerStates || []),
    currentArtifactHash: signing.currentArtifactHash,
    signedDocumentEvidence: clone(signing.signedDocumentEvidence || null),
    terminalDecision: clone(signing.terminalDecision || null),
    runtimeRevision: signing.runtimeRevision,
    updatedAt: signing.updatedAt,
    lastEventId: signing.lastEventId,
  }
}

function commandFingerprint(commandType, command, actor) {
  return buildConveyancerGovernedContentHash(JSON.stringify(stable({ commandType, command, actor })))
}

function evidenceActorValid(actor, capability, lane) {
  return Boolean(actor?.userId && canConveyancerLegalInstrumentSigningActor(actor.role, capability) && laneAuthorised(actor.role, lane))
}

export function validateConveyancerLegalInstrumentSigningEvidence(input = {}) {
  const signing = clone(input || {})
  const errors = []
  if (signing.version !== CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_EVIDENCE_VERSION) errors.push('unsupported_signing_evidence_contract')
  for (const field of ['signingId', 'reviewId', 'documentId', 'planId', 'transactionId', 'organisationId', 'actionKey', 'lane']) if (!text(signing[field])) errors.push(`${key(field)}_required`)
  if (!Number.isInteger(Number(signing.planVersion)) || Number(signing.planVersion) < 1) errors.push('plan_version_required')
  if (!sha(signing.contentFingerprint) || !sha(signing.provenanceFingerprint) || !sha(signing.c6BindingFingerprint) || !sha(signing.c6ApprovalFingerprint)) errors.push('valid_source_fingerprints_required')
  if (!text(signing.c6ApprovalEventId)) errors.push('c6_approval_event_required')
  if (!STATUSES.has(signing.status)) errors.push('invalid_signing_status')
  if (!validDate(signing.preparedAt) || !validDate(signing.expiresAt) || new Date(signing.expiresAt) <= new Date(signing.preparedAt)) errors.push('valid_signing_window_required')
  if (!evidenceActorValid(signing.preparedBy, C.prepare, signing.lane)) errors.push('signing_preparer_authority_invalid')
  const renderEvidence = signing.renderEvidence || {}
  if (!renderEvidence.artifactId || !renderEvidence.artifactVersionId || !sha(renderEvidence.artifactHash) || renderEvidence.mimeType !== 'application/pdf' || !Number.isInteger(renderEvidence.pageCount) || renderEvidence.pageCount < 1 || !renderEvidence.rendererName || !renderEvidence.rendererVersion || !renderEvidence.renderedBy?.userId || !validDate(renderEvidence.renderedAt) || new Date(renderEvidence.renderedAt) > new Date(signing.preparedAt) || renderEvidence.sourceDocumentId !== signing.documentId || renderEvidence.sourceContentFingerprint !== signing.contentFingerprint || renderEvidence.sourceProvenanceFingerprint !== signing.provenanceFingerprint || renderEvidence.sourceApprovalFingerprint !== signing.c6ApprovalFingerprint) errors.push('render_evidence_contract_invalid')
  const requiredSignerRoles = unique((Array.isArray(signing.requiredSignerRoles) ? signing.requiredSignerRoles : []).map(key)).sort()
  if (!requiredSignerRoles.length) errors.push('required_signer_roles_missing')
  const signerContract = (Array.isArray(signing.signerContract) ? signing.signerContract : []).map(normalizeSignerContract)
  errors.push(...validateSignerContract(signerContract, requiredSignerRoles))
  if (signing.bindingFingerprint !== buildConveyancerLegalInstrumentSigningBindingFingerprint(signing)) errors.push('signing_binding_fingerprint_invalid')
  if (!sha(signing.renderEvidence?.artifactHash) || !sha(signing.currentArtifactHash)) errors.push('valid_artifact_hash_chain_required')
  const states = Array.isArray(signing.signerStates) ? signing.signerStates : []
  if (states.length !== signerContract.length || states.some((state) => !SIGNER_STATUSES.has(state.status)) || states.map((item) => item.signerKey).join('|') !== signerContract.map((item) => item.signerKey).join('|')) errors.push('signer_state_contract_mismatch')
  const providerEvents = []
  states.forEach((state) => {
    const contract = signerContract.find((item) => item.signerKey === state.signerKey)
    if (state.status === 'signed') {
      const evidence = state.signatureEvidence || {}
      if (!contract?.allowedMethods.includes(evidence.method) || !validDate(evidence.signedAt) || new Date(evidence.signedAt) < new Date(signing.preparedAt) || new Date(evidence.signedAt) > new Date(signing.updatedAt) || !text(evidence.evidenceReferenceId) || !text(evidence.providerEventId) || !sha(evidence.inputArtifactHash) || !sha(evidence.outputArtifactHash) || !sha(evidence.identityVerification?.referenceHash) || !validDate(evidence.identityVerification?.verifiedAt) || new Date(evidence.identityVerification?.verifiedAt) < new Date(signing.preparedAt) || new Date(evidence.identityVerification?.verifiedAt) > new Date(evidence.signedAt)) errors.push(`signature_evidence_incomplete:${state.signerKey}`)
      if (!evidenceActorValid(evidence.recordedBy, C.recordEvidence, signing.lane)) errors.push(`signature_evidence_authority_invalid:${state.signerKey}`)
      providerEvents.push(evidence.providerEventId)
    } else if (state.signatureEvidence) errors.push(`signature_evidence_without_signed_status:${state.signerKey}`)
    if (state.status === 'declined') {
      const evidence = state.declineEvidence || {}
      if (!text(evidence.reasonCode) || !text(evidence.evidenceReferenceId) || !text(evidence.providerEventId) || !validDate(evidence.declinedAt) || new Date(evidence.declinedAt) < new Date(signing.preparedAt) || new Date(evidence.declinedAt) > new Date(signing.updatedAt) || !evidenceActorValid(evidence.recordedBy, C.recordEvidence, signing.lane)) errors.push(`decline_evidence_incomplete:${state.signerKey}`)
      providerEvents.push(evidence.providerEventId)
    } else if (state.declineEvidence) errors.push(`decline_evidence_without_declined_status:${state.signerKey}`)
  })
  if (new Set(providerEvents).size !== providerEvents.length) errors.push('duplicate_provider_event_id')
  const signedChain = states.filter((state) => state.status === 'signed').sort((left, right) => new Date(left.signatureEvidence.signedAt) - new Date(right.signatureEvidence.signedAt) || left.signerKey.localeCompare(right.signerKey))
  let expectedInputHash = signing.renderEvidence?.artifactHash
  signedChain.forEach((state) => {
    if (state.signatureEvidence.inputArtifactHash !== expectedInputHash) errors.push(`signature_artifact_chain_broken:${state.signerKey}`)
    expectedInputHash = state.signatureEvidence.outputArtifactHash
  })
  if (signedChain.length && signing.currentArtifactHash !== expectedInputHash) errors.push('current_artifact_hash_chain_invalid')
  if (!signedChain.length && signing.currentArtifactHash !== signing.renderEvidence?.artifactHash) errors.push('unsigned_artifact_hash_changed')
  const allRequiredSigned = signerContract.filter((item) => item.required).every((contract) => states.find((state) => state.signerKey === contract.signerKey)?.status === 'signed')
  if (signing.status === S.prepared && states.some((item) => item.status !== 'pending')) errors.push('prepared_signing_has_progress')
  if (signing.status === S.inProgress && states.every((item) => item.status === 'pending')) errors.push('in_progress_signing_has_no_progress')
  if (signing.status === S.awaitingCompletionEvidence && !allRequiredSigned) errors.push('required_signatures_incomplete')
  if (signing.status === S.declined && (!states.some((item) => item.status === 'declined') || !signing.terminalDecision?.reason || !validDate(signing.terminalDecision?.decidedAt))) errors.push('declined_signing_without_signer_decline')
  if ([S.expired, S.voided].includes(signing.status) && (!signing.terminalDecision?.reason || !validDate(signing.terminalDecision?.decidedAt) || new Date(signing.terminalDecision?.decidedAt) < new Date(signing.preparedAt) || new Date(signing.terminalDecision?.decidedAt) > new Date(signing.updatedAt) || !evidenceActorValid(signing.terminalDecision?.decidedBy, signing.status === S.expired ? C.expire : C.void, signing.lane))) errors.push('terminal_signing_decision_invalid')
  if (!TERMINAL.has(signing.status) && signing.terminalDecision) errors.push('terminal_decision_on_active_signing')
  if (signing.status !== S.completed && signing.signedDocumentEvidence) errors.push('signed_document_evidence_only_allowed_on_completion')
  if (signing.status === S.completed) {
    const evidence = signing.signedDocumentEvidence || {}
    if (!allRequiredSigned) errors.push('required_signatures_incomplete')
    const latestSignatureAt = signedChain.map((state) => state.signatureEvidence.signedAt).sort().at(-1)
    if (!text(evidence.signedDocumentId) || !text(evidence.signedDocumentVersionId) || !sha(evidence.finalArtifactHash) || evidence.finalArtifactHash !== signing.currentArtifactHash || !sha(evidence.storageReferenceHash) || !sha(evidence.completionCertificateHash) || !sha(evidence.certificateReferenceHash) || !text(evidence.providerEnvelopeId) || !validDate(evidence.completedAt) || (latestSignatureAt && new Date(evidence.completedAt) < new Date(latestSignatureAt)) || new Date(evidence.completedAt) > new Date(signing.updatedAt) || !evidenceActorValid(evidence.recordedBy, C.complete, signing.lane)) errors.push('signed_document_evidence_incomplete')
    if (signing.completionFingerprint !== buildConveyancerLegalInstrumentCompletionFingerprint(signing)) errors.push('completion_fingerprint_invalid')
  } else if (signing.completionFingerprint) errors.push('completion_fingerprint_only_allowed_on_completion')
  if (!Number.isInteger(Number(signing.runtimeRevision)) || Number(signing.runtimeRevision) < 1 || !validDate(signing.updatedAt) || !text(signing.lastEventId)) errors.push('signing_runtime_evidence_invalid')
  return { valid: errors.length === 0, errors: unique(errors), signing }
}

function event(signing, { commandId, commandType, commandHash = null, actor, occurredAt, before }) {
  const eventId = `legal_instrument_signing_event:${signing.signingId}:${signing.runtimeRevision}:${commandId}`
  signing.lastEventId = eventId
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_EVIDENCE_VERSION,
    eventId,
    eventType: commandType === 'prepare_signing' ? 'legal_instrument_signing_prepared' : 'legal_instrument_signing_evidence_recorded',
    commandId,
    commandType,
    commandFingerprint: commandHash,
    signingId: signing.signingId,
    reviewId: signing.reviewId,
    documentId: signing.documentId,
    planId: signing.planId,
    lane: signing.lane,
    bindingFingerprint: signing.bindingFingerprint,
    c6ApprovalFingerprint: signing.c6ApprovalFingerprint,
    before,
    after: runtimeSnapshot(signing),
    signingRevision: signing.runtimeRevision,
    occurredAt,
    actor,
    renderingPerformed: false,
    persistencePerformed: false,
    signingPerformed: false,
    dispatchPerformed: false,
    signingEvidenceRecorded: commandType !== 'prepare_signing',
  })
}

export function startConveyancerLegalInstrumentSigningEvidence({
  review: inputReview = {},
  document = {},
  renderEvidence: inputRenderEvidence = {},
  signers: inputSigners = [],
  actor = {},
  occurredAt = '',
  expiresAt = '',
  commandId = '',
  existingSignings = [],
} = {}) {
  const resolvedCommandId = text(commandId)
  if (!resolvedCommandId) return fail('command_id_required')
  const preparer = normalizeActor(actor)
  if (!preparer.userId || !canConveyancerLegalInstrumentSigningActor(preparer.role, C.prepare)) return fail('signing_preparation_not_authorised')
  const reviewValidation = validateConveyancerLegalInstrumentReview(inputReview)
  if (!reviewValidation.valid) return fail('c6_review_invalid', reviewValidation.errors)
  const review = reviewValidation.review
  if (review.status !== CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_STATUSES.approved || !review.approvedForRelease) return fail('c6_approval_required')
  if (!laneAuthorised(preparer.role, review.lane)) return fail('signing_preparation_lane_not_authorised')
  const duplicate = (Array.isArray(existingSignings) ? existingSignings : []).find((item) => text((item.signing || item).documentId) === review.documentId)
  if (duplicate) {
    const existing = duplicate.signing || duplicate
    if (existing.preparationCommandId !== resolvedCommandId) return fail('legal_instrument_signing_already_exists')
    if (existing.preparedBy?.role !== preparer.role || existing.preparedBy?.userId !== preparer.userId) return fail('signing_preparation_command_id_conflict')
    return { ok: true, duplicate: true, code: 'idempotent_replay', errors: [], signing: deepFreeze(clone(existing)), event: clone(duplicate.event || null) }
  }
  if (!validDate(occurredAt) || !validDate(expiresAt)) return fail('valid_signing_window_required')
  const preparedAt = new Date(occurredAt).toISOString()
  const resolvedExpiresAt = new Date(expiresAt).toISOString()
  if (new Date(preparedAt) < new Date(review.approval.approvedAt) || new Date(resolvedExpiresAt) <= new Date(preparedAt) || new Date(resolvedExpiresAt) > new Date(new Date(preparedAt).getTime() + 90 * 86400000)) return fail('valid_signing_window_required')
  const fingerprints = recomputeDocumentFingerprints(document)
  if (document.documentId !== review.documentId || document.contentFingerprint !== review.contentFingerprint || document.provenanceFingerprint !== review.provenanceFingerprint || fingerprints.contentFingerprint !== document.contentFingerprint || fingerprints.provenanceFingerprint !== document.provenanceFingerprint) return fail('approved_document_integrity_invalid')
  const renderEvidence = normalizeRenderEvidence(inputRenderEvidence)
  const renderErrors = validateRenderEvidence(renderEvidence, review, document, preparedAt)
  if (renderErrors.length) return fail('render_evidence_invalid', renderErrors)
  const requiredRoles = unique((document.renderModel?.signingFields || []).filter((field) => field.required !== false && ['signature', 'initial'].includes(key(field.fieldType))).map((field) => key(field.signerRole))).sort()
  if (!requiredRoles.length) return fail('document_has_no_required_signature_fields')
  const signerContract = (Array.isArray(inputSigners) ? inputSigners : []).map(normalizeSignerContract).sort((left, right) => left.signingOrder - right.signingOrder || left.signerKey.localeCompare(right.signerKey))
  const signerErrors = validateSignerContract(signerContract, requiredRoles)
  if (signerErrors.length) return fail('signer_contract_invalid', signerErrors)
  const signingId = `legal_instrument_signing:${document.documentId}`
  const signing = {
    version: CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_EVIDENCE_VERSION,
    signingId,
    reviewId: review.reviewId,
    documentId: document.documentId,
    planId: document.planId,
    planVersion: document.planVersion,
    transactionId: document.transactionId,
    organisationId: document.organisationId,
    actionKey: document.actionKey,
    lane: document.lane,
    contentFingerprint: document.contentFingerprint,
    provenanceFingerprint: document.provenanceFingerprint,
    c6BindingFingerprint: review.bindingFingerprint,
    c6ApprovalFingerprint: review.approval.approvalFingerprint,
    c6ApprovalEventId: review.lastEventId,
    renderEvidence,
    requiredSignerRoles: requiredRoles,
    signerContract,
    signerStates: signerContract.map((signer) => ({ signerKey: signer.signerKey, status: 'pending', viewedAt: null, signatureEvidence: null, declineEvidence: null })),
    preparationCommandId: resolvedCommandId,
    preparedAt,
    preparedBy: preparer,
    expiresAt: resolvedExpiresAt,
    bindingFingerprint: null,
    currentArtifactHash: renderEvidence.artifactHash,
    status: S.prepared,
    signedDocumentEvidence: null,
    completionFingerprint: null,
    terminalDecision: null,
    runtimeRevision: 1,
    updatedAt: preparedAt,
    lastEventId: null,
    dispatchAllowed: false,
    persistenceAllowed: false,
    externalSigningRequested: false,
  }
  signing.bindingFingerprint = buildConveyancerLegalInstrumentSigningBindingFingerprint(signing)
  const auditEvent = event(signing, { commandId: resolvedCommandId, commandType: 'prepare_signing', actor: preparer, occurredAt: preparedAt, before: { status: 'not_prepared', runtimeRevision: 0 } })
  const validation = validateConveyancerLegalInstrumentSigningEvidence(signing)
  if (!validation.valid) return fail('resulting_signing_evidence_invalid', validation.errors)
  return { ok: true, duplicate: false, code: 'legal_instrument_signing_prepared', errors: [], signing: deepFreeze(signing), event: auditEvent }
}

function expectedBinding(signing, command) {
  if (text(command.expectedSigningId || command.expected_signing_id) !== signing.signingId) return 'stale_signing_id'
  if (Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision) !== Number(signing.runtimeRevision)) return 'stale_signing_revision'
  if (text(command.expectedBindingFingerprint || command.expected_binding_fingerprint) !== signing.bindingFingerprint) return 'stale_signing_binding_fingerprint'
  if (text(command.expectedArtifactHash || command.expected_artifact_hash) !== signing.currentArtifactHash) return 'stale_signing_artifact_hash'
  return ''
}

function findSigner(signing, command) {
  const signerKey = key(command.signerKey || command.signer_key || command.payload?.signerKey)
  return { state: signing.signerStates.find((item) => item.signerKey === signerKey), contract: signing.signerContract.find((item) => item.signerKey === signerKey) }
}

function applyCommand(signing, commandType, command, actor, occurredAt) {
  if ([COMMAND.recordViewed, COMMAND.recordSignature, COMMAND.recordDecline].includes(commandType)) {
    if (!canConveyancerLegalInstrumentSigningActor(actor.role, C.recordEvidence)) return 'signing_evidence_recording_not_authorised'
    const { state, contract } = findSigner(signing, command)
    if (!state || !contract) return 'signer_not_found'
    if (commandType === COMMAND.recordViewed) {
      if (state.status === 'signed' || state.status === 'declined') return 'signer_terminal_status'
      state.status = 'viewed'
      state.viewedAt = occurredAt
      signing.status = S.inProgress
      return ''
    }
    if (commandType === COMMAND.recordDecline) {
      if (!['pending', 'viewed'].includes(state.status)) return 'signer_terminal_status'
      const reasonCode = key(command.reasonCode || command.reason_code || command.payload?.reasonCode)
      const evidenceReferenceId = text(command.evidenceReferenceId || command.evidence_reference_id || command.payload?.evidenceReferenceId)
      const providerEventId = text(command.providerEventId || command.provider_event_id || command.payload?.providerEventId)
      if (!reasonCode || !evidenceReferenceId || !providerEventId) return 'decline_evidence_required'
      if (signing.signerStates.some((item) => item.declineEvidence?.providerEventId === providerEventId || item.signatureEvidence?.providerEventId === providerEventId)) return 'duplicate_provider_event_id'
      state.status = 'declined'
      state.declineEvidence = { reasonCode, evidenceReferenceId, providerEventId, declinedAt: occurredAt, recordedBy: actor }
      signing.status = S.declined
      signing.terminalDecision = { reason: `signer_declined:${reasonCode}`, decidedAt: occurredAt, decidedBy: actor }
      return ''
    }
    if (!['pending', 'viewed'].includes(state.status)) return 'signer_terminal_status'
    const outstandingOrders = signing.signerContract.filter((item) => item.required && signing.signerStates.find((stateItem) => stateItem.signerKey === item.signerKey)?.status !== 'signed').map((item) => item.signingOrder)
    if (outstandingOrders.length && contract.signingOrder !== Math.min(...outstandingOrders)) return 'signing_order_not_reached'
    const method = key(command.method || command.payload?.method)
    const signedAt = command.signedAt || command.signed_at || command.payload?.signedAt || occurredAt
    const evidenceReferenceId = text(command.evidenceReferenceId || command.evidence_reference_id || command.payload?.evidenceReferenceId)
    const providerEventId = text(command.providerEventId || command.provider_event_id || command.payload?.providerEventId)
    const inputArtifactHash = text(command.inputArtifactHash || command.input_artifact_hash || command.payload?.inputArtifactHash).toLowerCase()
    const outputArtifactHash = text(command.outputArtifactHash || command.output_artifact_hash || command.payload?.outputArtifactHash).toLowerCase()
    const identity = command.identityVerification || command.identity_verification || command.payload?.identityVerification || {}
    const identityVerification = { method: key(identity.method), verifiedAt: validDate(identity.verifiedAt || identity.verified_at) ? new Date(identity.verifiedAt || identity.verified_at).toISOString() : null, referenceHash: text(identity.referenceHash || identity.reference_hash).toLowerCase() }
    if (!contract.allowedMethods.includes(method) || !validDate(signedAt) || new Date(signedAt) < new Date(signing.preparedAt) || new Date(signedAt) > new Date(occurredAt) || !evidenceReferenceId || !providerEventId || inputArtifactHash !== signing.currentArtifactHash || !sha(outputArtifactHash) || outputArtifactHash === inputArtifactHash || !identityVerification.method || !validDate(identityVerification.verifiedAt) || !sha(identityVerification.referenceHash)) return 'signature_evidence_required'
    if (signing.signerStates.some((item) => item.declineEvidence?.providerEventId === providerEventId || item.signatureEvidence?.providerEventId === providerEventId)) return 'duplicate_provider_event_id'
    state.status = 'signed'
    state.viewedAt ||= occurredAt
    state.signatureEvidence = { method, signedAt: new Date(signedAt).toISOString(), evidenceReferenceId, providerEventId, inputArtifactHash, outputArtifactHash, identityVerification, recordedBy: actor }
    signing.currentArtifactHash = outputArtifactHash
    const allSigned = signing.signerContract.filter((item) => item.required).every((item) => signing.signerStates.find((stateItem) => stateItem.signerKey === item.signerKey)?.status === 'signed')
    signing.status = allSigned ? S.awaitingCompletionEvidence : S.inProgress
    return ''
  }
  if (commandType === COMMAND.complete) {
    if (!canConveyancerLegalInstrumentSigningActor(actor.role, C.complete)) return 'signing_completion_not_authorised'
    if (signing.status !== S.awaitingCompletionEvidence) return 'required_signatures_incomplete'
    const evidence = command.signedDocumentEvidence || command.signed_document_evidence || command.payload?.signedDocumentEvidence || {}
    const normalized = {
      signedDocumentId: text(evidence.signedDocumentId || evidence.signed_document_id),
      signedDocumentVersionId: text(evidence.signedDocumentVersionId || evidence.signed_document_version_id),
      finalArtifactHash: text(evidence.finalArtifactHash || evidence.final_artifact_hash).toLowerCase(),
      storageReferenceHash: text(evidence.storageReferenceHash || evidence.storage_reference_hash).toLowerCase(),
      completionCertificateHash: text(evidence.completionCertificateHash || evidence.completion_certificate_hash).toLowerCase(),
      certificateReferenceHash: text(evidence.certificateReferenceHash || evidence.certificate_reference_hash).toLowerCase(),
      providerEnvelopeId: text(evidence.providerEnvelopeId || evidence.provider_envelope_id),
      completedAt: occurredAt,
      recordedBy: actor,
    }
    if (!normalized.signedDocumentId || !normalized.signedDocumentVersionId || normalized.finalArtifactHash !== signing.currentArtifactHash || !sha(normalized.storageReferenceHash) || !sha(normalized.completionCertificateHash) || !sha(normalized.certificateReferenceHash) || !normalized.providerEnvelopeId) return 'signed_document_evidence_required'
    signing.status = S.completed
    signing.signedDocumentEvidence = normalized
    signing.completionFingerprint = buildConveyancerLegalInstrumentCompletionFingerprint(signing)
    return ''
  }
  if (commandType === COMMAND.expire) {
    if (!canConveyancerLegalInstrumentSigningActor(actor.role, C.expire)) return 'signing_expiry_not_authorised'
    if (new Date(occurredAt) < new Date(signing.expiresAt)) return 'signing_not_expired'
    signing.status = S.expired
    signing.terminalDecision = { reason: 'signing_window_expired', decidedAt: occurredAt, decidedBy: actor }
    return ''
  }
  if (!canConveyancerLegalInstrumentSigningActor(actor.role, C.void)) return 'signing_void_not_authorised'
  const reason = text(command.reason || command.payload?.reason)
  if (!reason) return 'signing_void_reason_required'
  signing.status = S.voided
  signing.terminalDecision = { reason, decidedAt: occurredAt, decidedBy: actor }
  return ''
}

export function executeConveyancerLegalInstrumentSigningEvidence({ signing: input = {}, command = {}, actor = {}, occurredAt = '', existingEvents = [] } = {}) {
  const commandId = text(command.commandId || command.command_id)
  if (!commandId) return fail('command_id_required')
  const validation = validateConveyancerLegalInstrumentSigningEvidence(input)
  if (!validation.valid) return fail('signing_evidence_invalid', validation.errors)
  const current = validation.signing
  const commandType = key(command.type)
  if (!COMMANDS.has(commandType)) return fail('invalid_signing_evidence_command')
  const evidenceActor = normalizeActor(actor)
  if (!evidenceActor.userId || !laneAuthorised(evidenceActor.role, current.lane)) return fail('signing_actor_not_authorised')
  const resolvedCommandFingerprint = commandFingerprint(commandType, command, evidenceActor)
  const duplicate = (Array.isArray(existingEvents) ? existingEvents : []).find((item) => item.commandId === commandId && item.signingId === current.signingId)
  if (duplicate) {
    if (duplicate.commandType !== commandType || duplicate.commandFingerprint !== resolvedCommandFingerprint) return fail('signing_command_id_conflict')
    return { ok: true, duplicate: true, code: 'idempotent_replay', errors: [], signing: deepFreeze(clone(current)), event: clone(duplicate) }
  }
  if (TERMINAL.has(current.status)) return fail('terminal_signing_evidence')
  if (!validDate(occurredAt)) return fail('occurred_at_required')
  const resolvedOccurredAt = new Date(occurredAt).toISOString()
  if (new Date(resolvedOccurredAt) < new Date(current.updatedAt)) return fail('signing_event_precedes_current_revision')
  if (new Date(resolvedOccurredAt) > new Date(current.expiresAt) && commandType !== COMMAND.expire) return fail('signing_window_expired')
  const bindingError = expectedBinding(current, command)
  if (bindingError) return fail(bindingError)
  const next = clone(current)
  const before = runtimeSnapshot(next)
  const applyError = applyCommand(next, commandType, command, evidenceActor, resolvedOccurredAt)
  if (applyError) return fail(applyError)
  next.runtimeRevision += 1
  next.updatedAt = resolvedOccurredAt
  const auditEvent = event(next, { commandId, commandType, commandHash: resolvedCommandFingerprint, actor: evidenceActor, occurredAt: resolvedOccurredAt, before })
  const nextValidation = validateConveyancerLegalInstrumentSigningEvidence(next)
  if (!nextValidation.valid) return fail('resulting_signing_evidence_invalid', nextValidation.errors)
  return { ok: true, duplicate: false, code: commandType === COMMAND.complete ? 'legal_instrument_signing_completed' : 'legal_instrument_signing_evidence_updated', errors: [], signing: deepFreeze(next), event: auditEvent }
}
