import test from 'node:test'
import assert from 'node:assert/strict'
import { assessTransactionPdfPersistence } from '../transactionPdfPersistence.js'

const sha256 = `sha256:${'a'.repeat(64)}`
const packet = { id: 'packet-1', transaction_id: 'transaction-1' }
const version = {
  id: 'version-1',
  packet_id: packet.id,
  rendered_document_id: 'document-1',
  rendered_file_bucket: 'documents',
  rendered_file_path: 'packet-1/otp.pdf',
  rendered_media_type: 'application/pdf',
  rendered_byte_length: 2048,
  rendered_sha256: sha256,
  transaction_pdf_persisted: true,
}
const document = {
  id: 'document-1',
  transaction_id: packet.transaction_id,
  legal_packet_id: packet.id,
  legal_packet_version_id: version.id,
  generated_artifact_bucket: version.rendered_file_bucket,
  file_path: version.rendered_file_path,
}

test('accepts a fully linked transaction PDF', () => {
  assert.deepEqual(assessTransactionPdfPersistence({ packet, version, document }).reasons, [])
})

test('rejects a document linked to another transaction', () => {
  const result = assessTransactionPdfPersistence({ packet, version, document: { ...document, transaction_id: 'other' } })
  assert.equal(result.ready, false)
  assert.ok(result.reasons.includes('D3_TRANSACTION_LINK_MISMATCH'))
})

test('rejects storage identity drift', () => {
  const result = assessTransactionPdfPersistence({ packet, version, document: { ...document, file_path: 'changed.pdf' } })
  assert.ok(result.reasons.includes('D3_ARTIFACT_PATH_MISMATCH'))
})
