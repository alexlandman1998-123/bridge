import assert from 'node:assert/strict'
import fs from 'node:fs'

const resolver = fs.readFileSync('src/core/documents/packetStatusResolver.js', 'utf8')
for (const token of [
  'getFinalDocumentCompletionStatus',
  'resolveSigningOperationalStatus',
  "state: 'PUBLISHING'",
  "state: 'FINALISING'",
  'finalCompletion',
  'operationalStatus',
  'viewerRole',
]) assert.match(resolver, new RegExp(token))
assert.doesNotMatch(resolver, /if \(allSignersSigned \|\| hasFinalSignedVersion/)

const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
assert.match(workspace, /SigningOperationalStatusCard/)
assert.match(workspace, /viewerRole: workspaceRole/)

const panel = fs.readFileSync('src/components/documents/DocumentPacketWorkflowPanel.jsx', 'utf8')
assert.match(panel, /SigningOperationalStatusCard/)
assert.match(panel, /getFinalDocumentCompletionStatus/)
assert.match(panel, /viewerRole: role/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-k1'])

console.log('Document generator K1 operational signing-status contract passed.')
