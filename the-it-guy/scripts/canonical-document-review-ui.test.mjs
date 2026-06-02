import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const attorneyDetailSource = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const reviewMigrationSource = fs.readFileSync(
  path.join(root, '../supabase/migrations/202605250016_canonical_document_browser_review_lifecycle_rpc.sql'),
  'utf8',
)

assert.equal(
  packageJson.scripts['test:canonical-document-review-ui'],
  'node scripts/canonical-document-review-ui.test.mjs',
  'package script should expose canonical browser review UI checks',
)

assert.match(apiSource, /reviewCanonicalDocumentRequirement/, 'API should expose canonical review lifecycle RPC wrapper')
assert.match(apiSource, /bridge_review_canonical_requirement/, 'review actions should use the scoped review RPC')
assert.doesNotMatch(
  apiSource,
  /\.from\('document_requirement_rules'\)/,
  'browser API should avoid direct reads of hardened canonical rule tables',
)
assert.match(
  apiSource,
  /status,\s*review_status,[\s\S]*canonical_requirement_instance_id/,
  'document fetch should hydrate canonical review status/link fields',
)

assert.match(attorneyDetailSource, /requiredDocumentRows/, 'required table should render linked canonical requirements')
assert.match(attorneyDetailSource, /requiredDocumentStatus/, 'library view model should preserve canonical requirement status')
assert.match(attorneyDetailSource, /openReviewAction\('approve'/, 'approve action should be wired from the required document table')
assert.match(attorneyDetailSource, /openReviewAction\('reject'/, 'reject action should be wired from the required document table')
assert.match(attorneyDetailSource, /handleReplaceDocument/, 'canonical documents should expose replacement upload flow')
assert.match(attorneyDetailSource, /getLinkedRequirementForDocument/, 'document library should merge canonical checklist metadata')

assert.match(reviewMigrationSource, /security definer/i, 'review RPC should be security definer')
assert.match(reviewMigrationSource, /auth\.uid\(\)/, 'review RPC should require authenticated users')
assert.match(reviewMigrationSource, /transaction_attorney_assignments/, 'review RPC should validate attorney transaction access')
assert.match(reviewMigrationSource, /transaction_participants/, 'review RPC should validate participant transaction access')
assert.match(reviewMigrationSource, /document_requirement_reviews/, 'review RPC should persist review rows')
assert.match(reviewMigrationSource, /document_requirement_events/, 'review RPC should create lifecycle events')
assert.match(reviewMigrationSource, /transaction_required_documents/, 'review RPC should sync legacy transaction projection')
assert.match(reviewMigrationSource, /grant execute .* to authenticated/i, 'review RPC should allow scoped authenticated execution')
assert.match(reviewMigrationSource, /revoke all .* from anon/i, 'review RPC should not be executable by anon')
assert.doesNotMatch(reviewMigrationSource, /grant\s+(insert|update|delete|all).*document_requirement_instances\s+to\s+authenticated/i, 'review support must not grant broad canonical table writes')

console.log('canonical-document-review-ui tests passed')
