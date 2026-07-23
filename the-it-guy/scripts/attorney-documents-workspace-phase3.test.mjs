import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const attorneyDetailSource = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const matterModelSource = fs.readFileSync(path.join(root, 'src/services/documents/matterDocumentWorkspaceModel.js'), 'utf8')
const matterModelTestSource = fs.readFileSync(path.join(root, 'src/services/__tests__/matterDocumentWorkspaceModel.test.js'), 'utf8')

assert.equal(
  packageJson.scripts['test:attorney-documents-workspace-phase3'],
  'node scripts/attorney-documents-workspace-phase3.test.mjs',
  'package script should expose the Phase 3 canonical workspace contract',
)

for (const category of ['buyer', 'seller', 'finance', 'transfer', 'bond', 'cancellation', 'general']) {
  assert.match(
    matterModelSource,
    new RegExp(`\\{ key: '${category}'`),
    `Phase 3 canonical category set should include ${category}`,
  )
}

assert.match(
  matterModelSource,
  /export function normalizeMatterDocumentCategory/,
  'Phase 3 should define a stable mapping layer from legacy/library categories to canonical matter categories',
)
assert.match(
  matterModelSource,
  /generated' \|\| normalized === 'internal'\) return 'general'/,
  'generated and internal documents should roll up to General Documents',
)
assert.match(
  matterModelSource,
  /bank_requested'\) return 'finance'/,
  'bank requested documents should roll up to Finance Documents',
)
assert.match(
  matterModelSource,
  /export function buildMatterDocumentCategorySummaries/,
  'Phase 3 should expose category summaries from the pure model',
)
assert.match(
  matterModelSource,
  /categorySummaries = buildMatterDocumentCategorySummaries/,
  'workspace model should return category summaries with the rest of the document view model',
)
assert.match(
  matterModelSource,
  /row\.category === normalizedFilter \|\| row\.canonicalCategory === normalizedFilter/,
  'library filtering should honor both legacy and canonical categories',
)

assert.match(
  attorneyDetailSource,
  /categorySummaries=\{matterDocumentWorkspaceModel\.categorySummaries\}/,
  'active attorney documents workspace should receive canonical category summaries',
)
assert.match(
  attorneyDetailSource,
  /categorySummaries\.map\(\(category\)/,
  'active attorney documents workspace should render the category summary cards',
)
assert.match(
  attorneyDetailSource,
  /onFilterChange\?\.\(category\.key\)/,
  'category cards should filter the document library through existing filter state',
)

for (const expected of [
  "normalizeMatterDocumentCategory('generated'), 'general'",
  "normalizeMatterDocumentCategory('bank_requested'), 'finance'",
  'general filter should include generated/internal matter records through canonical category mapping',
]) {
  assert.ok(matterModelTestSource.includes(expected), `Phase 3 model tests should cover: ${expected}`)
}

console.log('attorney documents workspace Phase 3 canonical category checks passed')
