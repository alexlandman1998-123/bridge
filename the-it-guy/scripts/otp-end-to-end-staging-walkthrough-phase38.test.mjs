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
  OTP_END_TO_END_STAGING_WALKTHROUGH_CONTRACT,
  OTP_END_TO_END_STAGING_WALKTHROUGH_PHASE38_VERSION,
  OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS,
  buildOtpEndToEndStagingWalkthrough,
  buildOtpEndToEndStagingWalkthroughPhase38Audit,
  formatOtpEndToEndStagingWalkthroughPhase38Markdown,
} from '../src/core/documents/otpEndToEndStagingWalkthroughPhase38.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase38Source = await readFile(new URL('../src/core/documents/otpEndToEndStagingWalkthroughPhase38.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-end-to-end-staging-walkthrough-phase38'],
  'node scripts/otp-end-to-end-staging-walkthrough-phase38.test.mjs',
  'package.json should expose the OTP end-to-end staging walkthrough Phase 38 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-end-to-end-staging-walkthrough-phase38'],
  'node scripts/report-otp-end-to-end-staging-walkthrough-phase38.mjs',
  'package.json should expose the OTP end-to-end staging walkthrough Phase 38 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-end-to-end-staging-walkthrough-phase38'),
  'OTP vNext verification should include Phase 38 end-to-end staging walkthrough.',
)

assert.equal(OTP_END_TO_END_STAGING_WALKTHROUGH_PHASE38_VERSION, 'otp_end_to_end_staging_walkthrough_phase38_v1')
assert.equal(OTP_END_TO_END_STAGING_WALKTHROUGH_CONTRACT, 'otp-vnext-end-to-end-staging-walkthrough-phase38-v1')
assert.equal(OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS, 'OTP_END_TO_END_STAGING_WALKTHROUGH_READY_FOR_PILOT_GO_NO_GO')

const resaleWalkthrough = buildOtpEndToEndStagingWalkthrough({
  routeVariant: 'resale_existing_property',
  checkedAt: '2026-08-06T00:00:00.000Z',
})
assert.equal(resaleWalkthrough.version, OTP_END_TO_END_STAGING_WALKTHROUGH_PHASE38_VERSION)
assert.equal(resaleWalkthrough.contract, OTP_END_TO_END_STAGING_WALKTHROUGH_CONTRACT)
assert.equal(resaleWalkthrough.status, OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS)
assert.equal(resaleWalkthrough.canApproveStagingWalkthrough, true)
assert.deepEqual(
  resaleWalkthrough.stages.map((stage) => stage.key),
  [
    'agent_review',
    'generate_otp',
    'prepare_signing',
    'dispatch_guard',
    'signer_sessions',
    'completion_guard',
    'final_artifact_proof',
  ],
)
assert.equal(resaleWalkthrough.dryRunStageCount, 7)

const missingStageWalkthrough = buildOtpEndToEndStagingWalkthrough({
  routeVariant: 'resale_existing_property',
  stages: resaleWalkthrough.stages.filter((stage) => stage.key !== 'dispatch_guard'),
})
assert.equal(missingStageWalkthrough.canApproveStagingWalkthrough, false)
assert.ok(missingStageWalkthrough.blockerCodes.includes('missing_stage:dispatch_guard'))

const wrongVersionWalkthrough = buildOtpEndToEndStagingWalkthrough({
  routeVariant: 'resale_existing_property',
  stages: resaleWalkthrough.stages.map((stage) =>
    stage.key === 'signer_sessions' ? { ...stage, packetVersionId: 'wrong-version' } : stage,
  ),
})
assert.equal(wrongVersionWalkthrough.canApproveStagingWalkthrough, false)
assert.ok(wrongVersionWalkthrough.blockerCodes.includes('stage_version_mismatch:signer_sessions'))

const liveWriteWalkthrough = buildOtpEndToEndStagingWalkthrough({
  routeVariant: 'resale_existing_property',
  stages: resaleWalkthrough.stages.map((stage) =>
    stage.key === 'dispatch_guard' ? { ...stage, writeMode: 'live_write' } : stage,
  ),
})
assert.equal(liveWriteWalkthrough.canApproveStagingWalkthrough, false)
assert.ok(liveWriteWalkthrough.blockerCodes.includes('stage_not_dry_run:dispatch_guard'))

for (const token of [
  'agent_review',
  'generate_otp',
  'prepare_signing',
  'dispatch_guard',
  'signer_sessions',
  'completion_guard',
  'final_artifact_proof',
  'PHASE38_LIVE_WRITE_STAGE_BLOCKED',
]) {
  assert.ok(phase38Source.includes(token), `phase38 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-06T00:00:00.000Z',
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
  checkedAt: '2026-08-06T00:00:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-06T00:00:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt: '2026-08-06T00:00:00.000Z',
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt: '2026-08-06T00:00:00.000Z',
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
const phase36Audit = buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt: '2026-08-06T00:00:00.000Z',
  phase35Audit,
  packetServiceSource,
  packageJson,
})
const phase37Audit = buildOtpFinalSignedArtifactProofPhase37Audit({
  checkedAt: '2026-08-06T00:00:00.000Z',
  phase36Audit,
  packetServiceSource,
  packageJson,
})
const audit = buildOtpEndToEndStagingWalkthroughPhase38Audit({
  checkedAt: '2026-08-06T00:00:00.000Z',
  phase37Audit,
  packageJson,
})
assert.equal(audit.version, OTP_END_TO_END_STAGING_WALKTHROUGH_PHASE38_VERSION)
assert.equal(audit.status, OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 39)
for (const check of [
  'PHASE38_PHASE37_FINAL_ARTIFACT_PROOF_READY',
  'PHASE38_RESALE_AND_NEW_DEVELOPMENT_WALKTHROUGHS_PASS',
  'PHASE38_STAGE_ORDER_LOCKED',
  'PHASE38_ROUTE_PACKET_VERSION_BINDING_LOCKED',
  'PHASE38_STAGING_NO_WRITE_MODE_LOCKED',
  'PHASE38_COMPLETION_AND_FINAL_ARTIFACT_PROOF_INCLUDED',
  'PHASE38_MISSING_STAGE_BLOCKED',
  'PHASE38_WRONG_VERSION_STAGE_BLOCKED',
  'PHASE38_LIVE_WRITE_STAGE_BLOCKED',
  'PHASE38_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpEndToEndStagingWalkthroughPhase38Markdown(audit)
for (const token of [
  'OTP Generator Phase 38 End-to-End Staging Walkthrough',
  'OTP_END_TO_END_STAGING_WALKTHROUGH_READY_FOR_PILOT_GO_NO_GO',
  'agent_review',
  'Phase 39: Pilot Go/No-Go Evidence Review',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP end-to-end staging walkthrough Phase 38 contract passed.')
