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
import { buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit } from '../src/core/documents/otpTemplateRenewalTemplateUpdateDraftPhase60.js'
import { buildOtpTemplateRenewalPdfSigningProofPhase61Audit } from '../src/core/documents/otpTemplateRenewalPdfSigningProofPhase61.js'
import {
  OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_CONTRACT,
  OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION,
  OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS,
  buildOtpTemplateRenewalPublicationGuardPhase62Audit,
  buildOtpTemplateRenewalPublicationGuardReceipt,
  formatOtpTemplateRenewalPublicationGuardPhase62Markdown,
} from '../src/core/documents/otpTemplateRenewalPublicationGuardPhase62.js'

const checkedAt = '2026-08-06T20:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase62Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalPublicationGuardPhase62.js', import.meta.url), 'utf8')

assert.equal(packageJson.scripts?.['test:otp-template-renewal-publication-guard-phase62'], 'node scripts/otp-template-renewal-publication-guard-phase62.test.mjs')
assert.equal(packageJson.scripts?.['report:otp-template-renewal-publication-guard-phase62'], 'node scripts/report-otp-template-renewal-publication-guard-phase62.mjs')
assert.ok(packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-publication-guard-phase62'))

assert.equal(OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION, 'otp_template_renewal_publication_dry_run_activation_guard_phase62_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_CONTRACT, 'otp-vnext-template-renewal-publication-dry-run-activation-guard-phase62-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_PUBLICATION_DRY_RUN_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN')

for (const token of [
  'PHASE62_PROOF_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE62_MISSING_ROUTE_CANDIDATE_BLOCKED',
  'PHASE62_DOCX_CANDIDATE_BLOCKED',
  'PHASE62_ACTIVATION_GUARD_MISMATCH_BLOCKED',
  'PHASE62_LIVE_WRITE_BLOCKED',
  'PHASE62_EVIDENCE_BLOCKED',
]) {
  assert.ok(phase62Source.includes(token), `phase62 source should include ${token}`)
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
const phase60Audit = buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit({ checkedAt, phase59Audit, packageJson })
const phase61Audit = buildOtpTemplateRenewalPdfSigningProofPhase61Audit({ checkedAt, phase60Audit, packageJson })
const audit = buildOtpTemplateRenewalPublicationGuardPhase62Audit({ checkedAt, phase61Audit, packageJson })

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 63)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_final_approval_and_closeout')

for (const check of [
  'PHASE62_PHASE61_PDF_SIGNING_PROOF_READY',
  'PHASE62_GOOD_PUBLICATION_GUARD_READY',
  'PHASE62_BOTH_ROUTE_CANDIDATES_STAGED',
  'PHASE62_GUARD_BOUND_TO_PHASE61_PROOF',
  'PHASE62_NO_LIVE_WRITE_ALLOWED',
  'PHASE62_PROOF_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE62_MISSING_ROUTE_CANDIDATE_BLOCKED',
  'PHASE62_ROUTE_CANDIDATE_FAILURE_BLOCKED',
  'PHASE62_DOCX_CANDIDATE_BLOCKED',
  'PHASE62_ACTIVATION_GUARD_MISMATCH_BLOCKED',
  'PHASE62_MISSING_APPROVAL_BLOCKED',
  'PHASE62_ROLLBACK_BLOCKED',
  'PHASE62_FREEZE_WINDOW_BLOCKED',
  'PHASE62_LIVE_WRITE_BLOCKED',
  'PHASE62_EVIDENCE_BLOCKED',
  'PHASE62_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodProof = phase61Audit.pdfSigningProofReceipts.find((receipt) => receipt.canRequestAttorneyRecheck)
const blockedReceipt = buildOtpTemplateRenewalPublicationGuardReceipt({
  checkedAt,
  pdfSigningProofReceipt: goodProof,
  publicationDryRun: {
    dryRunId: '',
    status: 'live',
    executedAt: '',
    sourceProofFingerprint: 'wrong',
    templateUpdateDraftFingerprint: 'wrong',
    targetEnvironment: 'production',
    publicationMode: 'production_write',
    routeCount: 1,
    candidateVersionKey: '',
    previousVersionKey: '',
    productionWriteRequested: true,
    liveDefaultMutationRequested: true,
    signingDispatchRequested: true,
    dryRunOnly: false,
  },
  routeCandidates: [],
  activationGuard: {
    guardId: '',
    status: 'failed',
    guardedAt: '',
    sourceDryRunId: 'wrong',
    sourceProofFingerprint: 'wrong',
    candidateVersionKey: 'wrong',
    previousVersionKey: 'wrong',
    targetEnvironment: 'staging',
    controlledActivationDryRunRequired: false,
    operator: '',
    confirmationPhrase: 'bad',
    expectedConfirmationPhrase: 'expected',
    mfaVerified: false,
    attorneyRecheckRecorded: false,
    attorneyApprovalReference: '',
    productionWriteRequested: true,
    liveDefaultMutationRequested: true,
    signingDispatchRequested: true,
    partialRouteActivationRequested: true,
  },
  approvals: [],
  rollbackControls: {
    rollbackPlanReference: '',
    previousDefaultsSnapshotCaptured: false,
    restorePreviousVersionReady: false,
    disableCandidateVersionReady: false,
    stopSigningDispatchReady: false,
    rollbackOwner: '',
    rollbackDrillPassed: false,
  },
  activationWindow: {
    windowReference: '',
    status: 'frozen',
    opensAt: '',
    expiresAt: '',
    freezeActive: true,
    incidentFreezeActive: true,
  },
  noWriteProof: {
    guardOnly: false,
    mutatedData: true,
    productionWriteAttempted: true,
    liveDefaultMutationCount: 1,
    productionArtifactMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    signingDispatchMutationCount: 1,
    finalPdfMutationCount: 1,
  },
  evidence: [],
})

assert.equal(blockedReceipt.canProceedToControlledActivationDryRun, false)
for (const blocker of [
  'publication_dry_run_id_missing',
  'publication_dry_run_proof_fingerprint_mismatch',
  'route_candidate_missing:resale_existing_property',
  'route_candidate_missing:new_development',
  'activation_guard_id_missing',
  'publication_guard_approval_missing:attorney_reviewer',
  'rollback_restore_previous_version_not_ready',
  'activation_window_freeze_active',
  'publication_guard_production_write_attempted',
  'publication_guard_evidence_missing:no_write_attestation',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalPublicationGuardPhase62Markdown(audit)
for (const token of [
  'OTP Generator Phase 62 Renewal Publication Dry Run And Activation Guard',
  'OTP_TEMPLATE_RENEWAL_PUBLICATION_DRY_RUN_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN',
  'Phase 63: Final Approval And Closeout',
  'resale_existing_property',
  'new_development',
  'route_candidate_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal publication dry run and activation guard Phase 62 contract passed.')
