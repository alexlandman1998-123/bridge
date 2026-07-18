import assert from 'node:assert/strict'
import fs from 'node:fs'

const timeline = fs.readFileSync('src/core/documents/signingProgressTimeline.js', 'utf8')
const followUpPolicy = fs.readFileSync('src/core/documents/signingFollowUpPolicy.js', 'utf8')
for (const token of ['arch9-signing-progress-v1', 'nextSigner', 'attentionCount', 'hasActiveLink', 'resolveSignerFollowUp']) {
  assert.match(timeline, new RegExp(token.replace(/[']/g, "\\'")))
}
assert.match(followUpPolicy, /key: 'resend'/)
assert.match(followUpPolicy, /key: 'review'/)
assert.doesNotMatch(timeline, /signingToken:/)

const component = fs.readFileSync('src/components/documents/SigningProgressTimeline.jsx', 'utf8')
assert.match(component, /data-testid="signing-progress-timeline"/)
assert.match(component, /onSignerAction/)

const packetPanel = fs.readFileSync('src/components/documents/DocumentPacketWorkflowPanel.jsx', 'utf8')
assert.match(packetPanel, /SigningProgressTimeline/)
assert.match(packetPanel, /targetSignerRole/)
assert.doesNotMatch(packetPanel, /\/sign\/\{signer\.signing_token\}/)

const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
assert.match(workspace, /SigningProgressTimeline/)
assert.match(workspace, /runReviewAction\('resend_signature'/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-k2'])

console.log('Document generator K2 signer-progress and controlled-action contract passed.')
