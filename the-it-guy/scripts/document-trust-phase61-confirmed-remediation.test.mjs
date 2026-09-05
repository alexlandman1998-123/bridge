import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const migration = fs.readFileSync('../supabase/migrations/20260905095152_document_trust_phase61_confirmed_remediation.sql', 'utf8')
const script = fs.readFileSync('scripts/document-trust-phase61-confirmed-remediation.mjs', 'utf8')
const service = fs.readFileSync('src/services/documentTrustPhase61RemediationService.js', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase61-confirmed-remediation.md', 'utf8')

assert.equal(packageJson.scripts['test:document-trust-phase61'], 'node scripts/document-trust-phase61-confirmed-remediation.test.mjs')
assert.match(migration, /for update/i)
assert.match(migration, /Requirement and document must belong to the same transaction/)
assert.match(migration, /Legacy row and canonical requirement must belong to the same transaction/)
assert.match(migration, /revoke all on function/i)
assert.match(migration, /grant execute.*service_role/i)
assert.match(script, /--confirm-phase61-remediation/)
assert.match(script, /--actor-reference/)
assert.match(script, /ensureSelectedItemsAreQueued/)
assert.match(script, /fetchSatisfiedDocuments/)
assert.match(service, /automaticMatching: false/)
assert.match(service, /No automatic candidate is supplied/)
assert.match(service, /manual_resolve_conflicting_document_link/)
assert.match(docs, /does not guess/i)

console.log('document trust Phase 6.1 confirmed-remediation contract tests passed')
