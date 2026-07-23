import assert from 'node:assert/strict'
import { sha256Digest } from './legal-document-rollout-phase1-artifacts.mjs'
import { LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION } from './legal-document-rollout-phase1-preview-attestation.mjs'
import { createPendingLegalDocumentRolloutPhase1Receipt, rolloutPhase1ManifestDigest } from './legal-document-rollout-phase1-policy.mjs'
import { finalizeLegalDocumentRolloutPhase1Receipt, parsePhase1FinalizerArgs } from './legal-document-rollout-phase1-finalize.mjs'

const digest = (character) => `sha256:${character.repeat(64)}`
const sourceCommit = 'a'.repeat(40)
const stagingProjectRef = 'stagingref001'
const stagingOrigin = `https://${stagingProjectRef}.supabase.co`
const preparedAt = '2026-07-22T11:00:00.000Z'
const recordedAt = '2026-07-22T11:30:00.000Z'

const artifacts = {
  migrations: [
    { version: '202607220002', file: 'one.sql', dependsOn: 'reviewed_legal_runtime_preflight', sha256: digest('1') },
    { version: '202607220003', file: 'two.sql', dependsOn: '202607220002', sha256: digest('2') },
  ],
  edgeFunctions: [
    { name: 'generate-final-signed-document', sourceTreeSha256: digest('3') },
    { name: 'generate-final-signed-otp', sourceTreeSha256: digest('4') },
  ],
  edgeFunctionDeployUnitSha256: digest('5'),
  releaseOrder: { constrainedFunctions: ['generate-final-signed-otp'] },
}
const phase0Freeze = {
  manifestDigest: digest('6'),
  productionProjectRef: 'productionref001',
  source: { commitSha: sourceCommit, packageLockSha256: digest('7') },
  templateReview: { boundB1ManifestDigest: digest('8'), evidenceProjectRef: stagingProjectRef },
}
const pending = createPendingLegalDocumentRolloutPhase1Receipt({
  phase0Freeze,
  artifacts,
  stagingProjectRef,
  stagingOrigin,
  preparedBy: 'Release Manager',
  changeReference: 'REL-002',
  preparedAt,
})

const evidenceInput = {
  recoveryEvidenceReference: 'REC-002',
  preflightLedgerEvidenceDigest: digest('9'),
  migrationEvidence: [
    {
      version: '202607220002', targetProjectRef: stagingProjectRef, migrationSha256: digest('1'), predecessorLedgerEvidenceDigest: digest('9'), sqlApplied: true,
      applyEvidenceDigest: digest('a'), ledgerEvidenceDigest: digest('b'), catalogChecks: 'pass', behaviorChecks: 'pass', rollbackOrNoResidue: 'pass', reviewedBy: 'DB Reviewer',
      appliedAt: '2026-07-22T11:02:00.000Z', ledgerRecordedAt: '2026-07-22T11:03:00.000Z',
    },
    {
      version: '202607220003', targetProjectRef: stagingProjectRef, migrationSha256: digest('2'), predecessorLedgerEvidenceDigest: digest('b'), sqlApplied: true,
      applyEvidenceDigest: digest('c'), ledgerEvidenceDigest: digest('d'), catalogChecks: 'pass', behaviorChecks: 'pass', rollbackOrNoResidue: 'pass', reviewedBy: 'DB Reviewer',
      appliedAt: '2026-07-22T11:04:00.000Z', ledgerRecordedAt: '2026-07-22T11:05:00.000Z',
    },
  ],
  edgeFunctionEvidence: [
    { name: 'generate-final-signed-document', targetProjectRef: stagingProjectRef, sourceTreeSha256: digest('3'), deployUnitSha256: digest('5'), providerRevision: 'rev-1', deploymentReference: 'deploy-1', deployedAt: '2026-07-22T11:01:00.000Z' },
    { name: 'generate-final-signed-otp', targetProjectRef: stagingProjectRef, sourceTreeSha256: digest('4'), deployUnitSha256: digest('5'), providerRevision: 'rev-2', deploymentReference: 'deploy-2', deployedAt: '2026-07-22T11:02:00.000Z' },
  ],
  functionConfigurationReviews: [
    { name: 'generate-final-signed-otp', targetProjectRef: stagingProjectRef, configurationEvidenceDigest: digest('e'), reviewedBy: 'Security Reviewer', reviewedAt: '2026-07-22T11:06:00.000Z' },
  ],
  postDeployContractEvidenceDigest: digest('f'),
  evidenceRecordedBy: 'Staging Verifier',
  reviewedBy: 'Release Reviewer',
  evidenceRecordedAt: recordedAt,
}
const automaticPreviewEvidence = {
  provider: 'vercel',
  attestationVersion: LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
  deploymentId: 'dpl_preview123',
  previewUrl: 'https://legal-docs-phase1-preview.vercel.app',
  previewReleaseId: sourceCommit,
  previewReleaseManifestSha256: digest('1'),
  previewIndexHtmlSha256: digest('2'),
  previewArtifactTreeSha256: digest('3'),
  publicSupabaseOrigin: stagingOrigin,
  attestedAt: '2026-07-22T11:10:00.000Z',
}
const previewAttestation = {
  version: LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
  expectedReleaseId: sourceCommit,
  expectedSupabaseOrigin: stagingOrigin,
  receiptPreviewEvidence: automaticPreviewEvidence,
  providerMetadata: {
    sha256: digest('4'),
    observed: { id: 'dpl_preview123', projectId: 'prj_preview123', url: automaticPreviewEvidence.previewUrl, target: 'preview', state: 'READY', sourceCommitSha: sourceCommit },
  },
}

const finalized = finalizeLegalDocumentRolloutPhase1Receipt({
  pendingReceipt: pending,
  evidenceInput,
  previewAttestation,
  previewAttestationDigest: digest('5'),
  now: '2026-07-22T11:40:00.000Z',
})
assert.equal(finalized.status, 'staging_evidence_recorded')
assert.equal(finalized.execution.previewEvidence.deploymentMetadataEvidenceDigest, digest('4'))
assert.equal(finalized.execution.previewEvidence.attestationEvidenceDigest, digest('5'))
assert.equal(finalized.source.pendingReceiptManifestDigest, pending.manifestDigest)
assert.equal(finalized.manifestDigest, rolloutPhase1ManifestDigest(finalized))
assert.equal(finalized.evidence.fixtureWrites, 0)

const unsafeEvidence = structuredClone(evidenceInput)
unsafeEvidence.migrationEvidence[1].ledgerEvidenceDigest = unsafeEvidence.migrationEvidence[1].predecessorLedgerEvidenceDigest
assert.throws(
  () => finalizeLegalDocumentRolloutPhase1Receipt({ pendingReceipt: pending, evidenceInput: unsafeEvidence, previewAttestation, previewAttestationDigest: digest('5'), now: '2026-07-22T11:40:00.000Z' }),
  /reuses a ledger evidence digest/i,
)

assert.deepEqual(
  parsePhase1FinalizerArgs([
    '--receipt=config/legal-document-rollout-phase1-staging.json',
    '--evidence=/private/tmp/phase1-evidence.json',
    '--preview-attestation=/private/tmp/phase1-preview.json',
  ]),
  {
    receipt: 'config/legal-document-rollout-phase1-staging.json',
    evidence: '/private/tmp/phase1-evidence.json',
    'preview-attestation': '/private/tmp/phase1-preview.json',
  },
)
assert.throws(
  () => parsePhase1FinalizerArgs([
    '--receipt=config/legal-document-rollout-phase1-staging.json',
    '--evidence=/private/tmp/phase1-evidence.json',
    '--preview-attestation=/private/tmp/phase1-preview.json',
    '--out=config/legal-document-rollout-phase1-staging.json',
  ]),
  /Writing requires/i,
)
assert.match(sha256Digest('bridge9'), /^sha256:[0-9a-f]{64}$/)

console.log('Legal-document rollout Phase 1 receipt finalizer contract passed.')
