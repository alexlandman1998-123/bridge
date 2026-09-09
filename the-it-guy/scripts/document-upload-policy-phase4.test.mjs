import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_MAX_BYTES,
  sanitizeDocumentFileName,
  validateDocumentUploadFile,
} from '../src/lib/documentUploadPolicy.js'

assert.match(DOCUMENT_UPLOAD_ACCEPT, /\.pdf/, 'shared document input policy should accept PDFs')
assert.match(DOCUMENT_UPLOAD_ACCEPT, /\.docx/, 'shared document input policy should accept Word documents')
assert.match(DOCUMENT_UPLOAD_ACCEPT, /\.png/, 'shared document input policy should accept PNG files')
assert.equal(sanitizeDocumentFileName('../../Buyer ID (final).pdf'), 'Buyer-ID-final-.pdf')

const validFile = validateDocumentUploadFile({
  name: 'buyer-id.pdf',
  type: 'application/pdf',
  size: 512,
})
assert.equal(validFile.safeName, 'buyer-id.pdf')

assert.throws(
  () => validateDocumentUploadFile({ name: 'malware.exe', type: 'application/octet-stream', size: 512 }),
  /Unsupported file type/,
)
assert.throws(
  () => validateDocumentUploadFile({ name: 'buyer-id.pdf', type: 'image/png', size: 512 }),
  /does not match/,
)
assert.throws(
  () => validateDocumentUploadFile({ name: 'buyer-id.pdf', type: 'application/pdf', size: DOCUMENT_UPLOAD_MAX_BYTES + 1 }),
  /too large/,
)

const apiSource = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const privateListingSource = readFileSync(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')

assert.match(apiSource, /validateDocumentUploadFile\(file,/, 'transaction and portal upload paths should use shared validation')
assert.match(apiSource, /filePolicy\.safeName/, 'transaction and portal storage paths should use safe filenames')
assert.match(privateListingSource, /validateDocumentUploadFile\(file,/, 'listing upload paths should use shared validation')
assert.match(
  privateListingSource,
  /This listing is unavailable or you do not have permission to upload documents to it\./,
  'agent listing uploads should check listing access before storage upload',
)

console.log('document upload policy phase 4 tests passed')
