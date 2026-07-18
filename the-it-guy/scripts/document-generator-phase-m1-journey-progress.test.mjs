import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentJourneyProgress.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentJourneyProgress.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-journey-progress-v1/)
assert.match(model, /WORKSPACE_STAGES/)
assert.match(model, /SIGNER_STAGES/)
assert.match(component, /data-testid="document-journey-progress"/)
assert.match(component, /aria-current/)
assert.match(component, /aria-label="Document journey"/)
assert.match(workspace, /surface: 'workspace'/)
assert.match(workspace, /<DocumentJourneyProgress/)
assert.match(portal, /surface: 'signer_portal'/)
assert.match(portal, /<DocumentJourneyProgress/)

console.log('Document generator M1 visual journey hierarchy contract passed.')
