import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerGovernedContentHash } from './conveyancerCorrespondenceGenerator.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_ASSURANCE_VERSION,
  buildConveyancerLegalInstrumentAssurance,
} from './conveyancerLegalInstrumentPilot.js'

export const CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_VERSION = 'conveyancer_legal_instrument_review_v1'

export const CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_STATUSES = Object.freeze({
  pendingReview: 'pending_review',
  changesRequested: 'changes_requested',
  reviewed: 'reviewed',
  approved: 'approved',
  rejected: 'rejected',
})

export const CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS = Object.freeze({
  recommendApproval: 'recommend_approval',
  requestChanges: 'request_changes',
  reject: 'reject',
  approve: 'approve',
})

export const CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CAPABILITIES = Object.freeze({
  submit: 'submit',
  review: 'review',
  approve: 'approve',
  reject: 'reject',
})

export const CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS = Object.freeze([
  Object.freeze({ key: 'instruction_and_scope', label: 'Instruction and scope match the matter' }),
  Object.freeze({ key: 'parties_and_capacity', label: 'Parties, identity and signing capacity are correct' }),
  Object.freeze({ key: 'property_and_financial_data', label: 'Property and relevant financial data are correct' }),
  Object.freeze({ key: 'legal_wording_and_clauses', label: 'Legal wording and approved clauses are appropriate' }),
  Object.freeze({ key: 'execution_and_signing_fields', label: 'Execution blocks and signing fields are correct' }),
  Object.freeze({ key: 'data_warnings_and_conflicts', label: 'Data warnings and source conflicts are addressed' }),
])

const S = CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_STATUSES
const C = CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CAPABILITIES
const COMMANDS = new Set(Object.values(CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS))
const STATUSES = new Set(Object.values(S))
const CONTROL_KEYS = new Set(CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS.map((item) => item.key))
const TERMINAL_STATUSES = new Set([S.changesRequested, S.approved, S.rejected])

export const CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([C.submit]),
  [R.conveyancer]: Object.freeze(Object.values(C)),
  [R.transferAttorney]: Object.freeze(Object.values(C)),
  [R.bondAttorney]: Object.freeze(Object.values(C)),
  [R.cancellationAttorney]: Object.freeze(Object.values(C)),
  [R.firmManager]: Object.freeze(Object.values(C)),
  [R.accounts]: Object.freeze([]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
  [R.system]: Object.freeze([]),
})

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function clone(value) {
  return typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

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

function fail(code, errors = []) {
  return { ok: false, duplicate: false, code, errors: unique(errors), review: null, event: null }
}

export function getConveyancerLegalInstrumentReviewCapabilities(role) {
  return CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerLegalInstrumentReviewActor(role, capability) {
  return getConveyancerLegalInstrumentReviewCapabilities(role).includes(key(capability))
}

function laneAuthorised(role, lane) {
  const normalizedRole = normalizeMatterPlanOwnerRole(role)
  if (normalizedRole === R.firmManager) return true
  if (lane === 'transfer') return [R.conveyancer, R.transferAttorney, R.secretary].includes(normalizedRole)
  if (lane === 'bond') return [R.bondAttorney, R.secretary].includes(normalizedRole)
  if (lane === 'cancellation') return [R.cancellationAttorney, R.secretary].includes(normalizedRole)
  return false
}

function normalizeActor(input = {}) {
  return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null }
}

function normalizeControl(input = {}) {
  return {
    key: key(input.key || input.controlKey || input.control_key),
    status: key(input.status),
    reason: text(input.reason) || null,
  }
}

function normalizeControls(input = []) {
  if (Array.isArray(input)) return input.map(normalizeControl)
  if (input && typeof input === 'object') {
    return Object.entries(input).map(([controlKey, value]) => normalizeControl({
      key: controlKey,
      status: value === true ? 'confirmed' : value?.status || (value === false ? 'issue' : ''),
      reason: value?.reason,
    }))
  }
  return []
}

function controlsComplete(controls = []) {
  const byKey = new Map(controls.map((item) => [item.key, item]))
  return [...CONTROL_KEYS].every((controlKey) => {
    const control = byKey.get(controlKey)
    return control && (control.status === 'confirmed' || (control.status === 'not_applicable' && control.reason))
  }) && controls.every((item) => CONTROL_KEYS.has(item.key)) && new Set(controls.map((item) => item.key)).size === controls.length
}

function warningCodesFromDocument(document = {}) {
  return unique((Array.isArray(document.dataValidation?.failedCodes) ? document.dataValidation.failedCodes : []).map(key)).sort()
}

function buildBindingSnapshot(review = {}) {
  return stable({
    version: review.version,
    reviewId: review.reviewId,
    documentId: review.documentId,
    planId: review.planId,
    planVersion: review.planVersion,
    transactionId: review.transactionId,
    organisationId: review.organisationId,
    actionKey: review.actionKey,
    documentKey: review.documentKey,
    documentKind: review.documentKind,
    lane: review.lane,
    templateVersionId: review.templateVersionId,
    templateGovernanceFingerprint: review.templateGovernanceFingerprint,
    contentFingerprint: review.contentFingerprint,
    provenanceFingerprint: review.provenanceFingerprint,
    preparer: review.preparer,
    submissionCommandId: review.submissionCommandId,
    submittedAt: review.submittedAt,
    submittedBy: review.submittedBy,
    c5Assurance: review.c5Assurance,
    warningCodes: review.warningCodes,
  })
}

export function buildConveyancerLegalInstrumentReviewBindingFingerprint(review = {}) {
  return buildConveyancerGovernedContentHash(JSON.stringify(buildBindingSnapshot(review)))
}

function buildApprovalSnapshot(review = {}) {
  const approval = review.approval || {}
  return stable({
    reviewId: review.reviewId,
    documentId: review.documentId,
    bindingFingerprint: review.bindingFingerprint,
    contentFingerprint: review.contentFingerprint,
    provenanceFingerprint: review.provenanceFingerprint,
    reviewEventId: approval.reviewEventId,
    decisionReferenceId: approval.decisionReferenceId,
    summary: approval.summary,
    approvedAt: approval.approvedAt,
    approvedBy: approval.approvedBy,
  })
}

export function buildConveyancerLegalInstrumentApprovalFingerprint(review = {}) {
  return buildConveyancerGovernedContentHash(JSON.stringify(buildApprovalSnapshot(review)))
}

function runtimeSnapshot(review = {}) {
  return {
    status: review.status,
    reviewDecision: clone(review.reviewDecision || null),
    approval: clone(review.approval || null),
    runtimeRevision: Number(review.runtimeRevision || 0),
    updatedAt: review.updatedAt || null,
    lastEventId: review.lastEventId || null,
  }
}

function commandFingerprint(commandType, command, actor) {
  return buildConveyancerGovernedContentHash(JSON.stringify(stable({ commandType, command, actor })))
}

export function validateConveyancerLegalInstrumentReview(input = {}) {
  const review = clone(input || {})
  const errors = []
  if (review.version !== CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_VERSION) errors.push('unsupported_legal_instrument_review_contract')
  if (!text(review.reviewId)) errors.push('review_id_required')
  if (!text(review.documentId)) errors.push('document_id_required')
  if (!text(review.planId)) errors.push('plan_id_required')
  if (!Number.isInteger(Number(review.planVersion)) || Number(review.planVersion) < 1) errors.push('plan_version_required')
  if (!text(review.transactionId)) errors.push('transaction_id_required')
  if (!text(review.organisationId)) errors.push('organisation_id_required')
  if (!text(review.actionKey)) errors.push('action_key_required')
  if (!text(review.documentKey)) errors.push('document_key_required')
  if (!text(review.documentKind)) errors.push('document_kind_required')
  if (!['transfer', 'bond', 'cancellation'].includes(review.lane)) errors.push('valid_legal_lane_required')
  if (!text(review.templateVersionId) || !text(review.templateGovernanceFingerprint)) errors.push('template_provenance_required')
  if (!/^[a-f0-9]{64}$/i.test(text(review.contentFingerprint))) errors.push('valid_content_fingerprint_required')
  if (!/^[a-f0-9]{64}$/i.test(text(review.provenanceFingerprint))) errors.push('valid_provenance_fingerprint_required')
  if (!review.preparer?.userId || !review.preparer?.role) errors.push('preparer_required')
  if (!review.submittedBy?.userId || !review.submittedBy?.role || !validDate(review.submittedAt)) errors.push('submission_evidence_required')
  if (!STATUSES.has(review.status)) errors.push('invalid_review_status')
  if (!Number.isInteger(Number(review.runtimeRevision)) || Number(review.runtimeRevision) < 1) errors.push('positive_review_revision_required')
  if (!validDate(review.updatedAt)) errors.push('review_updated_at_required')
  if (!text(review.lastEventId)) errors.push('last_event_id_required')
  if (!review.c5Assurance || review.c5Assurance.version !== CONVEYANCER_LEGAL_INSTRUMENT_ASSURANCE_VERSION || !['ready', 'observe'].includes(review.c5Assurance.decision)) errors.push('reviewable_c5_assurance_required')
  if (review.bindingFingerprint !== buildConveyancerLegalInstrumentReviewBindingFingerprint(review)) errors.push('review_binding_fingerprint_invalid')
  const warnings = unique((review.warningCodes || []).map(key)).sort()

  if (review.status === S.pendingReview && (review.reviewDecision || review.approval)) errors.push('pending_review_cannot_have_decision')
  if ([S.reviewed, S.changesRequested, S.rejected, S.approved].includes(review.status) && !review.reviewDecision) errors.push('review_decision_required')
  if (review.reviewDecision) {
    const reviewer = review.reviewDecision.decidedBy || {}
    const capability = review.reviewDecision.outcome === 'rejected' ? C.reject : C.review
    if (!reviewer.userId || !canConveyancerLegalInstrumentReviewActor(reviewer.role, capability) || !laneAuthorised(reviewer.role, review.lane)) errors.push('legal_review_authority_invalid')
    if (!validDate(review.reviewDecision.decidedAt) || new Date(review.reviewDecision.decidedAt) < new Date(review.submittedAt) || new Date(review.reviewDecision.decidedAt) > new Date(review.updatedAt)) errors.push('legal_review_chronology_invalid')
  }
  if ([S.reviewed, S.approved].includes(review.status)) {
    if (review.reviewDecision?.outcome !== 'recommended') errors.push('approval_recommendation_required')
    if (!review.reviewDecision?.decidedBy?.userId || review.reviewDecision.decidedBy.userId === review.preparer.userId) errors.push('independent_legal_review_required')
    if (!validDate(review.reviewDecision?.decidedAt) || !text(review.reviewDecision?.summary)) errors.push('legal_review_evidence_incomplete')
    if (!controlsComplete(review.reviewDecision?.controls || [])) errors.push('review_controls_incomplete')
    const acknowledged = unique((review.reviewDecision?.acknowledgedWarningCodes || []).map(key)).sort()
    if (JSON.stringify(acknowledged) !== JSON.stringify(warnings)) errors.push('data_warning_acknowledgement_incomplete')
  }
  if (review.status === S.changesRequested) {
    if (review.reviewDecision?.outcome !== 'changes_requested' || !text(review.reviewDecision?.reason) || !Array.isArray(review.reviewDecision?.changeRequests) || !review.reviewDecision.changeRequests.length) errors.push('change_request_evidence_incomplete')
  }
  if (review.status === S.rejected && (review.reviewDecision?.outcome !== 'rejected' || !text(review.reviewDecision?.reason))) errors.push('rejection_evidence_incomplete')
  if (review.status !== S.approved && review.approval) errors.push('approval_only_allowed_in_approved_status')
  if (review.status === S.approved) {
    if (!review.approval?.approvedBy?.userId || review.approval.approvedBy.userId === review.preparer.userId) errors.push('independent_final_approval_required')
    if (!canConveyancerLegalInstrumentReviewActor(review.approval?.approvedBy?.role, C.approve) || !laneAuthorised(review.approval?.approvedBy?.role, review.lane)) errors.push('final_approval_authority_invalid')
    if (!validDate(review.approval?.approvedAt) || !text(review.approval?.summary) || !text(review.approval?.decisionReferenceId) || !text(review.approval?.reviewEventId)) errors.push('final_approval_evidence_incomplete')
    if (validDate(review.approval?.approvedAt) && (new Date(review.approval.approvedAt) < new Date(review.reviewDecision?.decidedAt) || new Date(review.approval.approvedAt) > new Date(review.updatedAt))) errors.push('final_approval_chronology_invalid')
    if (review.approval?.approvalFingerprint !== buildConveyancerLegalInstrumentApprovalFingerprint(review)) errors.push('approval_fingerprint_invalid')
  }
  return { valid: errors.length === 0, errors: unique(errors), review }
}

function event(review, { commandId, commandType, commandHash = null, actor, occurredAt, before }) {
  const eventId = `legal_instrument_review_event:${review.reviewId}:${review.runtimeRevision}:${commandId}`
  review.lastEventId = eventId
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_VERSION,
    eventId,
    eventType: commandType === 'submit_review' ? 'legal_instrument_review_submitted' : 'legal_instrument_review_decision',
    commandId,
    commandType,
    commandFingerprint: commandHash,
    reviewId: review.reviewId,
    documentId: review.documentId,
    planId: review.planId,
    planVersion: review.planVersion,
    actionKey: review.actionKey,
    lane: review.lane,
    contentFingerprint: review.contentFingerprint,
    provenanceFingerprint: review.provenanceFingerprint,
    bindingFingerprint: review.bindingFingerprint,
    before,
    after: runtimeSnapshot(review),
    reviewRevision: review.runtimeRevision,
    occurredAt,
    actor,
    renderingPerformed: false,
    persistencePerformed: false,
    signingPerformed: false,
    dispatchPerformed: false,
  })
}

export function startConveyancerLegalInstrumentReview({
  plan = {},
  template = {},
  document = {},
  generationEvent = {},
  actor = {},
  occurredAt = '',
  commandId = '',
  existingReviews = [],
} = {}) {
  const resolvedCommandId = text(commandId)
  if (!resolvedCommandId) return fail('command_id_required')
  const submitter = normalizeActor(actor)
  if (!submitter.userId) return fail('review_submitter_user_required')
  if (!canConveyancerLegalInstrumentReviewActor(submitter.role, C.submit)) return fail('review_submission_not_authorised')
  if (!laneAuthorised(submitter.role, document.lane)) return fail('review_submission_lane_not_authorised')
  const duplicate = (Array.isArray(existingReviews) ? existingReviews : []).find((item) => text((item.review || item).documentId) === text(document.documentId))
  if (duplicate) {
    const existing = duplicate.review || duplicate
    if (text(existing.submissionCommandId) === resolvedCommandId) {
      if (existing.submittedBy?.role !== submitter.role || existing.submittedBy?.userId !== submitter.userId) return fail('submission_command_id_conflict')
      return { ok: true, duplicate: true, code: 'idempotent_replay', errors: [], review: clone(existing), event: clone(duplicate.event || null) }
    }
    return fail('legal_instrument_review_already_exists')
  }
  if (!validDate(occurredAt)) return fail('occurred_at_required')
  const resolvedOccurredAt = new Date(occurredAt).toISOString()
  if (!validDate(document.generatedAt) || new Date(resolvedOccurredAt) < new Date(document.generatedAt)) return fail('review_submission_precedes_generation')
  const assurance = buildConveyancerLegalInstrumentAssurance({ plan, template, document, event: generationEvent, asOf: resolvedOccurredAt })
  if (assurance.decision === 'blocked') return fail('c5_legal_instrument_assurance_blocked', assurance.failedChecks.map((item) => item.id))
  const reviewId = `legal_instrument_review:${document.documentId}`
  const review = {
    version: CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_VERSION,
    reviewId,
    documentId: document.documentId,
    planId: document.planId,
    planVersion: document.planVersion,
    transactionId: document.transactionId,
    organisationId: document.organisationId,
    actionKey: document.actionKey,
    documentKey: document.documentKey,
    documentKind: document.documentKind,
    lane: document.lane,
    templateVersionId: document.template?.templateVersionId,
    templateGovernanceFingerprint: document.template?.governanceFingerprint,
    contentFingerprint: document.contentFingerprint,
    provenanceFingerprint: document.provenanceFingerprint,
    bindingFingerprint: null,
    status: S.pendingReview,
    preparer: normalizeActor(document.generatedBy),
    submissionCommandId: resolvedCommandId,
    submittedAt: resolvedOccurredAt,
    submittedBy: submitter,
    c5Assurance: {
      version: assurance.version,
      decision: assurance.decision,
      generatedAt: assurance.evidence.generatedAt,
      templateVersionId: assurance.evidence.templateVersionId,
      templateGovernanceFingerprint: assurance.evidence.templateGovernanceFingerprint,
      contentFingerprint: assurance.evidence.contentFingerprint,
      provenanceFingerprint: document.provenanceFingerprint,
    },
    warningCodes: warningCodesFromDocument(document),
    reviewDecision: null,
    approval: null,
    runtimeRevision: 1,
    updatedAt: resolvedOccurredAt,
    lastEventId: null,
    approvedForRelease: false,
    renderingAllowed: false,
    persistenceAllowed: false,
    signingAllowed: false,
    dispatchAllowed: false,
  }
  review.bindingFingerprint = buildConveyancerLegalInstrumentReviewBindingFingerprint(review)
  const before = { status: 'not_submitted', reviewDecision: null, approval: null, runtimeRevision: 0, updatedAt: null, lastEventId: null }
  const auditEvent = event(review, { commandId: resolvedCommandId, commandType: 'submit_review', actor: submitter, occurredAt: resolvedOccurredAt, before })
  const validation = validateConveyancerLegalInstrumentReview(review)
  if (!validation.valid) return fail('resulting_legal_instrument_review_invalid', validation.errors)
  return { ok: true, duplicate: false, code: 'legal_instrument_review_submitted', errors: [], review: deepFreeze(review), event: auditEvent }
}

function validateCommandBinding(review, command) {
  if (!text(command.expectedReviewId || command.expected_review_id)) return 'expected_review_id_required'
  if (text(command.expectedReviewId || command.expected_review_id) !== review.reviewId) return 'stale_review_id'
  if (!Number.isInteger(Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision))) return 'expected_review_revision_required'
  if (Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision) !== Number(review.runtimeRevision)) return 'stale_review_revision'
  if (text(command.expectedDocumentId || command.expected_document_id) !== review.documentId) return 'stale_review_document_id'
  if (text(command.expectedContentFingerprint || command.expected_content_fingerprint) !== review.contentFingerprint) return 'stale_review_content_fingerprint'
  if (text(command.expectedProvenanceFingerprint || command.expected_provenance_fingerprint) !== review.provenanceFingerprint) return 'stale_review_provenance_fingerprint'
  return ''
}

function changeRequests(input = []) {
  return (Array.isArray(input) ? input : []).map((item) => ({
    category: key(item.category) || 'other',
    description: text(item.description),
    blocking: item.blocking !== false,
  })).filter((item) => item.description)
}

function applyReviewCommand(review, commandType, command, actor, occurredAt) {
  if ([CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.recommendApproval, CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.requestChanges, CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.reject].includes(commandType)) {
    if (review.status !== S.pendingReview && !(review.status === S.reviewed && commandType === CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.requestChanges)) return 'review_decision_not_allowed_in_current_status'
    if (!canConveyancerLegalInstrumentReviewActor(actor.role, commandType === CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.reject ? C.reject : C.review)) return 'legal_review_decision_not_authorised'
    if (actor.userId === review.preparer.userId) return 'independent_legal_review_required'
  }
  if (commandType === CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.recommendApproval) {
    const controls = normalizeControls(command.controls || command.payload?.controls)
    if (!controlsComplete(controls)) return 'review_controls_incomplete'
    const summary = text(command.summary || command.payload?.summary)
    if (!summary) return 'legal_review_summary_required'
    const acknowledged = unique((command.acknowledgedWarningCodes || command.acknowledged_warning_codes || command.payload?.acknowledgedWarningCodes || []).map(key)).sort()
    if (JSON.stringify(acknowledged) !== JSON.stringify(review.warningCodes)) return 'data_warning_acknowledgement_incomplete'
    review.status = S.reviewed
    review.reviewDecision = { outcome: 'recommended', summary, controls, acknowledgedWarningCodes: acknowledged, decidedAt: occurredAt, decidedBy: actor }
    return ''
  }
  if (commandType === CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.requestChanges) {
    const reason = text(command.reason || command.payload?.reason)
    const requests = changeRequests(command.changeRequests || command.change_requests || command.payload?.changeRequests)
    if (!reason) return 'change_request_reason_required'
    if (!requests.length) return 'change_request_detail_required'
    review.status = S.changesRequested
    review.reviewDecision = { outcome: 'changes_requested', reason, changeRequests: requests, decidedAt: occurredAt, decidedBy: actor }
    return ''
  }
  if (commandType === CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.reject) {
    const reason = text(command.reason || command.payload?.reason)
    if (!reason) return 'legal_rejection_reason_required'
    review.status = S.rejected
    review.reviewDecision = { outcome: 'rejected', reason, decidedAt: occurredAt, decidedBy: actor }
    return ''
  }
  if (review.status !== S.reviewed) return 'final_approval_requires_review_recommendation'
  if (!canConveyancerLegalInstrumentReviewActor(actor.role, C.approve)) return 'final_approval_not_authorised'
  if (actor.userId === review.preparer.userId) return 'independent_final_approval_required'
  const summary = text(command.summary || command.payload?.summary)
  const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id || command.payload?.decisionReferenceId || command.payload?.decision_reference_id)
  if (!summary) return 'final_approval_summary_required'
  if (!decisionReferenceId) return 'approval_decision_reference_required'
  review.status = S.approved
  review.approvedForRelease = true
  review.approval = {
    summary,
    decisionReferenceId,
    reviewEventId: review.lastEventId,
    approvedAt: occurredAt,
    approvedBy: actor,
    approvalFingerprint: null,
  }
  review.approval.approvalFingerprint = buildConveyancerLegalInstrumentApprovalFingerprint(review)
  return ''
}

export function executeConveyancerLegalInstrumentReview({ review: input = {}, command = {}, actor = {}, occurredAt = '', existingEvents = [] } = {}) {
  const commandId = text(command.commandId || command.command_id)
  if (!commandId) return fail('command_id_required')
  const validation = validateConveyancerLegalInstrumentReview(input)
  if (!validation.valid) return fail('legal_instrument_review_invalid', validation.errors)
  const current = validation.review
  const commandType = key(command.type)
  if (!COMMANDS.has(commandType)) return fail('invalid_legal_instrument_review_command')
  const decisionMaker = normalizeActor(actor)
  if (!decisionMaker.userId) return fail('review_actor_user_required')
  if (!laneAuthorised(decisionMaker.role, current.lane)) return fail('review_actor_lane_not_authorised')
  const duplicate = (Array.isArray(existingEvents) ? existingEvents : []).find((item) => text(item.commandId || item.command_id) === commandId && text(item.reviewId || item.review_id) === current.reviewId)
  const resolvedCommandFingerprint = commandFingerprint(commandType, command, decisionMaker)
  if (duplicate) {
    if (duplicate.commandType !== commandType || duplicate.commandFingerprint !== resolvedCommandFingerprint) return fail('review_command_id_conflict')
    return { ok: true, duplicate: true, code: 'idempotent_replay', errors: [], review: deepFreeze(clone(current)), event: clone(duplicate) }
  }
  if (TERMINAL_STATUSES.has(current.status)) return fail('terminal_legal_instrument_review')
  if (!validDate(occurredAt)) return fail('occurred_at_required')
  const resolvedOccurredAt = new Date(occurredAt).toISOString()
  if (new Date(resolvedOccurredAt) < new Date(current.updatedAt)) return fail('review_event_precedes_current_revision')
  const bindingError = validateCommandBinding(current, command)
  if (bindingError) return fail(bindingError)
  const next = clone(current)
  const before = runtimeSnapshot(next)
  const applyError = applyReviewCommand(next, commandType, command, decisionMaker, resolvedOccurredAt)
  if (applyError) return fail(applyError)
  next.runtimeRevision = Number(next.runtimeRevision) + 1
  next.updatedAt = resolvedOccurredAt
  const auditEvent = event(next, { commandId, commandType, commandHash: resolvedCommandFingerprint, actor: decisionMaker, occurredAt: resolvedOccurredAt, before })
  const nextValidation = validateConveyancerLegalInstrumentReview(next)
  if (!nextValidation.valid) return fail('resulting_legal_instrument_review_invalid', nextValidation.errors)
  return { ok: true, duplicate: false, code: commandType === CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS.approve ? 'legal_instrument_approved' : 'legal_instrument_review_updated', errors: [], review: deepFreeze(next), event: auditEvent }
}
