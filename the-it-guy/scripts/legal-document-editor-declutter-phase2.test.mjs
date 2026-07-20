import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildLegalDocumentEditorPath } from '../src/core/documents/legalDocumentRoutes.js'

const scopeNav = await readFile(new URL('../src/components/legal-documents/LegalDocumentEditorScopeNav.jsx', import.meta.url), 'utf8')
const editorRoute = await readFile(new URL('../src/pages/settings/LegalDocumentEditorRoute.jsx', import.meta.url), 'utf8')
const editor = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const actionBar = await readFile(new URL('../src/components/legal-documents/TemplateEditorActionBar.jsx', import.meta.url), 'utf8')

assert.equal(buildLegalDocumentEditorPath('mandate'), '/settings/legal-templates/mandate/edit/standard')

for (const label of ['Always included', 'Conditional wording', 'Who signs']) {
  assert.match(scopeNav, new RegExp(`label: '${label}'`))
}
assert.doesNotMatch(scopeNav, /label: 'Whole document'/)
assert.doesNotMatch(scopeNav, /label: 'Standard wording'/)
assert.doesNotMatch(scopeNav, /label: 'Conditional sections'/)
assert.doesNotMatch(scopeNav, /label: 'Signing setup'/)

assert.match(editorRoute, /normalizedScope === 'all'/)
assert.match(editorRoute, /buildLegalDocumentEditorPath\(definition\.key, 'standard'\)/)

assert.match(editor, /<TemplateEditorActionBar/)
assert.match(actionBar, /!focused \? \([\s\S]*<span>Edit Template<\/span>/)
assert.match(actionBar, /aria-label=\{`Template status: \$\{isDefault \? 'Live' : 'Draft'\}`\}/)
assert.match(actionBar, /!focused \|\| !isDefault/)
assert.match(actionBar, /aria-label="More template actions"/)
assert.match(actionBar, /focused \? studioPrimaryButtonClass : studioSecondaryButtonClass/)

console.log('Legal-document editor declutter Phase 2 contract passed.')
