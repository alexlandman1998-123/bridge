import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/documentRoleGuidance.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/DocumentRoleGuidanceCard.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-document-role-guidance-v1/)
for (const audience of ['principal', 'agent', 'attorney', 'buyer', 'seller']) assert.match(model, new RegExp(audience))
assert.match(component, /data-testid="document-role-guidance"/)
assert.match(workspace, /surface: 'workspace'/)
assert.match(workspace, /<DocumentRoleGuidanceCard/)
assert.match(portal, /surface: 'signer_portal'/)
assert.match(portal, /<DocumentRoleGuidanceCard/)

console.log('Document generator L1 role-aware guidance contract passed.')
