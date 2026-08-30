import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const script = fs.readFileSync('scripts/listing-phase7-staging-smoke.mjs', 'utf8')
const contract = JSON.parse(fs.readFileSync('config/listing-worker-phase7-staging.json', 'utf8'))

function run(env = {}, args = []) {
  return spawnSync(process.execPath, ['scripts/listing-phase7-staging-smoke.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_STAGING_SERVICE_ROLE_KEY: '', LISTING_JOB_RUNNER_SECRET: '', ...env },
  })
}

const production = run({
  SUPABASE_STAGING_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.productionProjectRef}.supabase.co`,
})
assert.notEqual(production.status, 0)
assert.match(production.stderr, /Production project refused/)

const wrongStaging = run({ SUPABASE_STAGING_PROJECT_REF: 'wrongstagingref', SUPABASE_STAGING_URL: 'https://wrongstagingref.supabase.co' })
assert.notEqual(wrongStaging.status, 0)
assert.match(wrongStaging.stderr, /approved Phase 7 staging project/)

const preflight = run({
  SUPABASE_STAGING_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.stagingProjectRef}.supabase.co`,
})
assert.equal(preflight.status, 0)
assert.match(preflight.stdout, /STAGING_PREFLIGHT_READY/)

const unconfirmed = run({
  SUPABASE_STAGING_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.stagingProjectRef}.supabase.co`,
}, ['--execute'])
assert.notEqual(unconfirmed.status, 0)
assert.match(unconfirmed.stderr, /--confirm must equal/)

assert.equal(contract.scheduleEnabled, false)
assert.equal(contract.allowedJobType, 'media_reconcile')
assert.match(script, /max_attempts: 1/)
assert.match(script, /phase7_staging_smoke/)
assert.doesNotMatch(script, /property24_publish|private_property_publish/)

console.log('listing Phase 7 staging smoke tests passed')
