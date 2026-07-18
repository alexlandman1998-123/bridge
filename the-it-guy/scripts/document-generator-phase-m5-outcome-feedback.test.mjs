import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentOutcomeFeedback.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentOutcomeNotice.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-outcome-feedback-v1/)
assert.match(model, /sent for signature/)
assert.match(model, /signer_field/)
assert.match(component, /data-testid="document-outcome-notice"/)
assert.match(component, /aria-live="polite"/)
assert.match(component, /Dismiss status message/)
assert.match(workspace, /buildDocumentOutcomeFeedback/)
assert.match(workspace, /onDismiss=\{\(\) => setActionFeedback\(''\)\}/)
assert.match(portal, /remainingFields: progress\.remainingCount/)
assert.match(portal, /onDismiss=\{\(\) => setStatusMessage\(''\)\}/)

console.log('Document generator M5 outcome feedback and next-step receipt contract passed.')
