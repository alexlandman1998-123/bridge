import assert from 'node:assert/strict'
import {
  DOCUMENT_GENERATION_CONTRACT_VERSION,
  normalizeDocumentGenerationResponseContract,
  validateDocumentGenerationPreflight,
  validateDocumentGenerationRequestContract,
} from '../src/lib/documentGenerationContract.js'

const packetId = '11111111-1111-4111-8111-111111111111'

const validRequest = validateDocumentGenerationRequestContract({
  packetId,
  renderMode: 'docx_template',
  outputBucket: 'documents',
  outputPath: 'packets/test.pdf',
  placeholders: { seller_name: 'TEST Seller' },
})
assert.equal(validRequest.ok, true)
assert.equal(validRequest.payload.contractVersion, DOCUMENT_GENERATION_CONTRACT_VERSION)

const missingPacket = validateDocumentGenerationRequestContract({ renderMode: 'docx_template' })
assert.equal(missingPacket.ok, false)
assert.deepEqual(missingPacket.issues.map((item) => item.code), ['packet_id_missing'])

const blockedPreflight = validateDocumentGenerationPreflight({
  request: { packetId, renderMode: 'docx_template', outputPath: 'packets/test.pdf' },
  packetType: 'mandate',
  templateConfig: {},
})
assert.equal(blockedPreflight.ok, false)
assert.deepEqual(blockedPreflight.issues.map((item) => item.code), ['template_source_missing'])

const nativePreflight = validateDocumentGenerationPreflight({
  request: { packetId, renderMode: 'native_structured', outputPath: 'packets/test.pdf' },
  packetType: 'mandate',
  useNativeRenderer: true,
})
assert.equal(nativePreflight.ok, true)

const normalized = normalizeDocumentGenerationResponseContract({
  success: true,
  packetId,
  documentRecord: { data: { id: 'document-1', name: 'TEST mandate.pdf' } },
  output: { filePath: 'packets/test.pdf', bucket: 'documents', signedUrl: 'https://example.test/test.pdf' },
}, { packetId })
assert.equal(normalized.documentId, 'document-1')
assert.equal(normalized.output.filePath, 'packets/test.pdf')

assert.throws(
  () => normalizeDocumentGenerationResponseContract({ success: true, documentId: 'document-1' }, { packetId }),
  (error) => error.code === 'GENERATION_CONTRACT_ARTIFACT_INVALID',
)
assert.throws(
  () => normalizeDocumentGenerationResponseContract({ success: true, packetId: 'other', documentId: 'document-1', output: { filePath: 'x' } }, { packetId }),
  (error) => error.code === 'GENERATION_CONTRACT_PACKET_MISMATCH',
)

console.log('document-generation-contract: passed')
