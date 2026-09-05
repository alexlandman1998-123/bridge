import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const script = fs.readFileSync('scripts/document-trust-phase6-operational-assurance.mjs', 'utf8')
const service = fs.readFileSync('src/services/documentTrustOperationalAssuranceService.js', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase6-operational-assurance.md', 'utf8')

assert.equal(packageJson.scripts['test:document-trust-phase6'], 'node scripts/document-trust-phase6-operational-assurance.test.mjs')
assert.match(script, /document_requirement_instances/)
assert.match(script, /transaction_required_documents/)
assert.match(script, /client_portal_links/)
assert.match(script, /fetchRowsForTransactions/)
assert.match(script, /fetchReferencedCanonicalDocuments/)
assert.match(script, /documents by satisfied document id/)
assert.match(script, /--fail-on-issues/)
assert.match(script, /readOnly: true/)
assert.match(service, /canonical_link_broken/)
assert.match(service, /phase4_legacy_read_dependency/)
assert.match(service, /phase5_pilot_boundary_broken/)
assert.match(docs, /read-only/i)
assert.match(docs, /fail-on-issues/i)

console.log('document trust Phase 6 operational-assurance contract tests passed')
