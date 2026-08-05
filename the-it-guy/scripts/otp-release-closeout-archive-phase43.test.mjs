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
  OTP_RELEASE_CLOSEOUT_ARCHIVE_CONTRACT,
  OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION,
  OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS,
  buildOtpReleaseCloseoutArchivePhase43Audit,
  buildOtpReleaseCloseoutArchiveReceipt,
  formatOtpReleaseCloseoutArchivePhase43Markdown,
} from '../src/core/documents/otpReleaseCloseoutArchivePhase43.js'

const checkedAt = '2026-08-06T04:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase43Source = await readFile(new URL('../src/core/documents/otpReleaseCloseoutArchivePhase43.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-release-closeout-archive-phase43'],
  'node scripts/otp-release-closeout-archive-phase43.test.mjs',
  'package.json should expose the OTP release closeout archive Phase 43 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-release-closeout-archive-phase43'],
  'node scripts/report-otp-release-closeout-archive-phase43.mjs',
  'package.json should expose the OTP release closeout archive Phase 43 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-release-closeout-archive-phase43'),
  'OTP vNext verification should include Phase 43 release closeout archive.',
)

assert.equal(OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION, 'otp_release_closeout_archive_phase43_v1')
assert.equal(OTP_RELEASE_CLOSEOUT_ARCHIVE_CONTRACT, 'otp-vnext-release-closeout-archive-phase43-v1')
assert.equal(OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS, 'OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_FOR_STEADY_STATE_GOVERNANCE')

for (const token of [
  'PHASE43_MISSING_ARCHIVE_ENTRY_BLOCKED',
  'PHASE43_MUTABLE_ARCHIVE_BLOCKED',
  'PHASE43_MISSING_ROUTE_OUTPUT_BLOCKED',
  'PHASE43_DOCX_REGRESSION_BLOCKED',
  'PHASE43_LEGAL_HOLD_BLOCKED',
  'PHASE43_ROLLBACK_ARCHIVE_BLOCKED',
  'PHASE43_GOVERNANCE_HANDOFF_BLOCKED',
]) {
  assert.ok(phase43Source.includes(token), `phase43 source should include ${token}`)
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
const audit = buildOtpReleaseCloseoutArchivePhase43Audit({
  checkedAt,
  phase42Audit,
  packageJson,
})

assert.equal(audit.version, OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION)
assert.equal(audit.contract, OTP_RELEASE_CLOSEOUT_ARCHIVE_CONTRACT)
assert.equal(audit.status, OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 44)

for (const check of [
  'PHASE43_PHASE42_SIGNOFF_READY',
  'PHASE43_GOOD_ARCHIVE_READY',
  'PHASE43_REQUIRED_ARCHIVE_ENTRIES_CAPTURED',
  'PHASE43_ARCHIVE_ENTRIES_IMMUTABLE_AND_FINGERPRINTED',
  'PHASE43_BOTH_ROUTE_OUTPUTS_ARCHIVED',
  'PHASE43_LEGAL_SUMMARY_CLOSED',
  'PHASE43_ROLLBACK_RETENTION_ARCHIVED',
  'PHASE43_MISSING_ARCHIVE_ENTRY_BLOCKED',
  'PHASE43_MUTABLE_ARCHIVE_BLOCKED',
  'PHASE43_MISSING_ROUTE_OUTPUT_BLOCKED',
  'PHASE43_DOCX_REGRESSION_BLOCKED',
  'PHASE43_LEGAL_HOLD_BLOCKED',
  'PHASE43_ROLLBACK_ARCHIVE_BLOCKED',
  'PHASE43_MISSING_CLOSEOUT_APPROVAL_BLOCKED',
  'PHASE43_GOVERNANCE_HANDOFF_BLOCKED',
  'PHASE43_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodSignoff = phase42Audit.signoffReceipts.find((receipt) => receipt.canSignOffStabilisation)
const blockedArchive = buildOtpReleaseCloseoutArchiveReceipt({
  checkedAt,
  stabilisationSignoff: goodSignoff,
  closeoutApprovals: [
    { role: 'release_operator', approved: true, approvalReference: 'release-ok', approvedAt: checkedAt },
    { role: 'document_owner', approved: true, approvalReference: 'document-ok', approvedAt: checkedAt },
    { role: 'governance_owner', approved: false, approvalReference: '', approvedAt: '' },
  ],
})
assert.equal(blockedArchive.canArchiveReleaseCloseout, false)
assert.ok(blockedArchive.blockerCodes.includes('incomplete_closeout_approval:governance_owner'))

const markdown = formatOtpReleaseCloseoutArchivePhase43Markdown(audit)
for (const token of [
  'OTP Generator Phase 43 Release Closeout And Governance Archive',
  'OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_FOR_STEADY_STATE_GOVERNANCE',
  'missing_archive_entry:phase42_stabilisation_signoff_receipt',
  'Phase 44: Steady-State Governance Monitoring',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP release closeout archive Phase 43 contract passed.')
