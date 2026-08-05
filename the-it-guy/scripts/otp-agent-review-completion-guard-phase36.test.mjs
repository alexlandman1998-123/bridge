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
  OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT,
  OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION,
  OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS,
  assertOtpAgentReviewCompletionGuard,
  buildOtpAgentReviewCompletionGuardDecision,
  buildOtpAgentReviewCompletionGuardPhase36Audit,
  formatOtpAgentReviewCompletionGuardPhase36Markdown,
} from '../src/core/documents/otpAgentReviewCompletionGuardPhase36.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase36Source = await readFile(new URL('../src/core/documents/otpAgentReviewCompletionGuardPhase36.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-agent-review-completion-guard-phase36'],
  'node scripts/otp-agent-review-completion-guard-phase36.test.mjs',
  'package.json should expose the OTP agent review completion guard Phase 36 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-agent-review-completion-guard-phase36'],
  'node scripts/report-otp-agent-review-completion-guard-phase36.mjs',
  'package.json should expose the OTP agent review completion guard Phase 36 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-agent-review-completion-guard-phase36'),
  'OTP vNext verification should include Phase 36 completion guard.',
)

assert.equal(OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION, 'otp_agent_review_completion_guard_phase36_v1')
assert.equal(OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT, 'otp-vnext-agent-review-completion-guard-phase36-v1')
assert.equal(OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS, 'OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_FOR_FINAL_ARTIFACT_PROOF')

function sampleVersion({ versionId = 'otp-phase36-version', routeVariant = 'resale_existing_property', proof = true } = {}) {
  return {
    id: versionId,
    placeholders_resolved_json: proof
      ? {
          otpAgentReviewRecord: {
            confirmed: true,
            contract: 'otp-vnext-agent-review-ui-phase31-v1',
            routeVariant,
          },
          otpAgentReviewRuntimeProof: {
            present: true,
            confirmed: true,
            contract: 'otp-vnext-agent-review-ui-phase31-v1',
            routeVariant,
            reviewRecordFingerprint: `review-${routeVariant}`,
            termsFingerprint: `terms-${routeVariant}`,
          },
        }
      : {},
  }
}

function sampleSummary({ packetId = 'otp-phase36-packet', versionId = 'otp-phase36-version', complete = true, asset = true } = {}) {
  return {
    signers: ['purchaser_1', 'seller'].map((role, index) => ({
      packet_id: packetId,
      packet_version_id: versionId,
      signer_role: role,
      signing_order: index + 1,
      status: complete ? 'signed' : index === 0 ? 'signed' : 'sent',
    })),
    fields: ['purchaser_1', 'seller'].flatMap((role) => [
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'signature',
        required: true,
        status: complete ? 'completed' : 'pending',
        signature_asset_path: asset ? `${role}/signature.png` : '',
      },
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'date',
        required: true,
        status: complete ? 'completed' : 'pending',
      },
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'initial',
        required: true,
        status: complete ? 'completed' : 'pending',
        signature_asset_path: asset ? `${role}/initial.png` : '',
      },
    ]),
  }
}

const completeDecision = buildOtpAgentReviewCompletionGuardDecision({
  packet: { id: 'otp-phase36-packet', packet_type: 'otp' },
  version: sampleVersion({ versionId: 'otp-phase36-version' }),
  signingSummary: sampleSummary({ packetId: 'otp-phase36-packet', versionId: 'otp-phase36-version' }),
  checkedAt: '2026-08-05T23:00:00.000Z',
})
assert.equal(completeDecision.version, OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION)
assert.equal(completeDecision.contract, OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT)
assert.equal(completeDecision.status, OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS)
assert.equal(completeDecision.canFinalizeReviewedOtp, true)
assert.equal(assertOtpAgentReviewCompletionGuard(completeDecision), completeDecision)

const incompleteDecision = buildOtpAgentReviewCompletionGuardDecision({
  packet: { id: 'otp-phase36-packet', packet_type: 'otp' },
  version: sampleVersion({ versionId: 'otp-phase36-version' }),
  signingSummary: sampleSummary({ packetId: 'otp-phase36-packet', versionId: 'otp-phase36-version', complete: false }),
})
assert.equal(incompleteDecision.canFinalizeReviewedOtp, false)
assert.ok(incompleteDecision.blockerCodes.some((code) => code.startsWith('required_signer_incomplete')))
assert.ok(incompleteDecision.blockerCodes.some((code) => code.startsWith('required_field_incomplete')))
assert.throws(() => assertOtpAgentReviewCompletionGuard(incompleteDecision), /OTP finalisation is blocked/)

const missingAssetDecision = buildOtpAgentReviewCompletionGuardDecision({
  packet: { id: 'otp-phase36-packet', packet_type: 'otp' },
  version: sampleVersion({ versionId: 'otp-phase36-version' }),
  signingSummary: sampleSummary({ packetId: 'otp-phase36-packet', versionId: 'otp-phase36-version', complete: true, asset: false }),
})
assert.equal(missingAssetDecision.canFinalizeReviewedOtp, false)
assert.ok(missingAssetDecision.blockerCodes.some((code) => code.startsWith('required_asset_missing')))

const wrongVersionDecision = buildOtpAgentReviewCompletionGuardDecision({
  packet: { id: 'otp-phase36-packet', packet_type: 'otp' },
  version: sampleVersion({ versionId: 'otp-phase36-version' }),
  signingSummary: sampleSummary({ packetId: 'otp-phase36-packet', versionId: 'wrong-version' }),
})
assert.equal(wrongVersionDecision.canFinalizeReviewedOtp, false)
assert.ok(wrongVersionDecision.blockerCodes.some((code) => code.includes('version_mismatch')))

const missingProofDecision = buildOtpAgentReviewCompletionGuardDecision({
  packet: { id: 'otp-phase36-packet', packet_type: 'otp' },
  version: sampleVersion({ versionId: 'otp-phase36-version', proof: false }),
  signingSummary: sampleSummary({ packetId: 'otp-phase36-packet', versionId: 'otp-phase36-version' }),
})
assert.equal(missingProofDecision.canFinalizeReviewedOtp, false)
assert.ok(missingProofDecision.blockerCodes.includes('missing_agent_review_runtime_proof'))

for (const token of [
  'buildOtpAgentReviewCompletionGuardDecision',
  'assertOtpAgentReviewCompletionGuard',
  'otp_agent_review_completion_guard_passed',
  'SIGNERS_INCOMPLETE',
  'FIELDS_INCOMPLETE',
  'MISSING_SIGNATURE_ASSETS',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include ${token}`)
}
for (const token of [
  'PHASE36_INCOMPLETE_SIGNERS_AND_FIELDS_BLOCKED',
  'PHASE36_WRONG_VERSION_BLOCKED',
  'PHASE36_MISSING_REVIEW_PROOF_BLOCKED',
  'OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_FOR_FINAL_ARTIFACT_PROOF',
]) {
  assert.ok(phase36Source.includes(token), `phase36 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-05T23:00:00.000Z',
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
  checkedAt: '2026-08-05T23:00:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-05T23:00:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt: '2026-08-05T23:00:00.000Z',
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt: '2026-08-05T23:00:00.000Z',
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
const audit = buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt: '2026-08-05T23:00:00.000Z',
  phase35Audit,
  packetServiceSource,
  packageJson,
})
assert.equal(audit.version, OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION)
assert.equal(audit.status, OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 37)
for (const check of [
  'PHASE36_PHASE35_SIGNER_SESSION_READY',
  'PHASE36_BOTH_ROUTES_CAN_FINALIZE_WHEN_COMPLETE',
  'PHASE36_INCOMPLETE_SIGNERS_AND_FIELDS_BLOCKED',
  'PHASE36_WRONG_VERSION_BLOCKED',
  'PHASE36_MISSING_REVIEW_PROOF_BLOCKED',
  'PHASE36_PACKET_SERVICE_COMPLETION_GUARD_WIRED',
  'PHASE36_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpAgentReviewCompletionGuardPhase36Markdown(audit)
for (const token of [
  'OTP Generator Phase 36 Agent Review Completion Guard Runtime Alignment',
  'OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_FOR_FINAL_ARTIFACT_PROOF',
  'PHASE36_INCOMPLETE_SIGNERS_AND_FIELDS_BLOCKED',
  'Phase 37: Final Signed Artifact Proof',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP agent review completion guard Phase 36 contract passed.')
