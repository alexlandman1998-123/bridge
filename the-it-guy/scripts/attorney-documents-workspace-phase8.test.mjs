import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const modelSource = fs.readFileSync(path.join(root, 'src/services/documents/matterDocumentWorkspaceModel.js'), 'utf8')
const modelTestSource = fs.readFileSync(path.join(root, 'src/services/__tests__/matterDocumentWorkspaceModel.test.js'), 'utf8')

assert.equal(
  packageJson.scripts['test:attorney-documents-workspace-phase8'],
  'node scripts/attorney-documents-workspace-phase8.test.mjs',
  'package script should expose the Phase 8 category and folder experience contract',
)

const componentStart = source.indexOf('function ArchlineDocumentsWorkspace')
const componentEnd = source.indexOf('function ArchlineTasksWorkspace', componentStart)
const component = source.slice(componentStart, componentEnd)

for (const category of ['buyer', 'seller', 'finance', 'transfer', 'bond', 'cancellation', 'general']) {
  assert.match(modelSource, new RegExp(`${category}: \\[`), `Phase 8 should define system groups for ${category}`)
}

for (const groupLabel of [
  'Identity & FICA',
  'Financial',
  'Entity Authority',
  'Sale Agreement',
  'Transfer Duty',
  'Drafting',
  'Lodgement',
  'Registration',
  'Post-Registration',
]) {
  assert.ok(modelSource.includes(groupLabel), `Phase 8 should retain the structured group ${groupLabel}`)
}

for (const expected of [
  'MATTER_DOCUMENT_CATEGORY_GROUPS',
  'resolveMatterDocumentCategoryGroup',
  'categoryGroup: categoryGroup.key',
  'categoryGroupLabel: categoryGroup.label',
  'groupSummaries',
  'statusRows.filter((row) => row.categoryGroup === group.key)',
]) {
  assert.ok(modelSource.includes(expected), `Phase 8 model contract should include ${expected}`)
}

for (const expected of [
  'Category Groups',
  'activeCategoryGroup',
  'setActiveCategoryGroup',
  'categoryGroupSummaries',
  'visibleLibraryRows',
  'category.groupSummaries.slice(0, 3)',
  'row.categoryGroup === activeCategoryGroup',
  'group.verifiedCount',
  'group.missingCount',
]) {
  assert.ok(component.includes(expected), `Phase 8 workspace should include ${expected}`)
}

for (const expected of [
  "buyerProofRow.categoryGroupLabel, 'Identity & FICA'",
  "sellerLibraryRow.categoryGroupLabel, 'Identity & FICA'",
  'sellerSummary.groupSummaries[0].count, 1',
  "generalSummary.groupSummaries[0].label, 'Generated'",
]) {
  assert.ok(modelTestSource.includes(expected), `model tests should cover ${expected}`)
}

console.log('attorney documents workspace Phase 8 category and folder experience checks passed')
