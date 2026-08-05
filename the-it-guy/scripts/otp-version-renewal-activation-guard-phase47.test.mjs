import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpAgentReviewUiPhase31Audit,
} from '../src/core/documents/otpAgentReviewUiPhase31.js'
import {
  buildOtpAgentReviewRuntimeProofPhase32Audit,
} from '../src/core/documents/otpAgentReviewRuntimeProofPhase32.js'
import {
  buildOtpAgentReviewSigningAlignmentPhase33Audit,
} from '../src/core/documents/otpAgentReviewSigningEnvelopeAlignmentPhase33.js'
import {
  buildOtpAgentReviewDispatchGuardPhase34Audit,
} from '../src/core/documents/otpAgentReviewDispatchGuardPhase34.js'
import {
  buildOtpAgentReviewSignerSessionPhase35Audit,
} from '../src/core/documents/otpAgentReviewSignerSessionPhase35.js'
import {
  buildOtpAgentReviewCompletionGuardPhase36Audit,
} from '../src/core/documents/otpAgentReviewCompletionGuardPhase36.js'
import {
  buildOtpFinalSignedArtifactProofPhase37Audit,
} from '../src/core/documents/otpFinalSignedArtifactProofPhase37.js'
import {
  buildOtpEndToEndStagingWalkthroughPhase38Audit,
} from '../src/core/documents/otpEndToEndStagingWalkthroughPhase38.js'
import {
  buildOtpProductionReleaseDecisionPhase39Audit,
} from '../src/core/documents/otpProductionReleaseDecisionPhase39.js'
import {
  buildOtpControlledProductionCutoverPhase40Audit,
} from '../src/core/documents/otpControlledProductionCutoverPhase40.js'
import {
  buildOtpPostCutoverMonitoringPhase41Audit,
} from '../src/core/documents/otpPostCutoverMonitoringPhase41.js'
import {
  buildOtpProductionStabilisationSignoffPhase42Audit,
} from '../src/core/documents/otpProductionStabilisationSignoffPhase42.js'
import {
  buildOtpReleaseCloseoutArchivePhase43Audit,
} from '../src/core/documents/otpReleaseCloseoutArchivePhase43.js'
import {
  buildOtpSteadyStateGovernanceMonitoringPhase44Audit,
} from '../src/core/documents/otpSteadyStateGovernanceMonitoringPhase44.js'
import {
  buildOtpTemplateChangeControlPhase45Audit,
} from '../src/core/documents/otpTemplateChangeControlPhase45.js'
import {
  buildOtpVersionRenewalPublicationPhase46Audit,
} from '../src/core/documents/otpVersionRenewalPublicationPhase46.js'
import {
  OTP_VERSION_RENEWAL_ACTIVATION_GUARD_CONTRACT,
  OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION,
  OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS,
  buildOtpVersionRenewalActivationGuardPhase47Audit,
  buildOtpVersionRenewalActivationGuardReceipt,
  formatOtpVersionRenewalActivationGuardPhase47Markdown,
} from '../src/core/documents/otpVersionRenewalActivationGuardPhase47.js'

const checkedAt = '2026-08-06T08:00:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase47Source = await readFile(new URL('../src/core/documents/otpVersionRenewalActivationGuardPhase47.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-version-renewal-activation-guard-phase47'],
  'node scripts/otp-version-renewal-activation-guard-phase47.test.mjs',
  'package.json should expose the OTP version renewal activation guard Phase 47 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-version-renewal-activation-guard-phase47'],
  'node scripts/report-otp-version-renewal-activation-guard-phase47.mjs',
  'package.json should expose the OTP version renewal activation guard Phase 47 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-activation-guard-phase47'),
  'OTP vNext verification should include Phase 47 version renewal activation guard.',
)

assert.equal(OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION, 'otp_version_renewal_activation_guard_phase47_v1')
assert.equal(OTP_VERSION_RENEWAL_ACTIVATION_GUARD_CONTRACT, 'otp-vnext-version-renewal-activation-guard-phase47-v1')
assert.equal(OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS, 'OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN')

for (const token of [
  'PHASE47_BLOCKED_PHASE46_RECEIPT_REJECTED',
  'PHASE47_STALE_OPERATION_BLOCKED',
  'PHASE47_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE47_DOCX_REGRESSION_BLOCKED',
  'PHASE47_OPERATOR_CONFIRMATION_MISMATCH_BLOCKED',
  'PHASE47_LIVE_MUTATION_BLOCKED',
]) {
  assert.ok(phase47Source.includes(token), `phase47 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt,
  phase30Audit: {
    status: 'OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING',
    sampleModels: {
      resaleReady: {
        canOpenAgentReviewModal: true,
        canGenerateOtp: true,
        routeVariant: 'resale_existing_property',
        routeLabel: 'Existing / resale property OTP',
        blockerCodes: [],
        warningCodes: [],
        editableSections: [{ key: 'buyer_cost_obligations' }],
        standardConditionControls: [{ key: 'bond_approval' }],
        approvalRows: [],
      },
    },
  },
  workspaceSource,
  packageJson,
})
const phase32Audit = buildOtpAgentReviewRuntimeProofPhase32Audit({
  checkedAt,
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt,
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt,
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt,
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
const phase36Audit = buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt,
  phase35Audit,
  packetServiceSource,
  packageJson,
})
const phase37Audit = buildOtpFinalSignedArtifactProofPhase37Audit({
  checkedAt,
  phase36Audit,
  packetServiceSource,
  packageJson,
})
const phase38Audit = buildOtpEndToEndStagingWalkthroughPhase38Audit({
  checkedAt,
  phase37Audit,
  packageJson,
})
const phase39Audit = buildOtpProductionReleaseDecisionPhase39Audit({
  checkedAt,
  phase38Audit,
  packageJson,
})
const phase40Audit = buildOtpControlledProductionCutoverPhase40Audit({
  checkedAt,
  phase39Audit,
  packageJson,
})
const phase41Audit = buildOtpPostCutoverMonitoringPhase41Audit({
  checkedAt,
  phase40Audit,
  packageJson,
})
const phase42Audit = buildOtpProductionStabilisationSignoffPhase42Audit({
  checkedAt,
  phase41Audit,
  packageJson,
})
const phase43Audit = buildOtpReleaseCloseoutArchivePhase43Audit({
  checkedAt,
  phase42Audit,
  packageJson,
})
const phase44Audit = buildOtpSteadyStateGovernanceMonitoringPhase44Audit({
  checkedAt,
  phase43Audit,
  packageJson,
})
const phase45Audit = buildOtpTemplateChangeControlPhase45Audit({
  checkedAt,
  phase44Audit,
  packageJson,
})
const phase46Audit = buildOtpVersionRenewalPublicationPhase46Audit({
  checkedAt,
  phase45Audit,
  packageJson,
})
const audit = buildOtpVersionRenewalActivationGuardPhase47Audit({
  checkedAt,
  phase46Audit,
  packageJson,
})

assert.equal(audit.version, OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION)
assert.equal(audit.contract, OTP_VERSION_RENEWAL_ACTIVATION_GUARD_CONTRACT)
assert.equal(audit.status, OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 48)

for (const check of [
  'PHASE47_PHASE46_PUBLICATION_DRY_RUN_READY',
  'PHASE47_GOOD_ACTIVATION_GUARD_READY',
  'PHASE47_RESALE_AND_NEW_DEVELOPMENT_GUARDED_SEPARATELY',
  'PHASE47_NO_LIVE_WRITE_BEFORE_CONTROLLED_DRY_RUN',
  'PHASE47_BLOCKED_PHASE46_RECEIPT_REJECTED',
  'PHASE47_STALE_OPERATION_BLOCKED',
  'PHASE47_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE47_MISSING_ROUTE_BLOCKED',
  'PHASE47_DOCX_REGRESSION_BLOCKED',
  'PHASE47_OPERATOR_CONFIRMATION_MISMATCH_BLOCKED',
  'PHASE47_LIVE_MUTATION_BLOCKED',
  'PHASE47_ROLLBACK_CONTROL_BLOCKED',
  'PHASE47_MISSING_APPROVAL_BLOCKED',
  'PHASE47_FREEZE_WINDOW_BLOCKED',
  'PHASE47_MISSING_EVIDENCE_BLOCKED',
  'PHASE47_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodDryRun = phase46Audit.dryRunReceipts.find((receipt) => receipt.canCompletePublicationDryRun)
const blockedReceipt = buildOtpVersionRenewalActivationGuardReceipt({
  checkedAt,
  dryRunReceipt: goodDryRun,
  activationIntent: {
    operationId: '',
    operationType: 'manual_override',
    sourceDryRunId: 'wrong-dry-run',
    versionKey: 'wrong-version',
    previousVersionKey: 'wrong-previous-version',
    targetEnvironment: 'staging',
    dryRunFirst: false,
    requestedBy: '',
    productionWriteRequested: true,
    liveDefaultMutationRequested: true,
    signingDispatchRequested: true,
    allowPartialRouteActivation: true,
  },
})
assert.equal(blockedReceipt.canProceedToControlledActivationDryRun, false)
assert.ok(blockedReceipt.blockerCodes.includes('activation_operation_id_missing'))
assert.ok(blockedReceipt.blockerCodes.includes('activation_operation_type_invalid'))
assert.ok(blockedReceipt.blockerCodes.includes('activation_source_dry_run_mismatch'))
assert.ok(blockedReceipt.blockerCodes.includes('partial_route_activation_requested'))

const markdown = formatOtpVersionRenewalActivationGuardPhase47Markdown(audit)
for (const token of [
  'OTP Generator Phase 47 Version Renewal Activation Guard',
  'OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN',
  'route_activation_docx_source_observed:resale_existing_property',
  'Phase 48: Controlled Version Renewal Activation Dry Run',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP version renewal activation guard Phase 47 contract passed.')
