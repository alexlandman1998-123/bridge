import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentResponsibility.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentResponsibilityCard.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-responsibility-v1/)
assert.match(model, /nextHandoff/)
assert.match(model, /isViewer/)
assert.doesNotMatch(model, /signing_token|token_expires|portalLink/)
assert.match(component, /data-testid="document-responsibility"/)
assert.match(component, /Next handoff:/)
assert.match(workspace, /surface: 'workspace'/)
assert.match(workspace, /<DocumentResponsibilityCard/)
assert.match(portal, /surface: 'signer_portal'/)
assert.match(portal, /session\?\.signingOrder/)

console.log('Document generator L3 responsibility and handoff contract passed.')
