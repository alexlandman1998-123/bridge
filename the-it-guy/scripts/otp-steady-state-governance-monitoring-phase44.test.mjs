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
  OTP_STEADY_STATE_GOVERNANCE_MONITORING_CONTRACT,
  OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION,
  OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS,
  buildOtpSteadyStateGovernanceMonitoringPhase44Audit,
  buildOtpSteadyStateGovernanceMonitoringReceipt,
  formatOtpSteadyStateGovernanceMonitoringPhase44Markdown,
} from '../src/core/documents/otpSteadyStateGovernanceMonitoringPhase44.js'

const checkedAt = '2026-08-06T05:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase44Source = await readFile(new URL('../src/core/documents/otpSteadyStateGovernanceMonitoringPhase44.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-steady-state-governance-monitoring-phase44'],
  'node scripts/otp-steady-state-governance-monitoring-phase44.test.mjs',
  'package.json should expose the OTP steady-state governance monitoring Phase 44 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-steady-state-governance-monitoring-phase44'],
  'node scripts/report-otp-steady-state-governance-monitoring-phase44.mjs',
  'package.json should expose the OTP steady-state governance monitoring Phase 44 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-steady-state-governance-monitoring-phase44'),
  'OTP vNext verification should include Phase 44 steady-state governance monitoring.',
)

assert.equal(OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION, 'otp_steady_state_governance_monitoring_phase44_v1')
assert.equal(OTP_STEADY_STATE_GOVERNANCE_MONITORING_CONTRACT, 'otp-vnext-steady-state-governance-monitoring-phase44-v1')
assert.equal(OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS, 'OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_FOR_CHANGE_CONTROL')

for (const token of [
  'PHASE44_STALE_CYCLE_BLOCKED',
  'PHASE44_ROUTE_DRIFT_BLOCKED',
  'PHASE44_DOCX_REGRESSION_BLOCKED',
  'PHASE44_LEGAL_REVIEW_EXPIRY_BLOCKED',
  'PHASE44_ARCHIVE_INTEGRITY_BLOCKED',
  'PHASE44_CHANGE_CONTROL_QUEUE_BLOCKED',
]) {
  assert.ok(phase44Source.includes(token), `phase44 source should include ${token}`)
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
const audit = buildOtpSteadyStateGovernanceMonitoringPhase44Audit({
  checkedAt,
  phase43Audit,
  packageJson,
})

assert.equal(audit.version, OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION)
assert.equal(audit.contract, OTP_STEADY_STATE_GOVERNANCE_MONITORING_CONTRACT)
assert.equal(audit.status, OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 45)

for (const check of [
  'PHASE44_PHASE43_ARCHIVE_READY',
  'PHASE44_GOOD_MONITORING_READY',
  'PHASE44_REQUIRED_SIGNALS_GREEN',
  'PHASE44_BOTH_ROUTES_MONITORED',
  'PHASE44_REVIEW_ATTESTATIONS_CAPTURED',
  'PHASE44_STALE_CYCLE_BLOCKED',
  'PHASE44_ROUTE_DRIFT_BLOCKED',
  'PHASE44_DOCX_REGRESSION_BLOCKED',
  'PHASE44_LEGAL_REVIEW_EXPIRY_BLOCKED',
  'PHASE44_ARCHIVE_INTEGRITY_BLOCKED',
  'PHASE44_INCIDENTS_BLOCKED',
  'PHASE44_ROLLBACK_RETENTION_BLOCKED',
  'PHASE44_CHANGE_CONTROL_QUEUE_BLOCKED',
  'PHASE44_MISSING_ATTESTATION_BLOCKED',
  'PHASE44_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodArchive = phase43Audit.archiveReceipts.find((receipt) => receipt.canArchiveReleaseCloseout)
const blockedReceipt = buildOtpSteadyStateGovernanceMonitoringReceipt({
  checkedAt,
  closeoutArchive: goodArchive,
  monitoringSignals: [
    { key: 'route_default_stability', status: 'red', owner: '', evidencePath: '' },
  ],
})
assert.equal(blockedReceipt.canContinueSteadyStateGovernance, false)
assert.ok(blockedReceipt.blockerCodes.includes('missing_monitoring_signal:signing_envelope_stability'))
assert.ok(blockedReceipt.blockerCodes.includes('monitoring_signal_not_green:route_default_stability'))

const markdown = formatOtpSteadyStateGovernanceMonitoringPhase44Markdown(audit)
for (const token of [
  'OTP Generator Phase 44 Steady-State Governance Monitoring',
  'OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_FOR_CHANGE_CONTROL',
  'steady_state_docx_source_observed:new_development',
  'Phase 45: Template Change Control And Version Renewal',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP steady-state governance monitoring Phase 44 contract passed.')
