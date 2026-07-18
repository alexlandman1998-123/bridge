import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/signingActivityHistory.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/SigningActivityHistory.jsx', import.meta.url), 'utf8')
const resolver = await readFile(new URL('../src/core/documents/packetStatusResolver.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-signing-activity-v1/)
assert.match(model, /signer_reminder_sent/)
assert.match(model, /signer_link_viewed/)
assert.match(model, /signer_completed_signing/)
assert.doesNotMatch(model, /signing_token|portalLink/)
assert.match(component, /data-testid="signing-activity-history"/)
assert.match(resolver, /includeEvents: true/)
assert.match(resolver, /signingActivity,/)
assert.match(resolver, /delete safePacket\.events/)
assert.match(workspace, /<SigningActivityHistory/)

console.log('Document generator K4 signing-activity history contract passed.')
