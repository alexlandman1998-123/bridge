import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const auditSource = fs.readFileSync(path.join(root, 'docs/attorney-documents-workspace-phase-1-audit.md'), 'utf8')
const attorneyDetailSource = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const matterModelSource = fs.readFileSync(path.join(root, 'src/services/documents/matterDocumentWorkspaceModel.js'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const transactionRequirementServiceSource = fs.readFileSync(
  path.join(root, 'src/services/documents/transactionCanonicalDocumentRequirementService.js'),
  'utf8',
)
const transactionRequirementMigration = fs.readFileSync(
  path.join(root, '../supabase/migrations/20260601000101_transaction_canonical_document_requirement_engine.sql'),
  'utf8',
)

assert.equal(
  packageJson.scripts['test:attorney-documents-workspace-phase1'],
  'node scripts/attorney-documents-workspace-phase1.test.mjs',
  'package script should expose the Phase 1 document workspace contract check',
)

for (const expected of [
  'Primary matter route: `/transactions/:transactionId`',
  '`documents`',
  '`transaction_document_requirements`',
  '`document_requirement_instances`',
  '`document_requests`',
  '`document_packets`',
  'No migration is required for the first implementation step.',
  'extract a pure matter-document workspace model',
]) {
  assert.ok(auditSource.includes(expected), `Phase 1 audit should document: ${expected}`)
}

assert.match(attorneyDetailSource, /function ArchlineDocumentsWorkspace/, 'attorney route should retain the current documents workspace component')
assert.match(attorneyDetailSource, /<ArchlineDocumentsWorkspace[\s\S]*documentHealthSummary=/, 'documents tab should render the Archline workspace with readiness data')
assert.match(attorneyDetailSource, /requiredRows=\{documentHealthSummary\.requiredDocuments\.length \? documentHealthSummary\.requiredDocuments : requiredDocumentRows\}/, 'documents tab should pass required rows into the workspace')
assert.match(attorneyDetailSource, /libraryRows=\{documentLibraryRows\}/, 'documents tab should pass filtered library rows into the workspace')
assert.match(attorneyDetailSource, /missingRows=\{documentReadiness\.missingDocuments \|\| \[\]\}/, 'documents tab should pass missing requirement rows into the workspace')
assert.match(attorneyDetailSource, /buildMatterDocumentWorkspaceModel/, 'attorney route should delegate document workspace derivation to the extracted model')

for (const filterKey of [
  'all',
  'critical',
  'missing',
  'pending_review',
  'bank_requested',
  'verified',
  'buyer',
  'seller',
  'finance',
  'transfer',
  'bond',
  'cancellation',
  'generated',
  'internal',
]) {
  assert.match(
    matterModelSource,
    new RegExp(`\\{ key: '${filterKey}'`),
    `current document library should keep the ${filterKey} filter contract`,
  )
}

assert.match(
  matterModelSource,
  /uniqueDocumentsByRenderKey\(documents\)[\s\S]*\.map\(\(document\) => \{[\s\S]*displayName:\s*document\?\.name[\s\S]*fileUrl:\s*document\?\.url/,
  'uploaded documents should be normalized into library rows with display names and file URLs',
)
assert.match(
  matterModelSource,
  /toArray\(requiredDocumentChecklist\)\.map\(\(requirement\) => \{[\s\S]*linkedDocument[\s\S]*normalizeDocumentCommandStatus\(requirement\?\.status[\s\S]*hasDocument:\s*Boolean\(linkedDocument \|\| uploadedDocumentId\)/,
  'required documents without linked uploads should keep missing/requested status semantics',
)
assert.match(
  matterModelSource,
  /getLinkedRequirementForDocument\(document\)[\s\S]*requiredDocumentCanonicalId:\s*getRequirementCanonicalId\(linkedRequirement\) \|\| getDocumentCanonicalId\(document\) \|\| ''/,
  'canonical-linked documents should preserve requirement instance ids in library rows',
)
assert.match(
  matterModelSource,
  /toArray\(documentReadiness\.missingDocuments\)[\s\S]*mapRequirementAsLibraryRow\(row, 'missing'\)/,
  'missing requirements should be renderable as document library rows',
)
assert.match(
  attorneyDetailSource,
  /openDocumentUploadModal[\s\S]*openConveyancingDocumentRequest[\s\S]*handleReplaceDocument[\s\S]*openReviewAction/,
  'upload, request, replace, and review flows should remain wired from the route',
)

for (const expected of [
  'loadSharedDocuments',
  'fetchSharedDocumentRowsByTransactionIds',
  'uploadDocument',
  'uploadToDocumentsBucket',
  'getSignedUrl',
  'DOCUMENTS_BUCKET_CANDIDATES',
  'bridge_link_document_to_canonical_requirement',
  'bridge_review_canonical_requirement',
  'updateDocumentRequestFromUploadIfPossible',
  'matchAndMarkRequiredDocumentFromUpload',
  'runDocumentAutomationIfPossible',
  'logTransactionEventIfPossible',
]) {
  assert.ok(apiSource.includes(expected), `API should keep current document infrastructure: ${expected}`)
}

assert.match(
  apiSource,
  /status,\s*review_status,[\s\S]*visibility_scope,[\s\S]*stage_key,[\s\S]*bucket_key,[\s\S]*canonical_requirement_instance_id/,
  'shared document fetch should hydrate status, visibility, workflow, bucket, and canonical metadata',
)
assert.match(
  transactionRequirementServiceSource,
  /export const TRANSACTION_DOCUMENT_REQUIREMENT_TABLE = 'transaction_document_requirements'/,
  'canonical transaction requirement service should define the transaction requirement table',
)
assert.match(
  transactionRequirementServiceSource,
  /visibleSection/,
  'canonical transaction requirement service should preserve visible section metadata for future category derivation',
)
assert.match(
  transactionRequirementMigration,
  /UI should read this table instead of inferring document ownership from legacy checklist rows/,
  'transaction_document_requirements migration should remain the source-of-truth direction for UI ownership',
)

console.log('attorney documents workspace Phase 1 contract checks passed')
