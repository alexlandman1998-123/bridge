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
assertIncludes('h3 className="text-lg font-semibold tracking-[-0.03em] text-[#102033]">Seller Pack</h3>', 'Overview tab must collapse to a single Seller Pack heading.')
assertIncludes('Capture the seller type, marital setup, and any company or trust authority details before uploading the signed FICA form.', 'Documents tab must explain the wizard-backed capture step.')
assertIncludes('Capture details first', 'FICA upload should point to the capture modal when details are missing.')
assertNotIncludes('kingstons-seller-pack-manual-completion-status', 'The old completion banner should be removed from the page.')
assertNotIncludes('kingstons-documents-fica-seller-type-status', 'The old FICA seller type badge should be removed from the page.')
assertNotIncludes('Manual Seller Pack complete. Listing can be prepared.', 'The old completion banner should be removed from the page.')
assertNotIncludes('FICA seller type:', 'The old FICA seller type badge should be removed from the page.')

console.log('Kingstons manual seller pack phase 2 guard passed.')
