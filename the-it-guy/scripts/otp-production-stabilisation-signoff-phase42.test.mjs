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
  OTP_PRODUCTION_STABILISATION_SIGNOFF_CONTRACT,
  OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION,
  OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS,
  buildOtpProductionStabilisationSignoffPhase42Audit,
  buildOtpProductionStabilisationSignoffReceipt,
  formatOtpProductionStabilisationSignoffPhase42Markdown,
} from '../src/core/documents/otpProductionStabilisationSignoffPhase42.js'

const checkedAt = '2026-08-06T03:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase42Source = await readFile(new URL('../src/core/documents/otpProductionStabilisationSignoffPhase42.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-production-stabilisation-signoff-phase42'],
  'node scripts/otp-production-stabilisation-signoff-phase42.test.mjs',
  'package.json should expose the OTP production stabilisation signoff Phase 42 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-production-stabilisation-signoff-phase42'],
  'node scripts/report-otp-production-stabilisation-signoff-phase42.mjs',
  'package.json should expose the OTP production stabilisation signoff Phase 42 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-production-stabilisation-signoff-phase42'),
  'OTP vNext verification should include Phase 42 production stabilisation signoff.',
)

assert.equal(OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION, 'otp_production_stabilisation_signoff_phase42_v1')
assert.equal(OTP_PRODUCTION_STABILISATION_SIGNOFF_CONTRACT, 'otp-vnext-production-stabilisation-signoff-phase42-v1')
assert.equal(OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS, 'OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_FOR_RELEASE_CLOSEOUT')

for (const token of [
  'PHASE42_ROLLBACK_TRIGGER_BLOCKS_SIGNOFF',
  'PHASE42_MISSING_APPROVAL_BLOCKS_SIGNOFF',
  'PHASE42_OPEN_INCIDENTS_BLOCK_SIGNOFF',
  'PHASE42_MISSING_EVIDENCE_BLOCKS_SIGNOFF',
  'PHASE42_DOCX_REGRESSION_BLOCKS_SIGNOFF',
]) {
  assert.ok(phase42Source.includes(token), `phase42 source should include ${token}`)
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
const audit = buildOtpProductionStabilisationSignoffPhase42Audit({
  checkedAt,
  phase41Audit,
  packageJson,
})

assert.equal(audit.version, OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION)
assert.equal(audit.contract, OTP_PRODUCTION_STABILISATION_SIGNOFF_CONTRACT)
assert.equal(audit.status, OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 43)

for (const check of [
  'PHASE42_PHASE41_MONITORING_READY',
  'PHASE42_CLEAN_WATCH_SIGNOFF_READY',
  'PHASE42_REQUIRED_APPROVALS_CAPTURED',
  'PHASE42_EVIDENCE_LINKS_CAPTURED',
  'PHASE42_NO_OPEN_INCIDENTS_OR_ROLLBACK_TRIGGERS',
  'PHASE42_ROLLBACK_RETENTION_AVAILABLE',
  'PHASE42_ROLLBACK_TRIGGER_BLOCKS_SIGNOFF',
  'PHASE42_MISSING_APPROVAL_BLOCKS_SIGNOFF',
  'PHASE42_OPEN_INCIDENTS_BLOCK_SIGNOFF',
  'PHASE42_MISSING_EVIDENCE_BLOCKS_SIGNOFF',
  'PHASE42_ROLLBACK_RETENTION_BLOCKS_SIGNOFF',
  'PHASE42_DOCX_REGRESSION_BLOCKS_SIGNOFF',
  'PHASE42_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const cleanWatch = phase41Audit.watches.find((watch) => watch.canContinuePostCutover)
const blockedReceipt = buildOtpProductionStabilisationSignoffReceipt({
  checkedAt,
  monitoringWatch: cleanWatch,
  approvals: [
    { role: 'release_operator', approved: true, approvalReference: 'release-ok', approvedAt: checkedAt },
    { role: 'document_owner', approved: false, approvalReference: '', approvedAt: '' },
    { role: 'support_owner', approved: true, approvalReference: 'support-ok', approvedAt: checkedAt },
  ],
})
assert.equal(blockedReceipt.canSignOffStabilisation, false)
assert.ok(blockedReceipt.blockerCodes.includes('incomplete_stabilisation_approval:document_owner'))

const markdown = formatOtpProductionStabilisationSignoffPhase42Markdown(audit)
for (const token of [
  'OTP Generator Phase 42 Production Stabilisation Signoff',
  'OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_FOR_RELEASE_CLOSEOUT',
  'missing_stabilisation_approval:document_owner',
  'Phase 43: Release Closeout And Governance Archive',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP production stabilisation signoff Phase 42 contract passed.')
