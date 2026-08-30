import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('config/listing-worker-phase13-production-canary.json', 'utf8'))
const script = fs.readFileSync('scripts/listing-phase13-production-syndication-canary.mjs', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260830100759_listing_syndication_production_canary.sql', 'utf8')

function run(env = {}, args = []) {
  return spawnSync(process.execPath, ['scripts/listing-phase13-production-syndication-canary.mjs', ...args], {
    encoding: 'utf8', env: { ...process.env, ...env },
  })
}

const staging = run({
  SUPABASE_PRODUCTION_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_PRODUCTION_URL: `https://${contract.stagingProjectRef}.supabase.co`,
})
assert.notEqual(staging.status, 0)
assert.match(staging.stderr, /approved Phase 13 production project|Staging project cannot/)

const preflight = run({
  SUPABASE_PRODUCTION_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_PRODUCTION_URL: `https://${contract.productionProjectRef}.supabase.co`,
})
assert.equal(preflight.status, 0)
assert.match(preflight.stdout, /PRODUCTION_SYNDICATION_CANARY_(BLOCKED|PREFLIGHT_READY)/)
assert.match(preflight.stdout, /"scheduleEnabled": false/)

const listingId = '11111111-1111-4111-8111-111111111111'
const unconfirmed = run({
  SUPABASE_PRODUCTION_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_PRODUCTION_URL: `https://${contract.productionProjectRef}.supabase.co`,
}, ['--execute', '--provider', 'property24', '--listing-id', listingId])
assert.notEqual(unconfirmed.status, 0)
assert.match(unconfirmed.stderr, /--confirm must equal RUN_PHASE13_PRODUCTION_CANARY/)

assert.equal(contract.batchLimit, 1)
assert.equal(contract.maxAttempts, 1)
assert.equal(contract.scheduleEnabled, false)
assert.equal(contract.rollback.preserveAuditEvidence, true)
assert.match(script, /phase12Digest/)
assert.match(script, /adapter\.productionEnabled !== true/)
assert.match(script, /Production queue must be idle and lease-clean/)
assert.match(script, /providerSyncEvidence/)
assert.match(script, /attempt_count\) !== 1/)
assert.match(migration, /bridge_enqueue_listing_syndication_canary_v1/)
assert.match(migration, /bridge_is_org_admin/)
assert.match(migration, /p_max_attempts|,\s*1\s*\n\s*\);/)
assert.match(migration, /active production syndication job already exists/i)

console.log('listing Phase 13 production syndication canary tests passed')
