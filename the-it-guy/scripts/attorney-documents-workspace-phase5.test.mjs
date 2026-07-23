import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const modelSource = fs.readFileSync(path.join(root, 'src/services/documents/matterDocumentWorkspaceModel.js'), 'utf8')
const modelTestSource = fs.readFileSync(path.join(root, 'src/services/__tests__/matterDocumentWorkspaceModel.test.js'), 'utf8')

assert.equal(
  packageJson.scripts['test:attorney-documents-workspace-phase5'],
  'node scripts/attorney-documents-workspace-phase5.test.mjs',
  'package script should expose the Phase 5 document category overview contract',
)

const componentStart = source.indexOf('function ArchlineDocumentsWorkspace')
const componentEnd = source.indexOf('function ArchlineTasksWorkspace', componentStart)
const component = source.slice(componentStart, componentEnd)

for (const category of ['buyer', 'seller', 'finance', 'transfer', 'bond', 'cancellation', 'general']) {
  assert.match(modelSource, new RegExp(`\\{ key: '${category}'`), `Phase 5 category overview should retain ${category}`)
}

assert.match(modelSource, /visible: totalDocuments > 0 \|\| requiredCount > 0/, 'category summaries should only show relevant categories')
assert.match(modelSource, /const unlinkedDocuments = documents\.filter/, 'category status counts should not double-count linked documents')
assert.match(modelSource, /const statusRows = \[\.\.\.requirements, \.\.\.unlinkedDocuments\]/, 'category counts should use requirements plus unlinked documents')
assert.match(modelSource, /uploadedOrUnreviewedCount: uploadedCount/, 'category summaries should expose uploaded or unreviewed counts')
assert.match(modelSource, /progressPercent/, 'category summaries should expose compact progress data')

for (const expected of [
  'category.totalDocuments',
  'category.requiredCount',
  'category.verifiedCount',
  'category.pendingReviewCount',
  'category.missingCount',
  'category.uploadedOrUnreviewedCount',
  'category.progressPercent',
  'onFilterChange?.(category.key)',
]) {
  assert.ok(component.includes(expected), `category cards should render/wire ${expected}`)
}

for (const expected of [
  'linked document plus requirement should count as one pending-review item',
  'category summary status rows should de-duplicate linked documents and requirements',
  'generalSummary.progressPercent, 100',
]) {
  assert.ok(modelTestSource.includes(expected), `model tests should cover ${expected}`)
}

console.log('attorney documents workspace Phase 5 category overview checks passed')
