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
  OTP_TEMPLATE_CHANGE_CONTROL_CONTRACT,
  OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION,
  OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS,
  buildOtpTemplateChangeControlPhase45Audit,
  buildOtpTemplateChangeControlReceipt,
  formatOtpTemplateChangeControlPhase45Markdown,
} from '../src/core/documents/otpTemplateChangeControlPhase45.js'

const checkedAt = '2026-08-06T06:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase45Source = await readFile(new URL('../src/core/documents/otpTemplateChangeControlPhase45.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-change-control-phase45'],
  'node scripts/otp-template-change-control-phase45.test.mjs',
  'package.json should expose the OTP template change control Phase 45 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-change-control-phase45'],
  'node scripts/report-otp-template-change-control-phase45.mjs',
  'package.json should expose the OTP template change control Phase 45 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-change-control-phase45'),
  'OTP vNext verification should include Phase 45 template change control.',
)

assert.equal(OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION, 'otp_template_change_control_phase45_v1')
assert.equal(OTP_TEMPLATE_CHANGE_CONTROL_CONTRACT, 'otp-vnext-template-change-control-phase45-v1')
assert.equal(OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS, 'OTP_TEMPLATE_CHANGE_CONTROL_READY_FOR_VERSION_RENEWAL_DRY_RUN')

for (const token of [
  'PHASE45_UNAPPROVED_CHANGE_BLOCKED',
  'PHASE45_MISSING_ROUTE_IMPACT_BLOCKED',
  'PHASE45_DOCX_SOURCE_BLOCKED',
  'PHASE45_VERSION_COLLISION_BLOCKED',
  'PHASE45_LEGAL_HOLD_BLOCKED',
  'PHASE45_PRODUCTION_WRITE_BLOCKED',
]) {
  assert.ok(phase45Source.includes(token), `phase45 source should include ${token}`)
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
const audit = buildOtpTemplateChangeControlPhase45Audit({
  checkedAt,
  phase44Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_CHANGE_CONTROL_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 46)

for (const check of [
  'PHASE45_PHASE44_GOVERNANCE_READY',
  'PHASE45_GOOD_CHANGE_CONTROL_READY',
  'PHASE45_BOTH_ROUTE_IMPACTS_REVIEWED',
  'PHASE45_REQUIRED_TEST_EVIDENCE_CAPTURED',
  'PHASE45_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE45_UNAPPROVED_CHANGE_BLOCKED',
  'PHASE45_MISSING_ROUTE_IMPACT_BLOCKED',
  'PHASE45_DOCX_SOURCE_BLOCKED',
  'PHASE45_VERSION_COLLISION_BLOCKED',
  'PHASE45_LEGAL_HOLD_BLOCKED',
  'PHASE45_MISSING_EVIDENCE_BLOCKED',
  'PHASE45_ROLLBACK_PLAN_BLOCKED',
  'PHASE45_PRODUCTION_WRITE_BLOCKED',
  'PHASE45_MISSING_APPROVAL_BLOCKED',
  'PHASE45_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodMonitoring = phase44Audit.monitoringReceipts.find((receipt) => receipt.canContinueSteadyStateGovernance)
const blockedReceipt = buildOtpTemplateChangeControlReceipt({
  checkedAt,
  steadyStateMonitoring: goodMonitoring,
  changeRequest: {
    changeRequestId: '',
    status: 'draft',
    productionWriteRequested: true,
    emergencyOverride: true,
  },
})
assert.equal(blockedReceipt.canPrepareVersionRenewal, false)
assert.ok(blockedReceipt.blockerCodes.includes('change_request_id_missing'))
assert.ok(blockedReceipt.blockerCodes.includes('change_request_emergency_override_not_allowed'))

const markdown = formatOtpTemplateChangeControlPhase45Markdown(audit)
for (const token of [
  'OTP Generator Phase 45 Template Change Control And Version Renewal',
  'OTP_TEMPLATE_CHANGE_CONTROL_READY_FOR_VERSION_RENEWAL_DRY_RUN',
  'route_impact_docx_source_observed:resale_existing_property',
  'Phase 46: Version Renewal Publication Dry Run',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template change control Phase 45 contract passed.')
