import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const core = await readFile(new URL('../src/core/documents/documentExperienceTelemetry.js', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/documentExperienceTelemetryService.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')

assert.match(core, /arch9-document-experience-telemetry-v1/)
assert.match(core, /journey_viewed/)
assert.match(core, /commit_confirmed/)
assert.doesNotMatch(core, /packetId|transactionId|documentText|signerName|signerEmail/)
assert.match(service, /route: '\/document-experience'/)
assert.match(service, /arch9:document-experience/)
assert.match(service, /anonymous_surface/)
assert.match(workspace, /recordDocumentExperienceEvent/)
assert.match(workspace, /surface: 'workspace'/)
assert.match(portal, /recordDocumentExperienceEvent/)
assert.match(portal, /surface: 'signer_portal'/)

console.log('Document generator N3 privacy-safe usability telemetry contract passed.')
