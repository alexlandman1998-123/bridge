import {
  buildPracticeActor,
  buildPracticeAuditEvent,
  buildPracticeOperationIdentity,
  buildPracticePolicyBinding,
  evaluatePracticeOperationAuthority,
  PRACTICE_OPERATION_CAPABILITIES,
} from './conveyancerPracticeOperationsContract.js'
import { buildInformationResource } from './conveyancerInformationGovernance.js'
import { CANONICAL_EVIDENCE_TYPES, CONVEYANCER_MANUAL_EVIDENCE_VERSION } from './conveyancerManualEvidenceRegister.js'
import { CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION } from './conveyancerClientRiskCompliance.js'
import { CONVEYANCER_FINANCIAL_MODEL_STATUSES, CONVEYANCER_FINANCIAL_MODEL_VERSION } from '../transactions/conveyancerFinancialModel.js'
import { CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES, CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION } from '../../services/attorneyWorkflow/conveyancerFinancialReconciliation.js'
import { CONVEYANCER_FINAL_ACCOUNT_STATUSES, CONVEYANCER_FINAL_ACCOUNT_VERSION } from '../../services/attorneyWorkflow/conveyancerFinalAccountWorkflow.js'

export const CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION = 'conveyancer_trust_money_controls_g5_v1'

export const TRUST_MOVEMENT_DIRECTIONS = Object.freeze({ receipt: 'receipt', payment: 'payment' })
export const TRUST_REQUISITION_STATES = Object.freeze({ held: 'held', pendingApproval: 'pending_approval', releaseRecommended: 'release_recommended', paid: 'paid', failed: 'failed', reversed: 'reversed', cancelled: 'cancelled' })
export const TRUST_RECONCILIATION_STATES = Object.freeze({ reviewRequired: 'review_required', pendingReview: 'pending_review', reconciled: 'reconciled', changesRequested: 'changes_requested' })
export const TRUST_EXCEPTION_TYPES = Object.freeze({ thirdPartyPayment: 'third_party_payment', unidentifiedReceipt: 'unidentified_receipt' })

export const TRUST_MONEY_SIDE_EFFECT_BOUNDARY = Object.freeze({
  paymentInitiated: false,
  bankCommandCreated: false,
  trustLedgerMutated: false,
  beneficiaryChanged: false,
  d5Mutated: false,
  d6Mutated: false,
  finalAccountMutated: false,
})

const C = PRACTICE_OPERATION_CAPABILITIES
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
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

function acceptedEvidence(item, type, identity, asOf = '') {
  const accepted = item?.version === CONVEYANCER_MANUAL_EVIDENCE_VERSION && item?.state === 'accepted' && item?.quality?.complete === true
  const sameMatter = text(item?.identity?.organisationId) === identity.organisationId && text(item?.identity?.attorneyFirmId) === identity.attorneyFirmId && text(item?.identity?.transactionId) === identity.transactionId
  const notExpired = !item?.expiresAt || !asOf || new Date(item.expiresAt) > new Date(asOf)
  return accepted && key(item.canonicalEvidenceType) === type && sameMatter && notExpired && HASH.test(text(item.documentHash))
}

function authorised(actor, identity, capability, asOf) {
  return evaluatePracticeOperationAuthority({ actor, identity, capability, asOf }).allowed
}

export function buildTrustControlPolicy(input = {}) {
  const policy = {
    version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION,
    policyId: text(input.policyId),
    policyVersion: text(input.policyVersion),
    organisationId: text(input.organisationId),
    attorneyFirmId: text(input.attorneyFirmId),
    effectiveAt: iso(input.effectiveAt),
    allowedCurrencies: unique(input.allowedCurrencies?.length ? input.allowedCurrencies : ['zar']),
    beneficiaryVerificationValidityDays: Math.max(1, Math.min(365, Number(input.beneficiaryVerificationValidityDays) || 90)),
    bankDetailChangeCoolingHours: Math.max(0, Math.min(168, Number(input.bankDetailChangeCoolingHours) || 24)),
    releaseRecommendationValidityHours: Math.max(1, Math.min(168, Number(input.releaseRecommendationValidityHours) || 24)),
    thirdPartyPaymentMode: key(input.thirdPartyPaymentMode) || 'exception_only',
    requireValidFfc: input.requireValidFfc !== false,
    requireApprovedClientRisk: input.requireApprovedClientRisk !== false,
    reason: text(input.reason),
  }
  policy.fingerprint = fingerprint(policy)
  const binding = buildPracticePolicyBinding({ policyId: policy.policyId, policyVersion: policy.policyVersion, policyFingerprint: policy.fingerprint, effectiveAt: policy.effectiveAt })
  const errors = [...binding.errors]
  if (!UUID.test(policy.organisationId) || !UUID.test(policy.attorneyFirmId) || !policy.reason || !['prohibited', 'exception_only'].includes(policy.thirdPartyPaymentMode)) errors.push('trust_control_policy_invalid')
  if (!policy.allowedCurrencies.length) errors.push('trust_control_currency_required')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], policy, binding: binding.binding })
}

export function buildTrustAuthorityProfile(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || input)
  const policyResult = buildTrustControlPolicy(input.policy || {})
  const practitionerResult = buildPracticeActor(input.practitioner || {})
  const at = iso(input.verifiedAt)
  const ffcValid = acceptedEvidence(input.ffcEvidence, CANONICAL_EVIDENCE_TYPES.fidelityFundCertificate, identityResult.identity, at)
  const accountValid = acceptedEvidence(input.trustAccountEvidence, CANONICAL_EVIDENCE_TYPES.trustAccountVerification, identityResult.identity, at)
  const errors = [...identityResult.errors, ...policyResult.errors, ...practitionerResult.errors]
  if (!text(input.profileId) || !at || !text(input.trustAccountReference) || !HASH.test(text(input.trustAccountHash))) errors.push('trust_authority_profile_invalid')
  if (!authorised(practitionerResult.actor, identityResult.identity, C.approveLegalInstrument, at)) errors.push('trust_responsible_practitioner_not_authorised')
  if (policyResult.policy.organisationId !== identityResult.identity.organisationId || policyResult.policy.attorneyFirmId !== identityResult.identity.attorneyFirmId) errors.push('trust_policy_binding_mismatch')
  if (policyResult.policy.requireValidFfc && !ffcValid) errors.push('trust_valid_ffc_required')
  if (!accountValid) errors.push('trust_account_verification_required')
  const profile = {
    version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION,
    profileId: text(input.profileId),
    identity: identityResult.identity,
    policy: policyResult.binding,
    practitioner: practitionerResult.actor,
    ffcEvidenceId: text(input.ffcEvidence?.evidenceId),
    ffcExpiresAt: iso(input.ffcEvidence?.expiresAt),
    trustAccountReference: text(input.trustAccountReference),
    trustAccountHash: text(input.trustAccountHash),
    trustAccountEvidenceId: text(input.trustAccountEvidence?.evidenceId),
    verifiedAt: at,
    active: errors.length === 0,
    controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY,
  }
  profile.fingerprint = fingerprint(profile)
  const resource = buildInformationResource({ resourceId: profile.profileId, resourceType: 'trust_authority_profile', organisationId: profile.identity.organisationId, attorneyFirmId: profile.identity.attorneyFirmId, transactionId: profile.identity.transactionId, branchId: profile.identity.branchId, teamId: profile.identity.teamId, classifications: ['financial', 'restricted'], retentionClass: 'trust_account_control', retainUntil: input.retainUntil, legalHold: input.legalHold === true, exportPolicy: 'prohibited' })
  if (!resource.ok) errors.push(...resource.errors)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], profile, informationResource: resource.resource })
}

function financialModelBinding(model = {}) {
  return { version: model.version, financialModelId: text(model.financialModelId), revision: Number(model.revision), fingerprint: text(model.fingerprint), status: key(model.status), organisationId: text(model.organisationId), transactionId: text(model.transactionId), lane: key(model.lane), currency: key(model.currency) }
}

export function buildMatterTrustAccountLink(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const actorResult = buildPracticeActor(input.verifiedBy || {})
  const model = financialModelBinding(input.financialModel)
  const at = iso(input.verifiedAt)
  const errors = [...identityResult.errors, ...actorResult.errors]
  if (!text(input.linkId) || input.authorityProfile?.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || input.authorityProfile?.active !== true || !HASH.test(text(input.accountReferenceHash)) || !text(input.ledgerReference) || !HASH.test(text(input.verificationHash)) || !at) errors.push('matter_trust_account_link_invalid')
  if (model.version !== CONVEYANCER_FINANCIAL_MODEL_VERSION || model.status !== CONVEYANCER_FINANCIAL_MODEL_STATUSES.ready || !model.financialModelId || !model.fingerprint) errors.push('approved_d5_financial_model_required')
  if (model.organisationId !== identityResult.identity.organisationId || model.transactionId !== identityResult.identity.transactionId || model.lane !== identityResult.identity.lane || model.currency !== 'zar') errors.push('matter_trust_account_financial_binding_mismatch')
  if (input.authorityProfile?.identity?.organisationId !== identityResult.identity.organisationId || input.authorityProfile?.identity?.attorneyFirmId !== identityResult.identity.attorneyFirmId || input.authorityProfile?.trustAccountHash !== text(input.accountReferenceHash)) errors.push('matter_trust_authority_binding_mismatch')
  if (!authorised(actorResult.actor, identityResult.identity, C.managePractice, at)) errors.push('matter_trust_account_link_not_authorised')
  const link = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, linkId: text(input.linkId), identity: identityResult.identity, authorityProfileId: text(input.authorityProfile?.profileId), authorityProfileFingerprint: text(input.authorityProfile?.fingerprint), financialModel: model, accountReferenceHash: text(input.accountReferenceHash), ledgerReference: text(input.ledgerReference), verificationReference: text(input.verificationReference), verificationHash: text(input.verificationHash), verifiedBy: actorResult.actor, verifiedAt: at, controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  link.fingerprint = fingerprint(link)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], link })
}

export function buildExpectedTrustMovement(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const actorResult = buildPracticeActor(input.preparedBy || {})
  const direction = key(input.direction)
  const amountMinor = Number(input.amountMinor)
  const at = iso(input.preparedAt)
  const errors = [...identityResult.errors, ...actorResult.errors]
  if (!text(input.movementId) || !Object.values(TRUST_MOVEMENT_DIRECTIONS).includes(direction) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || key(input.currency) !== 'zar' || !text(input.d5LineId) || !text(input.sourceReference) || !HASH.test(text(input.sourceHash)) || !iso(input.dueAt) || !text(input.purpose) || !at) errors.push('expected_trust_movement_invalid')
  if (direction === TRUST_MOVEMENT_DIRECTIONS.payment && (!text(input.beneficiaryPartyId) || !text(input.beneficiaryRole))) errors.push('expected_payment_beneficiary_required')
  if (!authorised(actorResult.actor, identityResult.identity, C.preparePayment, at)) errors.push('expected_trust_movement_not_authorised')
  const movement = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, movementId: text(input.movementId), identity: identityResult.identity, trustAccountLinkId: text(input.trustAccountLinkId), d5LineId: text(input.d5LineId), direction, amountMinor, currency: 'zar', beneficiaryPartyId: text(input.beneficiaryPartyId) || null, beneficiaryRole: key(input.beneficiaryRole) || null, payerPartyId: text(input.payerPartyId) || null, thirdParty: input.thirdParty === true, purpose: text(input.purpose), sourceReference: text(input.sourceReference), sourceHash: text(input.sourceHash), dueAt: iso(input.dueAt), preparedBy: actorResult.actor, preparedAt: at, controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  movement.fingerprint = fingerprint(movement)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], movement })
}

export function buildBeneficiaryVerification(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const preparedBy = buildPracticeActor(input.preparedBy || {})
  const reviewedBy = buildPracticeActor(input.reviewedBy || {})
  const at = iso(input.reviewedAt)
  const errors = [...identityResult.errors, ...preparedBy.errors, ...reviewedBy.errors]
  if (!text(input.verificationId) || !text(input.beneficiaryPartyId) || !text(input.accountReference) || !HASH.test(text(input.accountHash)) || !text(input.verificationMethod) || !iso(input.verifiedAt) || !at) errors.push('beneficiary_verification_invalid')
  if (!acceptedEvidence(input.evidence, CANONICAL_EVIDENCE_TYPES.beneficiaryVerification, identityResult.identity, at)) errors.push('accepted_beneficiary_evidence_required')
  if (!authorised(preparedBy.actor, identityResult.identity, C.preparePayment, input.verifiedAt)) errors.push('beneficiary_verification_preparer_not_authorised')
  if (!(authorised(reviewedBy.actor, identityResult.identity, C.reviewEvidence, at) || authorised(reviewedBy.actor, identityResult.identity, C.reviewCompliance, at)) || reviewedBy.actor.userId === preparedBy.actor.userId) errors.push('independent_beneficiary_review_required')
  const verification = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, verificationId: text(input.verificationId), identity: identityResult.identity, beneficiaryPartyId: text(input.beneficiaryPartyId), beneficiaryRole: key(input.beneficiaryRole), accountReference: text(input.accountReference), accountHash: text(input.accountHash), verificationMethod: key(input.verificationMethod), evidenceId: text(input.evidence?.evidenceId), verifiedAt: iso(input.verifiedAt), expiresAt: iso(input.expiresAt || input.evidence?.expiresAt), preparedBy: preparedBy.actor, reviewedBy: reviewedBy.actor, reviewedAt: at, reviewReason: text(input.reviewReason), state: errors.length ? 'invalid' : 'accepted', controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  if (!verification.reviewReason) errors.push('beneficiary_review_reason_required')
  verification.state = errors.length ? 'invalid' : 'accepted'
  verification.fingerprint = fingerprint(verification)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], verification })
}

export function evaluateBeneficiaryBankDetailChange(input = {}) {
  const previous = input.previousVerification || {}
  const current = input.currentVerification || {}
  const identity = current.identity || {}
  const approver = buildPracticeActor(input.approvedBy || {})
  const approvedAt = iso(input.approvedAt)
  const changedAt = iso(input.changedAt)
  const coolingHours = Number(input.policy?.bankDetailChangeCoolingHours || 24)
  const holdUntil = changedAt ? new Date(new Date(changedAt).getTime() + coolingHours * 3600000).toISOString() : null
  const errors = [...approver.errors]
  if (previous.state !== 'accepted' || current.state !== 'accepted' || previous.beneficiaryPartyId !== current.beneficiaryPartyId || previous.accountHash === current.accountHash || !changedAt || !approvedAt || !text(input.reason)) errors.push('beneficiary_bank_change_invalid')
  if (!acceptedEvidence(input.changeEvidence, CANONICAL_EVIDENCE_TYPES.bankDetailChangeVerification, identity, approvedAt)) errors.push('bank_detail_change_evidence_required')
  if (!(authorised(approver.actor, identity, C.managePractice, approvedAt) || authorised(approver.actor, identity, C.reviewEvidence, approvedAt)) || [previous.reviewedBy?.userId, current.preparedBy?.userId].includes(approver.actor.userId)) errors.push('independent_bank_change_approval_required')
  const coolingComplete = Boolean(holdUntil && new Date(approvedAt) >= new Date(holdUntil))
  if (!coolingComplete) errors.push('bank_detail_change_cooling_period_active')
  const decision = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, decisionId: text(input.decisionId), beneficiaryPartyId: current.beneficiaryPartyId, previousVerificationId: previous.verificationId, currentVerificationId: current.verificationId, changedAt, holdUntil, approvedAt, approvedBy: approver.actor, reason: text(input.reason), evidenceId: text(input.changeEvidence?.evidenceId), allowedForRecommendation: errors.length === 0, controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  if (!decision.decisionId) errors.push('bank_detail_change_decision_required')
  decision.allowedForRecommendation = errors.length === 0
  decision.fingerprint = fingerprint(decision)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], decision })
}

export function buildTrustPaymentExceptionDecision(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const compliance = buildPracticeActor(input.complianceApprover || {})
  const legal = buildPracticeActor(input.legalApprover || {})
  const at = iso(input.approvedAt)
  const type = key(input.type)
  const errors = [...identityResult.errors, ...compliance.errors, ...legal.errors]
  if (!text(input.decisionId) || !Object.values(TRUST_EXCEPTION_TYPES).includes(type) || !text(input.relatedRecordId) || !text(input.reason) || !text(input.evidenceReference) || !HASH.test(text(input.evidenceHash)) || !at) errors.push('trust_payment_exception_invalid')
  if (!authorised(compliance.actor, identityResult.identity, C.reviewCompliance, at) || !authorised(legal.actor, identityResult.identity, C.legalReview, at) || compliance.actor.userId === legal.actor.userId) errors.push('trust_payment_exception_dual_approval_required')
  const decision = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, decisionId: text(input.decisionId), identity: identityResult.identity, type, relatedRecordId: text(input.relatedRecordId), reason: text(input.reason), evidenceReference: text(input.evidenceReference), evidenceHash: text(input.evidenceHash), complianceApprover: compliance.actor, legalApprover: legal.actor, approvedAt: at, state: errors.length ? 'invalid' : 'approved', controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  decision.fingerprint = fingerprint(decision)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], decision })
}

function complianceApproved(value, identity) {
  return value?.version === CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION && value?.state === 'approved' && value?.mayProceed === true && text(value?.identity?.transactionId) === identity.transactionId && text(value?.identity?.attorneyFirmId) === identity.attorneyFirmId
}

export function buildTrustPaymentRequisition(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const requester = buildPracticeActor(input.requestedBy || {})
  const policyResult = buildTrustControlPolicy(input.policy || {})
  const at = iso(input.requestedAt)
  const movement = input.expectedMovement || {}
  const beneficiary = input.beneficiaryVerification || {}
  const amountMinor = Number(input.amountMinor)
  const blockers = []
  const errors = [...identityResult.errors, ...requester.errors, ...policyResult.errors]
  if (!text(input.requisitionId) || movement.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || movement.direction !== 'payment' || movement.identity?.transactionId !== identityResult.identity.transactionId || !Number.isSafeInteger(amountMinor) || amountMinor !== movement.amountMinor || key(input.currency) !== 'zar' || !text(input.purpose) || !at) errors.push('trust_payment_requisition_invalid')
  if (input.trustAccountLink?.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || input.trustAccountLink?.identity?.transactionId !== identityResult.identity.transactionId) blockers.push('matter_trust_account_link_required')
  if (input.authorityProfile?.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || input.authorityProfile?.active !== true || (input.authorityProfile.ffcExpiresAt && new Date(input.authorityProfile.ffcExpiresAt) <= new Date(at))) blockers.push('active_trust_authority_required')
  if (beneficiary.state !== 'accepted' || beneficiary.beneficiaryPartyId !== movement.beneficiaryPartyId || (beneficiary.expiresAt && new Date(beneficiary.expiresAt) <= new Date(at))) blockers.push('current_beneficiary_verification_required')
  if (input.bankDetailChange && input.bankDetailChange.allowedForRecommendation !== true) blockers.push('bank_detail_change_hold_active')
  if (policyResult.policy.requireApprovedClientRisk && !complianceApproved(input.clientRiskAssessment, identityResult.identity)) blockers.push('approved_client_risk_required')
  const supportingEvidence = input.supportingEvidence || []
  if (!supportingEvidence.length || supportingEvidence.some((item) => !acceptedEvidence(item, CANONICAL_EVIDENCE_TYPES.paymentSupportingDocument, identityResult.identity, at))) blockers.push('accepted_payment_support_required')
  if (movement.thirdParty) {
    if (policyResult.policy.thirdPartyPaymentMode === 'prohibited') blockers.push('third_party_payment_prohibited')
    else if (input.thirdPartyException?.state !== 'approved' || input.thirdPartyException?.type !== TRUST_EXCEPTION_TYPES.thirdPartyPayment || input.thirdPartyException?.relatedRecordId !== movement.movementId) blockers.push('third_party_payment_exception_required')
  }
  if (!authorised(requester.actor, identityResult.identity, C.preparePayment, at)) errors.push('trust_payment_request_not_authorised')
  const requisition = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, requisitionId: text(input.requisitionId), identity: identityResult.identity, policy: policyResult.binding, authorityProfileId: text(input.authorityProfile?.profileId), trustAccountLinkId: text(input.trustAccountLink?.linkId), expectedMovementId: movement.movementId, expectedMovementFingerprint: movement.fingerprint, beneficiaryVerificationId: beneficiary.verificationId, beneficiaryAccountHash: beneficiary.accountHash, clientRiskAssessmentId: text(input.clientRiskAssessment?.assessmentId), amountMinor, currency: 'zar', purpose: text(input.purpose), supportingEvidenceIds: supportingEvidence.map((item) => item.evidenceId).sort(), requestedBy: requester.actor, requestedAt: at, blockers: [...new Set(blockers)], state: blockers.length ? TRUST_REQUISITION_STATES.held : TRUST_REQUISITION_STATES.pendingApproval, approvals: [], releaseRecommendation: null, controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  requisition.fingerprint = fingerprint(requisition)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], requisition })
}

export function approveTrustPaymentRequisition({ requisition = {}, approvals = [], policy = {}, approvedAt = '' } = {}) {
  const at = iso(approvedAt)
  const identity = requisition.identity || {}
  const policyResult = buildTrustControlPolicy(policy)
  const normalized = approvals.map((approval) => ({ actor: buildPracticeActor(approval.actor || {}).actor, role: key(approval.actor?.role), reason: text(approval.reason), approvalReference: text(approval.approvalReference), approvalHash: text(approval.approvalHash), approvedAt: iso(approval.approvedAt) }))
  const errors = []
  if (!policyResult.ok || policyResult.binding.policyFingerprint !== requisition.policy?.policyFingerprint || policyResult.binding.policyVersion !== requisition.policy?.policyVersion) errors.push('trust_payment_policy_binding_mismatch')
  if (requisition.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || requisition.state !== TRUST_REQUISITION_STATES.pendingApproval || requisition.blockers?.length || !at) errors.push('trust_payment_requisition_not_approvable')
  if (normalized.length < 2 || new Set(normalized.map((approval) => approval.actor.userId)).size !== normalized.length || normalized.some((approval) => approval.actor.userId === requisition.requestedBy?.userId || !approval.reason || !approval.approvalReference || !HASH.test(approval.approvalHash) || !approval.approvedAt)) errors.push('trust_payment_segregation_of_duties_invalid')
  if (normalized.some((approval) => new Date(approval.approvedAt) < new Date(requisition.requestedAt) || new Date(approval.approvedAt) > new Date(at))) errors.push('trust_payment_approval_chronology_invalid')
  const accountsApproval = normalized.some((approval) => approval.role === 'accounts' && authorised(approval.actor, identity, C.approveTrustPayment, approval.approvedAt))
  const legalApproval = normalized.some((approval) => ['responsible_attorney', 'supervising_attorney'].includes(approval.role) && authorised(approval.actor, identity, C.legalReview, approval.approvedAt))
  if (!accountsApproval || !legalApproval) errors.push('trust_payment_dual_approval_required')
  const validityHours = policyResult.policy.releaseRecommendationValidityHours
  const next = { ...requisition, state: errors.length ? requisition.state : TRUST_REQUISITION_STATES.releaseRecommended, approvals: normalized, releaseRecommendation: errors.length ? null : { recommendationId: `release:${requisition.requisitionId}`, recommendedAt: at, expiresAt: new Date(new Date(at).getTime() + validityHours * 3600000).toISOString(), amountMinor: requisition.amountMinor, beneficiaryAccountHash: requisition.beneficiaryAccountHash, paymentInitiated: false, bankCommandCreated: false } }
  delete next.fingerprint
  next.fingerprint = fingerprint(next)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], requisition: next })
}

export function recordTrustPaymentOutcome({ requisition = {}, outcome = '', evidence = {}, recordedBy = {}, occurredAt = '', reason = '', previousOutcome = null } = {}) {
  const type = key(outcome)
  const actorResult = buildPracticeActor(recordedBy)
  const at = iso(occurredAt)
  const evidenceType = type === 'paid' ? CANONICAL_EVIDENCE_TYPES.proofOfPayment : type === 'failed' ? CANONICAL_EVIDENCE_TYPES.paymentFailure : CANONICAL_EVIDENCE_TYPES.paymentReversal
  const errors = [...actorResult.errors]
  if (!['paid', 'failed', 'reversed'].includes(type) || requisition.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || requisition.state !== TRUST_REQUISITION_STATES.releaseRecommended || !at || !text(reason)) errors.push('trust_payment_outcome_invalid')
  if (!acceptedEvidence(evidence, evidenceType, requisition.identity || {}, at)) errors.push('trust_payment_outcome_evidence_required')
  if (!authorised(actorResult.actor, requisition.identity || {}, C.reconcileTrust, at)) errors.push('trust_payment_outcome_not_authorised')
  if (type === 'reversed' && previousOutcome?.state !== TRUST_REQUISITION_STATES.paid) errors.push('paid_outcome_required_for_reversal')
  const result = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, outcomeId: `outcome:${requisition.requisitionId}:${type}`, requisitionId: requisition.requisitionId, identity: requisition.identity, state: type, amountMinor: requisition.amountMinor, beneficiaryAccountHash: requisition.beneficiaryAccountHash, evidenceId: evidence.evidenceId, evidenceHash: evidence.documentHash, occurredAt: at, recordedBy: actorResult.actor, reason: text(reason), previousOutcomeId: text(previousOutcome?.outcomeId) || null, controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  result.fingerprint = fingerprint(result)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], outcome: result })
}

export function buildTrustMoneyReconciliation(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const preparer = buildPracticeActor(input.preparedBy || {})
  const at = iso(input.preparedAt)
  const expected = input.expectedMovements || []
  const entries = input.ledgerEntries || []
  const outcomes = input.paymentOutcomes || []
  const exceptions = input.exceptionDecisions || []
  const link = input.trustAccountLink || {}
  const findings = []
  const errors = [...identityResult.errors, ...preparer.errors]
  if (!text(input.reconciliationId) || !Number.isSafeInteger(Number(input.openingBalanceMinor)) || !Number.isSafeInteger(Number(input.closingBalanceMinor)) || !text(input.ledgerSnapshotReference) || !HASH.test(text(input.ledgerSnapshotHash)) || !at) errors.push('trust_reconciliation_invalid')
  if (link.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || link.identity?.transactionId !== identityResult.identity.transactionId || link.linkId !== text(input.trustAccountLinkId)) errors.push('trust_reconciliation_account_link_invalid')
  if (!acceptedEvidence(input.ledgerEvidence, CANONICAL_EVIDENCE_TYPES.trustLedgerSnapshot, identityResult.identity, at) || input.ledgerEvidence?.documentHash !== text(input.ledgerSnapshotHash)) errors.push('accepted_trust_ledger_evidence_required')
  if (!authorised(preparer.actor, identityResult.identity, C.reconcileTrust, at)) errors.push('trust_reconciliation_not_authorised')
  if (new Set(expected.map((item) => item.movementId)).size !== expected.length || new Set(entries.map((item) => text(item.entryId))).size !== entries.length) errors.push('trust_reconciliation_duplicate_identity')
  if (entries.some((entry) => text(entry.accountReferenceHash) !== link.accountReferenceHash)) errors.push('trust_reconciliation_account_binding_mismatch')
  const matches = expected.map((movement) => {
    const entry = entries.find((item) => text(item.movementId) === movement.movementId)
    const expectedDirection = movement.direction === 'receipt' ? 'inflow' : 'outflow'
    const outcome = outcomes.find((item) => item.requisitionId && item.requisitionId === text(entry?.requisitionId))
    const matched = Boolean(entry && movement.version === CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION && movement.identity?.transactionId === identityResult.identity.transactionId && movement.trustAccountLinkId === link.linkId && key(entry.direction) === expectedDirection && Number(entry.amountMinor) === movement.amountMinor && HASH.test(text(entry.evidenceHash)))
    if (!matched) findings.push(`trust_movement_unmatched:${movement.movementId}`)
    if (movement.direction === 'payment' && (!outcome || outcome.state !== 'paid' || outcome.amountMinor !== movement.amountMinor || outcome.identity?.transactionId !== identityResult.identity.transactionId)) findings.push(`trust_payment_outcome_unconfirmed:${movement.movementId}`)
    if (outcome && ['failed', 'reversed'].includes(outcome.state)) findings.push(`trust_payment_${outcome.state}:${movement.movementId}`)
    if (movement.thirdParty && !exceptions.some((decision) => decision.state === 'approved' && decision.type === TRUST_EXCEPTION_TYPES.thirdPartyPayment && decision.relatedRecordId === movement.movementId)) findings.push(`third_party_payment_unapproved:${movement.movementId}`)
    return { movementId: movement.movementId, entryId: text(entry?.entryId) || null, matched, amountMinor: movement.amountMinor, direction: movement.direction, outcomeId: outcome?.outcomeId || null }
  })
  const unidentifiedEntries = entries.filter((entry) => !expected.some((movement) => movement.movementId === text(entry.movementId))).map((entry) => text(entry.entryId))
  for (const entryId of unidentifiedEntries) if (!exceptions.some((decision) => decision.state === 'approved' && decision.type === TRUST_EXCEPTION_TYPES.unidentifiedReceipt && decision.relatedRecordId === entryId)) findings.push(`unidentified_trust_entry:${entryId}`)
  const inflows = entries.filter((entry) => key(entry.direction) === 'inflow').reduce((sum, entry) => sum + Number(entry.amountMinor || 0), 0)
  const outflows = entries.filter((entry) => key(entry.direction) === 'outflow').reduce((sum, entry) => sum + Number(entry.amountMinor || 0), 0)
  if (Number(input.openingBalanceMinor) + inflows - outflows !== Number(input.closingBalanceMinor)) findings.push('trust_ledger_arithmetic_mismatch')
  const reconciliation = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, reconciliationId: text(input.reconciliationId), identity: identityResult.identity, trustAccountLinkId: text(input.trustAccountLinkId), ledgerSnapshotReference: text(input.ledgerSnapshotReference), ledgerSnapshotHash: text(input.ledgerSnapshotHash), openingBalanceMinor: Number(input.openingBalanceMinor), closingBalanceMinor: Number(input.closingBalanceMinor), matches, unidentifiedEntries, findings: [...new Set(findings)].sort(), state: findings.length ? TRUST_RECONCILIATION_STATES.reviewRequired : TRUST_RECONCILIATION_STATES.pendingReview, preparedBy: preparer.actor, preparedAt: at, reviewedBy: null, reviewedAt: null, reviewReason: '', controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  reconciliation.fingerprint = fingerprint(reconciliation)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], reconciliation })
}

export function reviewTrustMoneyReconciliation({ reconciliation = {}, reviewer = {}, decision = '', reason = '', reviewedAt = '' } = {}) {
  const actorResult = buildPracticeActor(reviewer)
  const at = iso(reviewedAt)
  const target = key(decision)
  const errors = [...actorResult.errors]
  if (reconciliation.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || ![TRUST_RECONCILIATION_STATES.pendingReview, TRUST_RECONCILIATION_STATES.reviewRequired].includes(reconciliation.state) || !['reconciled', 'changes_requested'].includes(target) || !at || !text(reason)) errors.push('trust_reconciliation_review_invalid')
  if (!authorised(actorResult.actor, reconciliation.identity || {}, C.legalReview, at) || actorResult.actor.userId === reconciliation.preparedBy?.userId) errors.push('independent_trust_reconciliation_review_required')
  if (target === 'reconciled' && reconciliation.findings?.length) errors.push('trust_reconciliation_findings_open')
  const next = { ...reconciliation, state: errors.length ? reconciliation.state : target, reviewedBy: actorResult.actor, reviewedAt: at, reviewReason: text(reason) }
  delete next.fingerprint
  next.fingerprint = fingerprint(next)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], reconciliation: next })
}

export function buildTrustFinalAccountReconciliation(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const reviewer = buildPracticeActor(input.reviewedBy || {})
  const at = iso(input.reviewedAt)
  const trust = input.trustReconciliation || {}
  const d6 = input.financialReconciliation || {}
  const finalAccount = input.finalAccount || {}
  const errors = [...identityResult.errors, ...reviewer.errors]
  if (!text(input.reconciliationId) || trust.version !== CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION || trust.state !== TRUST_RECONCILIATION_STATES.reconciled || d6.version !== CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION || d6.status !== CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES.reconciled || finalAccount.version !== CONVEYANCER_FINAL_ACCOUNT_VERSION || finalAccount.status !== CONVEYANCER_FINAL_ACCOUNT_STATUSES.approved || !at) errors.push('trust_final_account_binding_invalid')
  if (text(trust.identity?.transactionId) !== identityResult.identity.transactionId || text(d6.financialModel?.transactionId) !== identityResult.identity.transactionId || text(finalAccount.financialModel?.transactionId) !== identityResult.identity.transactionId) errors.push('trust_final_account_matter_mismatch')
  const trustBalance = Number(input.trustClosingBalanceMinor)
  const finalBalance = Number(input.finalAccountClosingBalanceMinor)
  const outstanding = unique(input.outstandingRecordIds)
  if (!Number.isSafeInteger(trustBalance) || !Number.isSafeInteger(finalBalance) || trustBalance !== 0 || finalBalance !== 0 || outstanding.length) errors.push('trust_final_account_not_zero')
  if (!authorised(reviewer.actor, identityResult.identity, C.legalReview, at) || reviewer.actor.userId === trust.preparedBy?.userId) errors.push('trust_final_account_review_not_authorised')
  const result = { version: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, reconciliationId: text(input.reconciliationId), identity: identityResult.identity, trustReconciliationId: trust.reconciliationId, trustReconciliationFingerprint: trust.fingerprint, financialReconciliationId: text(d6.reconciliationId), financialReconciliationFingerprint: text(d6.fingerprint), finalAccountId: text(finalAccount.finalAccountId), finalAccountFingerprint: text(finalAccount.fingerprint), trustClosingBalanceMinor: trustBalance, finalAccountClosingBalanceMinor: finalBalance, outstandingRecordIds: outstanding, reviewedBy: reviewer.actor, reviewedAt: at, readyForCloseout: errors.length === 0, controls: TRUST_MONEY_SIDE_EFFECT_BOUNDARY }
  result.fingerprint = fingerprint(result)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], reconciliation: result })
}

export function buildTrustMoneyAuditEvent({ record = {}, eventId = '', eventType = '', actorUserId = '', reason = '', occurredAt = '', detailReference = '', detailHash = '' } = {}) {
  return buildPracticeAuditEvent({ eventId, eventType, operationId: record.requisitionId || record.reconciliationId || record.profileId || record.linkId, organisationId: record.identity?.organisationId, attorneyFirmId: record.identity?.attorneyFirmId, transactionId: record.identity?.transactionId, actorUserId, capability: C.reconcileTrust, reason, occurredAt, correlationId: record.requisitionId || record.reconciliationId, detailReference, detailHash })
}
