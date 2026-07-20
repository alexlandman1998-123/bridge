import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const editor = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/components/legal-documents/legalDocumentEditorLayout.js', import.meta.url), 'utf8')

for (const token of [
  'editorLayoutState.hideTools',
  'editorLayoutState.hideMain',
  'editorLayoutState.toolsUseFullWidth',
  "isFocusedLegalDocumentEditor ? 'hidden' : ''",
]) {
  assert.ok(editor.includes(token), `Simplified editor layout should include ${token}.`)
}

for (const token of [
  "'mx-auto w-full max-w-6xl xl:grid-cols-[240px_minmax(0,1fr)]'",
  "'mx-auto w-full max-w-7xl xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]'",
  'toolsAreCollapsedRail',
  'toolsUseFullWidth',
]) {
  assert.ok(layout.includes(token), `Simplified layout policy should include ${token}.`)
}

assert.match(editor, /isFocusedStandardEditor && editorToolsCollapsed \? \([\s\S]*<span>Tools<\/span>/)
assert.match(editor, /!isFocusedLegalDocumentEditor \? \([\s\S]*aria-label=\{outlineCollapsed \? 'Expand document outline'/)
assert.match(editor, /Signing Fields\{isFocusedSigningEditor && selectedSection/)
assert.match(editor, /isFocusedSigningEditor \? 'xl:grid-cols-4'/)

console.log('Simplified legal-document editor layout Phase 4 contract passed.')
