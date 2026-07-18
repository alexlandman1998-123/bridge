import test from 'node:test'
import assert from 'node:assert/strict'
import { assessFinalTransactionPublication } from '../finalTransactionPublication.js'

const packet = { transactionId: 'transaction-1' }
const version = { id: 'version-1' }
const artifact = { bucket: 'documents', path: 'signed/final.pdf', sha256: 'a'.repeat(64) }
const publication = { packetVersionId: 'version-1', transactionId: 'transaction-1', documentId: 'document-1', artifactPath: artifact.path, artifactSha256: artifact.sha256 }
const document = { id: 'document-1', transactionId: 'transaction-1', filePath: artifact.path, fileBucket: artifact.bucket, finalArtifactSha256: artifact.sha256, visibilityScope: 'shared', isClientVisible: true }

test('accepts the exact signed artifact published into the transaction', () => {
  assert.equal(assessFinalTransactionPublication({ packet, version, artifact, publication, document }).ready, true)
})

test('rejects publication into a different transaction', () => {
  const result = assessFinalTransactionPublication({ packet, version, artifact, publication: { ...publication, transactionId: 'transaction-2' }, document })
  assert.ok(result.reasons.includes('F3_TRANSACTION_PUBLICATION_BINDING_INVALID'))
})

test('rejects a document that is not shared', () => {
  const result = assessFinalTransactionPublication({ packet, version, artifact, publication, document: { ...document, visibilityScope: 'internal' } })
  assert.ok(result.reasons.includes('F3_DOCUMENT_NOT_SHARED'))
})
