import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const api = fs.readFileSync('src/lib/api.js', 'utf8')
const workspace = fs.readFileSync('src/services/clientPortalWorkspaceService.js', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase4-legacy-read-retirement.md', 'utf8')

assert.equal(packageJson.scripts['test:document-trust-phase4'], 'node scripts/document-trust-phase4-legacy-read-retirement.test.mjs')
assert.match(api, /fetchClientPortalCanonicalDocumentProjection/)
assert.match(api, /bridge_client_portal_canonical_document_projection/)
assert.match(workspace, /VITE_DOCUMENT_TRUST_PHASE4_ENABLED/)
assert.match(workspace, /buildCanonicalBuyerDocumentCenter/)
assert.match(workspace, /canonicalOnly: true/)
assert.match(workspace, /legacy document reads are fenced/)
assert.match(workspace, /canonicalDocumentProjectionError/)
assert.match(docs, /fails? closed/i)
assert.match(docs, /not delete/i)

console.log('document trust Phase 4 legacy-read-retirement contract tests passed')
