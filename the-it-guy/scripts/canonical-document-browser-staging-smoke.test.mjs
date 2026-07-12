import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const smokeSource = fs.readFileSync(path.join(root, 'scripts/canonical-document-browser-staging-smoke.mjs'), 'utf8')

assert.equal(
  packageJson.scripts['verify:canonical-documents:browser-staging'],
  'node scripts/canonical-document-browser-staging-smoke.mjs',
  'package script should expose Phase 4 browser staging verification',
)
assert.equal(
  packageJson.scripts['test:canonical-document-browser-staging-smoke'],
  'node scripts/canonical-document-browser-staging-smoke.test.mjs',
  'package script should expose the Phase 4 browser smoke contract test',
)

assert.match(smokeSource, /canonical-document-real-staging-dry-run\.mjs/, 'browser smoke should gate on the Phase 3 real-staging verifier')
assert.match(smokeSource, /canonical-document-browser-actor-readiness\.mjs/, 'browser smoke should gate on the Phase 5 actor readiness verifier')
assert.match(smokeSource, /CANONICAL_BROWSER_SKIP_ACTOR_READINESS/, 'browser smoke should allow explicitly skipping the actor readiness preflight')
assert.match(smokeSource, /--skip-actor-readiness/, 'browser smoke should expose a CLI skip for the actor readiness preflight')
assert.match(smokeSource, /browser_actor_not_ready/, 'browser smoke should fail fast with actor-readiness blockers before browser launch')
assert.match(smokeSource, /CANONICAL_BROWSER_EMAIL/, 'browser smoke should allow an explicit staging browser actor override')
assert.match(smokeSource, /CANONICAL_BROWSER_PASSWORD/, 'browser smoke should allow an explicit staging browser password override')
assert.match(smokeSource, /blocked_staging_actor_onboarding/, 'browser smoke should classify onboarding-gated staging actors clearly')
assert.match(smokeSource, /unmappedLegacyKeyCount/, 'browser smoke should assert critical parity counters')
assert.match(smokeSource, /\/settings\/legal-templates/, 'browser smoke should open the legal templates page')
assert.match(smokeSource, /Legal Templates/, 'browser smoke should verify legal templates loaded')
assert.match(smokeSource, /Organisation \/ Legal Templates/, 'browser smoke should guard against the removed breadcrumb returning')
assert.match(smokeSource, /Blank Template/, 'browser smoke should verify the blank template creator')
assert.match(smokeSource, /\/transactions\/\$\{config\.transactionId\}/, 'browser smoke should open a transaction document workspace')
assert.match(smokeSource, /Document Readiness/, 'browser smoke should verify the transaction documents surface')
assert.match(smokeSource, /mutatedData:\s*false/, 'browser smoke report should explicitly mark itself non-mutating')

assert.doesNotMatch(smokeSource, /createClient/, 'browser smoke should not create a Supabase client directly')
assert.doesNotMatch(smokeSource, /\.insert\(/, 'browser smoke should not insert staging data')
assert.doesNotMatch(smokeSource, /\.update\(/, 'browser smoke should not update staging data')
assert.doesNotMatch(smokeSource, /\.upsert\(/, 'browser smoke should not upsert staging data')
assert.doesNotMatch(smokeSource, /\.delete\(/, 'browser smoke should not delete staging data')

console.log('canonical-document-browser-staging-smoke tests passed')
