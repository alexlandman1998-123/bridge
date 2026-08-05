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
  OTP_PRODUCTION_RELEASE_DECISION_CONTRACT,
  OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION,
  OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS,
  buildOtpProductionReleaseDecisionPack,
  buildOtpProductionReleaseDecisionPhase39Audit,
  formatOtpProductionReleaseDecisionPhase39Markdown,
} from '../src/core/documents/otpProductionReleaseDecisionPhase39.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase39Source = await readFile(new URL('../src/core/documents/otpProductionReleaseDecisionPhase39.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-production-release-decision-phase39'],
  'node scripts/otp-production-release-decision-phase39.test.mjs',
  'package.json should expose the OTP production release decision Phase 39 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-production-release-decision-phase39'],
  'node scripts/report-otp-production-release-decision-phase39.mjs',
  'package.json should expose the OTP production release decision Phase 39 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-production-release-decision-phase39'),
  'OTP vNext verification should include Phase 39 production release decision.',
)

assert.equal(OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION, 'otp_production_release_decision_phase39_v1')
assert.equal(OTP_PRODUCTION_RELEASE_DECISION_CONTRACT, 'otp-vnext-production-release-decision-phase39-v1')
assert.equal(OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS, 'OTP_PRODUCTION_RELEASE_DECISION_READY_FOR_MANUAL_SIGNOFF')

const approvedPack = buildOtpProductionReleaseDecisionPack({
  checkedAt: '2026-08-06T00:30:00.000Z',
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
assert.equal(approvedPack.version, OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION)
assert.equal(approvedPack.status, OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS)
assert.equal(approvedPack.releaseDecision, 'go_for_controlled_cutover')
assert.equal(approvedPack.canCutoverProduction, true)

const pendingAttorneyPack = buildOtpProductionReleaseDecisionPack({
  checkedAt: '2026-08-06T00:30:00.000Z',
  operatorApprovalReference: 'operator-release-approval',
})
assert.equal(pendingAttorneyPack.status, OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS)
assert.equal(pendingAttorneyPack.releaseDecision, 'conditional_go_pending_attorney_approval')
assert.equal(pendingAttorneyPack.canCutoverProduction, false)
assert.ok(pendingAttorneyPack.legalApprovalHoldCodes.includes('attorney_approval_required:resale_existing_property'))
assert.ok(pendingAttorneyPack.legalApprovalHoldCodes.includes('attorney_approval_required:new_development'))

const docxPack = buildOtpProductionReleaseDecisionPack({
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
  templateDefaults: [
    {
      routeVariant: 'resale_existing_property',
      templateDefaultId: 'old-resale.docx',
      previousTemplateDefaultId: 'previous-resale',
      sourceFormat: 'docx',
      status: 'locked',
    },
    {
      routeVariant: 'new_development',
      templateDefaultId: 'otp-new-development-template',
      previousTemplateDefaultId: 'previous-new-development',
      sourceFormat: 'native_pdf_template',
      status: 'locked',
    },
  ],
  operatorApprovalReference: 'operator-release-approval',
})
assert.equal(docxPack.releaseDecision, 'no_go_remediation_required')
assert.ok(docxPack.blockerCodes.includes('docx_template_source_not_allowed:resale_existing_property'))

for (const token of [
  'PHASE39_ATTORNEY_APPROVAL_PENDING_MARKED',
  'PHASE39_ROLLBACK_PLAN_READY',
  'PHASE39_TEMPLATE_DEFAULTS_LOCKED_PER_ROUTE',
  'PHASE39_DOCX_SOURCE_BLOCKED',
  'conditional_go_pending_attorney_approval',
]) {
  assert.ok(phase39Source.includes(token), `phase39 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
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
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
const phase36Audit = buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase35Audit,
  packetServiceSource,
  packageJson,
})
const phase37Audit = buildOtpFinalSignedArtifactProofPhase37Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase36Audit,
  packetServiceSource,
  packageJson,
})
const phase38Audit = buildOtpEndToEndStagingWalkthroughPhase38Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase37Audit,
  packageJson,
})
const audit = buildOtpProductionReleaseDecisionPhase39Audit({
  checkedAt: '2026-08-06T00:30:00.000Z',
  phase38Audit,
  packageJson,
})
assert.equal(audit.version, OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION)
assert.equal(audit.status, OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 40)
for (const check of [
  'PHASE39_PHASE38_STAGING_WALKTHROUGH_READY',
  'PHASE39_RELEASE_FLAGS_DEFINED',
  'PHASE39_ROLLBACK_PLAN_READY',
  'PHASE39_TEMPLATE_DEFAULTS_LOCKED_PER_ROUTE',
  'PHASE39_NO_DOCX_TEMPLATE_DEFAULTS',
  'PHASE39_ROUTE_AND_ENVELOPE_SEPARATION_LOCKED',
  'PHASE39_EVIDENCE_LINKS_COMPLETE',
  'PHASE39_ATTORNEY_APPROVAL_PENDING_MARKED',
  'PHASE39_APPROVED_PACK_CAN_CUTOVER_WITH_OPERATOR_REFERENCE',
  'PHASE39_INCOMPLETE_ROLLBACK_BLOCKED',
  'PHASE39_TEMPLATE_DEFAULT_COLLISION_BLOCKED',
  'PHASE39_DOCX_SOURCE_BLOCKED',
  'PHASE39_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpProductionReleaseDecisionPhase39Markdown(audit)
for (const token of [
  'OTP Generator Phase 39 Production Release Decision / Cutover Checklist',
  'OTP_PRODUCTION_RELEASE_DECISION_READY_FOR_MANUAL_SIGNOFF',
  'conditional_go_pending_attorney_approval',
  'Attorney approval is still required before live cutover.',
  'Phase 40: Controlled Production Cutover Execution',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP production release decision Phase 39 contract passed.')
