import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
const setupScript = fs.readFileSync(path.join(root, 'scripts/setup-canonical-documents-staging-pilot-fixture.mjs'), 'utf8')
const authScript = fs.readFileSync(path.join(root, 'scripts/create-staging-internal-auth-state.mjs'), 'utf8')

assert.equal(
  packageJson.scripts['setup:canonical-documents:staging-pilot-fixture'],
  'node scripts/setup-canonical-documents-staging-pilot-fixture.mjs',
  'package script should expose the staging pilot fixture setup',
)
assert.equal(
  packageJson.scripts['auth:staging-internal'],
  'node scripts/create-staging-internal-auth-state.mjs',
  'package script should expose the staging internal auth-state generator',
)

assert.match(gitignore, /\.env\.staging\.local/, 'staging credential env file must be gitignored')
assert.match(gitignore, /playwright\/\.auth\//, 'Playwright auth state must be gitignored')

assert.match(setupScript, /CANONICAL_STAGING_PILOT_FIXTURE_WRITE/, 'write mode must require explicit env flag')
assert.match(setupScript, /--confirm-staging/, 'write mode must require explicit staging confirmation')
assert.match(setupScript, /isdowlnollckzvltkasn/, 'setup script must pin to the staging Supabase project')
assert.match(setupScript, /canonicalPrimaryEnabled['"]?: false|canonicalPrimaryEnabled,\s*false/, 'setup must report canonical_primary remains disabled')
assert.match(setupScript, /canonicalOnlyEnabled['"]?: false|canonicalOnlyEnabled,\s*false/, 'setup must report canonical_only remains disabled')
assert.match(setupScript, /hardWorkflowBlocksEnabled['"]?: false|hardWorkflowBlocksEnabled,\s*false/, 'setup must report hard blocks remain disabled')
assert.match(setupScript, /externalRemindersEnabled['"]?: false|externalRemindersEnabled,\s*false/, 'setup must report external reminders remain disabled')
assert.match(setupScript, /CANONICAL DOC TEST - SAFE TO DELETE/, 'fixture transaction must be clearly labelled')
assert.match(setupScript, /qa\.attorney\+canonical@bridgenine\.co\.za/, 'QA attorney account should be staging-specific')
assert.match(setupScript, /document_requirement_instances/, 'setup must create canonical requirement instances')
assert.match(setupScript, /transaction_required_documents/, 'setup must create legacy projections')
assert.match(setupScript, /manualReviewItemsExcluded/, 'setup must document excluded manual-review history')
assert.doesNotMatch(setupScript, /console\.log\(password|STAGING_INTERNAL_PASSWORD[^\\n]+console\.log/, 'setup must not print passwords')

assert.match(authScript, /STAGING_INTERNAL_EMAIL/, 'auth-state script must read email from env')
assert.match(authScript, /STAGING_INTERNAL_PASSWORD/, 'auth-state script must read password from env')
assert.match(authScript, /playwright.*\.auth.*staging-internal\.json/s, 'auth-state script must write ignored storage state')
assert.match(authScript, /passwordPrinted:\s*false/, 'auth-state script must explicitly avoid printing password')
assert.match(authScript, /isdowlnollckzvltkasn/, 'auth-state script must pin to staging Supabase project')

console.log('canonical-document-staging-pilot-fixture tests passed')
