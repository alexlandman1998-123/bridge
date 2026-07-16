import assert from 'node:assert/strict'
import {
  approveTrustPaymentRequisition,
  buildBeneficiaryVerification,
  buildExpectedTrustMovement,
  buildMatterTrustAccountLink,
  buildTrustAuthorityProfile,
  buildTrustControlPolicy,
  buildTrustFinalAccountReconciliation,
  buildTrustMoneyAuditEvent,
  buildTrustMoneyReconciliation,
  buildTrustPaymentExceptionDecision,
  buildTrustPaymentRequisition,
  evaluateBeneficiaryBankDetailChange,
  recordTrustPaymentOutcome,
  reviewTrustMoneyReconciliation,
  TRUST_MONEY_SIDE_EFFECT_BOUNDARY,
} from '../conveyancerTrustMoneyControls.js'
import { CANONICAL_EVIDENCE_TYPES, CONVEYANCER_MANUAL_EVIDENCE_VERSION } from '../conveyancerManualEvidenceRegister.js'
import { CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION } from '../conveyancerClientRiskCompliance.js'
import { CONVEYANCER_FINANCIAL_MODEL_VERSION } from '../../transactions/conveyancerFinancialModel.js'
import { CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION } from '../../../services/attorneyWorkflow/conveyancerFinancialReconciliation.js'
import { CONVEYANCER_FINAL_ACCOUNT_VERSION } from '../../../services/attorneyWorkflow/conveyancerFinalAccountWorkflow.js'

const org = '10000000-0000-4000-8000-000000000001'
const firm = '20000000-0000-4000-8000-000000000001'
const branch = '30000000-0000-4000-8000-000000000001'
const team = '40000000-0000-4000-8000-000000000001'
const matter = '50000000-0000-4000-8000-000000000001'
const attorney = '60000000-0000-4000-8000-000000000001'
const compliance = '70000000-0000-4000-8000-000000000001'
const manager = '80000000-0000-4000-8000-000000000001'
const accounts1 = '90000000-0000-4000-8000-000000000001'
const accounts2 = 'a0000000-0000-4000-8000-000000000001'
const beneficiary = 'party:g5:seller'
const at = '2026-07-16T12:00:00.000Z'
const hashA = `sha256:${'a'.repeat(64)}`
const hashB = `sha256:${'b'.repeat(64)}`
const hashC = `sha256:${'c'.repeat(64)}`

function identity(operationId = 'operation:g5:1') {
  return { organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team, transactionId: matter, operationId, lane: 'transfer' }
}

function actor(role, userId) {
  return { userId, membershipId: `membership:${userId}`, role, organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team }
}

function evidence(type, overrides = {}) {
  const id = overrides.evidenceId || `evidence:g5:${type}`
  return {
    version: CONVEYANCER_MANUAL_EVIDENCE_VERSION,
    evidenceId: id,
    identity: identity(id),
    canonicalEvidenceType: type,
    state: 'accepted',
    quality: { complete: true },
    documentReference: `document://${id}`,
    documentHash: overrides.documentHash || hashA,
    externalReference: `external:${id}`,
    confirmedFields: { party_id: beneficiary },
    receivedAt: '2026-07-15T00:00:00Z',
    expiresAt: overrides.expiresAt === undefined ? '2027-07-16T00:00:00Z' : overrides.expiresAt,
    reviewedBy: actor('compliance', compliance),
    reviewedAt: '2026-07-15T12:00:00Z',
    ...overrides,
  }
}

function policy(overrides = {}) {
  return buildTrustControlPolicy({ policyId: 'trust-policy:g5:1', policyVersion: '1.0.0', organisationId: org, attorneyFirmId: firm, effectiveAt: '2026-07-01T00:00:00Z', allowedCurrencies: ['zar'], beneficiaryVerificationValidityDays: 90, bankDetailChangeCoolingHours: 24, releaseRecommendationValidityHours: 24, thirdPartyPaymentMode: 'exception_only', requireValidFfc: true, requireApprovedClientRisk: true, reason: 'Firm trust-money control policy.', ...overrides })
}

function financialModel() {
  return { version: CONVEYANCER_FINANCIAL_MODEL_VERSION, financialModelId: 'financial-model:g5:1', revision: 1, fingerprint: 'fnv1a_1234abcd', status: 'ready', organisationId: org, transactionId: matter, lane: 'transfer', currency: 'ZAR' }
}

function authority(overrides = {}) {
  return buildTrustAuthorityProfile({ profileId: 'trust-authority:g5:1', identity: identity('trust-authority:g5:1'), policy: policy().policy, practitioner: actor('responsible_attorney', attorney), ffcEvidence: evidence(CANONICAL_EVIDENCE_TYPES.fidelityFundCertificate), trustAccountReference: 'vault://trust/account/1', trustAccountHash: hashB, trustAccountEvidence: evidence(CANONICAL_EVIDENCE_TYPES.trustAccountVerification), verifiedAt: at, retainUntil: '2032-07-16T00:00:00Z', ...overrides })
}

function link(authorityProfile = authority().profile) {
  return buildMatterTrustAccountLink({ linkId: 'trust-link:g5:1', identity: identity('trust-link:g5:1'), authorityProfile, financialModel: financialModel(), accountReferenceHash: hashB, ledgerReference: 'ledger://matter/g5/1', verificationReference: 'verification://trust-link/g5/1', verificationHash: hashC, verifiedBy: actor('firm_manager', manager), verifiedAt: at })
}

function movement(overrides = {}) {
  return buildExpectedTrustMovement({ movementId: 'movement:g5:payment:1', identity: identity('movement:g5:payment:1'), trustAccountLinkId: 'trust-link:g5:1', d5LineId: 'd5-line:seller-proceeds', direction: 'payment', amountMinor: 100000, currency: 'zar', beneficiaryPartyId: beneficiary, beneficiaryRole: 'seller', thirdParty: false, purpose: 'Pay approved seller proceeds.', sourceReference: 'd5://line/seller-proceeds', sourceHash: hashA, dueAt: '2026-07-20T00:00:00Z', preparedBy: actor('accounts', accounts1), preparedAt: at, ...overrides })
}

function beneficiaryVerification(overrides = {}) {
  return buildBeneficiaryVerification({ verificationId: 'beneficiary:g5:1', identity: identity('beneficiary:g5:1'), beneficiaryPartyId: beneficiary, beneficiaryRole: 'seller', accountReference: 'vault://beneficiary/account/1', accountHash: hashC, verificationMethod: 'independent_bank_confirmation', evidence: evidence(CANONICAL_EVIDENCE_TYPES.beneficiaryVerification), verifiedAt: '2026-07-16T10:00:00Z', expiresAt: '2026-10-16T00:00:00Z', preparedBy: actor('accounts', accounts1), reviewedBy: actor('compliance', compliance), reviewedAt: at, reviewReason: 'Beneficiary and account independently verified.', ...overrides })
}

function clientRisk() {
  return { version: CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION, assessmentId: 'assessment:g5:1', identity: identity('assessment:g5:1'), state: 'approved', mayProceed: true }
}

function requisition(overrides = {}) {
  const profile = authority().profile
  const accountLink = link(profile).link
  const expected = movement().movement
  const verified = beneficiaryVerification().verification
  return buildTrustPaymentRequisition({ requisitionId: 'requisition:g5:1', identity: identity('requisition:g5:1'), policy: policy().policy, authorityProfile: profile, trustAccountLink: accountLink, expectedMovement: expected, beneficiaryVerification: verified, clientRiskAssessment: clientRisk(), amountMinor: expected.amountMinor, currency: 'zar', purpose: expected.purpose, supportingEvidence: [evidence(CANONICAL_EVIDENCE_TYPES.paymentSupportingDocument)], requestedBy: actor('accounts', accounts1), requestedAt: at, ...overrides })
}

function approvedRequisition(overrides = {}) {
  const pending = requisition(overrides)
  assert.equal(pending.ok, true, JSON.stringify(pending.errors))
  assert.equal(pending.requisition.state, 'pending_approval', JSON.stringify(pending.requisition.blockers))
  const approved = approveTrustPaymentRequisition({ requisition: pending.requisition, policy: policy().policy, approvedAt: '2026-07-16T14:00:00Z', approvals: [
    { actor: actor('accounts', accounts2), reason: 'Accounts control approved.', approvalReference: 'approval://accounts/g5/1', approvalHash: hashA, approvedAt: '2026-07-16T13:00:00Z' },
    { actor: actor('responsible_attorney', attorney), reason: 'Legal payment purpose approved.', approvalReference: 'approval://legal/g5/1', approvalHash: hashB, approvedAt: '2026-07-16T13:30:00Z' },
  ] })
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  return approved.requisition
}

function paidOutcome(requisitionValue = approvedRequisition()) {
  return recordTrustPaymentOutcome({ requisition: requisitionValue, outcome: 'paid', evidence: evidence(CANONICAL_EVIDENCE_TYPES.proofOfPayment, { expiresAt: null }), recordedBy: actor('accounts', accounts2), occurredAt: '2026-07-16T15:00:00Z', reason: 'External proof of payment received and captured.' })
}

function test(name, fn) {
  try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error }
}

test('binds a versioned firm trust-control policy with a permanent no-payment boundary', () => {
  const result = policy()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.policy.thirdPartyPaymentMode, 'exception_only')
  assert.equal(TRUST_MONEY_SIDE_EFFECT_BOUNDARY.paymentInitiated, false)
  assert.equal(TRUST_MONEY_SIDE_EFFECT_BOUNDARY.bankCommandCreated, false)
})

test('requires valid practitioner FFC and verified trust-account evidence', () => {
  const result = authority()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.profile.active, true)
  assert.equal(result.informationResource.exportPolicy, 'prohibited')
  const expired = authority({ ffcEvidence: evidence(CANONICAL_EVIDENCE_TYPES.fidelityFundCertificate, { expiresAt: '2026-07-01T00:00:00Z' }) })
  assert.ok(expired.errors.includes('trust_valid_ffc_required'))
})

test('links the exact approved D5 matter to the verified trust account', () => {
  const result = link()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.link.financialModel.financialModelId, 'financial-model:g5:1')
  assert.equal(result.link.accountReferenceHash, hashB)
})

test('creates exact expected receipts and payments without executing them', () => {
  const payment = movement()
  assert.equal(payment.ok, true, JSON.stringify(payment.errors))
  assert.equal(payment.movement.direction, 'payment')
  assert.equal(payment.movement.amountMinor, 100000)
  assert.equal(payment.movement.controls.paymentInitiated, false)
  const receipt = movement({ movementId: 'movement:g5:receipt:1', direction: 'receipt', beneficiaryPartyId: '', beneficiaryRole: '', payerPartyId: 'party:g5:buyer', purpose: 'Receive purchaser deposit.' })
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors))
})

test('requires independent beneficiary verification with accepted G3 evidence', () => {
  const result = beneficiaryVerification()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.verification.state, 'accepted')
  const self = beneficiaryVerification({ reviewedBy: actor('accounts', accounts1) })
  assert.ok(self.errors.includes('independent_beneficiary_review_required'))
})

test('holds changed bank details until evidence, independent approval and cooling complete', () => {
  const previous = beneficiaryVerification().verification
  const current = beneficiaryVerification({ verificationId: 'beneficiary:g5:2', accountReference: 'vault://beneficiary/account/2', accountHash: hashA }).verification
  const common = { decisionId: 'bank-change:g5:1', previousVerification: previous, currentVerification: current, policy: policy().policy, changedAt: '2026-07-16T12:00:00Z', approvedBy: actor('firm_manager', manager), reason: 'Client provided changed banking details.', changeEvidence: evidence(CANONICAL_EVIDENCE_TYPES.bankDetailChangeVerification) }
  const early = evaluateBeneficiaryBankDetailChange({ ...common, approvedAt: '2026-07-16T20:00:00Z' })
  assert.ok(early.errors.includes('bank_detail_change_cooling_period_active'))
  const complete = evaluateBeneficiaryBankDetailChange({ ...common, approvedAt: '2026-07-17T13:00:00Z' })
  assert.equal(complete.ok, true, JSON.stringify(complete.errors))
  assert.equal(complete.decision.allowedForRecommendation, true)
})

test('holds requisitions with missing support, compliance or beneficiary controls', () => {
  const missing = requisition({ supportingEvidence: [], clientRiskAssessment: null })
  assert.equal(missing.ok, true)
  assert.equal(missing.requisition.state, 'held')
  assert.ok(missing.requisition.blockers.includes('accepted_payment_support_required'))
  assert.ok(missing.requisition.blockers.includes('approved_client_risk_required'))
})

test('requires approved exceptions for third-party payments', () => {
  const thirdPartyMovement = movement({ thirdParty: true }).movement
  const held = requisition({ expectedMovement: thirdPartyMovement })
  assert.ok(held.requisition.blockers.includes('third_party_payment_exception_required'))
  const exception = buildTrustPaymentExceptionDecision({ decisionId: 'exception:g5:third-party', identity: identity('exception:g5:third-party'), type: 'third_party_payment', relatedRecordId: thirdPartyMovement.movementId, reason: 'Documented third-party funding relationship.', evidenceReference: 'evidence://third-party/g5', evidenceHash: hashA, complianceApprover: actor('compliance', compliance), legalApprover: actor('responsible_attorney', attorney), approvedAt: at })
  assert.equal(exception.ok, true, JSON.stringify(exception.errors))
  const ready = requisition({ expectedMovement: thirdPartyMovement, thirdPartyException: exception.decision })
  assert.equal(ready.requisition.state, 'pending_approval', JSON.stringify(ready.requisition.blockers))
})

test('requires accounts and legal approval separated from the requester', () => {
  const pending = requisition().requisition
  const invalid = approveTrustPaymentRequisition({ requisition: pending, policy: policy().policy, approvedAt: '2026-07-16T14:00:00Z', approvals: [{ actor: actor('accounts', accounts1), reason: 'Self approval.', approvalReference: 'approval://self', approvalHash: hashA, approvedAt: at }] })
  assert.ok(invalid.errors.includes('trust_payment_segregation_of_duties_invalid'))
  assert.ok(invalid.errors.includes('trust_payment_dual_approval_required'))
  const changedPolicy = approveTrustPaymentRequisition({ requisition: pending, policy: policy({ releaseRecommendationValidityHours: 48 }).policy, approvedAt: '2026-07-16T14:00:00Z', approvals: [
    { actor: actor('accounts', accounts2), reason: 'Accounts control approved.', approvalReference: 'approval://accounts/g5/changed', approvalHash: hashA, approvedAt: '2026-07-16T13:00:00Z' },
    { actor: actor('responsible_attorney', attorney), reason: 'Legal purpose approved.', approvalReference: 'approval://legal/g5/changed', approvalHash: hashB, approvedAt: '2026-07-16T13:30:00Z' },
  ] })
  assert.ok(changedPolicy.errors.includes('trust_payment_policy_binding_mismatch'))
  const approved = approvedRequisition()
  assert.equal(approved.state, 'release_recommended')
  assert.equal(approved.releaseRecommendation.paymentInitiated, false)
  assert.equal(approved.releaseRecommendation.bankCommandCreated, false)
})

test('records paid, failed and reversed outcomes only from accepted evidence', () => {
  const approved = approvedRequisition()
  const paid = paidOutcome(approved)
  assert.equal(paid.ok, true, JSON.stringify(paid.errors))
  const failed = recordTrustPaymentOutcome({ requisition: approved, outcome: 'failed', evidence: evidence(CANONICAL_EVIDENCE_TYPES.paymentFailure, { expiresAt: null }), recordedBy: actor('accounts', accounts2), occurredAt: '2026-07-16T15:00:00Z', reason: 'External payment attempt failed.' })
  assert.equal(failed.ok, true, JSON.stringify(failed.errors))
  const reversed = recordTrustPaymentOutcome({ requisition: approved, outcome: 'reversed', previousOutcome: paid.outcome, evidence: evidence(CANONICAL_EVIDENCE_TYPES.paymentReversal, { expiresAt: null }), recordedBy: actor('accounts', accounts2), occurredAt: '2026-07-17T10:00:00Z', reason: 'Bank reversal evidence received.' })
  assert.equal(reversed.ok, true, JSON.stringify(reversed.errors))
})

test('reconciles expected movements, payment evidence and trust-ledger entries exactly', () => {
  const profile = authority().profile
  const accountLink = link(profile).link
  const expected = movement().movement
  const paid = paidOutcome().outcome
  const result = buildTrustMoneyReconciliation({ reconciliationId: 'trust-reconciliation:g5:1', identity: identity('trust-reconciliation:g5:1'), trustAccountLinkId: accountLink.linkId, trustAccountLink: accountLink, expectedMovements: [expected], paymentOutcomes: [paid], ledgerEntries: [{ entryId: 'ledger-entry:g5:1', movementId: expected.movementId, requisitionId: paid.requisitionId, direction: 'outflow', amountMinor: expected.amountMinor, accountReferenceHash: accountLink.accountReferenceHash, evidenceHash: hashA }], exceptionDecisions: [], openingBalanceMinor: 100000, closingBalanceMinor: 0, ledgerSnapshotReference: 'ledger-snapshot://g5/1', ledgerSnapshotHash: hashB, ledgerEvidence: evidence(CANONICAL_EVIDENCE_TYPES.trustLedgerSnapshot, { documentHash: hashB, expiresAt: null }), preparedBy: actor('accounts', accounts2), preparedAt: '2026-07-17T12:00:00Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.reconciliation.findings, [])
  assert.equal(result.reconciliation.state, 'pending_review')
  const approved = reviewTrustMoneyReconciliation({ reconciliation: result.reconciliation, reviewer: actor('responsible_attorney', attorney), decision: 'reconciled', reason: 'Trust movements match the approved matter position.', reviewedAt: '2026-07-17T13:00:00Z' })
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  assert.equal(approved.reconciliation.state, 'reconciled')
})

test('surfaces unidentified entries and requires explicit exception decisions', () => {
  const accountLink = link().link
  const base = { reconciliationId: 'trust-reconciliation:g5:unknown', identity: identity('trust-reconciliation:g5:unknown'), trustAccountLinkId: accountLink.linkId, trustAccountLink: accountLink, expectedMovements: [], paymentOutcomes: [], ledgerEntries: [{ entryId: 'ledger-entry:g5:unknown', movementId: '', direction: 'inflow', amountMinor: 5000, accountReferenceHash: accountLink.accountReferenceHash, evidenceHash: hashA }], openingBalanceMinor: 0, closingBalanceMinor: 5000, ledgerSnapshotReference: 'ledger-snapshot://g5/unknown', ledgerSnapshotHash: hashB, ledgerEvidence: evidence(CANONICAL_EVIDENCE_TYPES.trustLedgerSnapshot, { evidenceId: 'evidence:g5:ledger-unknown', documentHash: hashB, expiresAt: null }), preparedBy: actor('accounts', accounts2), preparedAt: '2026-07-17T12:00:00Z' }
  const unresolved = buildTrustMoneyReconciliation(base)
  assert.ok(unresolved.reconciliation.findings.includes('unidentified_trust_entry:ledger-entry:g5:unknown'))
  const exception = buildTrustPaymentExceptionDecision({ decisionId: 'exception:g5:unknown', identity: identity('exception:g5:unknown'), type: 'unidentified_receipt', relatedRecordId: 'ledger-entry:g5:unknown', reason: 'Receipt isolated pending allocation.', evidenceReference: 'evidence://unknown/g5', evidenceHash: hashA, complianceApprover: actor('compliance', compliance), legalApprover: actor('responsible_attorney', attorney), approvedAt: at }).decision
  const controlled = buildTrustMoneyReconciliation({ ...base, exceptionDecisions: [exception] })
  assert.deepEqual(controlled.reconciliation.findings, [])
})

test('binds reconciled trust money to approved D6 and D7 zero balances', () => {
  const trust = { version: 'conveyancer_trust_money_controls_g5_v1', reconciliationId: 'trust-reconciliation:g5:1', identity: identity(), state: 'reconciled', fingerprint: 'fnv1a_11111111', preparedBy: actor('accounts', accounts2) }
  const d6 = { version: CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION, reconciliationId: 'd6:g5:1', status: 'reconciled', fingerprint: 'fnv1a_22222222', financialModel: { transactionId: matter } }
  const d7 = { version: CONVEYANCER_FINAL_ACCOUNT_VERSION, finalAccountId: 'd7:g5:1', status: 'approved', fingerprint: 'fnv1a_33333333', financialModel: { transactionId: matter } }
  const result = buildTrustFinalAccountReconciliation({ reconciliationId: 'trust-final:g5:1', identity: identity('trust-final:g5:1'), trustReconciliation: trust, financialReconciliation: d6, finalAccount: d7, trustClosingBalanceMinor: 0, finalAccountClosingBalanceMinor: 0, outstandingRecordIds: [], reviewedBy: actor('responsible_attorney', attorney), reviewedAt: '2026-07-18T12:00:00Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.reconciliation.readyForCloseout, true)
})

test('records trust-control decisions in the common G1 audit shape', () => {
  const approved = approvedRequisition()
  const audit = buildTrustMoneyAuditEvent({ record: approved, eventId: 'audit:g5:1', eventType: 'trust_payment_release_recommended', actorUserId: attorney, reason: 'Dual approval completed.', occurredAt: '2026-07-16T14:00:00Z', detailReference: 'trust://requisition/g5/1', detailHash: hashA })
  assert.equal(audit.ok, true, JSON.stringify(audit.errors))
  assert.equal(audit.event.eventType, 'trust_payment_release_recommended')
})

console.log('G5 trust-money control tests passed.')
