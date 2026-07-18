import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSigningCompletionCertificate } from '../signingCompletionCertificate.js'

const sha256 = 'a'.repeat(64)
const readyInput = {
  packet: { packet_type: 'otp', title: 'Offer to Purchase', completed_at: '2026-07-18T12:00:00Z' },
  version: { version_number: 3, finalised_at: '2026-07-18T12:00:00Z', final_signed_file_name: 'signed-otp.pdf' },
  signers: [{ signer_role: 'purchaser_1', signer_name: 'Buyer One', signer_email: 'BUYER@example.com', status: 'signed', viewed_at: '2026-07-18T10:00:00Z', signed_at: '2026-07-18T11:00:00Z', signing_token: 'must-not-leak' }],
  finalCompletion: { ready: true, stage: 'completed_everywhere', recipientCount: 1, deliveredRecipientCount: 1, transactionDocumentId: 'document-1', completedAt: '2026-07-18T12:00:00Z' },
  launchChain: { finalArtifact: { sha256, byteLength: 2048 } },
  signingActivity: { totalCount: 5 },
}

test('creates a deterministic certificate only from verified completion evidence', () => {
  const result = buildSigningCompletionCertificate(readyInput)
  assert.equal(result.ready, true)
  assert.equal(result.certificateId, 'ARCH9-AAAAAAAAAAAA-20260718')
  assert.equal(result.artifact.sha256, sha256)
  assert.equal(result.delivery.deliveredRecipientCount, 1)
  assert.equal(result.signers[0].email, 'buyer@example.com')
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false)
})

test('withholds a certificate while publication or delivery is incomplete', () => {
  const result = buildSigningCompletionCertificate({ ...readyInput, finalCompletion: { ...readyInput.finalCompletion, ready: false, stage: 'awaiting_recipient_delivery' } })
  assert.equal(result.ready, false)
  assert.equal(result.certificateId, null)
  assert.equal(result.artifact, null)
  assert.ok(result.reasons.includes('COMPLETION_NOT_VERIFIED'))
})

test('rejects incomplete signer and artifact evidence', () => {
  const result = buildSigningCompletionCertificate({ ...readyInput, signers: [{ ...readyInput.signers[0], status: 'sent', signed_at: null }], launchChain: { finalArtifact: { sha256: 'bad', byteLength: 10 } } })
  assert.equal(result.ready, false)
  assert.ok(result.reasons.includes('SIGNERS_INCOMPLETE'))
  assert.ok(result.reasons.includes('FINAL_ARTIFACT_EVIDENCE_INVALID'))
})
