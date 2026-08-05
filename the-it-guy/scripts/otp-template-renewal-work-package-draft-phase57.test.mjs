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
import {
  OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_CONTRACT,
  OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION,
  OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS,
  buildOtpTemplateRenewalWorkPackageDraftPhase57Audit,
  buildOtpTemplateRenewalWorkPackageDraftReceipt,
  formatOtpTemplateRenewalWorkPackageDraftPhase57Markdown,
} from '../src/core/documents/otpTemplateRenewalWorkPackageDraftPhase57.js'

const checkedAt = '2026-08-06T15:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase57Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalWorkPackageDraftPhase57.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-work-package-draft-phase57'],
  'node scripts/otp-template-renewal-work-package-draft-phase57.test.mjs',
  'package.json should expose the OTP template renewal work-package draft Phase 57 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-work-package-draft-phase57'],
  'node scripts/report-otp-template-renewal-work-package-draft-phase57.mjs',
  'package.json should expose the OTP template renewal work-package draft Phase 57 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-work-package-draft-phase57'),
  'OTP vNext verification should include Phase 57 template renewal work-package draft.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION, 'otp_template_renewal_work_package_draft_phase57_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_CONTRACT, 'otp-vnext-template-renewal-work-package-draft-phase57-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_FOR_ATTORNEY_REVIEW_PACKET')

for (const token of [
  'PHASE57_SCOPING_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE57_MISSING_ROUTE_DRAFT_BLOCKED',
  'PHASE57_INCOMPLETE_ROUTE_DRAFT_BLOCKED',
  'PHASE57_DOCX_SOURCE_BLOCKED',
  'PHASE57_PREMATURE_APPROVAL_BLOCKED',
  'PHASE57_PRODUCTION_WRITE_BLOCKED',
]) {
  assert.ok(phase57Source.includes(token), `phase57 source should include ${token}`)
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
const audit = buildOtpTemplateRenewalWorkPackageDraftPhase57Audit({
  checkedAt,
  phase56Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 58)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_attorney_review_packet')

for (const check of [
  'PHASE57_PHASE56_SCOPING_READY',
  'PHASE57_GOOD_WORK_PACKAGE_DRAFT_READY',
  'PHASE57_DRAFT_BOUND_TO_SCOPING',
  'PHASE57_BOTH_ROUTE_DRAFTS_CREATED',
  'PHASE57_REQUIRED_DRAFT_SECTIONS_PRESENT',
  'PHASE57_REVIEW_GATES_QUEUED',
  'PHASE57_ATTORNEY_PACKET_PREPARED_NOT_APPROVED',
  'PHASE57_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE57_SCOPING_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE57_MISSING_ROUTE_DRAFT_BLOCKED',
  'PHASE57_INCOMPLETE_ROUTE_DRAFT_BLOCKED',
  'PHASE57_DOCX_SOURCE_BLOCKED',
  'PHASE57_PREMATURE_APPROVAL_BLOCKED',
  'PHASE57_REVIEW_GATE_BLOCKED',
  'PHASE57_QA_TRACEABILITY_BLOCKED',
  'PHASE57_ROLLBACK_TRACE_BLOCKED',
  'PHASE57_EVIDENCE_BLOCKED',
  'PHASE57_PRODUCTION_WRITE_BLOCKED',
  'PHASE57_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodScoping = phase56Audit.scopingReceipts.find((receipt) => receipt.canPrepareWorkPackageDraft)
const blockedReceipt = buildOtpTemplateRenewalWorkPackageDraftReceipt({
  checkedAt,
  scopingReceipt: goodScoping,
  draftManifest: {
    draftManifestId: '',
    status: 'draft',
    draftedAt: '',
    scopingFingerprint: 'wrong',
    routeCount: 1,
    routeSeparationMode: 'combined',
    draftMode: 'production',
    templateOwner: '',
    qaOwner: '',
    attorneyCoordinator: '',
    productionWriteRequested: true,
    emergencyOverride: true,
    draftOnly: false,
  },
  routeDrafts: [],
  reviewGates: [],
  attorneyPacketStub: {
    required: false,
    packetStatus: 'approved',
    attorneyApprovalGranted: true,
    unresolvedLegalHoldCount: 1,
    routeSeparatedPacket: false,
    packetReference: '',
    evidencePath: '',
  },
  qaTraceability: {
    sourceTestPlanCount: 0,
    contentScannerMapped: false,
    generatedPdfProofMapped: false,
    signingEnvelopeAlignmentMapped: false,
    agentReviewRuntimeMapped: false,
    routeRegressionMapped: false,
    rollbackRehearsalMapped: false,
    noWriteGuardMapped: false,
  },
  rollbackTrace: {
    rollbackReference: '',
    owner: '',
    restorePreviousDefaultsTraced: false,
    restorePreviousSigningEnvelopesTraced: false,
    restoreVersionPointerTraced: false,
    stopSigningDispatchTraced: false,
    dryRunStillRequired: false,
    productionWriteNotAllowed: false,
  },
  evidence: [],
  noWriteProof: {
    draftOnly: false,
    productionWriteAttempted: true,
    templateDefaultMutationCount: 1,
    legalWordingMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    versionPointerMutationCount: 1,
    dispatchMutationCount: 1,
  },
})

assert.equal(blockedReceipt.canPrepareAttorneyReviewPacket, false)
for (const blocker of [
  'draft_manifest_id_missing',
  'draft_scoping_fingerprint_mismatch',
  'draft_route_missing:resale_existing_property',
  'draft_route_missing:new_development',
  'draft_review_gate_missing:attorney_review',
  'draft_attorney_packet_premature_approval',
  'draft_generated_pdf_proof_not_mapped',
  'draft_rollback_owner_missing',
  'draft_evidence_missing:no_write_proof',
  'draft_production_write_attempted',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalWorkPackageDraftPhase57Markdown(audit)
for (const token of [
  'OTP Generator Phase 57 Template Renewal Work Package Draft',
  'OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_FOR_ATTORNEY_REVIEW_PACKET',
  'Phase 58: Template Renewal Attorney Review Packet',
  'resale_existing_property',
  'new_development',
  'draft_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal work-package draft Phase 57 contract passed.')
