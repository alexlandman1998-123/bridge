import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const modelSource = fs.readFileSync(path.join(root, 'src/services/documents/matterDocumentWorkspaceModel.js'), 'utf8')
const modelTestSource = fs.readFileSync(path.join(root, 'src/services/__tests__/matterDocumentWorkspaceModel.test.js'), 'utf8')

assert.equal(
  packageJson.scripts['test:attorney-documents-workspace-phase7'],
  'node scripts/attorney-documents-workspace-phase7.test.mjs',
  'package script should expose the Phase 7 document library contract',
)

const componentStart = source.indexOf('function ArchlineDocumentsWorkspace')
const componentEnd = source.indexOf('function ArchlineTasksWorkspace', componentStart)
const component = source.slice(componentStart, componentEnd)

for (const field of [
  'documentTypeLabel',
  'ownerLabel',
  'versionLabel',
  'fileSizeLabel',
  'linkedToLabel',
  'isFavourite',
]) {
  assert.match(modelSource, new RegExp(field), `Phase 7 model should expose ${field}`)
  assert.ok(component.includes(`row.${field}`), `Phase 7 library should render row.${field}`)
}

for (const heading of [
  'Document Type',
  'Party / Owner',
  'Uploaded',
  'Linked To',
  'Actions',
]) {
  assert.ok(component.includes(`>${heading}<`) || component.includes(`>${heading}`), `Document library should include ${heading} column`)
}

for (const expected of [
  'min-w-[1120px]',
  '<FileText size={16}',
  '<Star size={14}',
  'Preview',
  'Download',
  'Verify',
  'Replace',
  '<MoreHorizontal size={15}',
  'More document actions: preview, verify, reject, replace, upload new version, link to task, change category, add tag, rename, request replacement, mark not applicable, archive, delete',
  'visibleLibraryRows.slice(0, 12).map',
]) {
  assert.ok(component.includes(expected), `Document library should include ${expected}`)
}

for (const expected of [
  'resolveMatterDocumentTypeLabel',
  'resolveMatterDocumentVersionLabel',
  'resolveMatterDocumentFileSizeLabel',
  'resolveMatterDocumentLinkedToLabel',
  'resolveMatterDocumentFavourite',
  'toArray(row.raw?.tags).join',
]) {
  assert.ok(modelSource.includes(expected), `Phase 7 model/search contract should include ${expected}`)
}

for (const expected of [
  "sellerLibraryRow.documentTypeLabel, 'Seller FICA ID'",
  "sellerLibraryRow.versionLabel, 'v2'",
  "sellerLibraryRow.fileSizeLabel, '860 KB'",
  "sellerLibraryRow.isFavourite, true",
  "bankRequestedModel.libraryRows[0].linkedToLabel, 'ABSA request'",
]) {
  assert.ok(modelTestSource.includes(expected), `model tests should cover ${expected}`)
}

console.log('attorney documents workspace Phase 7 document library checks passed')
