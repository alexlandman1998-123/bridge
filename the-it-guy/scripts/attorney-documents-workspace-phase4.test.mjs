import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

assert.equal(
  packageJson.scripts['test:attorney-documents-workspace-phase4'],
  'node scripts/attorney-documents-workspace-phase4.test.mjs',
  'package script should expose the Phase 4 document workspace structure contract',
)

const componentStart = source.indexOf('function ArchlineDocumentsWorkspace')
const componentEnd = source.indexOf('function ArchlineTasksWorkspace', componentStart)
assert.notEqual(componentStart, -1, 'ArchlineDocumentsWorkspace should exist')
assert.notEqual(componentEnd, -1, 'ArchlineDocumentsWorkspace block should be extractable')

const component = source.slice(componentStart, componentEnd)
const categoryIndex = component.indexOf('title="Document Category Overview"')
const toolbarIndex = component.indexOf('title="Document Toolbar"')
const libraryIndex = component.indexOf('title="Document Library"')
const contextRailIndex = component.indexOf('<aside className="space-y-4')
const overviewIndex = component.indexOf('title="Document Overview"')

assert.ok(categoryIndex > -1, 'Phase 4 should render the document category overview first')
assert.ok(toolbarIndex > categoryIndex, 'Document Toolbar should follow the category overview')
assert.ok(libraryIndex > toolbarIndex, 'Document Library should follow the toolbar as the primary work surface')
assert.ok(contextRailIndex > libraryIndex, 'Context Rail should sit beside the document library area')
assert.ok(overviewIndex > contextRailIndex, 'Context Rail should start with Document Overview')

for (const title of [
  'Document Category Overview',
  'Document Toolbar',
  'Document Library',
  'Document Overview',
  'Quick Actions',
  'Missing Documents',
  'Recent Activity',
  'Required Documents',
]) {
  assert.match(component, new RegExp(`title="${title}"`), `Phase 4 layout should include ${title}`)
}

assert.match(component, /DOCUMENT_LIBRARY_FILTERS\.map/, 'Document Toolbar should retain the existing filter contract')
assert.match(component, /onSearchChange\?\.\(event\.target\.value\)/, 'Document Toolbar should retain search wiring')
assert.match(component, /onRequest/, 'Document Toolbar and context rail should retain request actions')
assert.match(component, /onUpload/, 'Document Toolbar and context rail should retain upload actions')
assert.match(component, /requiredRows\.slice\(0, 8\)/, 'Required Documents should remain available during Phase 4')
assert.match(component, /(libraryRows|visibleLibraryRows)\.slice\(0, 12\)/, 'Document Library should remain the dominant table/list surface')
assert.doesNotMatch(component, /title="Document Readiness"/, 'Phase 4 should move readiness into the context rail overview')

console.log('attorney documents workspace Phase 4 structure checks passed')
