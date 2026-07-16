import {
  buildPracticeActor,
  buildPracticeAuditEvent,
  buildPracticeEvidenceSource,
  buildPracticeOperationIdentity,
  buildPracticePolicyBinding,
  evaluatePracticeOperationAuthority,
  PRACTICE_OPERATION_CAPABILITIES,
} from './conveyancerPracticeOperationsContract.js'
import { buildInformationResource } from './conveyancerInformationGovernance.js'

export const CONVEYANCER_MANUAL_EVIDENCE_VERSION = 'conveyancer_manual_evidence_g3_v1'

export const CANONICAL_EVIDENCE_TYPES = Object.freeze({
  attorneyInstruction: 'attorney_instruction',
  identityDocument: 'identity_document',
  addressVerification: 'address_verification',
  entityRegistration: 'entity_registration',
  constitutionalDocument: 'constitutional_document',
  beneficialOwnershipEvidence: 'beneficial_ownership_evidence',
  authorisedRepresentativeEvidence: 'authorised_representative_evidence',
  sourceOfFunds: 'source_of_funds',
  sourceOfWealth: 'source_of_wealth',
  pepScreening: 'pep_screening',
  sanctionsScreening: 'sanctions_screening',
  adverseMediaScreening: 'adverse_media_screening',
  fidelityFundCertificate: 'fidelity_fund_certificate',
  trustAccountVerification: 'trust_account_verification',
  beneficiaryVerification: 'beneficiary_verification',
  bankDetailChangeVerification: 'bank_detail_change_verification',
  paymentSupportingDocument: 'payment_supporting_document',
  paymentFailure: 'payment_failure',
  paymentReversal: 'payment_reversal',
  trustLedgerSnapshot: 'trust_ledger_snapshot',
  correspondenceAttachment: 'correspondence_attachment',
  communicationDelivery: 'communication_delivery',
  communicationFailure: 'communication_failure',
  communicationAcknowledgement: 'communication_acknowledgement',
  bankInstruction: 'bank_instruction',
  bondApproval: 'bond_approval',
  bondCancellationInstruction: 'bond_cancellation_instruction',
  cancellationFigures: 'cancellation_figures',
  bankGuarantee: 'bank_guarantee',
  transferDutyAssessment: 'transfer_duty_assessment',
  transferDutyReceipt: 'transfer_duty_receipt',
  municipalClearanceFigures: 'municipal_clearance_figures',
  municipalClearanceCertificate: 'municipal_clearance_certificate',
  levyClearanceFigures: 'levy_clearance_figures',
  levyClearanceCertificate: 'levy_clearance_certificate',
  signingEvidence: 'signing_evidence',
  trustReceipt: 'trust_receipt',
  proofOfPayment: 'proof_of_payment',
  deedsLodgement: 'deeds_lodgement',
  deedsProgression: 'deeds_progression',
  deedsRegistration: 'deeds_registration',
  providerException: 'provider_exception',
})

export const EVIDENCE_REVIEW_STATES = Object.freeze({
  captured: 'captured',
  underReview: 'under_review',
  accepted: 'accepted',
  rejected: 'rejected',
  superseded: 'superseded',
  withdrawn: 'withdrawn',
  expired: 'expired',
})

export const EVIDENCE_QUALITY_LEVELS = Object.freeze({
  insufficient: 'insufficient',
  reviewable: 'reviewable',
  complete: 'complete',
})

const S = EVIDENCE_REVIEW_STATES
const C = PRACTICE_OPERATION_CAPABILITIES
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const TYPE_VALUES = Object.freeze(Object.values(CANONICAL_EVIDENCE_TYPES))
const TERMINAL_STATES = new Set([S.rejected, S.superseded, S.withdrawn, S.expired])
const STATE_TRANSITIONS = Object.freeze({
  [S.captured]: Object.freeze([S.underReview, S.withdrawn, S.expired]),
  [S.underReview]: Object.freeze([S.accepted, S.rejected, S.withdrawn, S.expired]),
  [S.accepted]: Object.freeze([S.superseded, S.withdrawn, S.expired]),
  [S.rejected]: Object.freeze([]),
  [S.superseded]: Object.freeze([]),
  [S.withdrawn]: Object.freeze([]),
  [S.expired]: Object.freeze([]),
})

const TYPE_RULES = Object.freeze({
  identity_document: { expiryRequired: true, classifications: ['special_personal', 'restricted'] },
  address_verification: { expiryRequired: true, classifications: ['personal', 'restricted'] },
  entity_registration: { externalReferenceRequired: true, classifications: ['confidential', 'personal'] },
  constitutional_document: { classifications: ['confidential', 'privileged'] },
  beneficial_ownership_evidence: { classifications: ['special_personal', 'restricted'] },
  authorised_representative_evidence: { classifications: ['personal', 'restricted'] },
  source_of_funds: { classifications: ['financial', 'restricted'] },
  source_of_wealth: { classifications: ['financial', 'restricted'] },
  pep_screening: { expiryRequired: true, classifications: ['special_personal', 'restricted'] },
  sanctions_screening: { expiryRequired: true, classifications: ['special_personal', 'restricted'] },
  adverse_media_screening: { expiryRequired: true, classifications: ['special_personal', 'restricted'] },
  fidelity_fund_certificate: { expiryRequired: true, externalReferenceRequired: true, classifications: ['confidential', 'restricted'] },
  trust_account_verification: { expiryRequired: true, externalReferenceRequired: true, classifications: ['financial', 'restricted'] },
  beneficiary_verification: { expiryRequired: true, classifications: ['financial', 'restricted'] },
  bank_detail_change_verification: { expiryRequired: true, classifications: ['financial', 'restricted'] },
  payment_supporting_document: { classifications: ['financial', 'restricted'] },
  payment_failure: { externalReferenceRequired: true, classifications: ['financial', 'restricted'] },
  payment_reversal: { externalReferenceRequired: true, classifications: ['financial', 'restricted'] },
  trust_ledger_snapshot: { externalReferenceRequired: true, classifications: ['financial', 'restricted'] },
  correspondence_attachment: { classifications: ['confidential'] },
  communication_delivery: { externalReferenceRequired: true, classifications: ['confidential'] },
  communication_failure: { externalReferenceRequired: true, classifications: ['confidential'] },
  communication_acknowledgement: { externalReferenceRequired: true, classifications: ['confidential'] },
  cancellation_figures: { expiryRequired: true, externalReferenceRequired: true, classifications: ['financial', 'confidential'] },
  bank_guarantee: { expiryRequired: true, externalReferenceRequired: true, classifications: ['financial', 'privileged'] },
  transfer_duty_assessment: { externalReferenceRequired: true, classifications: ['financial', 'personal'] },
  transfer_duty_receipt: { externalReferenceRequired: true, classifications: ['financial', 'personal'] },
  municipal_clearance_figures: { expiryRequired: true, externalReferenceRequired: true, classifications: ['financial', 'personal'] },
  municipal_clearance_certificate: { expiryRequired: true, externalReferenceRequired: true, classifications: ['confidential', 'personal'] },
  levy_clearance_figures: { expiryRequired: true, externalReferenceRequired: true, classifications: ['financial', 'personal'] },
  levy_clearance_certificate: { expiryRequired: true, externalReferenceRequired: true, classifications: ['confidential', 'personal'] },
  trust_receipt: { externalReferenceRequired: true, classifications: ['financial', 'restricted'] },
  proof_of_payment: { externalReferenceRequired: true, classifications: ['financial', 'restricted'] },
  deeds_lodgement: { externalReferenceRequired: true, classifications: ['confidential'] },
  deeds_progression: { externalReferenceRequired: true, classifications: ['confidential'] },
  deeds_registration: { externalReferenceRequired: true, classifications: ['confidential'] },
})

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const unique = (values = []) => [...new Set(values.map(key).filter(Boolean))].sort()

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, name) => {
    result[name] = stable(value[name])
    return result
  }, {})
}

function fingerprint(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

function qualityRules(type) {
  return TYPE_RULES[type] || { classifications: ['confidential'] }
}

function normalizedFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [key(name), typeof value === 'string' ? text(value) : value]))
}

export function evaluateEvidenceQuality(input = {}) {
  const type = key(input.canonicalEvidenceType)
  const rules = qualityRules(type)
  const issues = []
  const warnings = []
  const effectiveAt = iso(input.effectiveAt)
  const receivedAt = iso(input.receivedAt)
  const expiresAt = iso(input.expiresAt)

  if (!TYPE_VALUES.includes(type)) issues.push('evidence_type_unknown')
  if (!text(input.issuingOrganisation)) issues.push('evidence_issuing_organisation_required')
  if (rules.externalReferenceRequired && !text(input.externalReference)) issues.push('evidence_external_reference_required')
  if (!receivedAt) issues.push('evidence_received_date_required')
  if (!text(input.documentReference) || !HASH.test(text(input.documentHash))) issues.push('evidence_document_required')
  if (rules.expiryRequired && !expiresAt) issues.push('evidence_expiry_date_required')
  if (effectiveAt && receivedAt && new Date(effectiveAt) > new Date(receivedAt)) warnings.push('evidence_effective_after_received')
  if (expiresAt && effectiveAt && new Date(expiresAt) <= new Date(effectiveAt)) issues.push('evidence_expiry_not_after_effective_date')
  if (expiresAt && receivedAt && new Date(expiresAt) <= new Date(receivedAt)) issues.push('evidence_expired_when_received')
  for (const field of unique(input.requiredFields)) {
    const value = normalizedFields(input.confirmedFields)[field]
    if (value === undefined || value === null || text(value) === '') issues.push(`evidence_required_field_missing:${field}`)
  }

  const qualityLevel = issues.length ? EVIDENCE_QUALITY_LEVELS.insufficient : warnings.length ? EVIDENCE_QUALITY_LEVELS.reviewable : EVIDENCE_QUALITY_LEVELS.complete
  return freeze({ complete: issues.length === 0, qualityLevel, issues: [...new Set(issues)], warnings: [...new Set(warnings)] })
}

export function buildEvidenceRegisterEntry(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || input)
  const actorResult = buildPracticeActor(input.actor || {})
  const policyResult = buildPracticePolicyBinding(input.policy || {})
  const type = key(input.canonicalEvidenceType)
  const receivedAt = iso(input.receivedAt)
  const sourceResult = buildPracticeEvidenceSource({
    ...(input.source || {}),
    canonicalEvidenceType: type,
    receivedAt,
    reviewState: 'captured',
  })
  const quality = evaluateEvidenceQuality({ ...input, canonicalEvidenceType: type, receivedAt })
  const errors = [...identityResult.errors, ...actorResult.errors, ...policyResult.errors, ...sourceResult.errors]
  if (!text(input.evidenceId)) errors.push('evidence_identity_required')
  if (sourceResult.source.mode === 'manual' && sourceResult.source.capturedBy !== actorResult.actor.userId) errors.push('evidence_manual_captor_mismatch')
  const captureCapability = sourceResult.source.mode === 'integration' ? C.recordIntegratedEvidence : C.captureEvidence
  if (!actorResult.ok || !evaluatePracticeOperationAuthority({ actor: actorResult.actor, identity: identityResult.identity, capability: captureCapability, asOf: receivedAt }).allowed) errors.push('evidence_capture_not_authorised')
  if (input.approvedFields || input.acceptedAt || input.acceptedBy) errors.push('evidence_capture_cannot_self_approve')

  const rules = qualityRules(type)
  const entry = {
    version: CONVEYANCER_MANUAL_EVIDENCE_VERSION,
    evidenceId: text(input.evidenceId),
    identity: identityResult.identity,
    policy: policyResult.binding,
    canonicalEvidenceType: type,
    state: S.captured,
    source: sourceResult.source,
    issuingOrganisation: text(input.issuingOrganisation),
    externalReference: text(input.externalReference),
    effectiveAt: iso(input.effectiveAt),
    receivedAt,
    expiresAt: iso(input.expiresAt),
    documentReference: text(input.documentReference),
    documentHash: text(input.documentHash),
    confirmedFields: normalizedFields(input.confirmedFields),
    requiredFields: unique(input.requiredFields),
    extractionProposal: input.extractionProposal ? {
      engine: text(input.extractionProposal.engine),
      engineVersion: text(input.extractionProposal.engineVersion),
      proposedFields: normalizedFields(input.extractionProposal.proposedFields),
      confidence: Number.isFinite(Number(input.extractionProposal.confidence)) ? Number(input.extractionProposal.confidence) : null,
      proposedAt: iso(input.extractionProposal.proposedAt),
      status: 'proposal_only',
    } : null,
    quality,
    capturedBy: actorResult.actor,
    reviewedBy: null,
    reviewReason: '',
    reviewedAt: null,
    predecessorEvidenceId: text(input.predecessorEvidenceId) || null,
    supersededByEvidenceId: null,
    withdrawnAt: null,
    expiredAt: null,
  }
  entry.fingerprint = fingerprint(entry)
  const classifications = unique(input.classifications?.length ? input.classifications : rules.classifications)
  const resourceResult = buildInformationResource({
    resourceId: entry.evidenceId,
    resourceType: 'matter_evidence',
    organisationId: entry.identity.organisationId,
    attorneyFirmId: entry.identity.attorneyFirmId,
    transactionId: entry.identity.transactionId,
    branchId: entry.identity.branchId,
    teamId: entry.identity.teamId,
    classifications,
    retentionClass: key(input.retentionClass) || 'matter_evidence',
    retainUntil: input.retainUntil,
    legalHold: input.legalHold === true,
    exportPolicy: key(input.exportPolicy) || 'watermarked',
  })
  if (!resourceResult.ok) errors.push(...resourceResult.errors)

  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], entry, informationResource: resourceResult.resource })
}

export function transitionEvidenceReview({ entry = {}, toState = '', reviewer = {}, reason = '', occurredAt = '', replacementEvidenceId = '' } = {}) {
  const target = key(toState)
  const at = iso(occurredAt)
  const actorResult = buildPracticeActor(reviewer)
  const identityResult = buildPracticeOperationIdentity(entry.identity || {})
  const authority = evaluatePracticeOperationAuthority({ actor: actorResult.actor, identity: identityResult.identity, capability: C.reviewEvidence, asOf: at })
  const errors = []
  if (entry.version !== CONVEYANCER_MANUAL_EVIDENCE_VERSION || !text(entry.evidenceId)) errors.push('evidence_entry_invalid')
  if (!STATE_TRANSITIONS[entry.state]?.includes(target)) errors.push('evidence_review_transition_invalid')
  if (!at || !text(reason)) errors.push('evidence_review_reason_and_date_required')
  if (!authority.allowed) errors.push('evidence_review_not_authorised')
  if (actorResult.actor.userId === entry.capturedBy?.userId) errors.push('evidence_independent_review_required')
  if (target === S.accepted && entry.quality?.complete !== true) errors.push('evidence_quality_incomplete')
  if (target === S.superseded && !text(replacementEvidenceId)) errors.push('evidence_replacement_required')
  if (target === S.expired && entry.expiresAt && at && new Date(at) < new Date(entry.expiresAt)) errors.push('evidence_not_yet_expired')

  const next = {
    ...entry,
    state: target,
    reviewedBy: actorResult.actor,
    reviewReason: text(reason),
    reviewedAt: at,
    supersededByEvidenceId: target === S.superseded ? text(replacementEvidenceId) : entry.supersededByEvidenceId,
    withdrawnAt: target === S.withdrawn ? at : entry.withdrawnAt,
    expiredAt: target === S.expired ? at : entry.expiredAt,
  }
  delete next.fingerprint
  next.fingerprint = fingerprint(next)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], entry: next })
}

export function buildEvidenceReplacement({ predecessor = {}, replacement = {} } = {}) {
  const result = buildEvidenceRegisterEntry({
    ...replacement,
    canonicalEvidenceType: replacement.canonicalEvidenceType || predecessor.canonicalEvidenceType,
    predecessorEvidenceId: predecessor.evidenceId,
  })
  const errors = [...result.errors]
  if (predecessor.version !== CONVEYANCER_MANUAL_EVIDENCE_VERSION || predecessor.state !== S.accepted) errors.push('evidence_accepted_predecessor_required')
  if (result.entry.identity.organisationId !== predecessor.identity?.organisationId || result.entry.identity.attorneyFirmId !== predecessor.identity?.attorneyFirmId || result.entry.identity.transactionId !== predecessor.identity?.transactionId) errors.push('evidence_replacement_binding_mismatch')
  if (result.entry.canonicalEvidenceType !== predecessor.canonicalEvidenceType) errors.push('evidence_replacement_type_mismatch')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], replacement: result.entry, informationResource: result.informationResource })
}

export function detectDuplicateEvidence(candidate = {}, existingEntries = []) {
  const matches = existingEntries.filter((entry) => entry.evidenceId !== candidate.evidenceId && !TERMINAL_STATES.has(entry.state)).map((entry) => {
    const reasons = []
    if (text(candidate.documentHash) && text(candidate.documentHash).toLowerCase() === text(entry.documentHash).toLowerCase()) reasons.push('same_document_hash')
    if (candidate.canonicalEvidenceType === entry.canonicalEvidenceType && key(candidate.issuingOrganisation) === key(entry.issuingOrganisation) && text(candidate.externalReference) && key(candidate.externalReference) === key(entry.externalReference)) reasons.push('same_issuer_external_reference')
    return reasons.length ? { evidenceId: entry.evidenceId, state: entry.state, reasons, fingerprint: entry.fingerprint } : null
  }).filter(Boolean)
  return freeze({ duplicate: matches.length > 0, matches, action: matches.length ? 'human_duplicate_review_required' : 'continue_capture' })
}

export function projectApprovedCanonicalEvidence(entry = {}) {
  const errors = []
  if (entry.version !== CONVEYANCER_MANUAL_EVIDENCE_VERSION || entry.state !== S.accepted || entry.quality?.complete !== true) errors.push('approved_complete_evidence_required')
  const evidence = {
    version: CONVEYANCER_MANUAL_EVIDENCE_VERSION,
    evidenceId: text(entry.evidenceId),
    organisationId: text(entry.identity?.organisationId),
    attorneyFirmId: text(entry.identity?.attorneyFirmId),
    transactionId: text(entry.identity?.transactionId),
    lane: key(entry.identity?.lane),
    canonicalEvidenceType: key(entry.canonicalEvidenceType),
    issuingOrganisation: text(entry.issuingOrganisation),
    externalReference: text(entry.externalReference),
    effectiveAt: iso(entry.effectiveAt),
    receivedAt: iso(entry.receivedAt),
    expiresAt: iso(entry.expiresAt),
    documentReference: text(entry.documentReference),
    documentHash: text(entry.documentHash),
    confirmedFields: normalizedFields(entry.confirmedFields),
    policy: entry.policy,
    acceptedBy: entry.reviewedBy?.userId || null,
    acceptedAt: iso(entry.reviewedAt),
  }
  evidence.equivalenceKey = fingerprint({
    organisationId: evidence.organisationId,
    attorneyFirmId: evidence.attorneyFirmId,
    transactionId: evidence.transactionId,
    lane: evidence.lane,
    canonicalEvidenceType: evidence.canonicalEvidenceType,
    issuingOrganisation: evidence.issuingOrganisation,
    externalReference: evidence.externalReference,
    effectiveAt: evidence.effectiveAt,
    expiresAt: evidence.expiresAt,
    documentHash: evidence.documentHash,
    confirmedFields: evidence.confirmedFields,
  })
  evidence.fingerprint = fingerprint(evidence)
  return freeze({ ok: errors.length === 0, errors, evidence })
}

export function buildAttorneyEvidenceReviewQueue({ entries = [], asOf = '', lane = '', canonicalEvidenceTypes = [] } = {}) {
  const at = iso(asOf) || new Date().toISOString()
  const typeFilter = unique(canonicalEvidenceTypes)
  const items = entries.filter((entry) => [S.captured, S.underReview].includes(entry.state))
    .filter((entry) => !lane || key(entry.identity?.lane) === key(lane))
    .filter((entry) => !typeFilter.length || typeFilter.includes(entry.canonicalEvidenceType))
    .map((entry) => {
      const expiresAt = iso(entry.expiresAt)
      const expired = Boolean(expiresAt && new Date(expiresAt) <= new Date(at))
      const priority = expired ? 0 : entry.quality?.complete !== true ? 1 : entry.state === S.underReview ? 2 : 3
      return {
        evidenceId: entry.evidenceId,
        transactionId: entry.identity?.transactionId,
        lane: entry.identity?.lane,
        canonicalEvidenceType: entry.canonicalEvidenceType,
        state: entry.state,
        sourceMode: entry.source?.mode,
        receivedAt: entry.receivedAt,
        expiresAt,
        expired,
        qualityLevel: entry.quality?.qualityLevel,
        issues: entry.quality?.issues || [],
        priority,
        nextAction: expired ? 'Mark expired and request replacement' : entry.quality?.complete !== true ? 'Correct missing evidence details' : 'Review evidence',
      }
    })
    .sort((left, right) => left.priority - right.priority || new Date(left.receivedAt) - new Date(right.receivedAt) || left.evidenceId.localeCompare(right.evidenceId))
  return freeze({ version: CONVEYANCER_MANUAL_EVIDENCE_VERSION, generatedAt: at, count: items.length, items })
}

export function buildEvidenceAuditEvent({ entry = {}, eventId = '', eventType = '', actorUserId = '', reason = '', occurredAt = '', detailReference = '', detailHash = '' } = {}) {
  return buildPracticeAuditEvent({
    eventId,
    eventType: eventType || `evidence_${entry.state}`,
    operationId: entry.evidenceId,
    organisationId: entry.identity?.organisationId,
    attorneyFirmId: entry.identity?.attorneyFirmId,
    transactionId: entry.identity?.transactionId,
    actorUserId,
    capability: [S.captured].includes(entry.state) ? C.captureEvidence : C.reviewEvidence,
    reason,
    occurredAt,
    correlationId: entry.evidenceId,
    causationId: entry.predecessorEvidenceId || '',
    detailReference,
    detailHash,
  })
}
