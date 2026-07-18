import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentMobileAction.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentMobileActionDock.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-mobile-action-v1/)
assert.match(model, /complete_signing/)
assert.match(component, /data-testid="document-mobile-action"/)
assert.match(component, /aria-label="Current document action"/)
assert.match(component, /safe-area-inset-bottom/)
assert.match(component, /md:hidden/)
assert.match(workspace, /workspace_primary/)
assert.match(workspace, /<DocumentMobileActionDock/)
assert.match(portal, /remainingFields: progress\.remainingCount/)
assert.match(portal, /<DocumentMobileActionDock/)

console.log('Document generator M2 mobile primary-action contract passed.')
