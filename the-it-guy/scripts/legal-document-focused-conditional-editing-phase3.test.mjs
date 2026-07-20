import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const contextPanel = await readFile(new URL('../src/components/legal-documents/LegalDocumentEditorContextPanel.jsx', import.meta.url), 'utf8')
const editorRoute = await readFile(new URL('../src/pages/settings/LegalDocumentEditorRoute.jsx', import.meta.url), 'utf8')
const editor = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const actionBar = await readFile(new URL('../src/components/legal-documents/TemplateEditorActionBar.jsx', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/components/legal-documents/legalDocumentEditorLayout.js', import.meta.url), 'utf8')

assert.match(contextPanel, /if \(selected\) \{[\s\S]*Back to conditional wording/)
assert.match(contextPanel, /to=\{buildEditorLink\(documentKey, 'situations', templateId\)\}/)
assert.doesNotMatch(contextPanel, /Edit the \{selected\.label\.toLowerCase\(\)\} wording below/)

assert.match(editorRoute, /normalizedScope !== 'situations' \|\| selectedSituation \? \(/)
assert.match(editorRoute, /normalizedScope === 'situations' \? selectedSituation\.label/)

assert.match(layout, /mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES\.situations[\s\S]*max-w-5xl xl:grid-cols-1/)
assert.match(editor, /editorLayoutState\.hideTools \? 'hidden' : ''/)
assert.match(editor, /normalizedEditorScope === 'situations' \? \([\s\S]*<h2[\s\S]*\{selectedSection\.sectionLabel\}<\/h2>/)
assert.match(editor, /normalizedEditorScope !== 'situations' && selectedSectionTokens\.length/)

for (const token of [
  'Edit the legal wording, not the inclusion logic',
  'Included automatically',
]) {
  assert.ok(editor.includes(token), `Focused conditional editing should retain ${token}.`)
}
for (const token of ['Template status:', 'Preview', "saving ? 'Saving...' : 'Save'"]) {
  assert.ok(actionBar.includes(token), `Focused conditional actions should retain ${token}.`)
}

console.log('Focused conditional editing Phase 3 contract passed.')
