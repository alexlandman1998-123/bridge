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
import {
  OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_CONTRACT,
  OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION,
  OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS,
  buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit,
  buildOtpTemplateRenewalAttorneyReviewPacketReceipt,
  formatOtpTemplateRenewalAttorneyReviewPacketPhase58Markdown,
} from '../src/core/documents/otpTemplateRenewalAttorneyReviewPacketPhase58.js'

const checkedAt = '2026-08-06T16:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase58Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalAttorneyReviewPacketPhase58.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-attorney-review-packet-phase58'],
  'node scripts/otp-template-renewal-attorney-review-packet-phase58.test.mjs',
  'package.json should expose the OTP template renewal attorney review packet Phase 58 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-attorney-review-packet-phase58'],
  'node scripts/report-otp-template-renewal-attorney-review-packet-phase58.mjs',
  'package.json should expose the OTP template renewal attorney review packet Phase 58 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-attorney-review-packet-phase58'),
  'OTP vNext verification should include Phase 58 template renewal attorney review packet.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION, 'otp_template_renewal_attorney_review_packet_phase58_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_CONTRACT, 'otp-vnext-template-renewal-attorney-review-packet-phase58-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_FOR_ATTORNEY_RESPONSE')

for (const token of [
  'PHASE58_DRAFT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE58_MISSING_ROUTE_PACKET_BLOCKED',
  'PHASE58_INCOMPLETE_ROUTE_PACKET_BLOCKED',
  'PHASE58_DOCX_SOURCE_BLOCKED',
  'PHASE58_PREMATURE_APPROVAL_BLOCKED',
  'PHASE58_PRODUCTION_WRITE_BLOCKED',
]) {
  assert.ok(phase58Source.includes(token), `phase58 source should include ${token}`)
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
const audit = buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit({
  checkedAt,
  phase57Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 59)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_attorney_response_required_changes')

for (const check of [
  'PHASE58_PHASE57_DRAFT_READY',
  'PHASE58_GOOD_ATTORNEY_PACKET_READY',
  'PHASE58_PACKET_BOUND_TO_DRAFT',
  'PHASE58_BOTH_ROUTE_PACKETS_PREPARED',
  'PHASE58_REQUIRED_PACKET_SECTIONS_PRESENT',
  'PHASE58_ATTORNEY_INSTRUCTIONS_INCLUDED',
  'PHASE58_QUESTION_REGISTER_OPEN_NOT_APPROVED',
  'PHASE58_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE58_DRAFT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE58_MISSING_ROUTE_PACKET_BLOCKED',
  'PHASE58_INCOMPLETE_ROUTE_PACKET_BLOCKED',
  'PHASE58_DOCX_SOURCE_BLOCKED',
  'PHASE58_PREMATURE_APPROVAL_BLOCKED',
  'PHASE58_INSTRUCTION_SET_BLOCKED',
  'PHASE58_QA_ROLLBACK_CONTEXT_BLOCKED',
  'PHASE58_DISPATCH_BLOCKED',
  'PHASE58_EVIDENCE_BLOCKED',
  'PHASE58_PRODUCTION_WRITE_BLOCKED',
  'PHASE58_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodDraft = phase57Audit.draftReceipts.find((receipt) => receipt.canPrepareAttorneyReviewPacket)
const blockedReceipt = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
  checkedAt,
  draftReceipt: goodDraft,
  packetManifest: {
    packetId: '',
    status: 'approved',
    preparedAt: '',
    draftFingerprint: 'wrong',
    routeCount: 1,
    routeSeparationMode: 'combined',
    packetMode: 'production',
    templateOwner: '',
    attorneyCoordinator: '',
    qaContextIncluded: false,
    rollbackContextIncluded: false,
    productionWriteRequested: true,
    attorneyApprovalGranted: true,
    packetOnly: false,
  },
  routePackets: [],
  instructionSet: [],
  questionRegister: {
    registerId: '',
    status: 'closed',
    routeCount: 0,
    totalQuestionCount: 0,
    unresolvedQuestionCount: 0,
    attorneyResponseRequired: false,
    attorneyApprovalGranted: true,
  },
  qaRollbackContext: {
    qaTraceIncluded: false,
    contentScannerMapped: false,
    generatedPdfProofMapped: false,
    signingEnvelopeAlignmentMapped: false,
    rollbackTraceIncluded: false,
    rollbackReference: '',
    stopSigningDispatchTraced: false,
    noWriteGuardMapped: false,
  },
  reviewRouting: {
    attorneyRecipientRole: '',
    templateOwnerRole: '',
    responseDuePolicy: 'after_publication',
    deliveryMode: 'email',
    emailDispatchRequested: true,
    signingDispatchRequested: true,
    productionWriteRequested: true,
  },
  evidence: [],
  noWriteProof: {
    packetOnly: false,
    productionWriteAttempted: true,
    attorneyApprovalMutationCount: 1,
    legalWordingMutationCount: 1,
    templateDefaultMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    dispatchMutationCount: 1,
  },
})

assert.equal(blockedReceipt.canRequestAttorneyResponse, false)
for (const blocker of [
  'attorney_packet_id_missing',
  'attorney_packet_draft_fingerprint_mismatch',
  'attorney_packet_route_missing:resale_existing_property',
  'attorney_packet_route_missing:new_development',
  'attorney_instruction_missing:review_legal_wording',
  'attorney_question_register_premature_approval',
  'attorney_packet_pdf_proof_not_mapped',
  'attorney_review_email_dispatch_requested',
  'attorney_packet_evidence_missing:no_write_attestation',
  'attorney_packet_production_write_attempted',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalAttorneyReviewPacketPhase58Markdown(audit)
for (const token of [
  'OTP Generator Phase 58 Template Renewal Attorney Review Packet',
  'OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_FOR_ATTORNEY_RESPONSE',
  'Phase 59: Attorney Review Response And Required Changes',
  'resale_existing_property',
  'new_development',
  'attorney_packet_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal attorney review packet Phase 58 contract passed.')
