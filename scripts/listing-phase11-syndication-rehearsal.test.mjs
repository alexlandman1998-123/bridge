import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('config/listing-worker-phase11-syndication-rehearsal.json', 'utf8'))
const script = fs.readFileSync('scripts/listing-phase11-syndication-rehearsal.mjs', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260830095435_listing_syndication_operational_readiness.sql', 'utf8')

function run(env = {}, args = []) {
  return spawnSync(process.execPath, ['scripts/listing-phase11-syndication-rehearsal.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

const production = run({
  SUPABASE_STAGING_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.productionProjectRef}.supabase.co`,
})
assert.notEqual(production.status, 0)
assert.match(production.stderr, /Production project refused/)

const preflight = run({
  SUPABASE_STAGING_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.stagingProjectRef}.supabase.co`,
})
assert.equal(preflight.status, 0)
assert.match(preflight.stdout, /STAGING_SYNDICATION_PREFLIGHT_READY/)
assert.match(preflight.stdout, /"productionEnabled": false/)

const unconfirmed = run({
  SUPABASE_STAGING_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.stagingProjectRef}.supabase.co`,
}, ['--execute', '--provider', 'property24', '--listing-id', '11111111-1111-4111-8111-111111111111'])
assert.notEqual(unconfirmed.status, 0)
assert.match(unconfirmed.stderr, /--confirm must equal/)

assert.equal(contract.allowedEnvironment, 'sandbox')
assert.equal(contract.scheduleEnabled, false)
assert.match(script, /Staging queue must be idle/)
assert.match(script, /bridge_enqueue_listing_syndication_job_v1/)
assert.match(migration, /bridge_listing_syndication_health_v1/)
assert.match(migration, /bridge_is_org_admin/)
assert.match(migration, /where job_type in \('property24_publish', 'private_property_publish'\)/)

console.log('listing Phase 11 syndication rehearsal tests passed')
