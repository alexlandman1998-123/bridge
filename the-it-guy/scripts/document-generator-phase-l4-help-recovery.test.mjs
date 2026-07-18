import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentHelpRecovery.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentHelpRecoveryCard.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-help-recovery-v1/)
assert.match(model, /fresh signing link/)
assert.doesNotMatch(model, /signing_token|token_expires_at|portalLink/)
assert.match(component, /data-testid="document-help-recovery"/)
assert.match(component, /role="alert"/)
assert.match(workspace, /buildDocumentHelpRecovery/)
assert.match(workspace, /<DocumentHelpRecoveryCard/)
assert.match(portal, /surface: 'signer_portal'/)
assert.match(portal, /handleHelpRecoveryAction/)

console.log('Document generator L4 contextual help and recovery contract passed.')
