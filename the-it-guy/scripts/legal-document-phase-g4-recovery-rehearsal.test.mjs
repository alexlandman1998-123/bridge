import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentRecoveryReadiness } from '../src/core/documents/legalDocumentRecoveryReadiness.js'

const input = {
  g3: { status: 'READY_FOR_G4' },
  expectedProjectRef: 'staging-ref', expectedTemplateIds: ['template-b', 'template-a'],
  deactivation: { action: 'deactivate', mode: 'dry-run', status: 'DRY_RUN_READY', projectRef: 'staging-ref', blockers: [], mutatedData: false },
  rollback: { mode: 'dry-run', strategy: 'revoke_template_approval', projectRef: 'staging-ref', templateIds: ['template-a', 'template-b'], expectedEffect: 'Generation will fail closed immediately.', mutatedData: false },
  retryContract: { mandateExistingArtifactRetry: true, otpExistingArtifactRetry: true, concurrentClaim: true, providerIdempotency: true, successfulRecipientSkip: true, signedArtifactUnchanged: true },
}
assert.equal(assessLegalDocumentRecoveryReadiness(input).ready, true)
assert.ok(assessLegalDocumentRecoveryReadiness({ ...input, deactivation: { ...input.deactivation, mutatedData: true } }).reasons.includes('G4_DEACTIVATION_REHEARSAL_FAILED'))
assert.ok(assessLegalDocumentRecoveryReadiness({ ...input, retryContract: { ...input.retryContract, providerIdempotency: false } }).reasons.includes('G4_DELIVERY_RETRY_CONTRACT_INVALID'))
const verifier = fs.readFileSync('scripts/legal-document-phase-g4-recovery-rehearsal.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-a3-deactivate\.mjs/)
assert.match(verifier, /legal-document-phase4-rollback\.mjs/)
assert.match(verifier, /legal-document-review-manifest\.json/)
assert.match(verifier, /evidenceDigest/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /--apply|LEGAL_DOCUMENT_PHASE_A3_WRITE|LEGAL_DOCUMENT_ROLLBACK_WRITE/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-g4', 'verify:legal-documents:phase-g4']) assert.ok(pkg.scripts?.[name])
console.log('Legal document G4 recovery rehearsal contract passed.')
