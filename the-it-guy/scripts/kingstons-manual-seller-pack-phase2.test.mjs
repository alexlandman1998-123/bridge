import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const agencyPagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const source = fs.readFileSync(agencyPagePath, 'utf8')

function assertIncludes(snippet, message) {
  assert.ok(source.includes(snippet), message)
}

function assertNotIncludes(snippet, message) {
  assert.ok(!source.includes(snippet), message)
}

assertIncludes('function hasKingstonsSellerPackUploadEvidence', 'Manual Seller Pack completion must use a dedicated upload-evidence helper.')
assertIncludes('return hasKingstonsSellerPackUploadEvidence(documentRow)', 'Seller Pack uploaded status must be based on upload evidence.')
assertIncludes('documentRow.storagePath', 'Storage path must count as upload evidence.')
assertIncludes('documentRow.uploadedAt', 'Upload timestamp must count as upload evidence.')
assertIncludes('documentRow.documentId', 'Linked document id must count as upload evidence.')
assertIncludes('Number(documentRow.fileSize || documentRow.file_size || 0) > 0', 'Uploaded file size must count as upload evidence.')
assertNotIncludes('/(uploaded|submitted|received|signed|complete|completed|approved|verified)/.test(status)', 'Manual Seller Pack completion must not be satisfied by status text alone.')

assertIncludes('...missingRows.map((row) => row.label).filter(Boolean)', 'Seller Pack summary must expose missing document labels.')
assertIncludes('requiredLabels: rows.map((row) => row.label).filter(Boolean)', 'Seller Pack summary must expose the exact required document labels.')
assertIncludes('kingstons-seller-pack-manual-completion-status', 'Overview tab must show the manual completion status.')
assertIncludes('kingstons-seller-pack-documents-manual-completion-status', 'Documents tab must show the manual completion status.')
assertIncludes('Seller Pack completion requires all three uploaded files', 'Overview tab must explain the three-upload completion rule.')
assertIncludes('Manual completion requires uploaded files for', 'Documents tab must explain the manual upload completion rule.')
assertIncludes('Still needed: ${selectedKingstonsSellerPackSummary.missingLabels.join(\', \')}', 'Manual Seller Pack UI must name the outstanding required documents.')
assertIncludes('Manual Seller Pack complete. Listing can be prepared.', 'Overview tab must clearly mark the manual pack complete.')

console.log('Kingstons manual seller pack phase 2 guard passed.')
