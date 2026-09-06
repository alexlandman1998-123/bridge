import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ATTORNEY_RELEASE_PHASE0_VERSION, ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS, ATTORNEY_RELEASE_ROLES, ATTORNEY_RELEASE_SCENARIOS, ATTORNEY_RELEASE_UPDATE_VISIBILITY } from '../src/constants/attorneyReleaseReadinessPhase0.js'
import { ATTORNEY_PRODUCTION_PROJECT_REF, ATTORNEY_STAGING_RECOVERY_CONFIRMATION, assertAttorneyStagingTarget, inspectAttorneyStagingTarget, projectRefFromSupabaseUrl } from './lib/attorney-staging-safety.mjs'

assert.equal(ATTORNEY_RELEASE_PHASE0_VERSION, 'attorney-release-readiness-phase0-v1')
assert.deepEqual(ATTORNEY_RELEASE_ROLES.map((role) => role.transactionRole), ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
assert.equal(new Set(ATTORNEY_RELEASE_ROLES.map((role) => role.envPrefix)).size, 3)
assert.equal(ATTORNEY_RELEASE_SCENARIOS.length, 6)
for (const financeType of ['cash', 'bond', 'hybrid']) assert.ok(ATTORNEY_RELEASE_SCENARIOS.some((scenario) => scenario.financeType === financeType))
assert.ok(ATTORNEY_RELEASE_SCENARIOS.some((scenario) => scenario.buyerType === 'company'))
assert.ok(ATTORNEY_RELEASE_SCENARIOS.some((scenario) => scenario.sellerType === 'trust'))
assert.ok(ATTORNEY_RELEASE_SCENARIOS.some((scenario) => scenario.expectedDecision === 'review'))
assert.deepEqual(ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS, ['attorney_matter_workspace', 'transaction_workspace', 'attorney_operations', 'agent_transaction_view', 'buyer_portal', 'seller_portal'])
assert.deepEqual(ATTORNEY_RELEASE_UPDATE_VISIBILITY.internal, ['attorney_matter_workspace', 'attorney_operations'])
assert.equal(ATTORNEY_RELEASE_UPDATE_VISIBILITY.professional_shared.includes('buyer_portal'), false)
assert.equal(ATTORNEY_RELEASE_UPDATE_VISIBILITY.professional_shared.includes('seller_portal'), false)

const stagingRef = 'safe-staging-ref'
const safeTarget = inspectAttorneyStagingTarget({
  supabaseUrl: `https://${stagingRef}.supabase.co`,
  expectedProjectRef: stagingRef,
  environment: 'staging',
  recoveryConfirmation: ATTORNEY_STAGING_RECOVERY_CONFIRMATION,
  requireRecovery: true,
})
assert.equal(safeTarget.safe, true)
assert.equal(projectRefFromSupabaseUrl(`https://${stagingRef}.supabase.co`), stagingRef)
for (const [label, input, code] of [
  ['production target', { supabaseUrl: `https://${ATTORNEY_PRODUCTION_PROJECT_REF}.supabase.co`, expectedProjectRef: ATTORNEY_PRODUCTION_PROJECT_REF }, 'PRODUCTION_TARGET_DENIED'],
  ['reference mismatch', { supabaseUrl: `https://${stagingRef}.supabase.co`, expectedProjectRef: 'another-ref' }, 'STAGING_PROJECT_REF_MISMATCH'],
  ['missing reference', { supabaseUrl: `https://${stagingRef}.supabase.co`, expectedProjectRef: '' }, 'STAGING_PROJECT_REF_MISSING'],
  ['non-staging environment', { supabaseUrl: `https://${stagingRef}.supabase.co`, expectedProjectRef: stagingRef, environment: 'production' }, 'STAGING_ENVIRONMENT_REQUIRED'],
  ['missing recovery', { supabaseUrl: `https://${stagingRef}.supabase.co`, expectedProjectRef: stagingRef, requireRecovery: true }, 'STAGING_RECOVERY_NOT_CONFIRMED'],
]) {
  const result = inspectAttorneyStagingTarget({ environment: 'staging', ...input })
  assert.equal(result.safe, false, `${label} must fail closed`)
  assert.ok(result.blockers.some((item) => item.code === code), `${label} must report ${code}`)
  assert.throws(() => assertAttorneyStagingTarget({ environment: 'staging', ...input }), { code: 'ATTORNEY_STAGING_SAFETY_CHECK_FAILED' })
}

const documentation = readFileSync(new URL('../docs/attorney-release-readiness-phase0.md', import.meta.url), 'utf8')
for (const heading of ['## Decision', '## Supported attorney roles', '## Frozen scenario matrix', '## Update propagation contract', '## Scope freeze', '## Exit gate']) assert.ok(documentation.includes(heading), `Phase 0 documentation is missing ${heading}`)

const seeder = readFileSync(new URL('./seed-attorney-demo-transactions.mjs', import.meta.url), 'utf8')
const preflight = readFileSync(new URL('./check-attorney-release-phase0-staging.mjs', import.meta.url), 'utf8')
assert.match(seeder, /SEED_KEY = 'attorney-demo-full-workflows-v1'/)
assert.match(seeder, /demo_seed_manifests/)
assert.match(seeder, /is_demo_data: true/)
assert.match(seeder, /\.upsert\(/)
assert.match(seeder, /assertAttorneyStagingTarget/)
assert.match(preflight, /inspectAttorneyStagingTarget/)
assert.match(preflight, /signInWithPassword/)
assert.match(preflight, /from\('organisation_users'\)/)
assert.match(preflight, /from\('demo_seed_manifests'\)/)

console.log('Attorney release readiness Phase 0 frozen-contract verification passed.')
