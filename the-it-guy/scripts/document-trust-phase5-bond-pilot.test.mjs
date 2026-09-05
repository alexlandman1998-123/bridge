import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const service = fs.readFileSync('src/services/documentTrustBondPilotService.js', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase5-bond-pilot.md', 'utf8')

assert.equal(packageJson.scripts['test:document-trust-phase5'], 'node scripts/document-trust-phase5-bond-pilot.test.mjs')
assert.match(service, /VITE_DOCUMENT_TRUST_PHASE5_BOND_PILOT_ENABLED/)
assert.match(service, /canonical_document_handoff_complete/)
assert.match(service, /buyer_canonical_read_fence_enabled/)
assert.match(service, /bridge_start_bond_originator_one_originator_pilot/)
assert.match(service, /bridge_pause_bond_originator_one_originator_pilot/)
assert.match(service, /automaticBankSubmission: false/)
assert.match(docs, /one[- ]originator/i)
assert.match(docs, /manual/i)
assert.match(docs, /not.*bank/i)

console.log('document trust Phase 5 bond-pilot contract tests passed')
