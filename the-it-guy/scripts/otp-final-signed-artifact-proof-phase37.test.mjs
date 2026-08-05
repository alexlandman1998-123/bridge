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
  buildOtpAgentReviewCompletionGuardDecision,
  buildOtpAgentReviewCompletionGuardPhase36Audit,
} from '../src/core/documents/otpAgentReviewCompletionGuardPhase36.js'
import {
  OTP_FINAL_SIGNED_ARTIFACT_PROOF_CONTRACT,
  OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION,
  OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS,
  assertOtpFinalSignedArtifactProof,
  buildOtpFinalSignedArtifactProof,
  buildOtpFinalSignedArtifactProofPhase37Audit,
  formatOtpFinalSignedArtifactProofPhase37Markdown,
} from '../src/core/documents/otpFinalSignedArtifactProofPhase37.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase37Source = await readFile(new URL('../src/core/documents/otpFinalSignedArtifactProofPhase37.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-final-signed-artifact-proof-phase37'],
  'node scripts/otp-final-signed-artifact-proof-phase37.test.mjs',
  'package.json should expose the OTP final signed artifact proof Phase 37 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-final-signed-artifact-proof-phase37'],
  'node scripts/report-otp-final-signed-artifact-proof-phase37.mjs',
  'package.json should expose the OTP final signed artifact proof Phase 37 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-final-signed-artifact-proof-phase37'),
  'OTP vNext verification should include Phase 37 final signed artifact proof.',
)

assert.equal(OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION, 'otp_final_signed_artifact_proof_phase37_v1')
assert.equal(OTP_FINAL_SIGNED_ARTIFACT_PROOF_CONTRACT, 'otp-vnext-final-signed-artifact-proof-phase37-v1')
assert.equal(OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS, 'OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_FOR_END_TO_END_STAGING_WALKTHROUGH')

function sampleVersion({ versionId = 'otp-phase37-version', routeVariant = 'resale_existing_property' } = {}) {
  return {
    id: versionId,
    placeholders_resolved_json: {
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
    },
  }
}

function sampleSummary({ packetId = 'otp-phase37-packet', versionId = 'otp-phase37-version' } = {}) {
  return {
    signers: ['purchaser_1', 'seller'].map((role, index) => ({
      packet_id: packetId,
      packet_version_id: versionId,
      signer_role: role,
      signing_order: index + 1,
      status: 'signed',
    })),
    fields: ['purchaser_1', 'seller'].flatMap((role) => [
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'signature',
        required: true,
        status: 'completed',
        signature_asset_path: `${role}/signature.png`,
      },
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'date',
        required: true,
        status: 'completed',
      },
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'initial',
        required: true,
        status: 'completed',
        signature_asset_path: `${role}/initial.png`,
      },
    ]),
  }
}

const completionGuard = buildOtpAgentReviewCompletionGuardDecision({
  packet: { id: 'otp-phase37-packet', packet_type: 'otp' },
  version: sampleVersion(),
  signingSummary: sampleSummary(),
  checkedAt: '2026-08-05T23:30:00.000Z',
})
const goodArtifact = {
  ready: true,
  documentId: 'doc-otp-phase37-version',
  packetId: 'otp-phase37-packet',
  packetVersionId: 'otp-phase37-version',
  bucket: 'legal-final-artifacts',
  path: 'final-signed/otp-phase37-packet/otp-phase37-version.pdf',
  sha256: 'b'.repeat(64),
  byteLength: 512000,
  mediaType: 'application/pdf',
  routeVariant: 'resale_existing_property',
  reviewRecordFingerprint: 'review-resale_existing_property',
  termsFingerprint: 'terms-resale_existing_property',
}
const goodProof = buildOtpFinalSignedArtifactProof({
  completionGuard,
  finalArtifact: goodArtifact,
  checkedAt: '2026-08-05T23:30:00.000Z',
})
assert.equal(goodProof.version, OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION)
assert.equal(goodProof.contract, OTP_FINAL_SIGNED_ARTIFACT_PROOF_CONTRACT)
assert.equal(goodProof.status, OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS)
assert.equal(goodProof.canRecordFinalSignedArtifact, true)
assert.equal(assertOtpFinalSignedArtifactProof(goodProof), goodProof)

const wrongVersionProof = buildOtpFinalSignedArtifactProof({
  completionGuard,
  finalArtifact: { ...goodArtifact, packetVersionId: 'other-version' },
})
assert.equal(wrongVersionProof.canRecordFinalSignedArtifact, false)
assert.ok(wrongVersionProof.blockerCodes.includes('final_artifact_version_mismatch'))
assert.throws(() => assertOtpFinalSignedArtifactProof(wrongVersionProof), /final signed artifact proof is blocked/i)

const unsafeStorageProof = buildOtpFinalSignedArtifactProof({
  completionGuard,
  finalArtifact: { ...goodArtifact, documentId: '', bucket: 'https://public.example.invalid', path: '/tmp/final.pdf' },
})
assert.equal(unsafeStorageProof.canRecordFinalSignedArtifact, false)
assert.ok(unsafeStorageProof.blockerCodes.some((code) => code.startsWith('unsafe_final_artifact')))

const routeMismatchProof = buildOtpFinalSignedArtifactProof({
  completionGuard,
  finalArtifact: { ...goodArtifact, routeVariant: 'new_development' },
})
assert.equal(routeMismatchProof.canRecordFinalSignedArtifact, false)
assert.ok(routeMismatchProof.blockerCodes.includes('route_variant_mismatch'))

const missingEvidenceProof = buildOtpFinalSignedArtifactProof({
  completionGuard,
  finalArtifact: { ...goodArtifact, sha256: '', byteLength: 0, mediaType: '' },
})
assert.equal(missingEvidenceProof.canRecordFinalSignedArtifact, false)
assert.ok(missingEvidenceProof.blockerCodes.includes('missing_final_artifact_sha256'))
assert.ok(missingEvidenceProof.blockerCodes.includes('missing_final_artifact_byte_length'))

for (const token of [
  'buildOtpFinalSignedArtifactProof',
  'assertOtpFinalSignedArtifactProof',
  'otp_final_signed_artifact_proof_recorded',
  'otpFinalSignedArtifactProof',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include ${token}`)
}
for (const token of [
  'PHASE37_WRONG_VERSION_ARTIFACT_BLOCKED',
  'PHASE37_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE37_UNSAFE_STORAGE_BLOCKED',
  'PHASE37_MISSING_ARTIFACT_EVIDENCE_BLOCKED',
]) {
  assert.ok(phase37Source.includes(token), `phase37 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-05T23:30:00.000Z',
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
  checkedAt: '2026-08-05T23:30:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-05T23:30:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt: '2026-08-05T23:30:00.000Z',
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt: '2026-08-05T23:30:00.000Z',
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
const phase36Audit = buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt: '2026-08-05T23:30:00.000Z',
  phase35Audit,
  packetServiceSource,
  packageJson,
})
const audit = buildOtpFinalSignedArtifactProofPhase37Audit({
  checkedAt: '2026-08-05T23:30:00.000Z',
  phase36Audit,
  packetServiceSource,
  packageJson,
})
assert.equal(audit.version, OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION)
assert.equal(audit.status, OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 38)
for (const check of [
  'PHASE37_PHASE36_COMPLETION_GUARD_READY',
  'PHASE37_BOTH_ROUTES_ARTIFACTS_PROVED',
  'PHASE37_EXACT_COMPLETED_VERSION_BOUND',
  'PHASE37_ROUTE_LEGAL_FINGERPRINTS_PRESERVED',
  'PHASE37_SAFE_FINAL_ARTIFACT_STORAGE',
  'PHASE37_WRONG_VERSION_ARTIFACT_BLOCKED',
  'PHASE37_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE37_UNSAFE_STORAGE_BLOCKED',
  'PHASE37_MISSING_ARTIFACT_EVIDENCE_BLOCKED',
  'PHASE37_PACKET_SERVICE_FINAL_ARTIFACT_PROOF_WIRED',
  'PHASE37_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpFinalSignedArtifactProofPhase37Markdown(audit)
for (const token of [
  'OTP Generator Phase 37 Final Signed Artifact Proof',
  'OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_FOR_END_TO_END_STAGING_WALKTHROUGH',
  'PHASE37_WRONG_VERSION_ARTIFACT_BLOCKED',
  'Phase 38: End-to-End Staging Walkthrough',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP final signed artifact proof Phase 37 contract passed.')
