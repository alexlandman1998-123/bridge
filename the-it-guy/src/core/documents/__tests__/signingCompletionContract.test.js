import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSigningCompletion, buildSigningCompletion } from '../signingCompletionContract.js'

for (const type of ['mandate', 'otp']) {
  test(`builds the same durable completion result for ${type}`, () => {
    const result = assertSigningCompletion(buildSigningCompletion({
      completedAt: '2026-07-18T12:00:00.000Z',
      document: { id: `${type}-packet`, type, title: `${type} document`, transactionId: 'transaction-1' },
      version: { id: `${type}-version`, number: 3, finalisedAt: '2026-07-18T12:00:00.000Z' },
      signer: { id: 'signer-1', role: type === 'otp' ? 'purchaser_1' : 'seller', signedAt: '2026-07-18T12:00:00.000Z' },
      finalArtifact: { documentId: 'final-1', fileName: `${type}-signed.pdf`, path: `signed/${type}.pdf`, sha256: 'abc123' },
      transactionSaved: true,
      access: { transactionVisible: true, clientVisible: true, canonicalSatisfied: true, portalSurface: type === 'otp' ? 'client_portal' : 'seller_portal' },
      delivery: { status: 'delivered', emailStatus: 'sent' },
    }))

    assert.equal(result.contract, 'arch9-signing-completion-v1')
    assert.equal(result.status, 'completed')
    assert.equal(result.document.type, type)
    assert.equal(result.version.locked, true)
    assert.equal(result.finalArtifact.ready, true)
    assert.equal(result.transactionSaved, true)
    assert.equal(result.access.transactionVisible, true)
    assert.equal(result.delivery.emailStatus, 'sent')
  })
}

test('represents a safe completed state while the final copy is still being prepared', () => {
  const result = assertSigningCompletion(buildSigningCompletion({
    completedAt: '2026-07-18T12:00:00.000Z',
    document: { id: 'packet-1', type: 'mandate' },
    version: { id: 'version-1' },
    signer: { id: 'signer-1', signedAt: '2026-07-18T12:00:00.000Z' },
  }))
  assert.equal(result.finalArtifact.ready, false)
  assert.equal(result.deliveryStatus, 'preparing')
  assert.equal(result.transactionSaved, false)
})

test('preserves an identity-only resolver descriptor without reintroducing a storage URL', () => {
  const result = assertSigningCompletion(buildSigningCompletion({
    completedAt: '2026-07-22T12:00:00.000Z',
    document: { id: 'packet-1', type: 'mandate' },
    version: { id: 'version-1' },
    signer: { id: 'signer-1', signedAt: '2026-07-22T12:00:00.000Z' },
    finalArtifact: {
      ready: true,
      resolver: 'resolve-final-signed-document-access',
      packetId: 'packet-1',
      packetVersionId: 'version-1',
      documentId: 'final-1',
      fileName: 'signed-mandate.pdf',
      sha256: 'a'.repeat(64),
    },
  }))

  assert.equal(result.finalArtifact.ready, true)
  assert.equal(result.finalArtifact.resolver, 'resolve-final-signed-document-access')
  assert.equal(result.finalArtifact.documentId, 'final-1')
  assert.equal(result.finalArtifact.path, null)
  assert.equal(result.finalArtifact.url, null)
})
