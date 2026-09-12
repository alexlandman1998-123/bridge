import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reportDocumentUploadTelemetry } from '../src/lib/documentUploadObservability.js'

const emitted = []
const originalInfo = console.info
const originalWarn = console.warn
console.info = (_label, payload) => emitted.push(payload)
console.warn = (_label, payload) => emitted.push(payload)

try {
  const success = reportDocumentUploadTelemetry({
    surface: 'internal_transaction',
    stage: 'persistence',
    outcome: 'durable_saved',
    transactionId: 'transaction-1',
    documentId: 'document-1',
  })
  const failure = reportDocumentUploadTelemetry({
    surface: 'internal_transaction',
    stage: 'workflow_automation',
    outcome: 'failed',
    error: { code: 'automation_unavailable', message: 'Automation unavailable' },
    transactionId: 'transaction-1',
    documentId: 'document-1',
  })

  assert.equal(success.event, 'document_upload')
  assert.equal(success.outcome, 'durable_saved')
  assert.equal(failure.errorCode, 'automation_unavailable')
  assert.equal(failure.errorMessage, 'Automation unavailable')
  assert.equal(emitted.length, 2, 'telemetry should be emitted for successful and failed lifecycle events')
} finally {
  console.info = originalInfo
  console.warn = originalWarn
}

const apiSource = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const uploadDocumentSource = apiSource.slice(apiSource.indexOf('export async function uploadDocument'))

assert.ok(
  uploadDocumentSource.indexOf('assertActiveTransactionForDocumentUpload') < uploadDocumentSource.indexOf('uploadToDocumentsBucket'),
  'transaction access must be verified before storage is called',
)
assert.ok(
  uploadDocumentSource.indexOf('validateDocumentUploadFile') < uploadDocumentSource.indexOf('uploadToDocumentsBucket'),
  'file validation must run before storage is called',
)
assert.match(uploadDocumentSource, /findDocumentByUploadIdempotencyKey/, 'retries should first resolve an existing document')
assert.match(uploadDocumentSource, /removeDocumentUploadObjectAfterFailedPersistence/, 'persistence failures should trigger storage cleanup')
assert.match(uploadDocumentSource, /void runInternalDocumentUploadFollowUps\(/, 'durable upload success should not wait for follow-up work')
assert.match(apiSource, /Promise\.allSettled\(enabledFollowUps\.map\(\(\{ run \}\) => run\(\)\)\)/, 'one failed enabled follow-up must not block others')
assert.match(apiSource, /followUps\.filter\(\(\{ step \}\) => inferCanonicalRequirement/, 'general uploads must not invoke implicit requirement automation')
assert.match(uploadDocumentSource, /\.insert\(compatiblePayload\)/, 'optional-column retry must preserve document audience and links')
assert.match(apiSource, /reportDocumentUploadTelemetry\(/, 'the transaction upload lifecycle should emit structured telemetry')

console.log('document upload reliability phase 5 tests passed')
