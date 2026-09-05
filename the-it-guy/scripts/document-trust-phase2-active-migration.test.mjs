import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const script = fs.readFileSync('scripts/document-trust-phase2-active-migration.mjs', 'utf8')
const phase17 = fs.readFileSync('scripts/document-request-canonical-phase17-legacy-key-cleanup.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase2-active-migration.md', 'utf8')

assert.equal(packageJson.scripts['test:document-trust-phase2'], 'node scripts/document-trust-phase2-active-migration.test.mjs')
assert.match(script, /document_trust_phase2_active_migration/)
assert.match(script, /document-request-canonical-phase17-legacy-key-cleanup\.mjs/)
assert.match(script, /--confirm-phase2-active-migration/)
assert.match(script, /--confirm-legacy-cleanup/)
assert.match(script, /MAX_ACTIVE_TRANSACTION_BATCH = 25/)
assert.match(script, /missingCommittedKeysFromSharedPortal/)
assert.match(script, /buildReviewQueue/)
assert.match(script, /preflightOutput/)
assert.match(script, /Phase 2 commit is blocked by failed canonical parity or a non-empty review queue/)
assert.match(script, /deletesRows === false/)
assert.match(script, /writesDocumentRequests === false/)
assert.match(phase17, /PRESERVED_REQUIRED_DOCUMENT_STATUSES/)
assert.match(phase17, /status: 'not_required'/)
assert.match(docs, /dry-run/i)
assert.match(docs, /review queue/i)

console.log('document trust Phase 2 active-migration tests passed')
