import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentAccessibility.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentAccessibilityNavigation.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-accessibility-v1/)
assert.match(model, /signing_.*token/)
assert.match(component, /aria-label="Skip document navigation"/)
assert.match(component, /aria-live="polite"/)
assert.match(component, /aria-atomic="true"/)
assert.match(component, /motion-reduce:transition-none/)
assert.match(workspace, /id="document-workspace-content"/)
assert.match(workspace, /id="document-workspace-actions"/)
assert.match(portal, /id="signer-document-content"/)
assert.match(portal, /id="signer-document-actions"/)

console.log('Document generator M3 accessibility and keyboard-navigation contract passed.')
