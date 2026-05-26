import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const attorneyDetailSource = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const migrationSource = fs.readFileSync(
  path.join(root, '../supabase/migrations/202605250015_canonical_document_browser_upload_link_rpc.sql'),
  'utf8',
)

assert.equal(
  packageJson.scripts['test:canonical-document-upload-path'],
  'node scripts/canonical-document-upload-path.test.mjs',
  'package script should expose canonical upload path checks',
)

assert.match(apiSource, /canonicalRequirementInstanceId\s*=\s*null/, 'uploadDocument should accept a canonical requirement instance id')
assert.match(apiSource, /resolveCanonicalRequirementTargetForUpload/, 'uploadDocument should resolve canonical upload targets')
assert.match(apiSource, /bridge_link_document_to_canonical_requirement/, 'uploadDocument should call the scoped canonical upload RPC')
assert.match(apiSource, /bridge_link_document_to_canonical_requirement_by_key/, 'uploadDocument should fall back to scoped key-based canonical linkage when RLS hides canonical rows')
assert.match(apiSource, /canonical_requirement_instance_id/, 'documents should retain canonical requirement links')
assert.match(apiSource, /status,\s*review_status,[\s\S]*canonical_requirement_instance_id/, 'document fetch should preserve canonical review card metadata')
assert.match(
  apiSource,
  /canonicalRequirementInstanceId:\s*row\.canonicalRequirementInstanceId\s*\|\|\s*row\.canonical_requirement_instance_id\s*\|\|\s*null/,
  'required document checklist items should preserve canonical requirement ids for browser upload targeting',
)
assert.match(apiSource, /matchAndMarkRequiredDocumentFromUpload/, 'legacy upload fallback should remain in place')
assert.match(apiSource, /CANONICAL_UPLOAD_CATEGORY_KEY_HINTS/, 'explicit category aliases should be centralized')

assert.match(attorneyDetailSource, /Required document/, 'internal document upload UI should expose requirement targeting')
assert.match(attorneyDetailSource, /canonicalRequirementInstanceId/, 'internal document upload UI should pass canonical ids')
assert.match(attorneyDetailSource, /requiredDocumentKey/, 'internal document upload UI should pass requirement keys')
assert.match(attorneyDetailSource, /General upload - do not satisfy a requirement/, 'legacy-only fallback upload option should remain explicit')

assert.match(migrationSource, /security definer/i, 'browser upload linking RPC should be security definer')
assert.match(migrationSource, /auth\.uid\(\)/, 'browser upload linking RPC should require authenticated users')
assert.match(migrationSource, /document transaction does not match canonical requirement transaction/i, 'RPC should enforce context matching')
assert.match(migrationSource, /grant execute .* to authenticated/i, 'RPC should allow scoped authenticated execution')
assert.match(migrationSource, /revoke all .* from anon/i, 'RPC should not be executable by anon')
assert.match(migrationSource, /transaction_required_documents/, 'RPC should sync legacy projection status')
assert.match(migrationSource, /document_requirement_events/, 'RPC should create canonical lifecycle events')
assert.match(migrationSource, /bridge_link_document_to_canonical_requirement_by_key/, 'migration should expose a scoped key-based canonical upload linker')
assert.match(migrationSource, /ambiguous_canonical_requirement/, 'key-based linker should avoid ambiguous requirement matches')

console.log('canonical-document-upload-path tests passed')
