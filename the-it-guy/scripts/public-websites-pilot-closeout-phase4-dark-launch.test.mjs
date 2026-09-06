import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DARK_LAUNCH_CONFIRMATION,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  assertDarkLaunchTargets,
  parseDarkLaunchArgs,
  validateDarkLaunchManifest,
} from './public-websites-pilot-closeout-phase4-dark-launch.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')
const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260906100418_public_websites_pilot_closeout_phase4_dark_launch.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_pilot_closeout_phase4_dark_launch_test.sql'))
const repository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))
const operator = read(resolve(appRoot, 'scripts/public-websites-pilot-closeout-phase4-dark-launch.mjs'))
const workflow = read(resolve(repositoryRoot, '.github/workflows/public-websites-pilot-closeout-phase4-dark-launch.yml'))

for (const [pattern, message] of [
  [/create table public\.website_production_dark_launches/i, 'creates a distinct dark-launch allow-list'],
  [/check \(status in \('prepared', 'active', 'paused', 'rolled_back'\)\)/i, 'has an explicit lifecycle'],
  [/preview_hostname[\s\S]*\.vercel\\\.app/i, 'allows only Vercel deployment hostnames'],
  [/website_production_dark_launch_events/i, 'records release events'],
  [/events are immutable/i, 'makes event mutation fail closed'],
  [/website_prepare_production_dark_launch/i, 'has a prepare command'],
  [/website_bind_production_dark_launch_content/i, 'binds the rewritten production content fingerprint'],
  [/website_activate_production_dark_launch/i, 'has an activation command'],
  [/website_pause_production_dark_launch/i, 'has a pause command'],
  [/website_rollback_production_dark_launch/i, 'has a rollback command'],
  [/clientDnsChanged', false/i, 'records that no client DNS changed'],
  [/revoke all on function public\.website_activate_production_dark_launch[\s\S]*from public, anon, authenticated/i, 'blocks browser activation'],
]) assert.match(migration, pattern, message)

assert.match(databaseTest, /plan\(22\)/, 'database contract has a fixed plan')
assert.match(databaseTest, /service role cannot rewrite dark-launch events/, 'database contract protects immutable events')

assert.match(repository, /website_production_dark_launches/, 'public resolution reads the dark-launch gate')
assert.match(repository, /preview_hostname.*hostname/s, 'public resolution binds the exact preview hostname')
assert.match(workspace, /PRODUCTION DARK LAUNCH ACTIVE/, 'Website Studio shows the private production state')
assert.match(operator, /Production dark-launch mutations require/, 'operator requires explicit mutation authority')
assert.match(operator, /production website already exists outside this dark-launch record/i, 'seeding refuses an unrelated production site')
assert.match(operator, /Storage asset belongs to another Supabase project/, 'asset copying is project-pinned')
assert.match(operator, /clientDnsRequired: false/, 'seeded domains never request client DNS')
assert.doesNotMatch(workflow, /vercel (?:promote|domains add)/, 'dark launch never promotes or attaches a domain')
assert.match(workflow, /environment: public-websites-production/, 'production mutations use the protected environment')

const manifest = {
  contract: 'public-websites-pilot-closeout-phase4-dark-launch-v1',
  organisationId: '11111111-1111-4111-8111-111111111111',
  listingId: '22222222-2222-4222-8222-222222222222',
  sourceCommit: 'a'.repeat(40),
  stagingContentFingerprint: 'b'.repeat(32),
  candidateDeploymentUrl: 'https://agency-candidate.vercel.app',
  rollbackDeploymentUrl: 'https://agency-rollback.vercel.app',
  approvedBy: 'Release owner',
  approvalReference: 'phase4-dark-launch',
  confirmation: DARK_LAUNCH_CONFIRMATION,
}
assert.equal(validateDarkLaunchManifest(manifest).candidateDeploymentUrl, manifest.candidateDeploymentUrl)
assert.throws(() => validateDarkLaunchManifest({ ...manifest, candidateDeploymentUrl: 'https://www.kingstons.co.za' }), /Vercel deployment/i)
assert.throws(() => validateDarkLaunchManifest({ ...manifest, confirmation: 'yes' }), /requires AUTHORIZE/i)
assert.equal(parseDarkLaunchArgs(['--activate']).action, 'activate')
assert.throws(() => parseDarkLaunchArgs(['--activate', '--rollback']), /only one/i)
assert.doesNotThrow(() => assertDarkLaunchTargets({
  staging: { SUPABASE_STAGING_URL: `https://${STAGING_PROJECT_REF}.supabase.co`, SUPABASE_STAGING_SERVICE_ROLE_KEY: 'staging-key' },
  production: { SUPABASE_PRODUCTION_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`, SUPABASE_PRODUCTION_SERVICE_ROLE_KEY: 'production-key' },
}))
assert.throws(() => assertDarkLaunchTargets({
  staging: { SUPABASE_STAGING_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`, SUPABASE_STAGING_SERVICE_ROLE_KEY: 'wrong' },
  production: { SUPABASE_PRODUCTION_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`, SUPABASE_PRODUCTION_SERVICE_ROLE_KEY: 'production-key' },
}), /staging Supabase credentials/i)

console.log('Public websites pilot closeout Phase 4 dark-launch checks passed')
