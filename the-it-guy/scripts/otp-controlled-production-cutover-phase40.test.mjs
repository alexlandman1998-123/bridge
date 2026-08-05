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
  buildOtpProductionReleaseDecisionPack,
  buildOtpProductionReleaseDecisionPhase39Audit,
} from '../src/core/documents/otpProductionReleaseDecisionPhase39.js'
import {
  OTP_CONTROLLED_PRODUCTION_CUTOVER_CONTRACT,
  OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION,
  OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS,
  buildOtpControlledProductionCutoverPhase40Audit,
  buildOtpControlledProductionCutoverReceipt,
  formatOtpControlledProductionCutoverPhase40Markdown,
} from '../src/core/documents/otpControlledProductionCutoverPhase40.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase40Source = await readFile(new URL('../src/core/documents/otpControlledProductionCutoverPhase40.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-controlled-production-cutover-phase40'],
  'node scripts/otp-controlled-production-cutover-phase40.test.mjs',
  'package.json should expose the OTP controlled production cutover Phase 40 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-controlled-production-cutover-phase40'],
  'node scripts/report-otp-controlled-production-cutover-phase40.mjs',
  'package.json should expose the OTP controlled production cutover Phase 40 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-controlled-production-cutover-phase40'),
  'OTP vNext verification should include Phase 40 controlled production cutover.',
)

assert.equal(OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION, 'otp_controlled_production_cutover_phase40_v1')
assert.equal(OTP_CONTROLLED_PRODUCTION_CUTOVER_CONTRACT, 'otp-vnext-controlled-production-cutover-phase40-v1')
assert.equal(OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS, 'OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_FOR_OPERATOR_EXECUTION')

const approvedPack = buildOtpProductionReleaseDecisionPack({
  checkedAt: '2026-08-06T01:00:00.000Z',
  attorneyApprovals: [
    {
      routeVariant: 'resale_existing_property',
      approvalStatus: 'approved',
      approvalReference: 'attorney-approval-resale',
      required: true,
    },
    {
      routeVariant: 'new_development',
      approvalStatus: 'approved',
      approvalReference: 'attorney-approval-new-development',
      required: true,
    },
  ],
  operatorApprovalReference: 'operator-release-approval',
})
const approvedReceipt = buildOtpControlledProductionCutoverReceipt({
  checkedAt: '2026-08-06T01:00:00.000Z',
  releaseDecisionPack: approvedPack,
  operation: {
    operationKey: 'activate_otp_vnext_production_defaults',
    environment: 'production',
    executionMode: 'controlled_production_cutover',
    mutationMode: 'operator_receipt_only',
    operatorConfirmation: 'CONFIRM_OTP_PRODUCTION_CUTOVER',
    operatorApprovalReference: 'operator-release-approval',
    flags: approvedPack.flags,
    templateDefaultUpdates: approvedPack.templateDefaults,
    routeEnvelopeUpdates: approvedPack.routeSeparation,
    rollbackPlan: approvedPack.rollbackPlan,
    evidenceLinks: approvedPack.evidenceLinks,
  },
})
assert.equal(approvedReceipt.version, OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION)
assert.equal(approvedReceipt.contract, OTP_CONTROLLED_PRODUCTION_CUTOVER_CONTRACT)
assert.equal(approvedReceipt.status, OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS)
assert.equal(approvedReceipt.canExecuteControlledCutover, true)
assert.equal(approvedReceipt.mutatedData, false)

const conditionalPack = buildOtpProductionReleaseDecisionPack({
  checkedAt: '2026-08-06T01:00:00.000Z',
  operatorApprovalReference: 'operator-release-approval',
})
const conditionalReceipt = buildOtpControlledProductionCutoverReceipt({
  releaseDecisionPack: conditionalPack,
  operation: {
    ...approvedReceipt,
    operationKey: 'activate_otp_vnext_production_defaults',
    environment: 'production',
    executionMode: 'controlled_production_cutover',
    mutationMode: 'operator_receipt_only',
    operatorConfirmation: 'CONFIRM_OTP_PRODUCTION_CUTOVER',
    operatorApprovalReference: 'operator-release-approval',
    flags: conditionalPack.flags,
    templateDefaultUpdates: conditionalPack.templateDefaults,
    routeEnvelopeUpdates: conditionalPack.routeSeparation,
    rollbackPlan: conditionalPack.rollbackPlan,
    evidenceLinks: conditionalPack.evidenceLinks,
  },
})
assert.equal(conditionalReceipt.canExecuteControlledCutover, false)
assert.ok(conditionalReceipt.blockerCodes.includes('release_pack_has_legal_approval_holds'))

const missingConfirmationReceipt = buildOtpControlledProductionCutoverReceipt({
  releaseDecisionPack: approvedPack,
  operation: {
    operationKey: 'activate_otp_vnext_production_defaults',
    environment: 'production',
    executionMode: 'controlled_production_cutover',
    mutationMode: 'operator_receipt_only',
    operatorConfirmation: '',
    operatorApprovalReference: 'operator-release-approval',
    flags: approvedPack.flags,
    templateDefaultUpdates: approvedPack.templateDefaults,
    routeEnvelopeUpdates: approvedPack.routeSeparation,
    rollbackPlan: approvedPack.rollbackPlan,
    evidenceLinks: approvedPack.evidenceLinks,
  },
})
assert.equal(missingConfirmationReceipt.canExecuteControlledCutover, false)
assert.ok(missingConfirmationReceipt.blockerCodes.includes('missing_operator_cutover_confirmation'))

for (const token of [
  'PHASE40_CONDITIONAL_LEGAL_HOLD_BLOCKED',
  'PHASE40_OPERATOR_CONFIRMATION_REQUIRED',
  'PHASE40_ROUTE_TEMPLATE_MISMATCH_BLOCKED',
  'PHASE40_ROLLBACK_MISMATCH_BLOCKED',
  'PHASE40_DOCX_SOURCE_BLOCKED',
  'operator_receipt_only',
]) {
  assert.ok(phase40Source.includes(token), `phase40 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
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
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
const phase36Audit = buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase35Audit,
  packetServiceSource,
  packageJson,
})
const phase37Audit = buildOtpFinalSignedArtifactProofPhase37Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase36Audit,
  packetServiceSource,
  packageJson,
})
const phase38Audit = buildOtpEndToEndStagingWalkthroughPhase38Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase37Audit,
  packageJson,
})
const phase39Audit = buildOtpProductionReleaseDecisionPhase39Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase38Audit,
  packageJson,
})
const audit = buildOtpControlledProductionCutoverPhase40Audit({
  checkedAt: '2026-08-06T01:00:00.000Z',
  phase39Audit,
  packageJson,
})
assert.equal(audit.version, OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION)
assert.equal(audit.status, OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 41)
for (const check of [
  'PHASE40_PHASE39_RELEASE_DECISION_READY',
  'PHASE40_APPROVED_PACK_EXECUTION_RECEIPT_READY',
  'PHASE40_CONDITIONAL_LEGAL_HOLD_BLOCKED',
  'PHASE40_OPERATOR_CONFIRMATION_REQUIRED',
  'PHASE40_ROUTE_TEMPLATE_MISMATCH_BLOCKED',
  'PHASE40_ROLLBACK_MISMATCH_BLOCKED',
  'PHASE40_DOCX_SOURCE_BLOCKED',
  'PHASE40_EXACT_OPERATION_LOCKED',
  'PHASE40_EXECUTION_RECEIPT_NO_DATA_MUTATION',
  'PHASE40_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpControlledProductionCutoverPhase40Markdown(audit)
for (const token of [
  'OTP Generator Phase 40 Controlled Production Cutover Execution',
  'OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_FOR_OPERATOR_EXECUTION',
  'release_pack_has_legal_approval_holds',
  'Phase 41: Post-Cutover Monitoring And Rollback Watch',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP controlled production cutover Phase 40 contract passed.')
