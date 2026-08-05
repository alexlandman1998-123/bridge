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
  OTP_POST_CUTOVER_MONITORING_CONTRACT,
  OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION,
  OTP_POST_CUTOVER_MONITORING_READY_STATUS,
  buildOtpPostCutoverMonitoringPhase41Audit,
  buildOtpPostCutoverMonitoringWatch,
  formatOtpPostCutoverMonitoringPhase41Markdown,
} from '../src/core/documents/otpPostCutoverMonitoringPhase41.js'

const checkedAt = '2026-08-06T02:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase41Source = await readFile(new URL('../src/core/documents/otpPostCutoverMonitoringPhase41.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-post-cutover-monitoring-phase41'],
  'node scripts/otp-post-cutover-monitoring-phase41.test.mjs',
  'package.json should expose the OTP post-cutover monitoring Phase 41 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-post-cutover-monitoring-phase41'],
  'node scripts/report-otp-post-cutover-monitoring-phase41.mjs',
  'package.json should expose the OTP post-cutover monitoring Phase 41 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-post-cutover-monitoring-phase41'),
  'OTP vNext verification should include Phase 41 post-cutover monitoring.',
)

assert.equal(OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION, 'otp_post_cutover_monitoring_phase41_v1')
assert.equal(OTP_POST_CUTOVER_MONITORING_CONTRACT, 'otp-vnext-post-cutover-monitoring-phase41-v1')
assert.equal(OTP_POST_CUTOVER_MONITORING_READY_STATUS, 'OTP_POST_CUTOVER_MONITORING_READY_FOR_STABILISATION_SIGNOFF')

for (const token of [
  'PHASE41_ROUTE_DRIFT_TRIGGERS_ROLLBACK',
  'PHASE41_SIGNING_FAILURE_TRIGGERS_ROLLBACK',
  'PHASE41_ROLLBACK_UNAVAILABLE_BLOCKED',
  'PHASE41_DOCX_SOURCE_TRIGGERS_ROLLBACK',
  'PHASE41_UNBOUNDED_WINDOW_BLOCKED',
  'rollback_trigger',
]) {
  assert.ok(phase41Source.includes(token), `phase41 source should include ${token}`)
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
const audit = buildOtpPostCutoverMonitoringPhase41Audit({
  checkedAt,
  phase40Audit,
  packageJson,
})

assert.equal(audit.version, OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION)
assert.equal(audit.contract, OTP_POST_CUTOVER_MONITORING_CONTRACT)
assert.equal(audit.status, OTP_POST_CUTOVER_MONITORING_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 42)

for (const check of [
  'PHASE41_PHASE40_CUTOVER_RECEIPT_READY',
  'PHASE41_GOOD_WATCH_CAN_CONTINUE',
  'PHASE41_MONITORING_WINDOW_BOUNDED',
  'PHASE41_BOTH_ROUTES_MONITORED',
  'PHASE41_ROUTE_DEFAULTS_STABLE',
  'PHASE41_SIGNING_AND_ARTIFACT_HEALTHY',
  'PHASE41_ROLLBACK_WATCH_ARMED',
  'PHASE41_ROUTE_DRIFT_TRIGGERS_ROLLBACK',
  'PHASE41_SIGNING_FAILURE_TRIGGERS_ROLLBACK',
  'PHASE41_ROLLBACK_UNAVAILABLE_BLOCKED',
  'PHASE41_DOCX_SOURCE_TRIGGERS_ROLLBACK',
  'PHASE41_UNBOUNDED_WINDOW_BLOCKED',
  'PHASE41_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const blockedWatch = buildOtpPostCutoverMonitoringWatch({
  checkedAt,
  cutoverReceipt: phase40Audit.receipts.find((receipt) => receipt.canExecuteControlledCutover),
  incidentSignals: {
    criticalCount: 1,
    generationFailureCount: 0,
    signingFailureCount: 0,
    signerScopeViolationCount: 0,
    finalArtifactFailureCount: 0,
    routeDriftCount: 0,
    docxReferenceCount: 0,
  },
})
assert.equal(blockedWatch.canContinuePostCutover, false)
assert.equal(blockedWatch.shouldTriggerRollback, true)
assert.ok(blockedWatch.blockerCodes.includes('critical_incident_signal_observed'))

const markdown = formatOtpPostCutoverMonitoringPhase41Markdown(audit)
for (const token of [
  'OTP Generator Phase 41 Post-Cutover Monitoring And Rollback Watch',
  'OTP_POST_CUTOVER_MONITORING_READY_FOR_STABILISATION_SIGNOFF',
  'rollback_trigger:template_default_drift:resale_existing_property',
  'Phase 42: Production Stabilisation Signoff',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP post-cutover monitoring Phase 41 contract passed.')
