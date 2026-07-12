import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'scripts/canonical-document-browser-actor-readiness.mjs'), 'utf8')

assert.equal(
  packageJson.scripts['verify:canonical-documents:browser-actor'],
  'node scripts/canonical-document-browser-actor-readiness.mjs',
  'package.json should expose the read-only browser actor readiness check',
)

assert.equal(
  packageJson.scripts['repair:canonical-documents:browser-actor'],
  'node scripts/canonical-document-browser-actor-readiness.mjs --repair --confirm-staging',
  'package.json should expose the guarded browser actor repair command',
)

assert.equal(
  packageJson.scripts['test:canonical-document-browser-actor-readiness'],
  'node scripts/canonical-document-browser-actor-readiness.test.mjs',
  'package.json should expose the Phase 5 browser actor readiness test',
)

assert.match(source, /isdowlnollckzvltkasn/, 'readiness script must be pinned to the approved staging project ref')
assert.match(source, /bridge_repair_workspace_onboarding/, 'readiness script must use the existing onboarding repair RPC')
assert.match(source, /CANONICAL_BROWSER_ACTOR_REPAIR_WRITE/, 'repair mode must require the explicit write flag')
assert.match(source, /--confirm-staging/, 'repair mode must require an explicit staging confirmation argument')
assert.match(source, /signInWithPassword/, 'repair RPC must be called from an authenticated actor session')
assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/, 'readiness diagnostics must use service-role credentials')
assert.match(source, /bridge_ensure_attorney_firm_organisation/, 'attorney repair must use the existing firm backing-organisation RPC')
assert.match(source, /bootstrap_attorney_firm_admin_membership/, 'attorney repair must use the existing firm admin bootstrap RPC')
assert.match(source, /workspace_management_authority/, 'readiness must verify settings/legal-template management authority')
assert.match(source, /legal-template management authority/, 'readiness should ask for a management-authority actor instead of generic repair when blocked by authority')
assert.match(source, /explicitly authorize firm-admin staging fixture bootstrap/, 'readiness should require explicit approval before suggesting staging firm-admin bootstrap')
assert.match(source, /actorScopedWrites:\s*\['user_workspace_preferences'\]/, 'report must declare the actor-scoped workspace preference write')
assert.match(source, /active_workspace_source:\s*'user_selected'/, 'attorney alignment must mark the workspace preference as user-selected')
assert.equal((source.match(/\.upsert\(/g) || []).length, 1, 'Phase 5 should only perform the one actor-scoped preference upsert')
assert.match(source, /actorClient\.from\('user_workspace_preferences'\)/, 'the only upsert must target the signed-in actor workspace preference')

for (const forbidden of [
  /\.from\([^)]*\)\.insert\(/,
  /\.from\([^)]*\)\.update\(/,
  /\.from\([^)]*\)\.delete\(/,
]) {
  assert.doesNotMatch(source, forbidden, `Phase 5 actor readiness must not perform broad table mutations directly: ${forbidden}`)
}

assert.doesNotMatch(source, /SERVICE_ROLE_KEY\s*[:=]\s*['"][A-Za-z0-9._-]{20,}/, 'script source must not embed service-role secrets')
assert.doesNotMatch(source, /PASSWORD\s*[:=]\s*['"][^'"]+['"]/, 'script source must not embed browser actor passwords')

console.log('canonical-document-browser-actor-readiness tests passed')
