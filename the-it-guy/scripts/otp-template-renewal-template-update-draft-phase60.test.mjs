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
import { buildOtpTemplateRenewalAttorneyResponsePhase59Audit } from '../src/core/documents/otpTemplateRenewalAttorneyResponsePhase59.js'
import {
  OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_CONTRACT,
  OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION,
  OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS,
  buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit,
  buildOtpTemplateRenewalTemplateUpdateDraftReceipt,
  formatOtpTemplateRenewalTemplateUpdateDraftPhase60Markdown,
} from '../src/core/documents/otpTemplateRenewalTemplateUpdateDraftPhase60.js'

const checkedAt = '2026-08-06T18:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase60Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalTemplateUpdateDraftPhase60.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-template-update-draft-phase60'],
  'node scripts/otp-template-renewal-template-update-draft-phase60.test.mjs',
  'package.json should expose the OTP template renewal template update draft Phase 60 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-template-update-draft-phase60'],
  'node scripts/report-otp-template-renewal-template-update-draft-phase60.mjs',
  'package.json should expose the OTP template renewal template update draft Phase 60 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-template-update-draft-phase60'),
  'OTP vNext verification should include Phase 60 template update draft.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION, 'otp_template_renewal_template_update_draft_from_attorney_feedback_phase60_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_CONTRACT, 'otp-vnext-template-renewal-template-update-draft-from-attorney-feedback-phase60-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_FOR_QA_AND_ATTORNEY_RECHECK')

for (const token of [
  'PHASE60_RESPONSE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE60_MISSING_ROUTE_DRAFT_BLOCKED',
  'PHASE60_INCOMPLETE_ROUTE_DRAFT_BLOCKED',
  'PHASE60_CHANGE_MATRIX_BLOCKED',
  'PHASE60_DOCX_DRAFT_BLOCKED',
  'PHASE60_PRODUCTION_WRITE_BLOCKED',
]) {
  assert.ok(phase60Source.includes(token), `phase60 source should include ${token}`)
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
const phase59Audit = buildOtpTemplateRenewalAttorneyResponsePhase59Audit({ checkedAt, phase58Audit, packageJson })
const audit = buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit({
  checkedAt,
  phase59Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 61)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_template_update_draft_qa_attorney_recheck')

for (const check of [
  'PHASE60_PHASE59_ATTORNEY_RESPONSE_READY',
  'PHASE60_GOOD_TEMPLATE_UPDATE_DRAFT_READY',
  'PHASE60_DRAFT_BOUND_TO_ATTORNEY_RESPONSE',
  'PHASE60_BOTH_ROUTE_DRAFTS_PREPARED',
  'PHASE60_REQUIRED_DRAFT_SECTIONS_PRESENT',
  'PHASE60_ATTORNEY_CHANGE_CATEGORIES_APPLIED',
  'PHASE60_QA_AND_ATTORNEY_RECHECK_REQUIRED',
  'PHASE60_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE60_RESPONSE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE60_MISSING_ROUTE_DRAFT_BLOCKED',
  'PHASE60_INCOMPLETE_ROUTE_DRAFT_BLOCKED',
  'PHASE60_CHANGE_MATRIX_BLOCKED',
  'PHASE60_DOCX_DRAFT_BLOCKED',
  'PHASE60_PREMATURE_APPROVAL_BLOCKED',
  'PHASE60_QA_PLAN_BLOCKED',
  'PHASE60_DISPATCH_BLOCKED',
  'PHASE60_EVIDENCE_BLOCKED',
  'PHASE60_PRODUCTION_WRITE_BLOCKED',
  'PHASE60_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodAttorneyResponse = phase59Audit.attorneyResponseReceipts.find((receipt) => receipt.canPrepareTemplateUpdateDraft)
const blockedReceipt = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
  checkedAt,
  attorneyResponseReceipt: goodAttorneyResponse,
  draftManifest: {
    draftId: '',
    status: 'published',
    draftedAt: '',
    attorneyResponseFingerprint: 'wrong',
    packetFingerprint: 'wrong',
    sourceDraftFingerprint: 'wrong',
    routeCount: 1,
    draftMode: 'production_write',
    templateOwner: '',
    qaOwner: '',
    attorneyRecheckRequired: false,
    attorneyApprovalGranted: true,
    productionWriteRequested: true,
    draftOnly: false,
  },
  routeUpdateDrafts: [],
  draftChangeMatrix: {
    matrixId: '',
    status: 'approved',
    routeCount: 0,
    totalAppliedChangeCount: 0,
    changeCategories: [],
    attorneyRecheckRequired: false,
    qaRequired: false,
    attorneyApprovalGranted: true,
    publicationApprovalGranted: true,
    routeSeparated: false,
  },
  qaPlan: {
    contentScannerRequired: false,
    generatedPdfProofRequired: false,
    signingEnvelopeAlignmentRequired: false,
    agentReviewRuntimeRequired: false,
    routeRegressionRequired: false,
    attorneyRecheckRequired: false,
    productionWriteNotAllowed: false,
    signingDispatchNotAllowed: false,
  },
  reviewRouting: {
    currentOwnerRole: '',
    nextOwnerRole: 'release_operator',
    attorneyReviewerRole: '',
    nextAction: 'publish',
    deliveryMode: 'email',
    emailDispatchRequested: true,
    signingDispatchRequested: true,
    productionWriteRequested: true,
  },
  evidence: [],
  noWriteProof: {
    draftOnly: false,
    productionWriteAttempted: true,
    attorneyApprovalMutationCount: 1,
    publicationApprovalMutationCount: 1,
    legalWordingMutationCount: 1,
    templateDefaultMutationCount: 1,
    fieldRegistryMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    dispatchMutationCount: 1,
  },
})

assert.equal(blockedReceipt.canStartQaAndAttorneyRecheck, false)
for (const blocker of [
  'template_update_draft_id_missing',
  'template_update_draft_response_fingerprint_mismatch',
  'template_update_draft_route_missing:resale_existing_property',
  'template_update_draft_route_missing:new_development',
  'template_update_draft_matrix_empty',
  'template_update_draft_matrix_category_missing:buyer_cost_obligations',
  'template_update_draft_pdf_proof_retest_missing',
  'template_update_draft_email_dispatch_requested',
  'template_update_draft_evidence_missing:no_write_attestation',
  'template_update_draft_production_write_attempted',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalTemplateUpdateDraftPhase60Markdown(audit)
for (const token of [
  'OTP Generator Phase 60 Template Update Draft From Attorney Feedback',
  'OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_FOR_QA_AND_ATTORNEY_RECHECK',
  'Phase 61: Template Update Draft QA And Attorney Recheck',
  'buyer_cost_obligations',
  'signatures_and_witnesses',
  'template_update_draft_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal template update draft Phase 60 contract passed.')
