import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const model = await readFile(new URL('../src/core/documents/signingCompletionCertificate.js', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/documents/SigningCompletionCertificate.jsx', import.meta.url), 'utf8')
const resolver = await readFile(new URL('../src/core/documents/packetStatusResolver.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')

assert.match(model, /arch9-signing-completion-certificate-v1/)
assert.match(model, /completed_everywhere/)
assert.match(model, /\^\[a-f0-9\]\{64\}\$/)
assert.doesNotMatch(model, /signing_token|portalLink/)
assert.match(component, /Download certificate/)
assert.match(component, /html2pdf\.js/)
assert.match(component, /SHA-256/)
assert.match(resolver, /getDocumentGeneratorLaunchChain/)
assert.match(resolver, /completionCertificate,/)
assert.match(workspace, /<SigningCompletionCertificate/)

console.log('Document generator K5 verified completion-certificate contract passed.')
