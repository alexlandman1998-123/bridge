import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildOtpAgentReviewUiPhase31Audit } from '../src/core/documents/otpAgentReviewUiPhase31.js'
import { buildOtpAgentReviewRuntimeProofPhase32Audit } from '../src/core/documents/otpAgentReviewRuntimeProofPhase32.js'
import { buildOtpAgentReviewSigningAlignmentPhase33Audit } from '../src/core/documents/otpAgentReviewSigningEnvelopeAlignmentPhase33.js'
import { buildOtpAgentReviewDispatchGuardPhase34Audit } from '../src/core/documents/otpAgentReviewDispatchGuardPhase34.js'
import { buildOtpAgentReviewSignerSessionPhase35Audit } from '../src/core/documents/otpAgentReviewSignerSessionPhase35.js'
import { buildOtpAgentReviewCompletionGuardPhase36Audit } from '../src/core/documents/otpAgentReviewCompletionGuardPhase36.js'
import { buildOtpFinalSignedArtifactProofPhase37Audit } from '../src/core/documents/otpFinalSignedArtifactProofPhase37.js'
import { buildOtpEndToEndStagingWalkthroughPhase38Audit } from '../src/core/documents/otpEndToEndStagingWalkthroughPhase38.js'
import { buildOtpProductionReleaseDecisionPhase39Audit } from '../src/core/documents/otpProductionReleaseDecisionPhase39.js'
import { buildOtpControlledProductionCutoverPhase40Audit } from '../src/core/documents/otpControlledProductionCutoverPhase40.js'
import { buildOtpPostCutoverMonitoringPhase41Audit } from '../src/core/documents/otpPostCutoverMonitoringPhase41.js'
import { buildOtpProductionStabilisationSignoffPhase42Audit } from '../src/core/documents/otpProductionStabilisationSignoffPhase42.js'
import { buildOtpReleaseCloseoutArchivePhase43Audit } from '../src/core/documents/otpReleaseCloseoutArchivePhase43.js'
import { buildOtpSteadyStateGovernanceMonitoringPhase44Audit } from '../src/core/documents/otpSteadyStateGovernanceMonitoringPhase44.js'
import { buildOtpTemplateChangeControlPhase45Audit } from '../src/core/documents/otpTemplateChangeControlPhase45.js'
import { buildOtpVersionRenewalPublicationPhase46Audit } from '../src/core/documents/otpVersionRenewalPublicationPhase46.js'
import { buildOtpVersionRenewalActivationGuardPhase47Audit } from '../src/core/documents/otpVersionRenewalActivationGuardPhase47.js'
import {
  OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_CONTRACT,
  OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION,
  OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS,
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
  buildOtpControlledVersionRenewalActivationDryRunReceipt,
  formatOtpControlledVersionRenewalActivationDryRunPhase48Markdown,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'

const checkedAt = '2026-08-06T08:45:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase48Source = await readFile(new URL('../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-controlled-version-renewal-activation-dry-run-phase48'],
  'node scripts/otp-controlled-version-renewal-activation-dry-run-phase48.test.mjs',
  'package.json should expose the OTP controlled version renewal activation dry-run Phase 48 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-controlled-version-renewal-activation-dry-run-phase48'],
  'node scripts/report-otp-controlled-version-renewal-activation-dry-run-phase48.mjs',
  'package.json should expose the OTP controlled version renewal activation dry-run Phase 48 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-controlled-version-renewal-activation-dry-run-phase48'),
  'OTP vNext verification should include Phase 48 controlled version renewal activation dry-run.',
)

assert.equal(OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION, 'otp_controlled_version_renewal_activation_dry_run_phase48_v1')
assert.equal(OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_CONTRACT, 'otp-vnext-controlled-version-renewal-activation-dry-run-phase48-v1')
assert.equal(OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS, 'OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_FOR_ACTIVATION_RECEIPT')

for (const token of [
  'PHASE48_BLOCKED_PHASE47_GUARD_REJECTED',
  'PHASE48_OPERATION_MISMATCH_BLOCKED',
  'PHASE48_ROUTE_OUTPUT_MISMATCH_BLOCKED',
  'PHASE48_DOCX_REGRESSION_BLOCKED',
  'PHASE48_LIVE_MUTATION_BLOCKED',
  'PHASE48_POST_VALIDATION_BLOCKED',
]) {
  assert.ok(phase48Source.includes(token), `phase48 source should include ${token}`)
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
const phase32Audit = buildOtpAgentReviewRuntimeProofPhase32Audit({ checkedAt, phase31Audit, packetServiceSource, workspaceSource, packageJson })
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({ checkedAt, phase31Audit, phase32Audit, packetServiceSource, packageJson })
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({ checkedAt, phase33Audit, packetServiceSource, workspaceSource, packageJson })
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({ checkedAt, phase34Audit, signerPortalSource, externalSigningApiSource, signingSessionContractSource, packageJson })
const phase36Audit = buildOtpAgentReviewCompletionGuardPhase36Audit({ checkedAt, phase35Audit, packetServiceSource, packageJson })
const phase37Audit = buildOtpFinalSignedArtifactProofPhase37Audit({ checkedAt, phase36Audit, packetServiceSource, packageJson })
const phase38Audit = buildOtpEndToEndStagingWalkthroughPhase38Audit({ checkedAt, phase37Audit, packageJson })
const phase39Audit = buildOtpProductionReleaseDecisionPhase39Audit({ checkedAt, phase38Audit, packageJson })
const phase40Audit = buildOtpControlledProductionCutoverPhase40Audit({ checkedAt, phase39Audit, packageJson })
const phase41Audit = buildOtpPostCutoverMonitoringPhase41Audit({ checkedAt, phase40Audit, packageJson })
const phase42Audit = buildOtpProductionStabilisationSignoffPhase42Audit({ checkedAt, phase41Audit, packageJson })
const phase43Audit = buildOtpReleaseCloseoutArchivePhase43Audit({ checkedAt, phase42Audit, packageJson })
const phase44Audit = buildOtpSteadyStateGovernanceMonitoringPhase44Audit({ checkedAt, phase43Audit, packageJson })
const phase45Audit = buildOtpTemplateChangeControlPhase45Audit({ checkedAt, phase44Audit, packageJson })
const phase46Audit = buildOtpVersionRenewalPublicationPhase46Audit({ checkedAt, phase45Audit, packageJson })
const phase47Audit = buildOtpVersionRenewalActivationGuardPhase47Audit({ checkedAt, phase46Audit, packageJson })
const audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({
  checkedAt,
  phase47Audit,
  packageJson,
})

assert.equal(audit.version, OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION)
assert.equal(audit.contract, OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_CONTRACT)
assert.equal(audit.status, OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 49)

for (const check of [
  'PHASE48_PHASE47_ACTIVATION_GUARD_READY',
  'PHASE48_GOOD_CONTROLLED_ACTIVATION_DRY_RUN_READY',
  'PHASE48_RESALE_AND_NEW_DEVELOPMENT_SIMULATED_SEPARATELY',
  'PHASE48_NO_LIVE_WRITE_OR_POINTER_MUTATION',
  'PHASE48_BLOCKED_PHASE47_GUARD_REJECTED',
  'PHASE48_OPERATION_MISMATCH_BLOCKED',
  'PHASE48_MISSING_ROUTE_BLOCKED',
  'PHASE48_ROUTE_OUTPUT_MISMATCH_BLOCKED',
  'PHASE48_DOCX_REGRESSION_BLOCKED',
  'PHASE48_LIVE_MUTATION_BLOCKED',
  'PHASE48_POST_VALIDATION_BLOCKED',
  'PHASE48_ROLLBACK_REHEARSAL_BLOCKED',
  'PHASE48_MISSING_EVIDENCE_BLOCKED',
  'PHASE48_MISSING_AUDIT_EVENT_BLOCKED',
  'PHASE48_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodGuard = phase47Audit.guardReceipts.find((receipt) => receipt.canProceedToControlledActivationDryRun)
const blockedReceipt = buildOtpControlledVersionRenewalActivationDryRunReceipt({
  checkedAt,
  activationGuardReceipt: goodGuard,
  activationSimulationPlan: {
    simulationId: '',
    sourceGuardOperationId: 'wrong-operation',
    operationType: 'manual_override',
    versionKey: 'wrong-version',
    previousVersionKey: 'wrong-previous-version',
    targetEnvironment: 'staging',
    operator: 'wrong-operator',
    dryRunOnly: false,
    productionWriteRequested: true,
    liveDefaultMutationRequested: true,
    signingDispatchRequested: true,
  },
})
assert.equal(blockedReceipt.canIssueActivationReceipt, false)
assert.ok(blockedReceipt.blockerCodes.includes('activation_simulation_id_missing'))
assert.ok(blockedReceipt.blockerCodes.includes('activation_guard_operation_mismatch'))
assert.ok(blockedReceipt.blockerCodes.includes('activation_simulation_operation_type_invalid'))
assert.ok(blockedReceipt.blockerCodes.includes('activation_simulation_production_write_requested'))

const markdown = formatOtpControlledVersionRenewalActivationDryRunPhase48Markdown(audit)
for (const token of [
  'OTP Generator Phase 48 Controlled Version Renewal Activation Dry Run',
  'OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_FOR_ACTIVATION_RECEIPT',
  'route_simulation_docx_source_observed:resale_existing_property',
  'Phase 49: Version Renewal Activation Receipt',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP controlled version renewal activation dry-run Phase 48 contract passed.')
