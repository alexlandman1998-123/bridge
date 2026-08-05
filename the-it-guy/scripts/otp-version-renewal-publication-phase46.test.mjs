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
  OTP_VERSION_RENEWAL_PUBLICATION_CONTRACT,
  OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION,
  OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS,
  buildOtpVersionRenewalPublicationPhase46Audit,
  buildOtpVersionRenewalPublicationReceipt,
  formatOtpVersionRenewalPublicationPhase46Markdown,
} from '../src/core/documents/otpVersionRenewalPublicationPhase46.js'

const checkedAt = '2026-08-06T07:15:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase46Source = await readFile(new URL('../src/core/documents/otpVersionRenewalPublicationPhase46.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-version-renewal-publication-phase46'],
  'node scripts/otp-version-renewal-publication-phase46.test.mjs',
  'package.json should expose the OTP version renewal publication Phase 46 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-version-renewal-publication-phase46'],
  'node scripts/report-otp-version-renewal-publication-phase46.mjs',
  'package.json should expose the OTP version renewal publication Phase 46 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-publication-phase46'),
  'OTP vNext verification should include Phase 46 version renewal publication.',
)

assert.equal(OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION, 'otp_version_renewal_publication_phase46_v1')
assert.equal(OTP_VERSION_RENEWAL_PUBLICATION_CONTRACT, 'otp-vnext-version-renewal-publication-phase46-v1')
assert.equal(OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS, 'OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_READY_FOR_ACTIVATION_GUARD')

for (const token of [
  'PHASE46_PHASE45_BLOCKED_RECEIPT_REJECTED',
  'PHASE46_MISSING_ROUTE_BLOCKED',
  'PHASE46_DOCX_REGRESSION_BLOCKED',
  'PHASE46_VERSION_COLLISION_BLOCKED',
  'PHASE46_LIVE_MUTATION_BLOCKED',
  'PHASE46_SIGNING_ENVELOPE_MISMATCH_BLOCKED',
]) {
  assert.ok(phase46Source.includes(token), `phase46 source should include ${token}`)
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
const audit = buildOtpVersionRenewalPublicationPhase46Audit({
  checkedAt,
  phase45Audit,
  packageJson,
})

assert.equal(audit.version, OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION)
assert.equal(audit.contract, OTP_VERSION_RENEWAL_PUBLICATION_CONTRACT)
assert.equal(audit.status, OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 47)

for (const check of [
  'PHASE46_PHASE45_CHANGE_CONTROL_READY',
  'PHASE46_GOOD_DRY_RUN_PUBLICATION_READY',
  'PHASE46_RESALE_AND_NEW_DEVELOPMENT_STAGED_SEPARATELY',
  'PHASE46_DRY_RUN_DOES_NOT_MUTATE_LIVE_DEFAULTS',
  'PHASE46_GENERATED_PROOF_AND_SCANNER_EVIDENCE_PRESENT',
  'PHASE46_SIGNING_ENVELOPES_ALIGNED',
  'PHASE46_PHASE45_BLOCKED_RECEIPT_REJECTED',
  'PHASE46_MISSING_ROUTE_BLOCKED',
  'PHASE46_DOCX_REGRESSION_BLOCKED',
  'PHASE46_VERSION_COLLISION_BLOCKED',
  'PHASE46_LIVE_MUTATION_BLOCKED',
  'PHASE46_SIGNING_ENVELOPE_MISMATCH_BLOCKED',
  'PHASE46_MISSING_EVIDENCE_BLOCKED',
  'PHASE46_ROLLBACK_SNAPSHOT_BLOCKED',
  'PHASE46_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodChangeControl = phase45Audit.changeReceipts.find((receipt) => receipt.canPrepareVersionRenewal)
const blockedReceipt = buildOtpVersionRenewalPublicationReceipt({
  checkedAt,
  changeControlReceipt: goodChangeControl,
  publicationDryRunPlan: {
    dryRunId: '',
    sourceChangeRequestId: 'wrong-change',
    publicationMode: 'production_write',
    targetEnvironment: 'production',
    productionWriteRequested: true,
    liveDefaultMutationRequested: true,
    signingDispatchRequested: true,
  },
})
assert.equal(blockedReceipt.canCompletePublicationDryRun, false)
assert.ok(blockedReceipt.blockerCodes.includes('dry_run_id_missing'))
assert.ok(blockedReceipt.blockerCodes.includes('source_change_request_mismatch'))
assert.ok(blockedReceipt.blockerCodes.includes('publication_production_write_requested'))

const markdown = formatOtpVersionRenewalPublicationPhase46Markdown(audit)
for (const token of [
  'OTP Generator Phase 46 Version Renewal Publication Dry Run',
  'OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_READY_FOR_ACTIVATION_GUARD',
  'route_publication_docx_source_observed:resale_existing_property',
  'Phase 47: Version Renewal Activation Guard',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP version renewal publication Phase 46 contract passed.')
