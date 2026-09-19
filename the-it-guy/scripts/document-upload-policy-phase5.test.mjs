import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { validateDocumentUploadFile, getDocumentUploadPolicy, DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION } = await server.ssrLoadModule('/src/lib/documentUploadPolicy.js')
  const valid = validateDocumentUploadFile({ name: 'proof-of-funds.pdf', type: 'application/pdf', size: 1024 }, { surface: 'internal_transaction' })
  assert.equal(valid.policyVersion, 'document_upload_policy_v2')
  assert.equal(valid.malwareScan.status, 'not_configured')
  assert.throws(() => validateDocumentUploadFile({ name: 'invoice.pdf.exe', type: 'application/octet-stream', size: 1024 }), /Unsupported file type/)
  assert.throws(() => validateDocumentUploadFile({ name: 'photo.jpg', type: 'image/png', size: 1024 }), /does not match/)
  assert.equal(getDocumentUploadPolicy({ surface: 'rental_application' }).maxBytes, 8 * 1024 * 1024)
  assert.equal(DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION.scanned, false)
  const migration = await readFile(new URL('../../supabase/migrations/20260918200208_document_upload_policy_storage_enforcement.sql', import.meta.url), 'utf8')
  const rentalApi = await readFile(new URL('../server/services/publicRentalApplicationApi.js', import.meta.url), 'utf8')
  assert.match(migration, /file_size_limit = 25 \* 1024 \* 1024/)
  assert.match(migration, /rental-application-documents/)
  assert.match(rentalApi, /validateRentalDocumentUpload/)
  assert.match(rentalApi, /\.remove\(\[path\]\)/)
  console.log('document upload policy phase 5 tests passed')
} finally { await server.close() }
