import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentRoleActions.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentRoleActionBar.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-role-actions-v1/)
assert.match(model, /actions: actions\.slice\(0, 3\)/)
assert.match(component, /data-testid="document-role-actions"/)
for (const action of ['edit_document', 'prepare_signatures', 'send_document', 'open_signers', 'open_activity', 'open_final', 'open_certificate']) assert.match(workspace, new RegExp(action))
for (const action of ['next_field', 'review_document', 'complete_signing']) assert.match(portal, new RegExp(action))
assert.match(portal, /canCompleteSigning/)

console.log('Document generator L2 role-prioritised action contract passed.')
