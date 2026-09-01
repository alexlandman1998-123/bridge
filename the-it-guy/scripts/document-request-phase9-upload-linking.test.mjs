import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  buildProfessionalDocumentRequestUploadTransition,
} from '../src/services/documents/documentRequestProfessionalPropagationService.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const apiSource = fs.readFileSync('src/lib/api.js', 'utf8')
const privateListingSource = fs.readFileSync('src/services/privateListingService.js', 'utf8')
const clientPortalSource = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase9-upload-linking.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase9-upload-linking.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase9-upload-linking'],
  'node scripts/document-request-phase9-upload-linking.test.mjs',
  'package.json should expose the Phase 9 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase9-upload-linking'],
  'node scripts/document-request-phase9-upload-linking.mjs',
  'package.json should expose the Phase 9 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase9-upload-linking'],
  'npm run verify:document-request-phase8-client-portal-container-adoption && npm run test:document-request-phase9-upload-linking && npm run report:document-request-phase9-upload-linking',
  'package.json should expose the Phase 9 verification command.',
)

assert.match(scriptSource, /document_request_phase9_upload_linking/, 'Phase 9 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 9 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 9 report should not connect to Supabase.')
assert.match(docs, /Upload Linking/, 'Phase 9 docs should name the phase.')
assert.match(docs, /document_requests/, 'Phase 9 docs should mention the request table.')

assert.match(apiSource, /async function updateDocumentRequestFromUploadIfPossible/, 'Buyer upload linker should exist.')
assert.match(apiSource, /requested_document_id:\s*documentId/, 'Buyer upload linker should store the uploaded document id.')
assert.match(apiSource, /completed_at:\s*nextStatus === 'completed' \? now : null/, 'Buyer upload linker should close non-review requests.')
assert.match(apiSource, /rejected_reason:\s*null/, 'Buyer upload linker should clear rejected reasons on replacement upload.')
assert.match(apiSource, /await updateDocumentRequestFromUploadIfPossible\(client,/, 'Buyer upload flow should invoke the linker.')
const clientPortalUploadSource = apiSource.slice(
  apiSource.indexOf('export async function uploadClientPortalDocument'),
  apiSource.indexOf('export async function reconcileClientPortalBondDocumentRequirements'),
)
assert.match(
  clientPortalUploadSource,
  /const postUploadContextPromise = \(async \(\) => \{[\s\S]*?previousReadiness = readinessSnapshot/,
  'Buyer portal upload should capture a pre-upload readiness baseline without holding up the file upload.',
)
assert.match(
  clientPortalUploadSource,
  /readiness = await runDocumentAutomationIfPossible\(client,/,
  'Buyer portal upload should use the recalculated post-upload readiness.',
)
assert.match(
  clientPortalUploadSource,
  /checkAndNotifyBondDocumentsComplete\(/,
  'Buyer portal upload should notify the bond originator when documents cross the complete threshold.',
)
assert.match(
  clientPortalUploadSource,
  /checkAndNotifyBondApplicationReadyForReview\(/,
  'Buyer portal upload should notify the bond originator when a submitted application becomes ready for review.',
)

assert.match(privateListingSource, /async function linkSellerPortalDocumentRequestUpload/, 'Seller upload linker should exist.')
assert.match(privateListingSource, /documentRequestId\s*=\s*''/, 'Seller upload should accept a documentRequestId option.')
assert.match(privateListingSource, /\.from\('document_requests'\)/, 'Seller upload linker should target document_requests.')
assert.match(privateListingSource, /requested_document_id:\s*normalizedDocumentId/, 'Seller upload linker should store the uploaded document id.')
assert.match(privateListingSource, /completed_at:\s*nextStatus === 'completed' \? now : null/, 'Seller upload linker should close non-review requests.')
assert.match(privateListingSource, /rejected_reason:\s*null/, 'Seller upload linker should clear rejected reasons on replacement upload.')
assert.match(privateListingSource, /updated_at:\s*now/, 'Seller upload linker should touch updated_at.')
assert.match(privateListingSource, /promotedSharedDocument\?\.id \|\| documentRow\?\.promoted_document_id \|\| documentRow\?\.id/, 'Seller upload should prefer promoted shared transaction documents.')
assert.match(privateListingSource, /documentRequestUpdate,/, 'Seller upload result should expose the request update result.')

assert.match(clientPortalSource, /documentRequestId:\s*options\.documentRequestId \|\| null/, 'Client portal should pass request id into upload APIs.')
assert.match(clientPortalSource, /request\.uploadSpec\?\.requestId/, 'Container cards should source request id from uploadSpec.')
assert.match(clientPortalSource, /const documentRequestId = String\(request\.uploadSpec\?\.requestId \|\| requestId \|\| ''\)\.trim\(\)/, 'Container upload should derive a request id from uploadSpec.')
assert.match(clientPortalSource, /handleUploadRequiredDocument\(/, 'Container upload should call the shared upload handler.')

const transition = buildProfessionalDocumentRequestUploadTransition({
  id: 'phase9-test-request',
  transactionId: 'phase9-test-transaction',
  documentId: 'phase9-test-document',
})
assert.equal(transition.before.blocksReadiness, true)
assert.equal(transition.before.hasUploadedDocument, false)
assert.equal(transition.after.blocksReadiness, false)
assert.equal(transition.after.hasUploadedDocument, true)
assert.equal(transition.after.linkedDocumentId, 'phase9-test-document')

const outputPath = 'output/document-request-phase9-upload-linking.test.json'
execFileSync('node', ['scripts/document-request-phase9-upload-linking.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase9_upload_linking')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'request_upload_linking_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)

console.log('document request phase 9 upload linking tests passed')
