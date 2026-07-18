import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentCommitConfirmation.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentCommitConfirmation.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-commit-confirmation-v1/)
assert.match(model, /send_signature/)
assert.match(model, /complete_signing/)
assert.match(component, /data-testid="document-commit-confirmation"/)
assert.match(component, /event\.key === 'Escape'/)
assert.match(component, /event\.key !== 'Tab'/)
assert.match(component, /previousFocus/)
assert.match(workspace, /sendConfirmationOpen/)
assert.match(workspace, /confirmedSend/)
assert.match(portal, /completeConfirmationOpen/)
assert.match(portal, /confirmedCompletion/)

console.log('Document generator M4 high-impact confirmation contract passed.')
