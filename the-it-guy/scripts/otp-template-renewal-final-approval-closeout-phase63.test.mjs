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
import { buildOtpTemplateRenewalPublicationGuardPhase62Audit } from '../src/core/documents/otpTemplateRenewalPublicationGuardPhase62.js'
import {
  OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_CONTRACT,
  OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_PHASE63_VERSION,
  OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_READY_STATUS,
  buildOtpTemplateRenewalFinalApprovalCloseoutPhase63Audit,
  buildOtpTemplateRenewalFinalApprovalCloseoutReceipt,
  formatOtpTemplateRenewalFinalApprovalCloseoutPhase63Markdown,
} from '../src/core/documents/otpTemplateRenewalFinalApprovalCloseoutPhase63.js'

const checkedAt = '2026-08-06T21:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase63Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalFinalApprovalCloseoutPhase63.js', import.meta.url), 'utf8')

assert.equal(packageJson.scripts?.['test:otp-template-renewal-final-approval-closeout-phase63'], 'node scripts/otp-template-renewal-final-approval-closeout-phase63.test.mjs')
assert.equal(packageJson.scripts?.['report:otp-template-renewal-final-approval-closeout-phase63'], 'node scripts/report-otp-template-renewal-final-approval-closeout-phase63.mjs')
assert.ok(packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-final-approval-closeout-phase63'))

assert.equal(OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_PHASE63_VERSION, 'otp_template_renewal_final_approval_and_closeout_phase63_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_CONTRACT, 'otp-vnext-template-renewal-final-approval-closeout-phase63-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_AND_CLOSEOUT_COMPLETE')

for (const token of [
  'PHASE63_PUBLICATION_GUARD_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE63_MISSING_ROUTE_CLOSEOUT_BLOCKED',
  'PHASE63_DOCX_CLOSEOUT_BLOCKED',
  'PHASE63_MISSING_FINAL_APPROVAL_BLOCKED',
  'PHASE63_ARCHIVE_EVIDENCE_BLOCKED',
  'PHASE63_WRITE_OR_ROLLBACK_FAILURE_BLOCKED',
  'PHASE63_OPEN_ITEMS_BLOCK_CLOSEOUT',
  'PHASE63_GOVERNANCE_HANDOFF_BLOCKED',
]) {
  assert.ok(phase63Source.includes(token), `phase63 source should include ${token}`)
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
const phase62Audit = buildOtpTemplateRenewalPublicationGuardPhase62Audit({ checkedAt, phase61Audit, packageJson })
const audit = buildOtpTemplateRenewalFinalApprovalCloseoutPhase63Audit({ checkedAt, phase62Audit, packageJson })

assert.equal(phase62Audit.nextPhase.phase, 63)
assert.equal(phase62Audit.nextPhase.key, 'otp_template_renewal_final_approval_and_closeout')
assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_PHASE63_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.lifecycleComplete, true)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase, null)

for (const check of [
  'PHASE63_PHASE62_PUBLICATION_GUARD_READY',
  'PHASE63_GOOD_FINAL_APPROVAL_CLOSEOUT_COMPLETE',
  'PHASE63_BOTH_ROUTE_CLOSEOUT_MANIFESTS_ARCHIVED',
  'PHASE63_CLOSEOUT_BOUND_TO_PHASE62_GUARD',
  'PHASE63_ATTORNEY_CLOSEOUT_RECORDED',
  'PHASE63_NO_LIVE_WRITE_OR_DISPATCH_ALLOWED',
  'PHASE63_PUBLICATION_GUARD_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE63_MISSING_ROUTE_CLOSEOUT_BLOCKED',
  'PHASE63_DOCX_CLOSEOUT_BLOCKED',
  'PHASE63_MISSING_FINAL_APPROVAL_BLOCKED',
  'PHASE63_ARCHIVE_EVIDENCE_BLOCKED',
  'PHASE63_WRITE_OR_ROLLBACK_FAILURE_BLOCKED',
  'PHASE63_OPEN_ITEMS_BLOCK_CLOSEOUT',
  'PHASE63_GOVERNANCE_HANDOFF_BLOCKED',
  'PHASE63_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodPublicationGuard = phase62Audit.publicationGuardReceipts.find((receipt) => receipt.canProceedToControlledActivationDryRun)
const blockedCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
  checkedAt,
  publicationGuardReceipt: goodPublicationGuard,
  finalApproval: {
    approvalId: '',
    status: 'draft',
    approvedAt: '',
    sourcePublicationGuardFingerprint: 'wrong',
    sourcePhase62Status: 'wrong',
    attorneyApprovalReference: '',
    legalReviewStatus: 'pending',
    principalEditableTemplateRiskAccepted: false,
    routeSeparationConfirmed: false,
    docxSourceAbsentConfirmed: false,
    noLiveWriteConfirmed: false,
    noSigningDispatchConfirmed: false,
    noFinalArtifactMutationConfirmed: false,
    closeoutDecision: 'hold',
  },
  routeCloseoutManifest: [],
  approvals: [],
  archiveEntries: [],
  rollbackAndNoWrite: {
    rollbackPlanReference: '',
    rollbackAvailableAfterCloseout: false,
    restorePreviousVersionReady: false,
    stopSigningDispatchReady: false,
    mutatedData: true,
    productionWriteAttempted: true,
    liveDefaultMutationCount: 1,
    signingDispatchMutationCount: 1,
    finalPdfMutationCount: 1,
  },
  openItems: {
    openBlockerCount: 1,
    unresolvedLegalItemCount: 1,
    unresolvedRouteIssueCount: 1,
    unresolvedEvidenceIssueCount: 1,
    productionIncidentFreezeActive: true,
  },
  governanceHandoff: {
    owner: '',
    templateOwner: '',
    supportOwner: '',
    archiveReference: '',
    steadyStateCadence: '',
    renewalThreadClosed: false,
  },
})

assert.equal(blockedCloseout.canCloseRenewal, false)
for (const blocker of [
  'final_approval_id_missing',
  'final_approval_publication_guard_fingerprint_mismatch',
  'final_closeout_route_missing:resale_existing_property',
  'final_closeout_route_missing:new_development',
  'final_closeout_approval_missing:attorney_reviewer',
  'final_closeout_archive_missing:attorney_closeout_signoff',
  'final_closeout_rollback_not_available',
  'final_closeout_production_write_attempted',
  'final_closeout_open_blockers_remain',
  'final_closeout_governance_owner_missing',
]) {
  assert.ok(blockedCloseout.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalFinalApprovalCloseoutPhase63Markdown(audit)
for (const token of [
  'OTP Generator Phase 63 Final Approval And Closeout',
  'OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_AND_CLOSEOUT_COMPLETE',
  'None - renewal thread closed',
  'resale_existing_property',
  'new_development',
  'attorney_closeout_signoff',
  'final_closeout_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal final approval and closeout Phase 63 contract passed.')
