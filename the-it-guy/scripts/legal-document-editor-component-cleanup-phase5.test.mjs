import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const actions = await readFile(new URL('../src/components/legal-documents/TemplateEditorActionBar.jsx', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/components/legal-documents/legalDocumentEditorLayout.js', import.meta.url), 'utf8')
const releaseGate = await readFile(new URL('./legal-document-editor-release-validation.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.match(page, /<TemplateEditorActionBar/)
assert.match(page, /editorGridClass/)
assert.match(page, /editorLayoutState\.hideTools/)
assert.doesNotMatch(page, /aria-label="More template actions"/)

for (const token of ['Preview', 'Save', 'Publish', 'More template actions', 'Template status:']) {
  assert.ok(actions.includes(token), `Extracted action bar should retain ${token}.`)
}

for (const token of [
  'resolveLegalDocumentEditorLayoutMode',
  'getLegalDocumentEditorGridClass',
  'getLegalDocumentEditorLayoutState',
  'toolsAreCollapsedRail',
]) {
  assert.ok(layout.includes(token), `Layout policy should expose ${token}.`)
}

for (const phase of ['phase2', 'phase3', 'phase4', 'phase5']) {
  assert.ok(releaseGate.includes(phase), `Release validation should include ${phase}.`)
}
for (const releaseCheck of ['focused editor lint', 'production build']) {
  assert.ok(releaseGate.includes(releaseCheck), `Release validation should include ${releaseCheck}.`)
}
assert.equal(
  packageJson.scripts['verify:legal-document-editor-release'],
  'node scripts/legal-document-editor-release-validation.mjs',
)

console.log('Legal-document editor component cleanup Phase 5 contract passed.')
