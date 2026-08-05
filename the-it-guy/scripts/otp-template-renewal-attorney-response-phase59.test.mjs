import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildOtpControlledVersionRenewalActivationDryRunPhase48Audit } from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import { buildOtpVersionRenewalActivationReceiptPhase49Audit } from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'
import { buildOtpVersionRenewalLiveWriteGuardPhase50Audit } from '../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js'
import { buildOtpControlledVersionRenewalApplyDryRunPhase51Audit } from '../src/core/documents/otpControlledVersionRenewalApplyDryRunPhase51.js'
import { buildOtpVersionRenewalApplyReceiptPhase52Audit } from '../src/core/documents/otpVersionRenewalApplyReceiptPhase52.js'
import { buildOtpPostRenewalMonitoringCloseoutPhase53Audit } from '../src/core/documents/otpPostRenewalMonitoringCloseoutPhase53.js'
import { buildOtpTemplateRenewalSteadyStateReviewPhase54Audit } from '../src/core/documents/otpTemplateRenewalSteadyStateReviewPhase54.js'
import { buildOtpTemplateRenewalChangeIntakePhase55Audit } from '../src/core/documents/otpTemplateRenewalChangeIntakePhase55.js'
import { buildOtpTemplateRenewalScopingAndTriagePhase56Audit } from '../src/core/documents/otpTemplateRenewalScopingAndTriagePhase56.js'
import { buildOtpTemplateRenewalWorkPackageDraftPhase57Audit } from '../src/core/documents/otpTemplateRenewalWorkPackageDraftPhase57.js'
import { buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit } from '../src/core/documents/otpTemplateRenewalAttorneyReviewPacketPhase58.js'
import {
  OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_CONTRACT,
  OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION,
  OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS,
  buildOtpTemplateRenewalAttorneyResponsePhase59Audit,
  buildOtpTemplateRenewalAttorneyResponseReceipt,
  formatOtpTemplateRenewalAttorneyResponsePhase59Markdown,
} from '../src/core/documents/otpTemplateRenewalAttorneyResponsePhase59.js'

const checkedAt = '2026-08-06T17:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase59Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalAttorneyResponsePhase59.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-attorney-response-phase59'],
  'node scripts/otp-template-renewal-attorney-response-phase59.test.mjs',
  'package.json should expose the OTP template renewal attorney response Phase 59 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-attorney-response-phase59'],
  'node scripts/report-otp-template-renewal-attorney-response-phase59.mjs',
  'package.json should expose the OTP template renewal attorney response Phase 59 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-attorney-response-phase59'),
  'OTP vNext verification should include Phase 59 template renewal attorney response.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION, 'otp_template_renewal_attorney_response_required_changes_phase59_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_CONTRACT, 'otp-vnext-template-renewal-attorney-response-required-changes-phase59-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_REQUIRED_CHANGES_READY_FOR_TEMPLATE_UPDATE_DRAFT')

for (const token of [
  'PHASE59_PACKET_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE59_MISSING_ROUTE_RESPONSE_BLOCKED',
  'PHASE59_UNANSWERED_QUESTIONS_BLOCKED',
  'PHASE59_MISSING_REQUIRED_CHANGES_BLOCKED',
  'PHASE59_DOCX_RESPONSE_BLOCKED',
  'PHASE59_PRODUCTION_WRITE_BLOCKED',
]) {
  assert.ok(phase59Source.includes(token), `phase59 source should include ${token}`)
}

const phase48Audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({ checkedAt, packageJson })
const phase49Audit = buildOtpVersionRenewalActivationReceiptPhase49Audit({ checkedAt, phase48Audit, packageJson })
const phase50Audit = buildOtpVersionRenewalLiveWriteGuardPhase50Audit({ checkedAt, phase49Audit, packageJson })
const phase51Audit = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({ checkedAt, phase50Audit, packageJson })
const phase52Audit = buildOtpVersionRenewalApplyReceiptPhase52Audit({ checkedAt, phase51Audit, packageJson })
const phase53Audit = buildOtpPostRenewalMonitoringCloseoutPhase53Audit({ checkedAt, phase52Audit, packageJson })
const phase54Audit = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({ checkedAt, phase53Audit, packageJson })
const phase55Audit = buildOtpTemplateRenewalChangeIntakePhase55Audit({ checkedAt, phase54Audit, packageJson })
const phase56Audit = buildOtpTemplateRenewalScopingAndTriagePhase56Audit({ checkedAt, phase55Audit, packageJson })
const phase57Audit = buildOtpTemplateRenewalWorkPackageDraftPhase57Audit({ checkedAt, phase56Audit, packageJson })
const phase58Audit = buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit({ checkedAt, phase57Audit, packageJson })
const audit = buildOtpTemplateRenewalAttorneyResponsePhase59Audit({
  checkedAt,
  phase58Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 60)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_template_update_draft_from_attorney_changes')

for (const check of [
  'PHASE59_PHASE58_PACKET_READY',
  'PHASE59_GOOD_ATTORNEY_RESPONSE_READY',
  'PHASE59_RESPONSE_BOUND_TO_PACKET',
  'PHASE59_BOTH_ROUTE_RESPONSES_CAPTURED',
  'PHASE59_REQUIRED_CHANGE_CATEGORIES_CAPTURED',
  'PHASE59_QUESTIONS_ANSWERED_CHANGES_REQUIRED',
  'PHASE59_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE59_PACKET_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE59_MISSING_ROUTE_RESPONSE_BLOCKED',
  'PHASE59_UNANSWERED_QUESTIONS_BLOCKED',
  'PHASE59_MISSING_REQUIRED_CHANGES_BLOCKED',
  'PHASE59_DOCX_RESPONSE_BLOCKED',
  'PHASE59_PREMATURE_APPROVAL_BLOCKED',
  'PHASE59_QA_RETEST_SCOPE_BLOCKED',
  'PHASE59_DISPATCH_BLOCKED',
  'PHASE59_EVIDENCE_BLOCKED',
  'PHASE59_PRODUCTION_WRITE_BLOCKED',
  'PHASE59_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodPacket = phase58Audit.attorneyPacketReceipts.find((receipt) => receipt.canRequestAttorneyResponse)
const blockedReceipt = buildOtpTemplateRenewalAttorneyResponseReceipt({
  checkedAt,
  packetReceipt: goodPacket,
  responseManifest: {
    responseId: '',
    status: 'approved',
    respondedAt: '',
    packetFingerprint: 'wrong',
    draftFingerprint: 'wrong',
    routeCount: 1,
    responseMode: 'publication_approval',
    attorneyReviewer: '',
    templateOwner: '',
    questionRegisterStatus: 'unanswered',
    attorneyApprovalGranted: true,
    productionWriteRequested: true,
    responseOnly: false,
  },
  routeResponses: [],
  changeRegister: {
    registerId: '',
    status: 'approved',
    routeCount: 0,
    totalRequiredChangeCount: 0,
    unresolvedQuestionCount: 2,
    requiredCategories: [],
    attorneyApprovalGranted: true,
    templateUpdateDraftRequired: false,
    routeSeparated: false,
  },
  qaRetestScope: {
    contentScannerRequired: false,
    generatedPdfProofRequired: false,
    signingEnvelopeAlignmentRequired: false,
    agentReviewRuntimeRequired: false,
    routeRegressionRequired: false,
    attorneyPacketTraceRequired: false,
    productionWriteNotAllowed: false,
    signingDispatchNotAllowed: false,
  },
  reviewRouting: {
    attorneyReviewerRole: '',
    templateOwnerRole: '',
    nextOwnerRole: 'release_operator',
    nextAction: 'publish',
    deliveryMode: 'email',
    emailDispatchRequested: true,
    signingDispatchRequested: true,
    productionWriteRequested: true,
  },
  evidence: [],
  noWriteProof: {
    responseOnly: false,
    productionWriteAttempted: true,
    attorneyApprovalMutationCount: 1,
    legalWordingMutationCount: 1,
    templateDefaultMutationCount: 1,
    fieldRegistryMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    dispatchMutationCount: 1,
  },
})

assert.equal(blockedReceipt.canPrepareTemplateUpdateDraft, false)
for (const blocker of [
  'attorney_response_id_missing',
  'attorney_response_packet_fingerprint_mismatch',
  'attorney_response_route_missing:resale_existing_property',
  'attorney_response_route_missing:new_development',
  'attorney_change_register_empty',
  'attorney_change_register_category_missing:buyer_cost_obligations',
  'attorney_response_pdf_proof_retest_missing',
  'attorney_response_email_dispatch_requested',
  'attorney_response_evidence_missing:no_write_attestation',
  'attorney_response_production_write_attempted',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalAttorneyResponsePhase59Markdown(audit)
for (const token of [
  'OTP Generator Phase 59 Template Renewal Attorney Response Required Changes',
  'OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_REQUIRED_CHANGES_READY_FOR_TEMPLATE_UPDATE_DRAFT',
  'Phase 60: Template Update Draft From Attorney Changes',
  'buyer_cost_obligations',
  'signatures_and_witnesses',
  'attorney_response_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal attorney response Phase 59 contract passed.')
